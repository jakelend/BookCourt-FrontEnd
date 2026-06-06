import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import type { CreateBookingLockRequestDto } from '../../../dto/request/booking/create-booking-lock-request.dto';
import type { BookingAvailableInstructorResponseDto } from '../../../dto/response/booking/booking-available-instructor-response.dto';
import type { BookingSport } from '../../../dto/response/booking/booking-field-response.dto';
import { isSport } from '../../../enumeration/sport.enum';
import { BookingService } from '../../../services/booking.service';
import { ImageUrlUtil } from '../../../util/image-url.util';

/**
 * Singolo step mostrato nella timeline del flusso di prenotazione.
 */
interface BookingStep {
  label: string;
}

/**
 * Step extra della prenotazione, usato per tennis e padel.
 *
 * Permette di scegliere un istruttore disponibile e il numero di racchette,
 * mantenendo attivo il lock sullo slot scelto prima di arrivare alla preview.
 */
@Component({
  selector: 'app-booking-extra-selection',
  imports: [CommonModule, FormsModule],
  templateUrl: './booking-extra-selection.component.html',
  styleUrl: './booking-extra-selection.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingExtraSelectionComponent implements OnInit {
  readonly currentStep = 4;

  readonly steps: BookingStep[] = [
    { label: 'Sport' },
    { label: 'Campo' },
    { label: 'Data e ora' },
    { label: 'Extra' },
    { label: 'Riepilogo' },
    { label: 'Pagamento' },
  ];

  /** Contesto principale della prenotazione selezionato negli step precedenti. */
  readonly selectedSport = signal<BookingSport | null>(null);
  readonly selectedFieldId = signal<number | null>(null);
  readonly selectedFieldName = signal('');
  readonly selectedDate = signal('');
  readonly selectedStartTime = signal('');
  readonly selectedEndTime = signal('');
  readonly durationMinutes = signal(0);

  /** Istruttori disponibili nello slot selezionato, caricati dal backend. */
  readonly instructors = signal<BookingAvailableInstructorResponseDto[]>([]);
  /** Id dell'istruttore scelto, nullo quando il cliente non vuole istruttore. */
  readonly selectedInstructorId = signal<number | null>(null);

  readonly racketOptions = [0, 1, 2, 3, 4];
  /** Numero di racchette selezionate dal cliente. */
  readonly selectedRackets = signal(0);
  readonly racketUnitPrice = 4;

  readonly isLoadingInstructors = signal(false);
  readonly isReleasingLock = signal(false);
  readonly errorMessage = signal('');
  readonly feedbackMessage = signal('');
  readonly failedInstructorImages = signal<Set<number>>(new Set());

  /** Indica se lo sport selezionato supporta la scelta dell'istruttore. */
  readonly isInstructorSport = computed(() => {
    const sport = this.selectedSport();
    return sport === 'TENNIS' || sport === 'PADEL';
  });

  readonly canUseInstructorWithSelectedDuration = computed(() => {
    if (!this.isInstructorSport()) {
      return false;
    }

    const minutes = this.durationMinutes();
    return minutes > 0 && minutes % 60 === 0;
  });

  readonly instructorDurationMessage = computed(() => {
    if (!this.isInstructorSport() || this.canUseInstructorWithSelectedDuration()) {
      return '';
    }

    return 'Per aggiungere un istruttore devi scegliere una durata multipla di 1 ora. Con questa durata puoi continuare senza istruttore e scegliere solo le racchette.';
  });

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

  readonly selectedInstructor = computed(() => {
    const selectedId = this.selectedInstructorId();

    if (selectedId == null) {
      return null;
    }

    return this.instructors().find(
      (instructor) => instructor.istruttoreId === selectedId,
    ) ?? null;
  });

  readonly selectedInstructorName = computed(() => {
    const instructor = this.selectedInstructor();
    return instructor ? `${instructor.nome} ${instructor.cognome}`.trim() : 'Nessun istruttore';
  });

  readonly racketsCost = computed(() => this.selectedRackets() * this.racketUnitPrice);

  readonly canContinue = computed(() => {
    return (
      !this.isLoadingInstructors() &&
      !this.isReleasingLock() &&
      !this.errorMessage() &&
      !this.isStoredLockTimerExpired()
    );
  });

  /** Inietta Router e BookingService per navigazione, lock e caricamento istruttori. */
  constructor(
    private readonly router: Router,
    private readonly bookingService: BookingService,
  ) {}

  /**
   * Inizializza lo step extra.
   *
   * Ricostruisce il contesto salvato, ripristina eventuali extra già scelti e
   * ricarica gli istruttori disponibili senza perdere il lock corrente.
   */
  ngOnInit(): void {
    this.loadBookingContext();
    this.restoreSavedExtras();

    // Se apro questa pagina senza i dati minimi del flusso,
    // torno allo step orario dove quei dati vengono rimessi a posto.
    if (!this.hasRequiredBookingContext()) {
      void this.router.navigate(['/dashboard/prenotazioni/orario']);
      return;
    }

    if (this.isInstructorSport() && this.canUseInstructorWithSelectedDuration()) {
      this.reloadInstructorsWithoutBlockingOwnLock();
      return;
    }

    this.instructors.set([]);
    this.selectedInstructorId.set(null);
    this.persistInstructorSelection();
  }

  /** Numero totale di step del wizard. */
  get totalSteps(): number {
    return this.steps.length;
  }

  /**
   * Seleziona un istruttore e salva la scelta in sessionStorage.
   *
   * @param instructor istruttore scelto tra quelli disponibili.
   */
  selectInstructor(instructor: BookingAvailableInstructorResponseDto): void {
    if (!this.canUseInstructorWithSelectedDuration()) {
      this.selectedInstructorId.set(null);
      this.persistInstructorSelection();
      this.errorMessage.set('Le prenotazioni con istruttore devono avere durata multipla di 1 ora.');
      return;
    }

    this.selectedInstructorId.set(instructor.istruttoreId);
    this.feedbackMessage.set('');
    this.persistInstructorSelection();
  }

  /** Rimuove la selezione dell'istruttore e aggiorna il contesto persistito. */
  clearInstructorSelection(): void {
    this.selectedInstructorId.set(null);
    this.feedbackMessage.set('');
    this.persistInstructorSelection();
  }

  /** Verifica se una card istruttore corrisponde all'istruttore scelto. */
  isInstructorSelected(instructor: BookingAvailableInstructorResponseDto): boolean {
    return this.selectedInstructorId() === instructor.istruttoreId;
  }

  /** Aggiorna il numero di racchette selezionate e lo salva nel flusso. */
  selectRackets(count: number): void {
    const normalizedCount = Math.max(0, Math.min(4, count));
    this.selectedRackets.set(normalizedCount);
    this.feedbackMessage.set('');
    this.persistRacketsSelection();
  }

  /** Rilascia il lock corrente e torna allo step data/ora. */
  goBack(): void {
    this.releaseStoredLockThenNavigate(['/dashboard/prenotazioni/orario']);
  }

  /**
   * Valida gli extra, aggiorna il lock con l'eventuale istruttore e va alla preview.
   *
   * Se la durata non è compatibile con l'istruttore, impedisce di continuare.
   */
  goNext(): void {
    this.errorMessage.set('');
    this.feedbackMessage.set('');

    if (this.isStoredLockTimerExpired()) {
      this.clearBookingLock();
      this.errorMessage.set('Tempo scaduto: seleziona di nuovo data e ora per bloccare lo slot.');
      void this.router.navigate(['/dashboard/prenotazioni/orario']);
      return;
    }

    if (!this.canContinue()) {
      this.errorMessage.set('Completa la scelta degli extra prima di continuare.');
      return;
    }

    this.persistInstructorSelection();
    this.persistRacketsSelection();

    /*
      Non eliminiamo qui il lock creato nella pagina data e ora.
      Per TENNIS e PADEL il lock deve rimanere attivo anche mentre l'utente sceglie
      istruttore e racchette, così gli altri utenti vedono subito lo slot occupato.
      Se nella preview viene scelto un istruttore, la preview eliminerà il lock base
      e creerà un nuovo lock completo con istruttore.
    */
    void this.router.navigate(['/dashboard/prenotazioni/riepilogo']);
  }

  /** TrackBy usato per la timeline degli step. */
  trackByStepLabel(_: number, step: BookingStep): string {
    return step.label;
  }

  /** TrackBy usato per la lista degli istruttori disponibili. */
  trackByInstructorId(_: number, instructor: BookingAvailableInstructorResponseDto): number {
    return instructor.istruttoreId;
  }

  /** TrackBy usato per le opzioni di numero racchette. */
  trackByRacketOption(_: number, option: number): number {
    return option;
  }

  isStepCompleted(index: number): boolean {
    return index + 1 <= this.currentStep;
  }

  getInstructorFullName(instructor: BookingAvailableInstructorResponseDto): string {
    return `${instructor.nome} ${instructor.cognome}`.trim();
  }

  /** Format della tariffa oraria dell'istruttore. */
  getInstructorRateLabel(instructor: BookingAvailableInstructorResponseDto): string {
    return instructor.costoOrario != null ? `€${Number(instructor.costoOrario).toFixed(2)}/h` : 'Tariffa non disponibile';
  }

  /** Restituisce l'URL dell'immagine profilo istruttore o null se assente. */
  getInstructorImageUrl(instructor: BookingAvailableInstructorResponseDto): string | null {
    if (this.failedInstructorImages().has(instructor.istruttoreId)) {
      return null;
    }

    return ImageUrlUtil.normalizeProfileImageUrl(instructor.fotoProfiloUrl);
  }

  onInstructorImageError(instructorId: number): void {
    this.failedInstructorImages.update(set => {
      const newSet = new Set(set);
      newSet.add(instructorId);
      return newSet;
    });
  }

  getInstructorInitials(instructor: BookingAvailableInstructorResponseDto): string {
    const nome = instructor.nome?.trim() ?? '';
    const cognome = instructor.cognome?.trim() ?? '';
    return `${nome.charAt(0).toUpperCase()}${cognome.charAt(0).toUpperCase()}` || '?';
  }

  /**
   * Ricarica gli istruttori rilasciando temporaneamente il lock dello slot.
   *
   * Serve per evitare che il lock del cliente faccia risultare occupato lo stesso
   * slot durante il calcolo disponibilità degli istruttori.
   */
  private reloadInstructorsWithoutBlockingOwnLock(): void {
    /*
      Nella pagina Data e ora creiamo già un lock base sul campo.
      Quel lock serve agli altri utenti per vedere lo slot occupato.

      Però, quando entriamo nella pagina Extra, la chiamata degli istruttori disponibili
      controlla anche se il campo è libero. Se lasciamo il nostro lock base attivo,
      il backend pensa che il campo sia occupato e può restituire zero istruttori.

      Quindi facciamo così:
      1. eliminiamo il lock base creato nella pagina precedente;
      2. carichiamo subito gli istruttori disponibili;
      3. ricreiamo un nuovo lock base sul campo, così gli altri utenti continuano
         a vedere lo slot occupato mentre scegliamo istruttore e racchette.
    */
    const lockId = this.getStoredLockId();

    if (!lockId) {
      this.loadAvailableInstructors(true);
      return;
    }

    this.isReleasingLock.set(true);
    this.errorMessage.set('');

    this.bookingService
      .eliminaLockPrenotazione(lockId)
      .pipe(
        finalize(() => {
          this.isReleasingLock.set(false);
        }),
      )
      .subscribe({
        next: () => {
          this.clearBookingLock(false);
          this.loadAvailableInstructors(true);
        },
        error: (error) => {
          console.warn('Lock già assente o non eliminabile prima del caricamento istruttori:', error);

          this.clearBookingLock(false);
          this.loadAvailableInstructors(true);
        },
      });
  }

  /**
   * Recupera dal backend gli istruttori disponibili nello slot selezionato.
   *
   * @param recreateBaseLockAfterLoad se true ricrea il lock base dopo il caricamento.
   */
  private loadAvailableInstructors(recreateBaseLockAfterLoad = false): void {
    const campoId = this.selectedFieldId();

    // Se la durata non va bene per l'istruttore,
    // evito proprio la chiamata perche so gia che non servirebbe.
    if (!this.canUseInstructorWithSelectedDuration()) {
      this.instructors.set([]);
      this.selectedInstructorId.set(null);
      this.persistInstructorSelection();
      return;
    }

    if (!campoId) {
      this.errorMessage.set('Campo non selezionato.');
      return;
    }

    this.isLoadingInstructors.set(true);
    this.errorMessage.set('');

    this.bookingService
      .getIstruttoriDisponibili(
        campoId,
        this.buildDateTimeParam(this.selectedDate(), this.selectedStartTime()),
        this.buildDateTimeParam(this.selectedDate(), this.selectedEndTime()),
      )
      .pipe(
        finalize(() => {
          this.isLoadingInstructors.set(false);
        }),
      )
      .subscribe({
        next: (instructors) => {
          this.failedInstructorImages.set(new Set());
          this.instructors.set(instructors);
          this.cleanSelectedInstructorIfNotAvailable();

          if (recreateBaseLockAfterLoad) {
            this.createBaseFieldLockForExtraStep();
          }
        },
        error: (error) => {
          console.error('Errore caricamento istruttori disponibili:', error);
          this.instructors.set([]);
          this.selectedInstructorId.set(null);
          this.persistInstructorSelection();
          this.errorMessage.set('Non è stato possibile caricare gli istruttori disponibili.');

          if (recreateBaseLockAfterLoad) {
            this.createBaseFieldLockForExtraStep();
          }
        },
      });
  }

  /** Crea un lock base sul campo mentre il cliente sceglie gli extra. */
  private createBaseFieldLockForExtraStep(): void {
    if (this.isStoredLockTimerExpired()) {
      this.clearBookingLock();
      this.errorMessage.set('Tempo scaduto: seleziona di nuovo data e ora per bloccare lo slot.');
      void this.router.navigate(['/dashboard/prenotazioni/orario']);
      return;
    }

    const campoId = this.selectedFieldId();

    if (!campoId) {
      return;
    }

    if (this.getStoredLockId()) {
      return;
    }

    const request: CreateBookingLockRequestDto = {
      campoId,
      inizio: this.buildDateTimeParam(this.selectedDate(), this.selectedStartTime()),
      durataMinuti: this.durationMinutes(),
      conIstruttore: false,
      istruttoreId: null,
    };

    this.isReleasingLock.set(true);

    this.bookingService
      .creaLockPrenotazione(request)
      .pipe(
        finalize(() => {
          this.isReleasingLock.set(false);
        }),
      )
      .subscribe({
        next: (lock) => {
          this.persistBaseLock(lock.lockId, lock.scadeIl);
        },
        error: (error) => {
          console.error('Errore ricreazione lock base nella pagina extra:', error);
          this.clearBookingLock();
          this.errorMessage.set(
            'Gli istruttori sono stati caricati, ma non è stato possibile bloccare temporaneamente lo slot. Riprova tornando alla scelta data e ora.',
          );
        },
      });
  }

  /** Salva in sessionStorage id e scadenza del lock base. */
  private persistBaseLock(lockId: number, scadeIl: string): void {
    sessionStorage.setItem('booking.lockId', String(lockId));
    sessionStorage.setItem('booking.lockSignature', this.buildBaseLockSignature());
    sessionStorage.setItem('booking.lockExpiresAt', this.resolveLockTimerExpiration(scadeIl));
    this.notifyBookingLockChanged();
  }

  /** Costruisce la firma del lock base per riconoscere lo stesso slot. */
  private buildBaseLockSignature(): string {
    return [
      this.selectedFieldId() ?? '',
      this.selectedDate(),
      this.selectedStartTime(),
      this.selectedEndTime(),
      this.durationMinutes(),
      false,
      '',
    ].join('|');
  }

  /** Legge da sessionStorage sport, campo, data, ora e durata scelti negli step precedenti. */
  private loadBookingContext(): void {
    const sport = sessionStorage.getItem('booking.selectedSport');
    const fieldId = Number(sessionStorage.getItem('booking.selectedFieldId'));

    if (isSport(sport)) {
      this.selectedSport.set(sport);
    }

    if (Number.isFinite(fieldId) && fieldId > 0) {
      this.selectedFieldId.set(fieldId);
    }

    this.selectedFieldName.set(sessionStorage.getItem('booking.selectedFieldName') ?? '');
    this.selectedDate.set(sessionStorage.getItem('booking.selectedDate') ?? '');
    this.selectedStartTime.set(sessionStorage.getItem('booking.startTime') ?? '');
    this.selectedEndTime.set(sessionStorage.getItem('booking.endTime') ?? '');
    this.durationMinutes.set(Number(sessionStorage.getItem('booking.durationMinutes') ?? 0));
  }

  /** Ripristina istruttore e racchette se l'utente torna su questo step. */
  private restoreSavedExtras(): void {
    const savedInstructorId = Number(sessionStorage.getItem('booking.selectedInstructorId'));
    const savedRackets = Number(sessionStorage.getItem('booking.racketsCount') ?? 0);

    if (Number.isFinite(savedInstructorId) && savedInstructorId > 0) {
      this.selectedInstructorId.set(savedInstructorId);
    }

    if (Number.isFinite(savedRackets)) {
      this.selectedRackets.set(Math.max(0, Math.min(4, savedRackets)));
    }
  }

  /** Verifica che tutti i dati minimi per lo step extra siano presenti. */
  private hasRequiredBookingContext(): boolean {
    return Boolean(
      this.selectedSport() &&
      this.selectedFieldId() &&
      this.selectedDate() &&
      this.selectedStartTime() &&
      this.selectedEndTime(),
    );
  }

  /** Rimuove l'istruttore salvato se non è più presente tra quelli disponibili. */
  private cleanSelectedInstructorIfNotAvailable(): void {
    const selectedId = this.selectedInstructorId();

    if (selectedId == null) {
      return;
    }

    const stillAvailable = this.instructors().some(
      (instructor) => instructor.istruttoreId === selectedId,
    );

    if (!stillAvailable) {
      this.selectedInstructorId.set(null);
      this.persistInstructorSelection();
    }
  }

  /** Salva la scelta dell'istruttore e i dati visuali collegati. */
  private persistInstructorSelection(): void {
    const instructor = this.selectedInstructor();

    if (!instructor) {
      // Salvo in modo esplicito il caso "senza istruttore",
      // cosi negli step dopo non devo interpretare valori mancanti.
      sessionStorage.setItem('booking.conIstruttore', 'false');
      sessionStorage.removeItem('booking.selectedInstructorId');
      sessionStorage.removeItem('booking.selectedInstructorName');
      sessionStorage.removeItem('booking.selectedInstructorHourlyRate');
      return;
    }

    sessionStorage.setItem('booking.conIstruttore', 'true');
    sessionStorage.setItem('booking.selectedInstructorId', String(instructor.istruttoreId));
    sessionStorage.setItem('booking.selectedInstructorName', this.getInstructorFullName(instructor));
    sessionStorage.setItem('booking.selectedInstructorHourlyRate', String(instructor.costoOrario ?? 0));
  }

  /** Salva il numero di racchette nel contesto del flusso. */
  private persistRacketsSelection(): void {
    sessionStorage.setItem('booking.racketsCount', String(this.selectedRackets()));
    sessionStorage.setItem('booking.racketUnitPrice', String(this.racketUnitPrice));
    sessionStorage.setItem('booking.racketsCost', String(this.racketsCost()));
  }

  /** Rimuove dal browser i dati del lock e, opzionalmente, anche il timer condiviso. */
  private clearBookingLock(clearTimer = true): void {
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

  /** Indica se il timer del lock salvato nel browser è già scaduto. */
  private isStoredLockTimerExpired(): boolean {
    return this.isLockExpirationExpired(sessionStorage.getItem('booking.lockExpiresAt'));
  }

  /** Controlla se una specifica data di scadenza lock è passata. */
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

  /** Rilascia il lock corrente tramite API e poi naviga alla route indicata. */
  private releaseStoredLockThenNavigate(targetRoute: string[]): void {
    const lockId = this.getStoredLockId();

    if (!lockId) {
      this.clearBookingLock();
      void this.router.navigate(targetRoute);
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
          this.clearBookingLock();
          void this.router.navigate(targetRoute);
        },
        error: (error) => {
          console.warn('Lock già assente o non eliminabile durante cambio extra:', error);

          this.clearBookingLock();
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

  /** Notifica agli altri componenti, come la sidebar, che il timer lock è cambiato. */
  private notifyBookingLockChanged(): void {
    window.dispatchEvent(new Event('booking-lock-updated'));
  }

  /** Costruisce una data ISO locale combinando giorno e orario selezionati. */
  private buildDateTimeParam(date: string, time: string): string {
    const normalizedTime = time.length === 5 ? `${time}:00` : time;
    return `${date}T${normalizedTime}`;
  }
}
