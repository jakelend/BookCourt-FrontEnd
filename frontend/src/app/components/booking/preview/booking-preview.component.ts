import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import type { CreateBookingLockRequestDto } from '../../../dto/request/booking/create-booking-lock-request.dto';
import type { BookingSport } from '../../../dto/response/booking/booking-field-response.dto';
import type { BookingLockResponseDto } from '../../../dto/response/booking/booking-lock-response.dto';
import type { BookingPreviewResponseDto } from '../../../dto/response/booking/booking-preview-response.dto';
import { isSport } from '../../../enumeration/sport.enum';
import { BookingService } from '../../../services/booking.service';

/**
 * Singolo step mostrato nella timeline del flusso di prenotazione.
 */
interface BookingStep {
  label: string;
}

/**
 * Step di riepilogo e conferma della prenotazione.
 *
 * Crea o riutilizza il lock dello slot, richiede al backend il preventivo
 * economico e, alla conferma, trasforma il lock in prenotazione definitiva.
 */
@Component({
  selector: 'app-booking-preview',
  imports: [CommonModule],
  templateUrl: './booking-preview.component.html',
  styleUrl: './booking-preview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingPreviewComponent implements OnInit {
  /** Step corrente nella timeline del wizard. */
  readonly currentStep = 5;

  readonly steps: BookingStep[] = [
    { label: 'Sport' },
    { label: 'Campo' },
    { label: 'Data e ora' },
    { label: 'Extra' },
    { label: 'Riepilogo' },
    { label: 'Pagamento' },
  ];

  /** Dati principali della prenotazione ricostruiti da sessionStorage. */
  readonly selectedSport = signal<BookingSport | null>(null);
  readonly selectedFieldId = signal<number | null>(null);
  readonly selectedFieldName = signal('');
  readonly selectedDate = signal('');
  readonly selectedStartTime = signal('');
  readonly selectedEndTime = signal('');
  readonly durationMinutes = signal(0);

  /** Dati relativi all'eventuale istruttore scelto nello step extra. */
  readonly conIstruttore = signal(false);
  readonly selectedInstructorId = signal<number | null>(null);
  readonly selectedInstructorName = signal('Nessun istruttore');
  readonly selectedInstructorHourlyRate = signal(0);

  /** Dati relativi ai partecipanti e alle racchette scelti dal cliente. */
  readonly participantsCount = signal(1);
  readonly racketsCount = signal(0);
  readonly racketUnitPrice = signal(4);

  /** Lock corrente sullo slot selezionato, necessario per calcolare e confermare la prenotazione. */
  readonly lock = signal<BookingLockResponseDto | null>(null);
  /** Preventivo economico restituito dal backend prima della conferma. */
  readonly preview = signal<BookingPreviewResponseDto | null>(null);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly feedbackMessage = signal('');
  readonly isReleasingLock = signal(false);
  readonly isConfirming = signal(false);

  readonly selectedSportLabel = computed(() => {
    switch (this.selectedSport()) {
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

  readonly isExtraSport = computed(() => {
    const sport = this.selectedSport();
    return sport === 'TENNIS' || sport === 'PADEL';
  });

  readonly selectedDateTitle = computed(() => {
    const date = this.selectedDate();

    if (!date) {
      return '-';
    }

    return new Date(`${date}T00:00:00`).toLocaleDateString('it-IT', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  });

  readonly timeLabel = computed(() => {
    if (!this.selectedStartTime() || !this.selectedEndTime()) {
      return '-';
    }

    return `${this.selectedStartTime()} - ${this.selectedEndTime()}`;
  });

  readonly durationLabel = computed(() => {
    const minutes = this.durationMinutes();

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

  readonly racketsLabel = computed(() => {
    const count = this.racketsCount();

    if (count === 0) {
      return 'Nessuna racchetta';
    }

    if (count === 1) {
      return '1 racchetta';
    }

    return `${count} racchette`;
  });

  /** Abilita il pulsante di conferma solo quando preview e stati asincroni sono coerenti. */
  readonly canConfirm = computed(() => {
    return (
      !!this.preview() &&
      !this.isLoading() &&
      !this.isReleasingLock() &&
      !this.isConfirming() &&
      !this.errorMessage()
    );
  });
  /** Inietta Router e BookingService per gestire preview, lock e conferma. */
  constructor(
    private readonly router: Router,
    private readonly bookingService: BookingService,
  ) {}

  /**
   * Inizializza la preview.
   *
   * Ricostruisce il contesto, verifica validità e scadenza del lock, normalizza
   * gli extra per il calcetto e carica il preventivo dal backend.
   */
  ngOnInit(): void {
    this.loadBookingContext();

    if (!this.hasRequiredBookingContext()) {
      void this.router.navigate(['/dashboard/prenotazioni/orario']);
      return;
    }

    if (this.isStoredLockTimerExpired()) {
      this.clearLockStorage();
      void this.router.navigate(['/dashboard/prenotazioni/orario']);
      return;
    }

    if (this.selectedSport() === 'CALCETTO') {
      this.normalizeCalcettoExtras();
    }

    this.loadPreview();
  }

  /** Numero totale di step del wizard. */
  get totalSteps(): number {
    return this.steps.length;
  }

  /** Rilascia il lock corrente e torna allo step precedente corretto per lo sport selezionato. */
  goBack(): void {
    const targetRoute =
      this.selectedSport() === 'CALCETTO'
        ? ['/dashboard/prenotazioni/orario']
        : ['/dashboard/prenotazioni/extra'];

    const keepTimerActive = this.selectedSport() !== 'CALCETTO';

    this.releaseCurrentLockAndNavigate(targetRoute, keepTimerActive);
  }

  /**
   * Conferma definitivamente la prenotazione usando il lock salvato.
   *
   * In caso di successo salva i dati necessari alla pagina di conferma e pulisce
   * i dati del lock per evitare conferme duplicate.
   */

  confirmBooking(): void {
    const lockId = this.getStoredLockId();

    this.errorMessage.set('');
    this.feedbackMessage.set('');

    if (!lockId) {
      this.errorMessage.set(
        'Lock prenotazione non trovato. Ricalcola il riepilogo prima di confermare.',
      );
      return;
    }

    if (this.isStoredLockTimerExpired()) {
      this.clearLockStorage();
      this.errorMessage.set('Tempo scaduto: seleziona di nuovo data e ora per bloccare lo slot.');
      void this.router.navigate(['/dashboard/prenotazioni/orario']);
      return;
    }

    this.isConfirming.set(true);

    this.bookingService
      .confermaPrenotazione({
        lockId,
        numeroPartecipanti: this.participantsCount(),
        numeroRacchette: this.racketsCount(),
      })
      .pipe(
        finalize(() => {
          this.isConfirming.set(false);
        }),
      )
      .subscribe({
        next: (prenotazione) => {
          sessionStorage.setItem(
            'booking.confirmedReservation',
            JSON.stringify(prenotazione),
          );
          sessionStorage.setItem('booking.confirmedFieldName', this.selectedFieldName());
          sessionStorage.setItem('booking.confirmedSport', this.selectedSport() ?? '');
          sessionStorage.setItem('booking.confirmedInstructorName', this.selectedInstructorName());
          sessionStorage.setItem('booking.confirmedDateTitle', this.selectedDateTitle());
          sessionStorage.setItem('booking.confirmedTimeLabel', this.timeLabel());
          sessionStorage.setItem('booking.confirmedDurationLabel', this.durationLabel());
          sessionStorage.setItem('booking.confirmedRacketsLabel', this.racketsLabel());
          sessionStorage.setItem('booking.confirmedTotal', String(prenotazione.costoTotale ?? 0));

          this.clearLockStorage();

          void this.router.navigate(['/dashboard/prenotazioni/conferma']);
        },
        error: (error) => {
          console.error('Errore conferma prenotazione:', error);

          this.errorMessage.set(
            'Non è stato possibile confermare la prenotazione. Controlla che il lock sia ancora valido e riprova.',
          );
        },
      });
  }

  /** TrackBy usato per la timeline degli step. */
  trackByStepLabel(_: number, step: BookingStep): string {
    return step.label;
  }

  /** Determina se uno step precedente deve risultare completato nella timeline. */
  isStepCompleted(index: number): boolean {
    return index + 1 <= this.currentStep;
  }

  /** Format di un importo in euro. */
  formatCurrency(value: number | null | undefined): string {
    const amount = Number(value ?? 0);

    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  }

  /** Legge da sessionStorage tutti i dati raccolti negli step precedenti. */
  private loadBookingContext(): void {
    const sport = sessionStorage.getItem('booking.selectedSport');
    const fieldId = Number(sessionStorage.getItem('booking.selectedFieldId'));
    const duration = Number(sessionStorage.getItem('booking.durationMinutes') ?? 0);
    const instructorId = Number(sessionStorage.getItem('booking.selectedInstructorId'));
    const instructorRate = Number(sessionStorage.getItem('booking.selectedInstructorHourlyRate') ?? 0);
    const participants = Number(sessionStorage.getItem('booking.participantsCount') ?? 1);
    const rackets = Number(sessionStorage.getItem('booking.racketsCount') ?? 0);
    const racketPrice = Number(sessionStorage.getItem('booking.racketUnitPrice') ?? 4);

    if (isSport(sport)) {
      this.selectedSport.set(sport);
    }

    if (Number.isFinite(fieldId) && fieldId > 0) {
      this.selectedFieldId.set(fieldId);
    }

    if (Number.isFinite(duration) && duration > 0) {
      this.durationMinutes.set(duration);
    }

    if (Number.isFinite(instructorId) && instructorId > 0) {
      this.selectedInstructorId.set(instructorId);
    }

    if (Number.isFinite(instructorRate) && instructorRate >= 0) {
      this.selectedInstructorHourlyRate.set(instructorRate);
    }

    if (Number.isFinite(participants) && participants >= 1 && participants <= 4) {
      this.participantsCount.set(participants);
    }

    if (Number.isFinite(rackets) && rackets >= 0 && rackets <= 4) {
      this.racketsCount.set(rackets);
    }

    if (Number.isFinite(racketPrice) && racketPrice >= 0) {
      this.racketUnitPrice.set(racketPrice);
    }

    this.selectedFieldName.set(sessionStorage.getItem('booking.selectedFieldName') ?? '');
    this.selectedDate.set(sessionStorage.getItem('booking.selectedDate') ?? '');
    this.selectedStartTime.set(sessionStorage.getItem('booking.startTime') ?? '');
    this.selectedEndTime.set(sessionStorage.getItem('booking.endTime') ?? '');
    this.selectedInstructorName.set(sessionStorage.getItem('booking.selectedInstructorName') ?? 'Nessun istruttore');
    this.conIstruttore.set(sessionStorage.getItem('booking.conIstruttore') === 'true');
  }

  /** Verifica che il contesto minimo per calcolare la preview sia completo. */
  private hasRequiredBookingContext(): boolean {
    return Boolean(
      this.selectedSport() &&
      this.selectedFieldId() &&
      this.selectedDate() &&
      this.selectedStartTime() &&
      this.selectedEndTime() &&
      this.durationMinutes() > 0,
    );
  }

  /** Rimuove istruttore e racchette per il calcetto, perché non prevede extra. */
  private normalizeCalcettoExtras(): void {
    this.conIstruttore.set(false);
    this.selectedInstructorId.set(null);
    this.selectedInstructorName.set('Nessun istruttore');
    this.selectedInstructorHourlyRate.set(0);
    this.racketsCount.set(0);
    this.racketUnitPrice.set(4);

    sessionStorage.setItem('booking.conIstruttore', 'false');
    sessionStorage.setItem('booking.racketsCount', '0');
    sessionStorage.setItem('booking.racketUnitPrice', '4');
    sessionStorage.setItem('booking.racketsCost', '0');
    sessionStorage.removeItem('booking.selectedInstructorId');
    sessionStorage.removeItem('booking.selectedInstructorName');
    sessionStorage.removeItem('booking.selectedInstructorHourlyRate');
  }

  /** Decide se usare un lock esistente o crearne uno nuovo prima di chiedere il preventivo. */
  private loadPreview(): void {
    this.errorMessage.set('');
    this.feedbackMessage.set('');
    this.preview.set(null);

    const storedLockId = Number(sessionStorage.getItem('booking.lockId'));
    const storedSignature = sessionStorage.getItem('booking.lockSignature');
    const currentSignature = this.buildLockSignature();

    if (
      Number.isFinite(storedLockId) &&
      storedLockId > 0 &&
      storedSignature === currentSignature
    ) {
      this.loadPreviewFromLock(storedLockId, true);
      return;
    }

    if (Number.isFinite(storedLockId) && storedLockId > 0) {
      this.releaseCurrentLockThenRun(() => this.createLockAndLoadPreview(), false);
      return;
    }

    this.clearLockStorage(false);
    this.createLockAndLoadPreview();
  }

  /** Crea un nuovo lock coerente con il contesto corrente e poi carica la preview. */
  private createLockAndLoadPreview(): void {
    const campoId = this.selectedFieldId();

    if (!campoId) {
      this.errorMessage.set('Campo non selezionato.');
      return;
    }

    const request: CreateBookingLockRequestDto = {
      campoId,
      inizio: this.buildDateTimeParam(this.selectedDate(), this.selectedStartTime()),
      durataMinuti: this.durationMinutes(),
      conIstruttore: this.conIstruttore(),
      istruttoreId: this.conIstruttore() ? this.selectedInstructorId() : null,
    };

    this.isLoading.set(true);

    this.bookingService
      .creaLockPrenotazione(request)
      .pipe(
        finalize(() => {
          this.isLoading.set(false);
        }),
      )
      .subscribe({
        next: (lock) => {
          this.lock.set(lock);
          this.persistLock(lock);
          this.loadPreviewFromLock(lock.lockId, false);
        },
        error: (error) => {
          console.error('Errore creazione lock prenotazione:', error);
          this.clearLockStorage();
          this.errorMessage.set(
            'Non è stato possibile bloccare temporaneamente lo slot selezionato. Controlla che sia ancora disponibile.',
          );
        },
      });
  }

  /**
   * Richiede al backend il preventivo economico associato al lock.
   *
   * @param lockId id del lock da usare.
   * @param retryWithNewLock se true, in caso di errore riprova creando un nuovo lock.
   */
  private loadPreviewFromLock(lockId: number, retryWithNewLock: boolean): void {
    this.isLoading.set(true);

    this.bookingService
      .getPreviewPrenotazione({
        lockId,
        numeroPartecipanti: this.participantsCount(),
        numeroRacchette: this.racketsCount(),
      })
      .pipe(
        finalize(() => {
          this.isLoading.set(false);
        }),
      )
      .subscribe({
        next: (preview) => {
          this.preview.set(preview);
          sessionStorage.setItem('booking.previewCostoCampo', String(preview.costoCampo));
          sessionStorage.setItem('booking.previewCostoIstruttore', String(preview.costoIstruttore));
          sessionStorage.setItem('booking.previewCostoRacchette', String(preview.costoRacchette));
          sessionStorage.setItem('booking.previewTotale', String(preview.totale));
        },
        error: (error) => {
          console.error('Errore preview prenotazione:', error);

          if (retryWithNewLock) {
            this.releaseCurrentLockThenRun(() => this.createLockAndLoadPreview(), false);
            return;
          }

          this.clearLockStorage();
          this.errorMessage.set(
            'Non è stato possibile calcolare il riepilogo della prenotazione.',
          );
        },
      });
  }

  /** Salva nel browser id, scadenza e firma del lock corrente. */
  private persistLock(lock: BookingLockResponseDto): void {
    sessionStorage.setItem('booking.lockId', String(lock.lockId));
    sessionStorage.setItem('booking.lockSignature', this.buildLockSignature());
    sessionStorage.setItem('booking.lockExpiresAt', this.resolveLockTimerExpiration(lock.scadeIl));
    this.notifyBookingLockChanged();
  }

  /** Rimuove i dati del lock e, opzionalmente, il timer condiviso. */
  private clearLockStorage(clearTimer = true): void {
    this.lock.set(null);
    sessionStorage.removeItem('booking.lockId');
    sessionStorage.removeItem('booking.lockSignature');

    if (clearTimer) {
      sessionStorage.removeItem('booking.lockExpiresAt');
    }

    this.notifyBookingLockChanged();
  }

  /** Mantiene la scadenza timer esistente se ancora valida, altrimenti usa quella del nuovo lock. */
  private resolveLockTimerExpiration(newExpiration: string): string {
    const currentExpiration = sessionStorage.getItem('booking.lockExpiresAt');

    if (currentExpiration && !this.isLockExpirationExpired(currentExpiration)) {
      return currentExpiration;
    }

    return newExpiration;
  }

  /** Indica se il timer del lock salvato è scaduto. */
  private isStoredLockTimerExpired(): boolean {
    return this.isLockExpirationExpired(sessionStorage.getItem('booking.lockExpiresAt'));
  }

  /** Controlla se una specifica data di scadenza lock è già passata. */
  private isLockExpirationExpired(expiration: string | null): boolean {
    if (!expiration) {
      return true;
    }

    const expirationDate = new Date(expiration);

    if (Number.isNaN(expirationDate.getTime())) {
      return true;
    }

    return expirationDate.getTime() <= Date.now();
  }

  /** Rilascia il lock attuale e poi naviga alla route indicata. */
  private releaseCurrentLockAndNavigate(targetRoute: string[], keepTimerActive = false): void {
    this.releaseCurrentLockThenRun(() => {
      void this.router.navigate(targetRoute);
    }, !keepTimerActive);
  }

  /**
   * Rilascia il lock corrente e poi invoca una callback.
   *
   * Se non esiste un lock valido, esegue comunque la callback.
   */
  private releaseCurrentLockThenRun(afterRelease: () => void, clearTimer = true): void {
    const lockId = this.getStoredLockId();

    if (!lockId) {
      this.clearLockStorage(clearTimer);
      afterRelease();
      return;
    }

    this.isReleasingLock.set(true);
    this.errorMessage.set('');
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
          this.clearLockStorage(clearTimer);
          afterRelease();
        },
        error: (error) => {
          console.warn('Lock già assente o non eliminabile:', error);

          this.clearLockStorage(clearTimer);
          afterRelease();
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

  /** Costruisce una firma dello slot e degli extra per capire se il lock salvato è ancora coerente. */
  private buildLockSignature(): string {
    return [
      this.selectedFieldId() ?? '',
      this.selectedDate(),
      this.selectedStartTime(),
      this.selectedEndTime(),
      this.durationMinutes(),
      this.conIstruttore(),
      this.selectedInstructorId() ?? '',
    ].join('|');
  }

  /** Notifica ai componenti interessati che il timer lock è stato aggiornato o rimosso. */
  private notifyBookingLockChanged(): void {
    window.dispatchEvent(new Event('booking-lock-updated'));
  }

  /** Costruisce una data ISO locale combinando giorno e orario selezionati. */
  private buildDateTimeParam(date: string, time: string): string {
    const normalizedTime = time.length === 5 ? `${time}:00` : time;
    return `${date}T${normalizedTime}`;
  }
}
