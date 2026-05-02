import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize } from 'rxjs/operators';
import { InstructorCalendarDayResponseDto } from '../../../dto/response/instructor/instructor-calendar-day-response.dto';
import { InstructorCalendarEventResponseDto } from '../../../dto/response/instructor/instructor-calendar-event-response.dto';
import { InstructorCalendarService } from '../../../services/instructor-calendar.service';

interface CalendarHourSlot {
  label: string;
  topPct: number;
}

interface CalendarEventView {
  id: string;
  source: InstructorCalendarEventResponseDto;
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

@Component({
  selector: 'app-instructor-calendar',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './instructor-calendar.component.html',
  styleUrl: './instructor-calendar.component.css',
})
export class InstructorCalendarComponent implements OnInit {
  private readonly calendarVerticalInsetPct = 2.4;

  selectedDate = new Date();
  loading = false;
  errorMessage = '';

  private readonly agendaSignal = signal<InstructorCalendarDayResponseDto | null>(null);
  private readonly eventsSignal = signal<CalendarEventView[]>([]);
  private readonly hourSlotsSignal = signal<CalendarHourSlot[]>([]);
  private readonly calendarHeightSignal = signal(0);

  constructor(private readonly instructorCalendarService: InstructorCalendarService) {}

  ngOnInit(): void {
    this.loadAgenda();
  }

  get agenda(): InstructorCalendarDayResponseDto | null {
    return this.agendaSignal();
  }

  get events(): CalendarEventView[] {
    return this.eventsSignal();
  }

  get hourSlots(): CalendarHourSlot[] {
    return this.hourSlotsSignal();
  }

  get calendarHeight(): number {
    return this.calendarHeightSignal();
  }

  get selectedDateTitle(): string {
    return this.selectedDate.toLocaleDateString('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  get instructorName(): string {
    const agenda = this.agenda;
    return agenda ? `${agenda.nomeIstruttore} ${agenda.cognomeIstruttore}` : 'Istruttore';
  }

  onDateSelected(date: Date | null): void {
    if (!date) {
      return;
    }

    this.selectedDate = this.cloneDateOnly(date);
    this.loadAgenda();
  }

  goToToday(): void {
    this.selectedDate = this.cloneDateOnly(new Date());
    this.loadAgenda();
  }

  goToPreviousDay(): void {
    this.selectedDate = this.addDays(this.selectedDate, -1);
    this.loadAgenda();
  }

  goToNextDay(): void {
    this.selectedDate = this.addDays(this.selectedDate, 1);
    this.loadAgenda();
  }

  retry(): void {
    this.loadAgenda();
  }

  trackByHour(_: number, slot: CalendarHourSlot): string {
    return slot.label;
  }

  trackByEvent(_: number, event: CalendarEventView): string {
    return event.id;
  }

  private loadAgenda(): void {
    this.loading = true;
    this.errorMessage = '';

    this.instructorCalendarService
      .getMyDailyAgenda(this.selectedDate)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (agenda) => {
          this.agendaSignal.set(agenda);
          this.rebuildCalendar(agenda);
        },
        error: (error) => {
          this.agendaSignal.set(null);
          this.eventsSignal.set([]);
          this.hourSlotsSignal.set([]);
          this.calendarHeightSignal.set(0);
          this.errorMessage = this.extractErrorMessage(error, 'Impossibile caricare il calendario istruttore.');
        },
      });
  }

  private rebuildCalendar(agenda: InstructorCalendarDayResponseDto): void {
    const range = this.resolveCalendarRange();
    const totalMinutes = Math.max(60, this.minutesBetween(range.start, range.end));

    this.calendarHeightSignal.set(0);
    this.hourSlotsSignal.set(this.buildHourSlots(range.start, range.end, totalMinutes));
    this.eventsSignal.set(this.layoutEvents(agenda.eventi ?? [], range.start, range.end, totalMinutes));
  }

  private resolveCalendarRange(): { start: Date; end: Date } {
    const start = this.getDisplayStartTime();
    const end = this.getDisplayEndTime();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      const fallbackStart = this.cloneDateOnly(this.selectedDate);
      fallbackStart.setHours(8, 0, 0, 0);

      const fallbackEnd = this.cloneDateOnly(this.selectedDate);
      fallbackEnd.setDate(fallbackEnd.getDate() + 1);
      fallbackEnd.setHours(0, 0, 0, 0);

      return { start: fallbackStart, end: fallbackEnd };
    }

    return { start, end };
  }

  private getDisplayStartTime(): Date {
    const displayStart = this.cloneDateOnly(this.selectedDate);
    displayStart.setHours(8, 0, 0, 0);
    return displayStart;
  }

  private getDisplayEndTime(): Date {
    const displayEnd = this.cloneDateOnly(this.selectedDate);
    displayEnd.setDate(displayEnd.getDate() + 1);
    displayEnd.setHours(0, 0, 0, 0);
    return displayEnd;
  }

  private buildHourSlots(start: Date, end: Date, totalMinutes: number): CalendarHourSlot[] {
    const slots: CalendarHourSlot[] = [];
    const cursor = new Date(start);
    cursor.setMinutes(0, 0, 0);

    if (cursor < start) {
      cursor.setHours(cursor.getHours() + 1);
    }

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
    events: InstructorCalendarEventResponseDto[],
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
    event: InstructorCalendarEventResponseDto,
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

  private buildEventId(event: InstructorCalendarEventResponseDto): string {
    const realId = event.prenotazioneId ?? event.eccezioneIstruttoreId ?? event.eccezioneCentroId;
    return `${event.tipo}-${realId ?? event.inizio}-${event.fine}`;
  }

  private buildSubtitle(event: InstructorCalendarEventResponseDto): string {
    switch (event.tipo) {
      case 'LEZIONE':
        return event.nomeCampo ? `Campo: ${event.nomeCampo}` : 'Lezione prenotata';
      case 'ECCEZIONE_ISTRUTTORE':
        return 'Indisponibilità personale';
      case 'ECCEZIONE_CENTRO':
        return 'Eccezione orario centro';
      default:
        return event.motivo ?? '';
    }
  }

  private buildDetails(event: InstructorCalendarEventResponseDto): string {
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

  private extractErrorMessage(error: unknown, fallback: string): string {
    const maybeError = error as { error?: { message?: string; fields?: Record<string, string> }; status?: number };

    if (maybeError?.error?.message) {
      return maybeError.error.message;
    }

    if (maybeError?.error?.fields) {
      const fieldErrors = Object.values(maybeError.error.fields).filter(Boolean);
      if (fieldErrors.length) {
        return fieldErrors.join(' ');
      }
    }

    if (maybeError?.status === 403) {
      return 'Non hai i permessi per visualizzare questo calendario.';
    }

    return fallback;
  }
}
