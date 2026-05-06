import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize } from 'rxjs/operators';
import { CreateCenterHoursExceptionRequestDto } from '../../../dto/request/secretary/create-center-hours-exception-request.dto';
import { CenterHoursExceptionResponseDto } from '../../../dto/response/secretary/center-hours-exception-response.dto';
import { SecretaryCenterHoursService } from '../../../services/secretary-center-hours.service';
import { extractBackendErrorMessage } from '../../../util/error-message.util';

type CenterHoursExceptionMode = 'CLOSED' | 'CUSTOM_HOURS';
type FeedbackType = 'success' | 'error' | '';

interface CalendarHourSlot {
  label: string;
  topPct: number;
}

interface CenterHoursCalendarEventView {
  id: number;
  source: CenterHoursExceptionResponseDto;
  topPct: number;
  heightPct: number;
  timeLabel: string;
  title: string;
  subtitle: string;
  cssClass: string;
  icon: string;
}

@Component({
  selector: 'app-center-hours-exceptions',
  imports: [
    CommonModule,
    FormsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './center-hours-exceptions.component.html',
  styleUrl: './center-hours-exceptions.component.css',
})
export class CenterHoursExceptionsComponent implements OnInit {
  readonly selectedDate = signal(this.formatLocalDate(new Date()));
  readonly mode = signal<CenterHoursExceptionMode>('CLOSED');
  readonly openingTime = signal('08:00');
  readonly closingTime = signal('23:00');
  readonly reason = signal('');

  readonly exceptions = signal<CenterHoursExceptionResponseDto[]>([]);
  readonly hourSlots = signal<CalendarHourSlot[]>([]);
  readonly eventViews = signal<CenterHoursCalendarEventView[]>([]);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly deletingId = signal<number | null>(null);

  readonly errorMessage = signal('');
  readonly formErrorMessage = signal('');
  readonly feedbackMessage = signal('');
  readonly feedbackType = signal<FeedbackType>('');

  readonly selectedDateValue = computed(() => this.parseLocalDate(this.selectedDate()));

  readonly selectedDateTitle = computed(() => {
    return this.parseLocalDate(this.selectedDate()).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  });

  readonly currentException = computed(() => this.exceptions()[0] ?? null);

  readonly canCreateException = computed(() => {
    return !this.currentException() && !this.loading() && !this.saving();
  });

  private readonly calendarVerticalInsetPct = 2.4;

  constructor(private readonly centerHoursService: SecretaryCenterHoursService) {}

  ngOnInit(): void {
    this.rebuildCalendar();
    this.loadExceptions();
  }

  onDateSelected(date: Date | null): void {
    if (!date) {
      return;
    }

    this.selectedDate.set(this.formatLocalDate(date));
    this.onSelectedDateChange();
  }

  onDateSelectedNative(value: string): void {
    if (!value) {
      return;
    }
    this.selectedDate.set(value);
    this.onSelectedDateChange();
  }

  goToToday(): void {
    this.selectedDate.set(this.formatLocalDate(new Date()));
    this.onSelectedDateChange();
  }

  goToPreviousDay(): void {
    this.selectedDate.set(this.formatLocalDate(this.addDays(this.parseLocalDate(this.selectedDate()), -1)));
    this.onSelectedDateChange();
  }

  goToNextDay(): void {
    this.selectedDate.set(this.formatLocalDate(this.addDays(this.parseLocalDate(this.selectedDate()), 1)));
    this.onSelectedDateChange();
  }

  setMode(mode: CenterHoursExceptionMode): void {
    this.mode.set(mode);
    this.formErrorMessage.set('');
    this.clearFeedback();
  }

  toggleMode(isClosed: boolean): void {
    this.setMode(isClosed ? 'CLOSED' : 'CUSTOM_HOURS');
  }

  setOpeningTime(value: string): void {
    this.openingTime.set(value);
  }

  setClosingTime(value: string): void {
    this.closingTime.set(value);
  }

  setReason(value: string): void {
    this.reason.set(value ?? '');
  }

  submitCreate(): void {
    this.formErrorMessage.set('');
    this.clearFeedback();

    if (this.currentException()) {
      this.formErrorMessage.set('Per questa data esiste già una eccezione. Eliminala prima di inserirne una nuova.');
      return;
    }

    const validationError = this.validateForm();
    if (validationError) {
      this.formErrorMessage.set(validationError);
      return;
    }

    const request = this.buildCreateRequest();

    this.saving.set(true);

    this.centerHoursService
      .creaEccezioneOrarioCentro(request)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.feedbackType.set('success');
          this.feedbackMessage.set('Eccezione orario centro inserita correttamente. Le prenotazioni impattate vengono annullate automaticamente dal sistema.');
          this.reason.set('');
          this.loadExceptions();
        },
        error: (error) => {
          this.feedbackType.set('error');
          this.feedbackMessage.set(extractBackendErrorMessage(error, 'Impossibile inserire l’eccezione orario centro.'));
        },
      });
  }

  deleteException(exceptionToDelete: CenterHoursExceptionResponseDto | null): void {
    if (!exceptionToDelete) {
      return;
    }

    this.clearFeedback();
    this.formErrorMessage.set('');
    this.deletingId.set(exceptionToDelete.id);

    this.centerHoursService
      .eliminaEccezioneOrarioCentro(exceptionToDelete.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe({
        next: () => {
          this.feedbackType.set('success');
          this.feedbackMessage.set('Eccezione orario centro eliminata correttamente.');
          this.loadExceptions();
        },
        error: (error) => {
          this.feedbackType.set('error');
          this.feedbackMessage.set(extractBackendErrorMessage(error, 'Impossibile eliminare l’eccezione orario centro.'));
        },
      });
  }

  retry(): void {
    this.loadExceptions();
  }

  isClosedMode(): boolean {
    return this.mode() === 'CLOSED';
  }

  isCustomHoursMode(): boolean {
    return this.mode() === 'CUSTOM_HOURS';
  }

  isDeleting(exceptionId: number): boolean {
    return this.deletingId() === exceptionId;
  }

  trackByHour(_: number, slot: CalendarHourSlot): string {
    return slot.label;
  }

  trackByEvent(_: number, event: CenterHoursCalendarEventView): number {
    return event.id;
  }

  trackByException(_: number, exception: CenterHoursExceptionResponseDto): number {
    return exception.id;
  }

  formatExceptionTitle(exception: CenterHoursExceptionResponseDto): string {
    if (exception.chiuso) {
      return 'Centro chiuso tutto il giorno';
    }

    return `Orario eccezionale ${this.formatNullableTime(exception.oraApertura)} - ${this.formatNullableTime(exception.oraChiusura)}`;
  }

  formatExceptionSubtitle(exception: CenterHoursExceptionResponseDto): string {
    return exception.motivo?.trim() || 'Nessun motivo indicato';
  }

  formatDisplayDate(value: string): string {
    return this.parseLocalDate(value).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  private onSelectedDateChange(): void {
    this.formErrorMessage.set('');
    this.clearFeedback();
    this.loadExceptions();
  }

  private loadExceptions(): void {
    const selectedDate = this.selectedDate();

    this.loading.set(true);
    this.errorMessage.set('');

    this.centerHoursService
      .getEccezioniOrarioCentro(selectedDate, selectedDate)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (exceptions) => {
          this.exceptions.set(exceptions ?? []);
          this.rebuildCalendar();
        },
        error: (error) => {
          this.exceptions.set([]);
          this.rebuildCalendar();
          this.errorMessage.set(extractBackendErrorMessage(error, 'Impossibile caricare le eccezioni orario centro.'));
        },
      });
  }

  private rebuildCalendar(): void {
    const dayStart = this.buildDateTime(this.selectedDate(), '08:00');
    const dayEnd = this.addDays(this.buildDateTime(this.selectedDate(), '00:00'), 1);
    const totalMinutes = Math.max(60, this.minutesBetween(dayStart, dayEnd));

    this.hourSlots.set(this.buildHourSlots(dayStart, dayEnd, totalMinutes));
    this.eventViews.set(this.exceptions()
      .map((exception) => this.toCalendarEventView(exception, dayStart, dayEnd, totalMinutes))
      .filter((event): event is CenterHoursCalendarEventView => !!event));
  }

  private toCalendarEventView(
    exception: CenterHoursExceptionResponseDto,
    dayStart: Date,
    dayEnd: Date,
    totalMinutes: number,
  ): CenterHoursCalendarEventView | null {
    if (exception.chiuso) {
      return {
        id: exception.id,
        source: exception,
        topPct: this.calendarVerticalInsetPct,
        heightPct: 100 - this.calendarVerticalInsetPct * 2,
        timeLabel: 'Tutto il giorno',
        title: 'Centro chiuso',
        subtitle: exception.motivo?.trim() || 'Chiusura straordinaria',
        cssClass: 'event-closed-day',
        icon: 'domain_disabled',
      };
    }

    const start = this.buildDateTime(exception.data, exception.oraApertura ?? '00:00');
    const end = this.buildDateTime(exception.data, exception.oraChiusura ?? '23:59');

    if (end <= dayStart || start >= dayEnd) {
      return null;
    }

    const clampedStart = start < dayStart ? dayStart : start;
    const clampedEnd = end > dayEnd ? dayEnd : end;
    const durationMinutes = Math.max(1, this.minutesBetween(clampedStart, clampedEnd));

    return {
      id: exception.id,
      source: exception,
      topPct: this.getCalendarTopPct(dayStart, clampedStart, totalMinutes),
      heightPct: this.getCalendarHeightPct(durationMinutes, totalMinutes),
      timeLabel: `${this.formatNullableTime(exception.oraApertura)} - ${this.formatNullableTime(exception.oraChiusura)}`,
      title: 'Orario eccezionale',
      subtitle: exception.motivo?.trim() || 'Variazione apertura/chiusura',
      cssClass: 'event-custom-hours',
      icon: 'schedule',
    };
  }

  private validateForm(): string {
    if (!this.openingTime() || !this.closingTime()) {
      return 'Inserisci sia l’orario di apertura sia l’orario di chiusura.';
    }

    const opening = this.buildDateTime(this.selectedDate(), this.openingTime());
    const closing = this.buildDateTime(this.selectedDate(), this.closingTime());

    if (!closing.getTime() || !opening.getTime() || closing <= opening) {
      return 'L’orario di chiusura deve essere successivo all’orario di apertura.';
    }

    return '';
  }

  private buildCreateRequest(): CreateCenterHoursExceptionRequestDto {
    return {
      data: this.selectedDate(),
      chiuso: false,
      oraApertura: this.openingTime(),
      oraChiusura: this.closingTime(),
      motivo: this.reason().trim() || null,
    };
  }

  private clearFeedback(): void {
    this.feedbackMessage.set('');
    this.feedbackType.set('');
  }

  private buildHourSlots(start: Date, end: Date, totalMinutes: number): CalendarHourSlot[] {
    const slots: CalendarHourSlot[] = [];
    const cursor = new Date(start);

    while (cursor <= end) {
      slots.push({
        label: this.formatTime(cursor),
        topPct: this.getCalendarTopPct(start, cursor, totalMinutes),
      });
      cursor.setHours(cursor.getHours() + 1);
    }

    return slots;
  }

  private buildDateTime(date: string, time: string): Date {
    const normalizedTime = time.length === 5 ? `${time}:00` : time;
    return new Date(`${date}T${normalizedTime}`);
  }

  private parseLocalDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatNullableTime(value: string | null): string {
    if (!value) {
      return '--:--';
    }

    return value.slice(0, 5);
  }

  private minutesBetween(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / 60000);
  }

  private getCalendarTopPct(dayStart: Date, value: Date, totalMinutes: number): number {
    const usablePct = 100 - this.calendarVerticalInsetPct * 2;
    return this.calendarVerticalInsetPct + (this.minutesBetween(dayStart, value) / totalMinutes) * usablePct;
  }

  private getCalendarHeightPct(durationMinutes: number, totalMinutes: number): number {
    const usablePct = 100 - this.calendarVerticalInsetPct * 2;
    return Math.max(5, (durationMinutes / totalMinutes) * usablePct);
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }
}
