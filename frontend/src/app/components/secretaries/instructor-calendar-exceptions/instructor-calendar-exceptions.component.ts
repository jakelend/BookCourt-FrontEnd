import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { finalize } from 'rxjs/operators';
import { SecretaryInstructorUnavailabilityRequestDto } from '../../../dto/request/secretary/secretary-instructor-unavailability-request.dto';
import { SecretaryInstructorCalendarDayResponseDto } from '../../../dto/response/secretary/secretary-instructor-calendar-day-response.dto';
import { SecretaryInstructorCalendarEventResponseDto } from '../../../dto/response/secretary/secretary-instructor-calendar-event-response.dto';
import { SecretaryInstructorResponseDto } from '../../../dto/response/secretary/secretary-instructor-response.dto';
import { SecretaryInstructorCalendarService } from '../../../services/secretary-instructor-calendar.service';
import { extractBackendErrorMessage } from '../../../util/error-message.util';

interface CalendarHourSlot {
  label: string;
  topPct: number;
}

interface CalendarEventView {
  id: string;
  source: SecretaryInstructorCalendarEventResponseDto;
  start: Date;
  end: Date;
  topPct: number;
  heightPct: number;
  leftPct: number;
  widthPct: number;
  timeLabel: string;
  durationLabel: string;
  subtitle: string;
  details: string;
  cssClass: string;
  icon: string;
}

interface CreateUnavailabilityForm {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  motivo: string;
}

@Component({
  selector: 'app-instructor-calendar-exceptions',
  imports: [
    CommonModule,
    FormsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './instructor-calendar-exceptions.component.html',
  styleUrl: './instructor-calendar-exceptions.component.css',
})
export class InstructorCalendarExceptionsComponent implements OnInit {
  private readonly calendarVerticalInsetPct = 2.4;

  selectedDate = new Date();
  selectedInstructorId: number | null = null;

  loadingInstructors = false;
  loadingAgenda = false;

  readonly isSaving = signal(false);
  readonly deleting = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly formErrorMessage = signal('');

  createForm: CreateUnavailabilityForm = this.buildCreateForm();
  selectedEvent: CalendarEventView | null = null;

  private readonly instructorsSignal = signal<SecretaryInstructorResponseDto[]>([]);
  private readonly agendaSignal = signal<SecretaryInstructorCalendarDayResponseDto | null>(null);
  private readonly eventsSignal = signal<CalendarEventView[]>([]);
  private readonly hourSlotsSignal = signal<CalendarHourSlot[]>([]);

  constructor(private readonly calendarService: SecretaryInstructorCalendarService) {}

  ngOnInit(): void {
    this.loadInstructors();
  }

  get instructors(): SecretaryInstructorResponseDto[] {
    return this.instructorsSignal();
  }

  get agenda(): SecretaryInstructorCalendarDayResponseDto | null {
    return this.agendaSignal();
  }

  get events(): CalendarEventView[] {
    return this.eventsSignal();
  }

  get hourSlots(): CalendarHourSlot[] {
    return this.hourSlotsSignal();
  }

  get selectedDateTitle(): string {
    return this.selectedDate.toLocaleDateString('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  get selectedInstructor(): SecretaryInstructorResponseDto | null {
    return this.instructors.find((instructor) => instructor.id === this.selectedInstructorId) ?? null;
  }

  get selectedInstructorName(): string {
    const instructor = this.selectedInstructor;
    return instructor ? `${instructor.nome} ${instructor.cognome}` : 'Seleziona un istruttore';
  }

  get hasInstructorSelected(): boolean {
    return this.selectedInstructorId !== null;
  }

  onInstructorSelected(value: string | number | null): void {
    const numericValue = Number(value);
    this.selectedInstructorId = Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
    this.selectedEvent = null;
    this.createForm = this.buildCreateForm();
    this.loadAgenda();
  }

  onDateSelected(date: Date | null): void {
    if (!date) {
      return;
    }

    this.selectedDate = this.cloneDateOnly(date);
    this.selectedEvent = null;
    this.createForm = this.buildCreateForm();
    this.loadAgenda();
  }

  goToToday(): void {
    this.selectedDate = this.cloneDateOnly(new Date());
    this.selectedEvent = null;
    this.createForm = this.buildCreateForm();
    this.loadAgenda();
  }

  goToPreviousDay(): void {
    this.selectedDate = this.addDays(this.selectedDate, -1);
    this.selectedEvent = null;
    this.createForm = this.buildCreateForm();
    this.loadAgenda();
  }

  goToNextDay(): void {
    this.selectedDate = this.addDays(this.selectedDate, 1);
    this.selectedEvent = null;
    this.createForm = this.buildCreateForm();
    this.loadAgenda();
  }

  retry(): void {
    if (!this.instructors.length) {
      this.loadInstructors();
      return;
    }

    this.loadAgenda();
  }

  submitCreate(): void {
    if (!this.selectedInstructorId) {
      this.formErrorMessage.set('Seleziona un istruttore prima di inserire l’indisponibilità.');
      return;
    }

    const request = this.buildCreateRequest(this.selectedInstructorId);

    if (!request) {
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.calendarService
      .createInstructorUnavailability(request)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: () => {
          this.successMessage.set('Indisponibilità istruttore inserita correttamente.');
          this.formErrorMessage.set('');
          this.createForm.motivo = '';
          this.loadAgenda();
        },
        error: (error) => {
          const message = extractBackendErrorMessage(
            error,
            'Impossibile inserire l’indisponibilità istruttore.',
          );
          this.formErrorMessage.set(message);
        },
      });
  }

  openEventDetails(event: CalendarEventView, domEvent?: Event): void {
    domEvent?.stopPropagation();
    this.selectedEvent = event;
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  closeEventDetails(): void {
    this.selectedEvent = null;
  }

  deleteSelectedEvent(): void {
    const exceptionId = this.selectedEvent?.source.eccezioneIstruttoreId;

    if (!exceptionId || this.selectedEvent?.source.tipo !== 'ECCEZIONE_ISTRUTTORE') {
      return;
    }

    this.deleting.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.calendarService
      .deleteInstructorUnavailability(exceptionId)
      .pipe(finalize(() => this.deleting.set(false)))
      .subscribe({
        next: () => {
          this.successMessage.set('Indisponibilità istruttore eliminata correttamente.');
          this.closeEventDetails();
          this.loadAgenda();
        },
        error: (error) => {
          this.errorMessage.set(extractBackendErrorMessage(
            error,
            'Impossibile eliminare l’indisponibilità istruttore.',
          ));
        },
      });
  }

  isDeletableInstructorException(event: CalendarEventView | null): boolean {
    return event?.source.tipo === 'ECCEZIONE_ISTRUTTORE' && !!event.source.eccezioneIstruttoreId;
  }

  trackByInstructor(_: number, instructor: SecretaryInstructorResponseDto): number {
    return instructor.id;
  }

  trackByHour(_: number, slot: CalendarHourSlot): string {
    return slot.label;
  }

  trackByEvent(_: number, event: CalendarEventView): string {
    return event.id;
  }

  private loadInstructors(): void {
    this.loadingInstructors = true;
    this.errorMessage.set('');

    this.calendarService
      .getInstructors()
      .pipe(finalize(() => (this.loadingInstructors = false)))
      .subscribe({
        next: (instructors) => {
          this.instructorsSignal.set(instructors ?? []);

          if (instructors?.length) {
            this.selectedInstructorId = instructors[0].id;
            this.loadAgenda();
          } else {
            this.clearAgenda();
            this.errorMessage.set('Non sono presenti istruttori attivi da gestire.');
          }
        },
        error: (error) => {
          this.instructorsSignal.set([]);
          this.clearAgenda();
          this.errorMessage.set(extractBackendErrorMessage(
            error,
            'Impossibile caricare la lista degli istruttori.',
          ));
        },
      });
  }

  private loadAgenda(): void {
    if (!this.selectedInstructorId) {
      this.clearAgenda();
      return;
    }

    this.loadingAgenda = true;
    this.errorMessage.set('');

    this.calendarService
      .getInstructorDailyAgenda(this.selectedInstructorId, this.selectedDate)
      .pipe(finalize(() => (this.loadingAgenda = false)))
      .subscribe({
        next: (agenda) => {
          this.agendaSignal.set(agenda);
          this.rebuildCalendar(agenda);
        },
        error: (error) => {
          this.clearAgenda();
          this.errorMessage.set(extractBackendErrorMessage(
            error,
            'Impossibile caricare il calendario dell’istruttore selezionato.',
          ));
        },
      });
  }

  private clearAgenda(): void {
    this.agendaSignal.set(null);
    this.eventsSignal.set([]);
    this.hourSlotsSignal.set([]);
  }

  private rebuildCalendar(agenda: SecretaryInstructorCalendarDayResponseDto): void {
    const range = this.resolveCalendarRange();
    const totalMinutes = Math.max(60, this.minutesBetween(range.start, range.end));

    this.hourSlotsSignal.set(this.buildHourSlots(range.start, range.end, totalMinutes));
    this.eventsSignal.set(this.layoutEvents(agenda.eventi ?? [], range.start, range.end, totalMinutes));
  }

  private resolveCalendarRange(): { start: Date; end: Date } {
    const start = this.cloneDateOnly(this.selectedDate);
    start.setHours(8, 0, 0, 0);

    const end = this.cloneDateOnly(this.selectedDate);
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);

    return { start, end };
  }

  private buildHourSlots(start: Date, end: Date, totalMinutes: number): CalendarHourSlot[] {
    const slots: CalendarHourSlot[] = [];
    const cursor = new Date(start);
    cursor.setMinutes(0, 0, 0);

    while (cursor <= end) {
      slots.push({
        label: this.formatTime(cursor),
        topPct: this.getCalendarTopPct(start, cursor, totalMinutes),
      });
      cursor.setHours(cursor.getHours() + 1);
    }

    return slots;
  }

  private layoutEvents(
    events: SecretaryInstructorCalendarEventResponseDto[],
    dayStart: Date,
    dayEnd: Date,
    totalMinutes: number,
  ): CalendarEventView[] {
    const views = events
      .map((event) => this.toCalendarEventView(event, dayStart, dayEnd, totalMinutes))
      .filter((event): event is CalendarEventView => !!event)
      .sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());

    const groups: CalendarEventView[][] = [];
    let currentGroup: CalendarEventView[] = [];
    let currentGroupEnd = Number.NEGATIVE_INFINITY;

    for (const event of views) {
      const eventStart = event.start.getTime();
      const eventEnd = event.end.getTime();

      if (!currentGroup.length || eventStart < currentGroupEnd) {
        currentGroup.push(event);
        currentGroupEnd = Math.max(currentGroupEnd, eventEnd);
      } else {
        groups.push(currentGroup);
        currentGroup = [event];
        currentGroupEnd = eventEnd;
      }
    }

    if (currentGroup.length) {
      groups.push(currentGroup);
    }

    groups.forEach((group) => this.positionOverlappingGroup(group));

    return views;
  }

  private toCalendarEventView(
    event: SecretaryInstructorCalendarEventResponseDto,
    dayStart: Date,
    dayEnd: Date,
    totalMinutes: number,
  ): CalendarEventView | null {
    const start = this.parseDateTime(event.inizio);
    const end = this.parseDateTime(event.fine);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return null;
    }

    if (end <= dayStart || start >= dayEnd) {
      return null;
    }

    const clampedStart = start < dayStart ? dayStart : start;
    const clampedEnd = end > dayEnd ? dayEnd : end;
    const durationMinutes = Math.max(1, this.minutesBetween(clampedStart, clampedEnd));

    return {
      id: this.buildEventId(event),
      source: event,
      start: clampedStart,
      end: clampedEnd,
      topPct: this.getCalendarTopPct(dayStart, clampedStart, totalMinutes),
      heightPct: this.getCalendarHeightPct(durationMinutes, totalMinutes),
      leftPct: 0,
      widthPct: 100,
      timeLabel: `${this.formatTime(start)} - ${this.formatTime(end)}`,
      durationLabel: this.formatDuration(durationMinutes),
      subtitle: this.buildSubtitle(event),
      details: this.buildDetails(event),
      cssClass: this.getEventCssClass(event.tipo),
      icon: this.getEventIcon(event.tipo),
    };
  }

  private positionOverlappingGroup(group: CalendarEventView[]): void {
    const columnEndTimes: number[] = [];
    const columnsByEvent = new Map<string, number>();

    for (const event of group) {
      const reusableColumnIndex = columnEndTimes.findIndex((endTime) => endTime <= event.start.getTime());
      const columnIndex = reusableColumnIndex >= 0 ? reusableColumnIndex : columnEndTimes.length;

      columnEndTimes[columnIndex] = event.end.getTime();
      columnsByEvent.set(event.id, columnIndex);
    }

    const totalColumns = Math.max(1, columnEndTimes.length);

    for (const event of group) {
      const columnIndex = columnsByEvent.get(event.id) ?? 0;
      const gapPct = 1.5;

      event.leftPct = (columnIndex * 100) / totalColumns;
      event.widthPct = 100 / totalColumns - gapPct;
    }
  }

  private buildCreateRequest(instructorId: number): SecretaryInstructorUnavailabilityRequestDto | null {
    const motivo = this.createForm.motivo.trim() || 'Indisponibilità istruttore';
    let inizio = '';
    let fine = '';

    if (
      !this.createForm.startDate ||
      !this.createForm.startTime ||
      !this.createForm.endDate ||
      !this.createForm.endTime
    ) {
      this.formErrorMessage.set('Compila data e ora di inizio/fine del periodo.');
      return null;
    }

    inizio = this.combineDateAndTime(this.createForm.startDate, this.createForm.startTime);
    fine = this.combineDateAndTime(this.createForm.endDate, this.createForm.endTime);

    if (this.parseDateTime(fine) <= this.parseDateTime(inizio)) {
      this.formErrorMessage.set('L’orario di fine deve essere successivo all’orario di inizio.');
      return null;
    }

    this.formErrorMessage.set('');

    return {
      istruttoreId: instructorId,
      inizio,
      fine,
      motivo,
    };
  }

  private buildCreateForm(): CreateUnavailabilityForm {
    const selectedDay = this.formatLocalDate(this.selectedDate);

    return {
      startDate: selectedDay,
      startTime: '09:00',
      endDate: selectedDay,
      endTime: '10:00',
      motivo: '',
    };
  }

  private buildEventId(event: SecretaryInstructorCalendarEventResponseDto): string {
    const realId = event.prenotazioneId ?? event.eccezioneIstruttoreId ?? event.eccezioneCentroId;
    return `${event.tipo}-${realId ?? event.inizio}-${event.fine}`;
  }

  private buildSubtitle(event: SecretaryInstructorCalendarEventResponseDto): string {
    switch (event.tipo) {
      case 'LEZIONE':
        return event.nomeCampo ? `Campo: ${event.nomeCampo}` : 'Lezione prenotata';
      case 'ECCEZIONE_ISTRUTTORE':
        return 'Indisponibilità istruttore';
      case 'ECCEZIONE_CENTRO':
        return 'Eccezione orario centro';
      default:
        return event.motivo ?? '';
    }
  }

  private buildDetails(event: SecretaryInstructorCalendarEventResponseDto): string {
    if (event.tipo === 'LEZIONE') {
      const cliente = [event.nomeCliente, event.cognomeCliente].filter(Boolean).join(' ');
      return cliente ? `Cliente: ${cliente}` : 'Cliente non disponibile';
    }

    return event.motivo || event.titolo || '';
  }

  private getEventCssClass(tipo: string): string {
    switch (tipo) {
      case 'LEZIONE':
        return 'event-lesson';
      case 'ECCEZIONE_ISTRUTTORE':
        return 'event-instructor-exception';
      case 'ECCEZIONE_CENTRO':
        return 'event-center-exception';
      default:
        return 'event-generic';
    }
  }

  private getEventIcon(tipo: string): string {
    switch (tipo) {
      case 'LEZIONE':
        return 'sports_tennis';
      case 'ECCEZIONE_ISTRUTTORE':
        return 'event_busy';
      case 'ECCEZIONE_CENTRO':
        return 'domain_disabled';
      default:
        return 'event';
    }
  }

  private parseDateTime(value: string): Date {
    return new Date(value);
  }

  private parseLocalDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private combineDateAndTime(date: string, time: string): string {
    return `${date}T${time}:00`;
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

  private formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours && remainingMinutes) {
      return `${hours}h ${remainingMinutes}m`;
    }

    if (hours) {
      return `${hours}h`;
    }

    return `${remainingMinutes}m`;
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
    return (durationMinutes / totalMinutes) * usablePct;
  }

  private addDays(date: Date, days: number): Date {
    const next = this.cloneDateOnly(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private cloneDateOnly(date: Date): Date {
    const clone = new Date(date);
    clone.setHours(0, 0, 0, 0);
    return clone;
  }
}
