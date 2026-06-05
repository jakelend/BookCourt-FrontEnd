import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Subscription, finalize, interval } from 'rxjs';
import type { CreateBookingLockRequestDto } from '../../../dto/request/booking/create-booking-lock-request.dto';
import type {
  BookingCalendarEventResponseDto,
  BookingFieldCalendarResponseDto,
} from '../../../dto/response/booking/booking-calendar-response.dto';
import type { BookingSport } from '../../../dto/response/booking/booking-field-response.dto';
import type { BookingLockResponseDto } from '../../../dto/response/booking/booking-lock-response.dto';
import { isSport } from '../../../enumeration/sport.enum';
import { BookingService } from '../../../services/booking.service';

interface BookingStep {
  label: string;
}

// Riga oraria visualizzata nella griglia del calendario giornaliero
interface CalendarHourSlot {
  label: string;
  topPct: number;
}

/**
 * Rappresentazione grafica di un evento del calendario campo.
 *
 * Contiene le percentuali usate dal template per posizionare e dimensionare
 * l'evento nella timeline verticale della giornata.
 */
interface CalendarEventView {
  id: string;
  tipo: string;
  titolo: string;
  topPct: number;
  heightPct: number;
  timeLabel: string;
  cssClass: string;
  icon: string;
}

// Rappresentazione grafica dello slot che il cliente sta selezionando
interface SelectedBookingEventView {
  topPct: number;
  heightPct: number;
  timeLabel: string;
  title: string;
}

/**
 * Step data e ora della prenotazione.
 *
 * Visualizza il calendario giornaliero del campo, impedisce la scelta di slot
 * non disponibili o nel passato, gestisce il lock temporaneo e salva data, ora
 * e durata per gli step successivi.
 */
@Component({
  selector: 'app-booking-date-time-selection',
  imports: [
    CommonModule,
    FormsModule,
    MatNativeDateModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './booking-date-time-selection.component.html',
  styleUrl: './booking-date-time-selection.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingDateTimeSelectionComponent implements OnInit, OnDestroy {
  readonly currentStep = 3;

  readonly steps: BookingStep[] = [
    { label: 'Sport' },
    { label: 'Campo' },
    { label: 'Data e ora' },
    { label: 'Extra' },
    { label: 'Riepilogo' },
    { label: 'Pagamento' },
  ];


  readonly selectedSport = signal<BookingSport | null>(null);
  readonly selectedFieldId = signal<number | null>(null);
  readonly selectedFieldName = signal<string>('');

  readonly selectedDate = signal(this.formatLocalDate(new Date()));
  readonly selectedStartTime = signal('08:00');
  readonly selectedEndTime = signal('09:00');

  readonly currentDateTime = signal(new Date());

  // Calendario del campo restituito dal backend per la data selezionata
  readonly calendarData = signal<BookingFieldCalendarResponseDto | null>(null);
  readonly hourSlots = computed(() => this.buildHourSlots());
  readonly startTimeOptions = computed(() => this.buildStartTimeOptions());

  // Stati reattivi di caricamento, errori e messaggi della schermata
  readonly isCalendarLoading = signal(false);
  readonly isReleasingLock = signal(false);
  readonly calendarErrorMessage = signal('');
  readonly formErrorMessage = signal('');
  readonly feedbackMessage = signal('');

  // Data minima selezionabile
  readonly minBookingDate = this.toDateOnly(this.formatLocalDate(new Date()));

  private readonly visibleDayStartTime = '08:00';
  private readonly visibleDayEndTime = '24:00';
  private readonly fallbackBookingStartTime = '08:00';
  private readonly fallbackBookingEndTime = '24:00';
  private readonly minimumDurationMinutes = 60;
  private readonly durationStepMinutes = 30;
  private readonly calendarVerticalInsetPct = 2.4;
  private readonly realtimeRefreshMs = 3000;

  private calendarRealtimeSubscription?: Subscription;
  private currentTimeSubscription?: Subscription;
  private realtimeRefreshInProgress = false;

  readonly selectedDateValue = computed(() => this.toDateOnly(this.selectedDate()));
  readonly dayStartTime = computed(() => this.visibleDayStartTime);
  readonly dayEndTime = computed(() => this.visibleDayEndTime);

  // Date di inizio/fine ricavate da giorno e orari selezionati
  readonly bookingStartTime = computed(() => {
    return (
      this.extractTimeFromDateTime(this.calendarData()?.apertura) ??
      this.fallbackBookingStartTime
    );
  });

  readonly bookingEndTime = computed(() => {
    return this.normalizeClosingTime(
      this.extractTimeFromDateTime(this.calendarData()?.chiusura) ??
        this.fallbackBookingEndTime,
    );
  });

  readonly selectedDateTitle = computed(() => {
    return this.toDateOnly(this.selectedDate()).toLocaleDateString('it-IT', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  });

  readonly selectedSportLabel = computed(() => {
    const sport = this.calendarData()?.sport ?? this.selectedSport();

    switch (sport) {
      case 'CALCETTO':
        return 'Calcetto';
      case 'PADEL':
        return 'Padel';
      case 'TENNIS':
        return 'Tennis';
      default:
        return '';
    }
  });

  // Il centro potrebbe essere chiuso in una data specifica indipendentemente dagli orari di
  // apertura generali, quindi mostriamo un messaggio dedicato e disabilitiamo la selezione
  readonly isClosedDay = computed(() => Boolean(this.calendarData()?.chiuso));

  readonly calendarStatusLabel = computed(() => {
    if (this.isCalendarLoading()) {
      return 'Caricamento calendario...';
    }

    if (this.calendarErrorMessage()) {
      return this.calendarErrorMessage();
    }

    if (this.isClosedDay()) {
      return 'Il centro è chiuso per questa data.';
    }

    return `Centro prenotabile dalle ${this.bookingStartTime()} alle ${this.bookingEndTime()}.`;
  });

  readonly endTimeOptions = computed(() => {
    if (!this.selectedDate() || !this.selectedStartTime() || this.isClosedDay()) {
      return [];
    }

    // Per costruire le opzioni di fine partiamo dall'orario di inizio selezionato
    const start = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.selectedStartTime()),
    );

    return this.buildEndTimeOptionsForStart(start);
  });

  // La durata totale della prenotazione in minuti, usata per validazioni e per mostrare un
  // riepilogo chiaro al cliente
  readonly selectedDurationMinutes = computed(() => {
    if (!this.isTimeRangeValid()) {
      return 0;
    }

    const start = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.selectedStartTime()),
    );
    const end = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.selectedEndTime()),
    );

    return this.minutesBetween(start, end);
  });

  // Rappresentazione testuale della durata selezionata, espressa in ore e minuti
  readonly selectedDurationLabel = computed(() => {
    const minutes = this.selectedDurationMinutes();

    if (minutes <= 0) {
      return '-';
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0 && remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}min`;
    }

    if (hours > 0) {
      return `${hours}h`;
    }

    return `${remainingMinutes}min`;
  });

  readonly hasValidTimeRange = computed(() => this.isTimeRangeValid());

  // Solo per tennis e padel mostriamo l'opzione di aggiungere un istruttore,
  // che richiede durate orarie
  readonly isInstructorSport = computed(() => {
    const sport = this.selectedSport();
    return sport === 'TENNIS' || sport === 'PADEL';
  });

  // L'istruttore è compatibile solo se la durata è un multiplo di 60 minuti,
  // altrimenti mostriamo un warning ma lasciamo prenotare
  readonly canUseInstructorWithSelectedDuration = computed(() => {
    if (!this.isInstructorSport() || !this.hasValidTimeRange()) {
      return true;
    }

    return this.selectedDurationMinutes() % 60 === 0;
  });

  // Se la durata non è compatibile con l'istruttore mostriamo un messaggio informativo,
  // ma lasciamo prenotare lo stesso
  readonly instructorDurationWarning = computed(() => {
    if (!this.isInstructorSport() || !this.hasValidTimeRange()) {
      return '';
    }

    if (this.canUseInstructorWithSelectedDuration()) {
      return '';
    }

    return 'Con questa durata puoi prenotare il campo, ma non potrai aggiungere un istruttore: le lezioni con istruttore devono durare 1h, 2h, 3h, ecc.';
  });

  // MOstro tutti gli eventi che ci sono nel calendario
  readonly calendarEventViews = computed<CalendarEventView[]>(() => {
    const calendar = this.calendarData();

    if (!calendar) {
      return [];
    }

    const centerExceptionEvents = this.buildCenterExceptionEventViews();

    const backendEvents = calendar.eventi
      .filter((event) => event.inizio && event.fine && event.tipo !== 'ECCEZIONE_ISTRUTTORE')
      .map((event, index) => this.toCalendarEventView(event, index))
      .filter((event): event is CalendarEventView => event !== null);

    return [...centerExceptionEvents, ...backendEvents];
  });

  /** Slot selezionato dal cliente, mostrato come evento evidenziato nel calendario. */
  readonly selectedBookingEvent = computed<SelectedBookingEventView | null>(() => {
    if (!this.isTimeRangeValid()) {
      return null;
    }

    const startTime = this.selectedStartTime();
    const endTime = this.selectedEndTime();

    const dayStart = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.dayStartTime()),
    );
    const dayEnd = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.dayEndTime()),
    );
    const start = new Date(
      this.buildHtmlDateTime(this.selectedDate(), startTime),
    );
    const end = new Date(
      this.buildHtmlDateTime(this.selectedDate(), endTime),
    );

    const totalMinutes = Math.max(60, this.minutesBetween(dayStart, dayEnd));
    const durationMinutes = Math.max(1, this.minutesBetween(start, end));

    return {
      topPct: this.getCalendarTopPct(dayStart, start, totalMinutes),
      heightPct: this.getCalendarHeightPct(durationMinutes, totalMinutes),
      timeLabel: `${startTime} - ${endTime}`,
      title: 'Prenotazione selezionata',
    };
  });

  /** Abilita il pulsante avanti solo se contesto, orario e disponibilità sono validi. */
  readonly canContinue = computed(() => {
    return (
      !!this.selectedFieldId() &&
      !!this.calendarData() &&
      !this.isCalendarLoading() &&
      !this.calendarErrorMessage() &&
      !this.isClosedDay() &&
      !this.isReleasingLock() &&
      this.isTimeRangeValid()
    );
  });

  /** Inietta Router, ActivatedRoute e BookingService per navigazione, parametri e API calendario/lock. */
  constructor(
    private readonly router: Router,
    private readonly bookingService: BookingService,
  ) {}

  /**
   * Inizializza lo step data/ora.
   *
   * Carica il contesto salvato, ripristina eventuali orari, avvia gli aggiornamenti
   * realtime e rilascia eventuali lock precedenti prima di caricare il calendario.
   */
  ngOnInit(): void {
    this.loadBookingContext();

    if (!this.selectedSport() || !this.selectedFieldId()) {
      void this.router.navigate(['/dashboard/prenotazioni/campi']);
      return;
    }

    this.restoreSavedDateTime();
    this.ensureSelectedDateIsNotPast();
    this.releaseStoredLockOnPageEntryThenLoadCalendar();
    this.startCurrentTimeRefresh();
    this.startCalendarRealtimeRefresh();
  }

  /** Ferma i timer interni per evitare memory leak quando il componente viene distrutto. */
  ngOnDestroy(): void {
    this.calendarRealtimeSubscription?.unsubscribe();
    this.currentTimeSubscription?.unsubscribe();
  }

  /** Numero totale di step del wizard. */
  get totalSteps(): number {
    return this.steps.length;
  }

  /** Riporta il calendario alla data odierna e ricarica disponibilità/messaggi. */
  goToToday(): void {
    this.selectedDate.set(this.formatLocalDate(new Date()));
    this.afterDateChanged();
  }

  /** Sposta la selezione al giorno successivo e aggiorna il calendario. */
  goToNextDay(): void {
    this.selectedDate.set(
      this.formatLocalDate(this.addDays(this.toDateOnly(this.selectedDate()), 1)),
    );

    this.afterDateChanged();
  }

  /**
   * Gestisce la scelta di una data dal date picker.
   *
   * Rifiuta date nulle o passate e aggiorna lo stato dello step.
   */
  onDateSelected(date: Date | null): void {
    if (!date) {
      return;
    }

    if (this.isDateBeforeToday(date)) {
      this.selectedDate.set(this.formatLocalDate(new Date()));
      this.afterDateChanged();
      return;
    }

    this.selectedDate.set(this.formatLocalDate(date));
    this.afterDateChanged();
  }

  /** Aggiorna l'orario di inizio selezionato, riallineando fine e validazioni. */
  setStartTime(value: string): void {
    this.selectedStartTime.set(this.normalizeTime(value));
    this.ensureValidEndTimeForStart();
    this.formErrorMessage.set('');
    this.feedbackMessage.set('');
    this.persistSelectedDateTimeIfValid();
  }

  /** Aggiorna l'orario di fine selezionato e salva il range se valido. */
  setEndTime(value: string): void {
    this.selectedEndTime.set(this.normalizeTime(value));
    this.formErrorMessage.set('');
    this.feedbackMessage.set('');
    this.persistSelectedDateTimeIfValid();
  }

  /** Rilascia l'eventuale lock e torna alla scelta campo. */
  goBack(): void {
    const sport = this.selectedSport();

    void this.router.navigate(['/dashboard/prenotazioni/campi'], {
      queryParams: sport ? { sport } : undefined,
    });
  }

  /**
   * Valida data e ora e crea il lock necessario per proseguire.
   *
   * Per il calcetto salta lo step extra e naviga direttamente alla preview.
   */
  goNext(): void {
    this.formErrorMessage.set('');
    this.feedbackMessage.set('');

    const validationError = this.validateTimeSelection();

    if (validationError) {
      this.formErrorMessage.set(validationError);
      return;
    }

    this.persistSelectedDateTime();

    if (this.selectedSport() === 'CALCETTO') {
      this.clearBookingExtrasForCalcetto();
      this.createDateTimeFieldLockThenNavigate(['/dashboard/prenotazioni/riepilogo']);
      return;
    }

    this.clearInstructorSelectionIfDurationIsNotHourly();
    this.createDateTimeFieldLockThenNavigate(['/dashboard/prenotazioni/extra']);
  }

  /** TrackBy usato per la timeline degli step. */
  trackByStepLabel(_: number, step: BookingStep): string {
    return step.label;
  }

  /** TrackBy usato per le righe orarie del calendario. */
  trackByHour(_: number, slot: CalendarHourSlot): string {
    return slot.label;
  }

  /** TrackBy usato per le opzioni orarie. */
  trackByTime(_: number, time: string): string {
    return time;
  }

  /** TrackBy usato per gli eventi visualizzati nel calendario. */
  trackByCalendarEvent(_: number, event: CalendarEventView): string {
    return event.id;
  }

  /** Determina se uno step precedente deve risultare completato nella timeline. */
  isStepCompleted(index: number): boolean {
    return index + 1 <= this.currentStep;
  }

  /** Aggiorna periodicamente l'ora corrente per invalidare automaticamente slot nel passato. */
  private startCurrentTimeRefresh(): void {
    this.currentTimeSubscription?.unsubscribe();

    this.currentTimeSubscription = interval(30000).subscribe(() => {
      this.currentDateTime.set(new Date());
      this.ensureValidStartTime();
      this.ensureValidEndTimeForStart();
      this.updateAvailabilityMessage(this.calendarData());
    });
  }

  /** Ricarica periodicamente il calendario per riflettere prenotazioni/lock creati da altri utenti. */
  private startCalendarRealtimeRefresh(): void {
    this.calendarRealtimeSubscription?.unsubscribe();

    this.calendarRealtimeSubscription = interval(this.realtimeRefreshMs).subscribe(() => {
      if (!this.selectedFieldId() || this.isCalendarLoading() || this.realtimeRefreshInProgress) {
        return;
      }

      this.loadCalendarioCampo(true);
    });
  }

  /**
   * All'ingresso nella pagina rilascia un eventuale lock precedente e poi carica il calendario.
   *
   * Evita che lock vecchi del cliente blocchino artificialmente lo slot appena visualizzato.
   */
  private releaseStoredLockOnPageEntryThenLoadCalendar(): void {
    const lockId = this.getStoredLockId();

    if (!lockId) {
      this.clearBookingLock();
      this.loadCalendarioCampo();
      return;
    }

    this.isReleasingLock.set(true);

    this.bookingService
      .eliminaLockPrenotazione(lockId)
      .pipe(
        finalize(() => {
          this.isReleasingLock.set(false);
        }),
      )
      .subscribe({
        next: () => {
          this.clearBookingLock();
          this.loadCalendarioCampo();
        },
        error: () => {
          this.clearBookingLock();
          this.loadCalendarioCampo();
        },
      });
  }

  /** Crea un lock solo campo per gli sport che non richiedono istruttore e poi naviga alla route target. */
  private createDateTimeFieldLockThenNavigate(targetRoute: string[]): void {
    const campoId = this.selectedFieldId();

    if (!campoId) {
      this.formErrorMessage.set('Campo non selezionato.');
      return;
    }

    const existingLockId = this.getStoredLockId();
    const existingSignature = sessionStorage.getItem('booking.lockSignature');
    const currentSignature = this.buildDateTimeLockSignature(false, null);

    if (existingLockId && existingSignature === currentSignature && !this.isStoredLockExpired()) {
      void this.router.navigate(targetRoute);
      return;
    }

    if (existingLockId) {
      this.isReleasingLock.set(true);

      this.bookingService
        .eliminaLockPrenotazione(existingLockId)
        .pipe(
          finalize(() => {
            this.isReleasingLock.set(false);
          }),
        )
        .subscribe({
          next: () => {
            this.clearBookingLock();
            this.createDateTimeLockAndNavigate(targetRoute);
          },
          error: () => {
            this.clearBookingLock();
            this.createDateTimeLockAndNavigate(targetRoute);
          },
        });

      return;
    }

    this.createDateTimeLockAndNavigate(targetRoute);
  }

  /** Crea un lock completo sullo slot selezionato e poi naviga alla route target. */
  private createDateTimeLockAndNavigate(targetRoute: string[]): void {
    const campoId = this.selectedFieldId();

    if (!campoId) {
      this.formErrorMessage.set('Campo non selezionato.');
      return;
    }

    const request: CreateBookingLockRequestDto = {
      campoId,
      inizio: this.buildDateTimeParam(this.selectedDate(), this.selectedStartTime()),
      durataMinuti: this.selectedDurationMinutes(),
      conIstruttore: false,
      istruttoreId: null,
    };

    this.isReleasingLock.set(true);
    this.formErrorMessage.set('');
    this.feedbackMessage.set('');

    this.bookingService
      .creaLockPrenotazione(request)
      .pipe(
        finalize(() => {
          this.isReleasingLock.set(false);
        }),
      )
      .subscribe({
        next: (lock) => {
          this.persistLock(lock, this.buildDateTimeLockSignature(false, null));
          void this.router.navigate(targetRoute);
        },
        error: (error) => {
          console.error('Errore creazione lock data e ora:', error);
          this.clearBookingLock();
          this.formErrorMessage.set(
            'Non è stato possibile bloccare temporaneamente lo slot. Controlla che sia ancora disponibile.',
          );
          this.loadCalendarioCampo(true);
        },
      });
  }

  /** Pulisce gli extra quando lo sport è calcetto, perché non usa istruttore o racchette. */
  private clearBookingExtrasForCalcetto(): void {
    sessionStorage.setItem('booking.conIstruttore', 'false');
    sessionStorage.setItem('booking.racketsCount', '0');
    sessionStorage.setItem('booking.racketUnitPrice', '4');
    sessionStorage.setItem('booking.racketsCost', '0');
    sessionStorage.removeItem('booking.selectedInstructorId');
    sessionStorage.removeItem('booking.selectedInstructorName');
    sessionStorage.removeItem('booking.selectedInstructorHourlyRate');
  }

  /** Rimuove l'istruttore se la durata scelta non è multipla di 60 minuti. */
  private clearInstructorSelectionIfDurationIsNotHourly(): void {
    if (this.canUseInstructorWithSelectedDuration()) {
      return;
    }

    sessionStorage.setItem('booking.conIstruttore', 'false');
    sessionStorage.removeItem('booking.selectedInstructorId');
    sessionStorage.removeItem('booking.selectedInstructorName');
    sessionStorage.removeItem('booking.selectedInstructorHourlyRate');
  }

  /** Rimuove dal browser i dati del lock corrente. */
  private clearBookingLock(): void {
    sessionStorage.removeItem('booking.lockId');
    sessionStorage.removeItem('booking.lockSignature');
    sessionStorage.removeItem('booking.lockExpiresAt');
    this.notifyBookingLockChanged();
  }

  /** Salva id, scadenza e firma del lock per riutilizzarlo negli step successivi. */
  private persistLock(lock: BookingLockResponseDto, signature: string): void {
    sessionStorage.setItem('booking.lockId', String(lock.lockId));
    sessionStorage.setItem('booking.lockSignature', signature);
    sessionStorage.setItem('booking.lockExpiresAt', lock.scadeIl);
    this.notifyBookingLockChanged();
  }

  /** Costruisce una firma dello slot e dell'eventuale istruttore associato al lock. */
  private buildDateTimeLockSignature(conIstruttore: boolean, istruttoreId: number | null): string {
    return [
      this.selectedFieldId() ?? '',
      this.selectedDate(),
      this.selectedStartTime(),
      this.selectedEndTime(),
      this.selectedDurationMinutes(),
      conIstruttore,
      istruttoreId ?? '',
    ].join('|');
  }

  /** Controlla se il lock salvato in sessionStorage è già scaduto. */
  private isStoredLockExpired(): boolean {
    const expiresAt = sessionStorage.getItem('booking.lockExpiresAt');

    if (!expiresAt) {
      return true;
    }

    const expirationDate = new Date(expiresAt);

    if (Number.isNaN(expirationDate.getTime())) {
      return true;
    }

    return expirationDate.getTime() <= Date.now();
  }

  /** Notifica ai componenti interessati, come la sidebar, che il lock è cambiato. */
  private notifyBookingLockChanged(): void {
    window.dispatchEvent(new Event('booking-lock-updated'));
  }

  /** Combina data e ora in una stringa ISO locale compatibile con il backend. */
  private buildDateTimeParam(date: string, time: string): string {
    const normalizedTime = time.length === 5 ? `${time}:00` : time;
    return `${date}T${normalizedTime}`;
  }

  /** Rilascia il lock salvato tramite API e poi naviga alla route indicata. */
  private releaseStoredLockThenNavigate(targetRoute: string[], beforeNavigate?: () => void): void {
    const lockId = this.getStoredLockId();

    if (!lockId) {
      this.clearBookingLock();
      beforeNavigate?.();
      void this.router.navigate(targetRoute);
      return;
    }

    this.isReleasingLock.set(true);
    this.formErrorMessage.set('');
    this.feedbackMessage.set('');

    this.bookingService
      .eliminaLockPrenotazione(lockId)
      .pipe(
        finalize(() => {
          this.isReleasingLock.set(false);
        }),
      )
      .subscribe({
        next: () => {
          this.clearBookingLock();
          beforeNavigate?.();
          void this.router.navigate(targetRoute);
        },
        error: (error) => {
          console.warn('Lock già assente o non eliminabile durante cambio step:', error);

          this.clearBookingLock();
          beforeNavigate?.();
          void this.router.navigate(targetRoute);
        },
      });
  }

  /** Legge e valida l'id del lock salvato in sessionStorage. */
  private getStoredLockId(): number | null {
    const lockId = Number(sessionStorage.getItem('booking.lockId'));

    if (!Number.isFinite(lockId) || lockId <= 0) {
      return null;
    }

    return lockId;
  }

  /** Esegue le operazioni comuni dopo il cambio data: orari, messaggi e calendario. */
  private afterDateChanged(): void {
    this.ensureSelectedDateIsNotPast();
    this.formErrorMessage.set('');
    this.feedbackMessage.set('');
    this.loadCalendarioCampo();
  }

  /**
   * Carica dal backend il calendario del campo per la data selezionata.
   *
   * @param silent se true non mostra lo stato di loading durante il refresh periodico.
   */
  private loadCalendarioCampo(silent = false): void {
    const campoId = this.selectedFieldId();

    if (!campoId) {
      this.calendarErrorMessage.set('Campo non selezionato.');
      return;
    }

    // Se stiamo facendo un refresh periodico silenzioso, evitiamo di mostrare lo stato di caricamento
    if (silent) {
      this.realtimeRefreshInProgress = true;
    } else {
      this.isCalendarLoading.set(true);
      this.calendarErrorMessage.set('');
      this.formErrorMessage.set('');
      this.feedbackMessage.set('');
    }

    this.bookingService
      .getCalendarioCampo(campoId, this.selectedDate())
      .pipe(
        finalize(() => {
          if (silent) {
            this.realtimeRefreshInProgress = false;
          } else {
            this.isCalendarLoading.set(false);
          }
        }),
      )
      .subscribe({
        next: (calendar) => {
          this.calendarData.set(calendar);
          this.selectedFieldName.set(calendar.nomeCampo);
          this.selectedSport.set(calendar.sport);

          if (!silent) {
            this.isCalendarLoading.set(false);
          }

          this.ensureValidStartTime();
          this.ensureValidEndTimeForStart();
          this.updateAvailabilityMessage(calendar);
        },
        error: (error) => {
          if (silent) {
            console.warn('Aggiornamento real-time calendario non riuscito:', error);
            return;
          }

          console.error('Errore caricamento calendario campo:', error);

          this.calendarData.set(null);
          this.calendarErrorMessage.set(
            'Non è stato possibile caricare il calendario del campo.',
          );
        },
      });
  }


  /** Aggiorna il messaggio informativo in base allo stato del calendario e alla disponibilità dello slot. */
  private updateAvailabilityMessage(calendar: BookingFieldCalendarResponseDto | null): void {
    if (!calendar) {
      return;
    }

    if (calendar.chiuso) {
      this.formErrorMessage.set('Il centro è chiuso in questa data.');
      return;
    }

    if (this.startTimeOptions().length === 0) {
      if (this.isSelectedDateToday()) {
        this.formErrorMessage.set(
          "Per oggi non ci sono più orari prenotabili. Puoi prenotare solo dall'ora successiva a quella corrente.",
        );
      } else {
        this.formErrorMessage.set('Non ci sono intervalli disponibili per questa data.');
      }

      return;
    }

    this.formErrorMessage.set('');
    this.persistSelectedDateTimeIfValid();
  }

  /** Legge sport e campo selezionati dagli step precedenti e gestisce redirect se mancanti. */
  private loadBookingContext(): void {
    const sport = sessionStorage.getItem('booking.selectedSport');
    const fieldId = Number(sessionStorage.getItem('booking.selectedFieldId'));
    const fieldName = sessionStorage.getItem('booking.selectedFieldName') ?? '';

    if (isSport(sport)) {
      this.selectedSport.set(sport);
    }

    if (Number.isFinite(fieldId) && fieldId > 0) {
      this.selectedFieldId.set(fieldId);
    }

    this.selectedFieldName.set(fieldName);
  }

  /** Ripristina data e orari salvati se il cliente torna indietro nel wizard. */
  private restoreSavedDateTime(): void {
    const savedDate = sessionStorage.getItem('booking.selectedDate');
    const savedStartTime = sessionStorage.getItem('booking.startTime');
    const savedEndTime = sessionStorage.getItem('booking.endTime');

    if (savedDate) {
      this.selectedDate.set(savedDate);
    }

    if (savedStartTime) {
      this.selectedStartTime.set(this.normalizeTime(savedStartTime));
    }

    if (savedEndTime) {
      this.selectedEndTime.set(this.normalizeTime(savedEndTime));
    }
  }

  /**
   * Valida il range orario selezionato e restituisce il messaggio di errore, se presente.
   *
   * Controlla durata minima, allineamento a mezz'ora, orari passati e disponibilità.
   */
  private validateTimeSelection(): string {
    if (this.isCalendarLoading()) {
      return 'Attendi il caricamento del calendario.';
    }

    if (this.calendarErrorMessage()) {
      return this.calendarErrorMessage();
    }

    if (this.isClosedDay()) {
      return 'Il centro è chiuso in questa data.';
    }

    if (!this.selectedFieldId()) {
      return 'Campo non selezionato.';
    }

    if (!this.selectedDate()) {
      return 'Seleziona una data.';
    }

    if (this.isSelectedDateBeforeToday()) {
      return 'Puoi prenotare solo da oggi in poi.';
    }

    if (this.isSelectedStartBeforeMinimumAllowedTime()) {
      return "Per oggi puoi prenotare solo dall'ora successiva a quella corrente.";
    }

    if (!this.selectedStartTime()) {
      return "Seleziona l'ora di inizio.";
    }

    if (!this.selectedEndTime()) {
      return "Seleziona l'ora di fine.";
    }

    if (!this.startTimeOptions().includes(this.selectedStartTime())) {
      return "L'ora di inizio scelta non è disponibile.";
    }

    if (!this.endTimeOptions().includes(this.selectedEndTime())) {
      return "L'intervallo scelto si sovrappone a un evento non disponibile.";
    }

    return '';
  }

  /** Ritorna true se la selezione oraria supera tutte le validazioni. */
  private isTimeRangeValid(): boolean {
    if (
      this.isCalendarLoading() ||
      this.calendarErrorMessage() ||
      this.isClosedDay() ||
      !this.selectedDate() ||
      !this.selectedStartTime() ||
      !this.selectedEndTime()
    ) {
      return false;
    }

    const start = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.selectedStartTime()),
    );
    const end = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.selectedEndTime()),
    );
    const dayStart = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.bookingStartTime()),
    );
    const dayEnd = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.bookingEndTime()),
    );

    if (this.isSelectedDateBeforeToday()) {
      return false;
    }

    if (start < this.getMinimumSelectableStartDateTime()) {
      return false;
    }

    if (!this.isHalfHourAligned(this.selectedStartTime())) {
      return false;
    }

    if (!this.isHalfHourAligned(this.selectedEndTime())) {
      return false;
    }

    if (start < dayStart || end > dayEnd || end <= start) {
      return false;
    }

    const durationMinutes = this.minutesBetween(start, end);

    if (
      durationMinutes < this.minimumDurationMinutes ||
      durationMinutes % this.durationStepMinutes !== 0
    ) {
      return false;
    }

    return this.isIntervalAvailable(start, end);
  }

  /** Costruisce la lista degli orari di inizio selezionabili. */
  private buildStartTimeOptions(): string[] {
    if (
      !this.calendarData() ||
      this.isCalendarLoading() ||
      this.calendarErrorMessage() ||
      this.isClosedDay()
    ) {
      return [];
    }

    const options: string[] = [];

    const dayStart = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.bookingStartTime()),
    );

    const dayEnd = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.bookingEndTime()),
    );

    const latestValidStart = new Date(dayEnd);
    latestValidStart.setMinutes(
      latestValidStart.getMinutes() - this.minimumDurationMinutes,
    );

    const minimumSelectableStart = this.getMinimumSelectableStartDateTime();
    const cursor = dayStart < minimumSelectableStart
      ? new Date(minimumSelectableStart)
      : new Date(dayStart);

    while (cursor <= latestValidStart) {
      if (this.buildEndTimeOptionsForStart(cursor).length > 0) {
        options.push(this.formatTime(cursor));
      }

      cursor.setMinutes(cursor.getMinutes() + this.durationStepMinutes);
    }

    return options;
  }

  /** Costruisce la lista degli orari di fine validi rispetto all'inizio scelto. */
  private buildEndTimeOptionsForStart(start: Date): string[] {
    const options: string[] = [];

    const firstValidEnd = new Date(start);
    firstValidEnd.setMinutes(firstValidEnd.getMinutes() + this.minimumDurationMinutes);

    const dayEnd = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.bookingEndTime()),
    );

    const cursor = new Date(firstValidEnd);

    while (cursor <= dayEnd) {
      if (this.isIntervalAvailable(start, cursor)) {
        options.push(this.formatTime(cursor));
      }

      cursor.setMinutes(cursor.getMinutes() + this.durationStepMinutes);
    }

    return options;
  }

  /** Riallinea l'orario di inizio se non è più valido per la data o il calendario corrente. */
  private ensureValidStartTime(): void {
    const availableStartTimes = this.startTimeOptions();

    if (availableStartTimes.length === 0) {
      this.selectedStartTime.set('');
      return;
    }

    if (!availableStartTimes.includes(this.selectedStartTime())) {
      this.selectedStartTime.set(availableStartTimes[0]);
    }
  }

  /** Riallinea l'orario di fine quando cambia l'inizio o quando non è più valido. */
  private ensureValidEndTimeForStart(): void {
    const availableEndTimes = this.endTimeOptions();

    if (availableEndTimes.length === 0) {
      this.selectedEndTime.set('');
      return;
    }

    if (!availableEndTimes.includes(this.selectedEndTime())) {
      this.selectedEndTime.set(availableEndTimes[0]);
    }
  }

  /** Verifica che il range selezionato non si sovrapponga a eventi bloccanti. */
  private isIntervalAvailable(start: Date, end: Date): boolean {
    return !this.getBlockingEvents().some((event) => {
      const eventStart = new Date(event.inizio);
      const eventEnd = new Date(event.fine);

      return start < eventEnd && end > eventStart;
    });
  }

  /** Restituisce gli eventi del calendario che bloccano la selezione cliente. */
  private getBlockingEvents(): BookingCalendarEventResponseDto[] {
    return (this.calendarData()?.eventi ?? []).filter(
      (event) => event.selezionabile === false,
    );
  }

  /** Crea gli overlay grafici per le eccezioni orario del centro. */
  private buildCenterExceptionEventViews(): CalendarEventView[] {
    const calendar = this.calendarData();

    if (!calendar) {
      return [];
    }

    const displayStart = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.dayStartTime()),
    );
    const displayEnd = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.dayEndTime()),
    );
    const totalMinutes = Math.max(60, this.minutesBetween(displayStart, displayEnd));

    if (calendar.chiuso) {
      return [
        this.buildSyntheticCenterExceptionEventView(
          'center-closed-full-day',
          'Centro chiuso',
          displayStart,
          displayEnd,
          `${this.dayStartTime()} - ${this.dayEndTime()}`,
          totalMinutes,
        ),
      ];
    }

    const bookingStart = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.bookingStartTime()),
    );
    const bookingEnd = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.bookingEndTime()),
    );

    const events: CalendarEventView[] = [];

    if (bookingStart > displayStart) {
      events.push(
        this.buildSyntheticCenterExceptionEventView(
          'center-exception-before-opening',
          'Centro non prenotabile',
          displayStart,
          bookingStart,
          `${this.dayStartTime()} - ${this.bookingStartTime()}`,
          totalMinutes,
        ),
      );
    }

    if (bookingEnd < displayEnd) {
      events.push(
        this.buildSyntheticCenterExceptionEventView(
          'center-exception-after-closing',
          'Centro non prenotabile',
          bookingEnd,
          displayEnd,
          `${this.bookingEndTime()} - ${this.dayEndTime()}`,
          totalMinutes,
        ),
      );
    }

    return events;
  }

  /** Costruisce un evento sintetico per rappresentare una fascia chiusa da eccezione centro. */
  private buildSyntheticCenterExceptionEventView(
    id: string,
    titolo: string,
    start: Date,
    end: Date,
    timeLabel: string,
    totalMinutes: number,
  ): CalendarEventView {
    const displayStart = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.dayStartTime()),
    );

    return {
      id,
      tipo: 'ECCEZIONE_ORARI_CENTRO',
      titolo,
      topPct: this.getCalendarTopPct(displayStart, start, totalMinutes),
      heightPct: this.getCalendarHeightPct(
        Math.max(1, this.minutesBetween(start, end)),
        totalMinutes,
      ),
      timeLabel,
      cssClass: 'field-event-center-exception',
      icon: 'event_busy',
    };
  }

  /** Converte un evento backend in evento visuale posizionato sulla timeline. */
  private toCalendarEventView(
    event: BookingCalendarEventResponseDto,
    index: number,
  ): CalendarEventView | null {
    const dayStart = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.dayStartTime()),
    );
    const dayEnd = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.dayEndTime()),
    );

    const eventStart = new Date(event.inizio);
    const eventEnd = new Date(event.fine);

    const visibleStart = eventStart < dayStart ? dayStart : eventStart;
    const visibleEnd = eventEnd > dayEnd ? dayEnd : eventEnd;

    if (visibleEnd <= visibleStart) {
      return null;
    }

    const totalMinutes = Math.max(60, this.minutesBetween(dayStart, dayEnd));
    const durationMinutes = Math.max(1, this.minutesBetween(visibleStart, visibleEnd));

    const titolo = this.getGenericTitleForClient(event.tipo, event.titolo);

    return {
      id: `${event.tipo}-${event.prenotazioneId ?? event.lockId ?? index}-${event.inizio}`,
      tipo: event.tipo,
      titolo: titolo,
      topPct: this.getCalendarTopPct(dayStart, visibleStart, totalMinutes),
      heightPct: this.getCalendarHeightPct(durationMinutes, totalMinutes),
      timeLabel: `${this.extractTimeFromDateTime(event.inizio)} - ${this.extractTimeFromDateTime(event.fine)}`,
      cssClass: this.getCalendarEventCssClass(event.tipo),
      icon: this.getCalendarEventIcon(event.tipo),
    };
  }

  /** Restituisce un titolo generico lato cliente, evitando dettagli non necessari su eventi interni. */
  private getGenericTitleForClient(tipo: string, originalTitle: string | null): string {
    switch (tipo) {
      case 'PRENOTAZIONE':
      case 'LEZIONE':
        return 'Slot occupato';
      case 'MANUTENZIONE':
        return 'Manutenzione campo';
      case 'LOCK':
        return 'Blocco temporaneo';
      case 'FESTIVITA':
        return 'Centro chiuso';
      case 'ECCEZIONE_ISTRUTTORE':
        return 'Slot non disponibile';
      case 'ECCEZIONE_ORARIO_CENTRO':
      case 'ECCEZIONE_ORARI_CENTRO':
      case 'ECCEZIONE_CENTRO':
        return originalTitle || 'Orario eccezionale';
      default:
        return 'Non disponibile';
    }
  }

  /** Associa il tipo evento backend alla classe CSS usata dal calendario. */
  private getCalendarEventCssClass(tipo: string): string {
    switch (tipo) {
      case 'PRENOTAZIONE':
      case 'LEZIONE':
        return 'field-event-booking';

      case 'MANUTENZIONE':
        return 'field-event-maintenance';

      case 'LOCK':
        return 'field-event-lock';

      case 'FESTIVITA':
        return 'field-event-center-closed';

      case 'ECCEZIONE_ORARIO_CENTRO':
      case 'ECCEZIONE_ORARI_CENTRO':
      case 'ECCEZIONE_CENTRO':
        return 'field-event-special-center-hours';

      default:
        return 'field-event-default';
    }
  }

  /** Associa il tipo evento backend all'icona Material mostrata nell'evento. */
  private getCalendarEventIcon(tipo: string): string {
    switch (tipo) {
      case 'PRENOTAZIONE':
      case 'LEZIONE':
        return 'event_busy';

      case 'MANUTENZIONE':
        return 'build';

      case 'LOCK':
        return 'lock_clock';

      case 'FESTIVITA':
        return 'domain_disabled';

      case 'ECCEZIONE_ORARIO_CENTRO':
      case 'ECCEZIONE_ORARI_CENTRO':
      case 'ECCEZIONE_CENTRO':
        return 'schedule';

      default:
        return 'block';
    }
  }

  /** Calcola il primo istante selezionabile tenendo conto della data odierna e dell'orario corrente. */
  private getMinimumSelectableStartDateTime(): Date {
    const selectedDay = this.toDateOnly(this.selectedDate());
    const today = this.toDateOnly(this.formatLocalDate(this.currentDateTime()));

    if (selectedDay.getTime() !== today.getTime()) {
      return new Date(this.buildHtmlDateTime(this.selectedDate(), this.bookingStartTime()));
    }

    const nextBookableHour = new Date(this.currentDateTime());
    nextBookableHour.setMinutes(0, 0, 0);
    nextBookableHour.setHours(nextBookableHour.getHours() + 1);

    const bookingStart = new Date(this.buildHtmlDateTime(this.selectedDate(), this.bookingStartTime()));

    return nextBookableHour > bookingStart ? nextBookableHour : bookingStart;
  }

  /** Controlla se l'inizio selezionato è precedente al minimo ammesso. */
  private isSelectedStartBeforeMinimumAllowedTime(): boolean {
    if (!this.selectedDate() || !this.selectedStartTime()) {
      return false;
    }

    const selectedStart = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.selectedStartTime()),
    );

    return selectedStart < this.getMinimumSelectableStartDateTime();
  }

  /** Verifica che l'orario sia allineato a minuti 00 o 30. */
  private isHalfHourAligned(time: string): boolean {
    const normalizedTime = this.normalizeTime(time);
    const minute = Number(normalizedTime.slice(3, 5));

    return minute === 0 || minute === 30;
  }

  /** Salva data e ora solo quando la selezione corrente è valida. */
  private persistSelectedDateTimeIfValid(): void {
    if (!this.isTimeRangeValid()) {
      return;
    }

    this.persistSelectedDateTime();
  }

  /** Salva nel browser data, ora di inizio, ora di fine e durata. */
  private persistSelectedDateTime(): void {
    sessionStorage.setItem('booking.selectedDate', this.selectedDate());
    sessionStorage.setItem('booking.startTime', this.selectedStartTime());
    sessionStorage.setItem('booking.endTime', this.selectedEndTime());
    sessionStorage.setItem(
      'booking.durationMinutes',
      String(this.selectedDurationMinutes()),
    );
  }

  /** Costruisce le righe orarie della timeline visibile. */
  private buildHourSlots(): CalendarHourSlot[] {
    const slots: CalendarHourSlot[] = [];

    const dayStart = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.dayStartTime()),
    );
    const dayEnd = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.dayEndTime()),
    );
    const totalMinutes = Math.max(60, this.minutesBetween(dayStart, dayEnd));

    const cursor = new Date(dayStart);

    while (cursor <= dayEnd) {
      slots.push({
        label: this.formatTime(cursor),
        topPct: this.getCalendarTopPct(dayStart, cursor, totalMinutes),
      });

      cursor.setHours(cursor.getHours() + 1);
    }

    return slots;
  }

  /** Costruisce un valore compatibile con input datetime-local combinando data e ora. */
  private buildHtmlDateTime(date: string, time: string): string {
    const normalizedTime = this.normalizeTime(time);

    if (normalizedTime === '24:00') {
      const nextDay = this.addDays(this.toDateOnly(date), 1);
      return `${this.formatLocalDate(nextDay)}T00:00`;
    }

    return `${date}T${normalizedTime}`;
  }

  /** Normalizza un orario nel formato HH:mm. */
  private normalizeTime(time: string): string {
    if (!time) {
      return '';
    }

    return time.length === 5 ? time : time.slice(0, 5);
  }

  /** Estrae l'orario HH:mm da una data completa restituita dal backend. */
  private extractTimeFromDateTime(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const timePart = value.split('T')[1];

    if (!timePart || timePart.length < 5) {
      return null;
    }

    return timePart.slice(0, 5);
  }

  /** Normalizza l'orario di chiusura gestendo anche il caso mezzanotte. */
  private normalizeClosingTime(time: string): string {
    const normalizedTime = this.normalizeTime(time);

    if (normalizedTime === '00:00') {
      return '24:00';
    }

    return normalizedTime;
  }

  /** Se la data selezionata è passata, la sostituisce con la data odierna. */
  private ensureSelectedDateIsNotPast(): void {
    if (this.isSelectedDateBeforeToday()) {
      this.selectedDate.set(this.formatLocalDate(new Date()));
    }
  }

  /** Indica se la data selezionata è precedente a oggi. */
  private isSelectedDateBeforeToday(): boolean {
    return this.isDateBeforeToday(this.toDateOnly(this.selectedDate()));
  }

  /** Indica se la data selezionata corrisponde a oggi. */
  private isSelectedDateToday(): boolean {
    const selectedDay = this.toDateOnly(this.selectedDate());
    const today = this.toDateOnly(this.formatLocalDate(this.currentDateTime()));

    return selectedDay.getTime() === today.getTime();
  }

  /** Controlla se una data è precedente alla data odierna. */
  private isDateBeforeToday(date: Date): boolean {
    const value = this.toDateOnly(this.formatLocalDate(date));
    const today = this.toDateOnly(this.formatLocalDate(new Date()));

    return value < today;
  }

  /** Converte una stringa data in Date impostata all'inizio del giorno locale. */
  private toDateOnly(value: string): Date {
    return new Date(`${value}T00:00:00`);
  }

  /** Format locale yyyy-MM-dd usato da input date e sessionStorage. */
  private formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  /** Restituisce una nuova data aggiungendo un numero di giorni alla data indicata. */
  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  /** Calcola i minuti tra due istanti. */
  private minutesBetween(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / 60000);
  }

  /** Calcola la percentuale top di un evento rispetto alla giornata visibile. */
  private getCalendarTopPct(dayStart: Date, value: Date, totalMinutes: number): number {
    const usablePct = 100 - this.calendarVerticalInsetPct * 2;

    return (
      this.calendarVerticalInsetPct +
      (this.minutesBetween(dayStart, value) / totalMinutes) * usablePct
    );
  }

  /** Calcola l'altezza percentuale di un evento rispetto alla durata totale visibile. */
  private getCalendarHeightPct(durationMinutes: number, totalMinutes: number): number {
    const usablePct = 100 - this.calendarVerticalInsetPct * 2;
    return (durationMinutes / totalMinutes) * usablePct;
  }

  /** Format interno dell'orario HH:mm. */
  private formatTime(date: Date): string {
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    return `${hour}:${minute}`;
  }
}
