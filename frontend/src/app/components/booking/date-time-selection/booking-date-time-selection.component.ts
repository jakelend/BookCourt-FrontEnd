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
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { finalize } from 'rxjs';
import { BookingSport } from '../../../dto/response/booking/booking-field-response.dto';
import {
  BookingCalendarEventResponseDto,
  BookingFieldCalendarResponseDto,
  BookingService,
} from '../../../services/booking.service';

interface BookingStep {
  label: string;
}

interface CalendarHourSlot {
  label: string;
  topPct: number;
}

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

interface SelectedBookingEventView {
  topPct: number;
  heightPct: number;
  timeLabel: string;
  title: string;
}

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
export class BookingDateTimeSelectionComponent implements OnInit {
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

  readonly calendarData = signal<BookingFieldCalendarResponseDto | null>(null);
  readonly hourSlots = signal<CalendarHourSlot[]>([]);
  readonly startTimeOptions = signal<string[]>([]);

  readonly isCalendarLoading = signal(false);
  readonly isReleasingLock = signal(false);
  readonly calendarErrorMessage = signal('');
  readonly formErrorMessage = signal('');
  readonly feedbackMessage = signal('');

  private readonly fallbackDayStartTime = '08:00';
  private readonly fallbackDayEndTime = '23:00';
  private readonly minimumDurationMinutes = 60;
  private readonly durationStepMinutes = 30;
  private readonly calendarVerticalInsetPct = 2.4;

  readonly selectedDateValue = computed(() => this.toDateOnly(this.selectedDate()));

  readonly dayStartTime = computed(() => {
    return this.extractTimeFromDateTime(this.calendarData()?.apertura) ?? this.fallbackDayStartTime;
  });

  readonly dayEndTime = computed(() => {
    return this.extractTimeFromDateTime(this.calendarData()?.chiusura) ?? this.fallbackDayEndTime;
  });

  readonly bookingStartTime = computed(() => this.dayStartTime());

  readonly bookingEndTime = computed(() => this.dayEndTime());

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

    return `Centro aperto dalle ${this.dayStartTime()} alle ${this.dayEndTime()}.`;
  });

  readonly endTimeOptions = computed(() => {
    if (!this.selectedDate() || !this.selectedStartTime() || this.isClosedDay()) {
      return [];
    }

    const start = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.selectedStartTime()),
    );

    return this.buildEndTimeOptionsForStart(start);
  });

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

  readonly isInstructorSport = computed(() => {
    const sport = this.selectedSport();
    return sport === 'TENNIS' || sport === 'PADEL';
  });

  readonly canUseInstructorWithSelectedDuration = computed(() => {
    if (!this.isInstructorSport() || !this.hasValidTimeRange()) {
      return true;
    }

    return this.selectedDurationMinutes() % 60 === 0;
  });

  readonly instructorDurationWarning = computed(() => {
    if (!this.isInstructorSport() || !this.hasValidTimeRange()) {
      return '';
    }

    if (this.canUseInstructorWithSelectedDuration()) {
      return '';
    }

    return 'Con questa durata puoi prenotare il campo, ma non potrai aggiungere un istruttore: le lezioni con istruttore devono durare 1h, 2h, 3h, ecc.';
  });

  readonly calendarEventViews = computed<CalendarEventView[]>(() => {
    const calendar = this.calendarData();

    if (!calendar) {
      return [];
    }

    return calendar.eventi
      .filter((event) => event.inizio && event.fine)
      .map((event, index) => this.toCalendarEventView(event, index))
      .filter((event): event is CalendarEventView => event !== null);
  });

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

  readonly canContinue = computed(() => {
    return (
      !!this.selectedFieldId() &&
      !!this.calendarData() &&
      !this.isCalendarLoading() &&
      !this.calendarErrorMessage() &&
      !this.isClosedDay() &&
      this.isTimeRangeValid()
    );
  });

  constructor(
    private readonly router: Router,
    private readonly bookingService: BookingService,
  ) {}

  ngOnInit(): void {
    this.loadBookingContext();

    if (!this.selectedSport() || !this.selectedFieldId()) {
      void this.router.navigate(['/dashboard/prenotazioni/campi']);
      return;
    }

    this.restoreSavedDateTime();
    this.loadCalendarioCampo();
  }

  get totalSteps(): number {
    return this.steps.length;
  }

  goToToday(): void {
    this.selectedDate.set(this.formatLocalDate(new Date()));
    this.afterDateChanged();
  }

  goToPreviousDay(): void {
    this.selectedDate.set(
      this.formatLocalDate(this.addDays(this.toDateOnly(this.selectedDate()), -1)),
    );

    this.afterDateChanged();
  }

  goToNextDay(): void {
    this.selectedDate.set(
      this.formatLocalDate(this.addDays(this.toDateOnly(this.selectedDate()), 1)),
    );

    this.afterDateChanged();
  }

  onDateSelected(date: Date | null): void {
    if (!date) {
      return;
    }

    this.selectedDate.set(this.formatLocalDate(date));
    this.afterDateChanged();
  }

  setStartTime(value: string): void {
    this.selectedStartTime.set(this.normalizeTime(value));
    this.ensureValidEndTimeForStart();
    this.formErrorMessage.set('');
    this.feedbackMessage.set('');
    this.persistSelectedDateTimeIfValid();
  }

  setEndTime(value: string): void {
    this.selectedEndTime.set(this.normalizeTime(value));
    this.formErrorMessage.set('');
    this.feedbackMessage.set('');
    this.persistSelectedDateTimeIfValid();
  }

  goBack(): void {
    const sport = this.selectedSport();

    void this.router.navigate(['/dashboard/prenotazioni/campi'], {
      queryParams: sport ? { sport } : undefined,
    });
  }

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
      this.releaseStoredLockThenNavigate(['/dashboard/prenotazioni/riepilogo'], () => {
        this.clearBookingExtrasForCalcetto();
      });
      return;
    }

    this.releaseStoredLockThenNavigate(['/dashboard/prenotazioni/extra'], () => {
      this.clearInstructorSelectionIfDurationIsNotHourly();
    });
  }

  trackByStepLabel(_: number, step: BookingStep): string {
    return step.label;
  }

  trackByHour(_: number, slot: CalendarHourSlot): string {
    return slot.label;
  }

  trackByTime(_: number, time: string): string {
    return time;
  }

  trackByCalendarEvent(_: number, event: CalendarEventView): string {
    return event.id;
  }

  isStepCompleted(index: number): boolean {
    return index + 1 <= this.currentStep;
  }

  private clearBookingExtrasForCalcetto(): void {
    sessionStorage.setItem('booking.conIstruttore', 'false');
    sessionStorage.setItem('booking.racketsCount', '0');
    sessionStorage.setItem('booking.racketUnitPrice', '4');
    sessionStorage.setItem('booking.racketsCost', '0');
    sessionStorage.removeItem('booking.selectedInstructorId');
    sessionStorage.removeItem('booking.selectedInstructorName');
    sessionStorage.removeItem('booking.selectedInstructorHourlyRate');
  }

  private clearInstructorSelectionIfDurationIsNotHourly(): void {
    if (this.canUseInstructorWithSelectedDuration()) {
      return;
    }

    sessionStorage.setItem('booking.conIstruttore', 'false');
    sessionStorage.removeItem('booking.selectedInstructorId');
    sessionStorage.removeItem('booking.selectedInstructorName');
    sessionStorage.removeItem('booking.selectedInstructorHourlyRate');
  }

  private clearBookingLock(): void {
    sessionStorage.removeItem('booking.lockId');
    sessionStorage.removeItem('booking.lockSignature');
    sessionStorage.removeItem('booking.lockExpiresAt');
  }

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

  private getStoredLockId(): number | null {
    const lockId = Number(sessionStorage.getItem('booking.lockId'));

    if (!Number.isFinite(lockId) || lockId <= 0) {
      return null;
    }

    return lockId;
  }

  private afterDateChanged(): void {
    this.formErrorMessage.set('');
    this.feedbackMessage.set('');
    this.loadCalendarioCampo();
  }

  private loadCalendarioCampo(): void {
    const campoId = this.selectedFieldId();

    if (!campoId) {
      this.calendarErrorMessage.set('Campo non selezionato.');
      return;
    }

    this.isCalendarLoading.set(true);
    this.calendarErrorMessage.set('');
    this.formErrorMessage.set('');
    this.feedbackMessage.set('');

    this.bookingService
      .getCalendarioCampo(campoId, this.selectedDate())
      .pipe(
        finalize(() => {
          this.isCalendarLoading.set(false);
        }),
      )
      .subscribe({
        next: (calendar) => {
          this.calendarData.set(calendar);
          this.selectedFieldName.set(calendar.nomeCampo);
          this.selectedSport.set(calendar.sport);

          this.rebuildPage();
          this.ensureValidStartTime();
          this.ensureValidEndTimeForStart();

          if (calendar.chiuso) {
            this.formErrorMessage.set('Il centro è chiuso in questa data.');
          } else if (this.startTimeOptions().length === 0) {
            this.formErrorMessage.set(
              'Non ci sono intervalli disponibili per questa data.',
            );
          } else {
            this.persistSelectedDateTimeIfValid();
          }
        },
        error: (error) => {
          console.error('Errore caricamento calendario campo:', error);

          this.calendarData.set(null);
          this.hourSlots.set([]);
          this.startTimeOptions.set([]);
          this.calendarErrorMessage.set(
            'Non è stato possibile caricare il calendario del campo.',
          );
        },
      });
  }

  private loadBookingContext(): void {
    const sport = sessionStorage.getItem('booking.selectedSport');
    const fieldId = Number(sessionStorage.getItem('booking.selectedFieldId'));
    const fieldName = sessionStorage.getItem('booking.selectedFieldName') ?? '';

    if (sport === 'CALCETTO' || sport === 'PADEL' || sport === 'TENNIS') {
      this.selectedSport.set(sport);
    }

    if (Number.isFinite(fieldId) && fieldId > 0) {
      this.selectedFieldId.set(fieldId);
    }

    this.selectedFieldName.set(fieldName);
  }

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

  private rebuildPage(): void {
    this.hourSlots.set(this.buildHourSlots());
    this.startTimeOptions.set(this.buildStartTimeOptions());
  }

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
      this.buildHtmlDateTime(this.selectedDate(), this.dayStartTime()),
    );
    const dayEnd = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.dayEndTime()),
    );

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

  private buildStartTimeOptions(): string[] {
    if (this.isClosedDay()) {
      return [];
    }

    const options: string[] = [];

    const dayStart = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.dayStartTime()),
    );

    const dayEnd = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.dayEndTime()),
    );

    const latestValidStart = new Date(dayEnd);
    latestValidStart.setMinutes(
      latestValidStart.getMinutes() - this.minimumDurationMinutes,
    );

    const cursor = new Date(dayStart);

    while (cursor <= latestValidStart) {
      if (this.buildEndTimeOptionsForStart(cursor).length > 0) {
        options.push(this.formatTime(cursor));
      }

      cursor.setMinutes(cursor.getMinutes() + this.durationStepMinutes);
    }

    return options;
  }

  private buildEndTimeOptionsForStart(start: Date): string[] {
    const options: string[] = [];

    const firstValidEnd = new Date(start);
    firstValidEnd.setMinutes(firstValidEnd.getMinutes() + this.minimumDurationMinutes);

    const dayEnd = new Date(
      this.buildHtmlDateTime(this.selectedDate(), this.dayEndTime()),
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

  private isIntervalAvailable(start: Date, end: Date): boolean {
    return !this.getBlockingEvents().some((event) => {
      const eventStart = new Date(event.inizio);
      const eventEnd = new Date(event.fine);

      return start < eventEnd && end > eventStart;
    });
  }

  private getBlockingEvents(): BookingCalendarEventResponseDto[] {
    return (this.calendarData()?.eventi ?? []).filter(
      (event) => event.selezionabile === false,
    );
  }

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

    return {
      id: `${event.tipo}-${event.prenotazioneId ?? event.lockId ?? index}-${event.inizio}`,
      tipo: event.tipo,
      titolo: event.titolo,
      topPct: this.getCalendarTopPct(dayStart, visibleStart, totalMinutes),
      heightPct: this.getCalendarHeightPct(durationMinutes, totalMinutes),
      timeLabel: `${this.extractTimeFromDateTime(event.inizio)} - ${this.extractTimeFromDateTime(event.fine)}`,
      cssClass: this.getCalendarEventCssClass(event.tipo),
      icon: this.getCalendarEventIcon(event.tipo),
    };
  }

  private getCalendarEventCssClass(tipo: string): string {
    switch (tipo) {
      case 'PRENOTAZIONE':
        return 'field-event-booking';

      case 'MANUTENZIONE':
        return 'field-event-maintenance';

      case 'LOCK':
        return 'field-event-lock';

      case 'FESTIVITA':
      case 'ECCEZIONE_ORARIO_CENTRO':
      case 'ECCEZIONE_ORARI_CENTRO':
        return 'field-event-center-exception';

      default:
        return 'field-event-default';
    }
  }

  private getCalendarEventIcon(tipo: string): string {
    switch (tipo) {
      case 'PRENOTAZIONE':
        return 'event_busy';

      case 'MANUTENZIONE':
        return 'build';

      case 'LOCK':
        return 'lock_clock';

      case 'FESTIVITA':
      case 'ECCEZIONE_ORARIO_CENTRO':
      case 'ECCEZIONE_ORARI_CENTRO':
        return 'event_busy';

      default:
        return 'block';
    }
  }

  private isHalfHourAligned(time: string): boolean {
    const normalizedTime = this.normalizeTime(time);
    const minute = Number(normalizedTime.slice(3, 5));

    return minute === 0 || minute === 30;
  }

  private persistSelectedDateTimeIfValid(): void {
    if (!this.isTimeRangeValid()) {
      return;
    }

    this.persistSelectedDateTime();
  }

  private persistSelectedDateTime(): void {
    sessionStorage.setItem('booking.selectedDate', this.selectedDate());
    sessionStorage.setItem('booking.startTime', this.selectedStartTime());
    sessionStorage.setItem('booking.endTime', this.selectedEndTime());
    sessionStorage.setItem(
      'booking.durationMinutes',
      String(this.selectedDurationMinutes()),
    );
  }

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

  private buildHtmlDateTime(date: string, time: string): string {
    return `${date}T${this.normalizeTime(time)}`;
  }

  private normalizeTime(time: string): string {
    if (!time) {
      return '';
    }

    return time.length === 5 ? time : time.slice(0, 5);
  }

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

  private toDateOnly(value: string): Date {
    return new Date(`${value}T00:00:00`);
  }

  private formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private minutesBetween(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / 60000);
  }

  private getCalendarTopPct(dayStart: Date, value: Date, totalMinutes: number): number {
    const usablePct = 100 - this.calendarVerticalInsetPct * 2;

    return (
      this.calendarVerticalInsetPct +
      (this.minutesBetween(dayStart, value) / totalMinutes) * usablePct
    );
  }

  private getCalendarHeightPct(durationMinutes: number, totalMinutes: number): number {
    const usablePct = 100 - this.calendarVerticalInsetPct * 2;
    return (durationMinutes / totalMinutes) * usablePct;
  }

  private formatTime(date: Date): string {
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    return `${hour}:${minute}`;
  }
}
