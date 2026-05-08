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
import { BookingSport } from '../../../dto/response/booking/booking-field-response.dto';
import {
  BookingAvailableInstructorResponseDto,
  BookingService,
  CreateBookingLockRequestDto,
} from '../../../services/booking.service';

interface BookingStep {
  label: string;
}

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

  readonly selectedSport = signal<BookingSport | null>(null);
  readonly selectedFieldId = signal<number | null>(null);
  readonly selectedFieldName = signal('');
  readonly selectedDate = signal('');
  readonly selectedStartTime = signal('');
  readonly selectedEndTime = signal('');
  readonly durationMinutes = signal(0);

  readonly instructors = signal<BookingAvailableInstructorResponseDto[]>([]);
  readonly selectedInstructorId = signal<number | null>(null);

  readonly racketOptions = [0, 1, 2, 3, 4];
  readonly selectedRackets = signal(0);
  readonly racketUnitPrice = 4;

  readonly isLoadingInstructors = signal(false);
  readonly isReleasingLock = signal(false);
  readonly errorMessage = signal('');
  readonly feedbackMessage = signal('');

  private readonly backendBaseUrl = 'http://localhost:8080';

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

  constructor(
    private readonly router: Router,
    private readonly bookingService: BookingService,
  ) {}

  ngOnInit(): void {
    this.loadBookingContext();
    this.restoreSavedExtras();

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

  get totalSteps(): number {
    return this.steps.length;
  }

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

  clearInstructorSelection(): void {
    this.selectedInstructorId.set(null);
    this.feedbackMessage.set('');
    this.persistInstructorSelection();
  }

  isInstructorSelected(instructor: BookingAvailableInstructorResponseDto): boolean {
    return this.selectedInstructorId() === instructor.istruttoreId;
  }

  selectRackets(count: number): void {
    const normalizedCount = Math.max(0, Math.min(4, count));
    this.selectedRackets.set(normalizedCount);
    this.feedbackMessage.set('');
    this.persistRacketsSelection();
  }

  goBack(): void {
    this.releaseStoredLockThenNavigate(['/dashboard/prenotazioni/orario']);
  }

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

  trackByStepLabel(_: number, step: BookingStep): string {
    return step.label;
  }

  trackByInstructorId(_: number, instructor: BookingAvailableInstructorResponseDto): number {
    return instructor.istruttoreId;
  }

  trackByRacketOption(_: number, option: number): number {
    return option;
  }

  isStepCompleted(index: number): boolean {
    return index + 1 <= this.currentStep;
  }

  getInstructorFullName(instructor: BookingAvailableInstructorResponseDto): string {
    return `${instructor.nome} ${instructor.cognome}`.trim();
  }

  getInstructorRateLabel(instructor: BookingAvailableInstructorResponseDto): string {
    return instructor.costoOrario != null ? `€${Number(instructor.costoOrario).toFixed(2)}/h` : 'Tariffa non disponibile';
  }

  getInstructorImageUrl(instructor: BookingAvailableInstructorResponseDto): string | null {
    const path = instructor.fotoProfiloUrl?.trim();

    if (!path) {
      return null;
    }

    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    return path.startsWith('/') ? `${this.backendBaseUrl}${path}` : `${this.backendBaseUrl}/${path}`;
  }

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

  private loadAvailableInstructors(recreateBaseLockAfterLoad: boolean): void {
    const campoId = this.selectedFieldId();

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

  private persistBaseLock(lockId: number, scadeIl: string): void {
    sessionStorage.setItem('booking.lockId', String(lockId));
    sessionStorage.setItem('booking.lockSignature', this.buildBaseLockSignature());
    sessionStorage.setItem('booking.lockExpiresAt', this.resolveLockTimerExpiration(scadeIl));
    this.notifyBookingLockChanged();
  }

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

  private loadBookingContext(): void {
    const sport = sessionStorage.getItem('booking.selectedSport');
    const fieldId = Number(sessionStorage.getItem('booking.selectedFieldId'));

    if (sport === 'CALCETTO' || sport === 'PADEL' || sport === 'TENNIS') {
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

  private hasRequiredBookingContext(): boolean {
    return Boolean(
      this.selectedSport() &&
      this.selectedFieldId() &&
      this.selectedDate() &&
      this.selectedStartTime() &&
      this.selectedEndTime(),
    );
  }

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

  private persistInstructorSelection(): void {
    const instructor = this.selectedInstructor();

    if (!instructor) {
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

  private persistRacketsSelection(): void {
    sessionStorage.setItem('booking.racketsCount', String(this.selectedRackets()));
    sessionStorage.setItem('booking.racketUnitPrice', String(this.racketUnitPrice));
    sessionStorage.setItem('booking.racketsCost', String(this.racketsCost()));
  }

  private clearBookingLock(clearTimer = true): void {
    sessionStorage.removeItem('booking.lockId');
    sessionStorage.removeItem('booking.lockSignature');

    if (clearTimer) {
      sessionStorage.removeItem('booking.lockExpiresAt');
    }

    this.notifyBookingLockChanged();
  }

  private resolveLockTimerExpiration(newExpiration: string): string {
    const currentExpiration = sessionStorage.getItem('booking.lockExpiresAt');

    if (currentExpiration && !this.isLockExpirationExpired(currentExpiration)) {
      return currentExpiration;
    }

    return newExpiration;
  }

  private isStoredLockTimerExpired(): boolean {
    return this.isLockExpirationExpired(sessionStorage.getItem('booking.lockExpiresAt'));
  }

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

  private getStoredLockId(): number | null {
    const lockId = Number(sessionStorage.getItem('booking.lockId'));

    if (!Number.isFinite(lockId) || lockId <= 0) {
      return null;
    }

    return lockId;
  }

  private notifyBookingLockChanged(): void {
    window.dispatchEvent(new Event('booking-lock-updated'));
  }

  private buildDateTimeParam(date: string, time: string): string {
    const normalizedTime = time.length === 5 ? `${time}:00` : time;
    return `${date}T${normalizedTime}`;
  }
}
