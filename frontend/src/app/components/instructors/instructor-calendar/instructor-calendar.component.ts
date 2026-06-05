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
import { extractBackendErrorMessage } from '../../../util/error-message.util';

/**
 * Singola riga oraria visualizzata nel calendario giornaliero dell'istruttore.
 */
interface CalendarHourSlot {
  label: string;
  topPct: number;
}

/**
 * Evento già convertito in coordinate grafiche percentuali per il calendario.
 */
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
/**
 * Calendario personale dell'istruttore.
 * Mostra lezioni, indisponibilità e altri eventi del giorno convertendoli in blocchi grafici.
 */
export class InstructorCalendarComponent implements OnInit {
  /**
   * Margine verticale usato per evitare che gli eventi tocchino i bordi del calendario.
   */
  private readonly calendarVerticalInsetPct = 2.4;

  /**
   * Data correntemente visualizzata nel calendario.
   */
  selectedDate = new Date();
  /**
   * Stati di caricamento ed errore della pagina calendario.
   */
  loading = false;
  errorMessage = '';

  /**
   * Stato reattivo dell'agenda giornaliera ricevuta dal backend e delle sue viste grafiche.
   */
  private readonly agendaSignal = signal<InstructorCalendarDayResponseDto | null>(null);
  private readonly eventsSignal = signal<CalendarEventView[]>([]);
  private readonly hourSlotsSignal = signal<CalendarHourSlot[]>([]);
  private readonly calendarHeightSignal = signal(0);

  /**
   * Inietta il servizio che espone le API calendario dell'istruttore.
   */
  constructor(private readonly instructorCalendarService: InstructorCalendarService) {}

  /**
   * Carica l'agenda del giorno corrente all'apertura del componente.
   */
  ngOnInit(): void {
    this.loadAgenda();
  }

  /**
   * Agenda giornaliera corrente.
   */
  get agenda(): InstructorCalendarDayResponseDto | null {
    return this.agendaSignal();
  }

  /**
   * Eventi già pronti per essere disegnati nel calendario.
   */
  get events(): CalendarEventView[] {
    return this.eventsSignal();
  }

  /**
   * Slot orari visualizzati come griglia laterale del calendario.
   */
  get hourSlots(): CalendarHourSlot[] {
    return this.hourSlotsSignal();
  }

  /**
   * Altezza calcolata del calendario in base al range orario visualizzato.
   */
  get calendarHeight(): number {
    return this.calendarHeightSignal();
  }

  /**
   * Titolo leggibile della data selezionata.
   */
  get selectedDateTitle(): string {
    return this.selectedDate.toLocaleDateString('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  /**
   * Nome dell'istruttore restituito dall'agenda, se disponibile.
   */
  get instructorName(): string {
    const agenda = this.agenda;
    return agenda ? `${agenda.nomeIstruttore} ${agenda.cognomeIstruttore}` : 'Istruttore';
  }

  /**
   * Gestisce la selezione di una data dal datepicker.
   */
  onDateSelected(date: Date | null): void {
    if (!date) {
      return;
    }

    this.selectedDate = this.cloneDateOnly(date);
    this.loadAgenda();
  }

  /**
   * Riporta il calendario alla data odierna.
   */
  goToToday(): void {
    this.selectedDate = this.cloneDateOnly(new Date());
    this.loadAgenda();
  }

  /**
   * Mostra l'agenda del giorno precedente.
   */
  goToPreviousDay(): void {
    this.selectedDate = this.addDays(this.selectedDate, -1);
    this.loadAgenda();
  }

  /**
   * Mostra l'agenda del giorno successivo.
   */
  goToNextDay(): void {
    this.selectedDate = this.addDays(this.selectedDate, 1);
    this.loadAgenda();
  }

  /**
   * Ricarica l'agenda dopo un errore.
   */
  retry(): void {
    this.loadAgenda();
  }

  /**
   * Funzione trackBy per la griglia oraria.
   */
  trackByHour(_: number, slot: CalendarHourSlot): string {
    return slot.label;
  }

  /**
   * Funzione trackBy per gli eventi del calendario.
   */
  trackByEvent(_: number, event: CalendarEventView): string {
    return event.id;
  }

  /**
   * Carica dal backend l'agenda dell'istruttore per la data selezionata.
   */
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
          this.errorMessage = extractBackendErrorMessage(
            error,
            'Impossibile caricare il calendario istruttore.',
            {
              statusMessages: {
                403: 'Non hai i permessi per visualizzare questo calendario.',
              },
            },
          );
        },
      });
  }

  /**
   * Ricostruisce griglia oraria e blocchi evento a partire dall'agenda ricevuta.
   */
  private rebuildCalendar(agenda: InstructorCalendarDayResponseDto): void {
    const range = this.resolveCalendarRange();
    const totalMinutes = Math.max(60, this.minutesBetween(range.start, range.end));

    const visibleEvents = (agenda.eventi ?? []).filter((event) =>
      ['LEZIONE', 'ECCEZIONE_ISTRUTTORE', 'ECCEZIONE_CENTRO'].includes(event.tipo),
    );

    this.calendarHeightSignal.set(0);
    this.hourSlotsSignal.set(this.buildHourSlots(range.start, range.end, totalMinutes));
    this.eventsSignal.set(this.layoutEvents(visibleEvents, range.start, range.end, totalMinutes));
  }

  /**
   * Calcola intervallo orario visibile nel calendario giornaliero.
   */
  private resolveCalendarRange(): { start: Date; end: Date } {
    const start = this.cloneDateOnly(this.selectedDate);
    start.setHours(8, 0, 0, 0);

    const end = this.cloneDateOnly(this.selectedDate);
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);

    return { start, end };
  }

  /**
   * Genera le tacche orarie da visualizzare nel calendario.
   */
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

  /**
   * Posiziona gli eventi nel calendario e gestisce eventuali sovrapposizioni.
   */
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

  /**
   * Converte un evento backend in una vista grafica con posizione, durata, classe CSS e descrizioni.
   */
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
      cssClass: this.getEventCssClass(event),
      icon: this.getEventIcon(event),
    };
  }

  /**
   * Distribuisce orizzontalmente eventi sovrapposti per renderli tutti visibili.
   */
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

  /**
   * Costruisce un identificativo stabile per il trackBy degli eventi.
   */
  private buildEventId(event: InstructorCalendarEventResponseDto): string {
    const realId = event.prenotazioneId ?? event.eccezioneIstruttoreId ?? event.eccezioneCentroId;
    return `${event.tipo}-${realId ?? event.inizio}-${event.fine}`;
  }

  /**
   * Costruisce il sottotitolo descrittivo dell'evento.
   */
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

  /**
   * Costruisce il testo di dettaglio mostrato nella card evento.
   */
  private buildDetails(event: InstructorCalendarEventResponseDto): string {
    if (event.tipo === 'LEZIONE') {
      const cliente = [event.nomeCliente, event.cognomeCliente].filter(Boolean).join(' ');
      return cliente ? `Cliente: ${cliente}` : 'Cliente non disponibile';
    }

    return event.motivo || event.titolo || '';
  }

  /**
   * Associa a ogni tipo di evento una classe CSS grafica.
   */
  private getEventCssClass(event: InstructorCalendarEventResponseDto): string {
    switch (event.tipo) {
      case 'LEZIONE':
        return 'event-lesson';
      case 'ECCEZIONE_ISTRUTTORE':
        return 'event-instructor-unavailable';
      case 'ECCEZIONE_CENTRO':
        const isClosed = event.titolo?.toLowerCase().includes('chiuso') ||
                         event.motivo?.toLowerCase().includes('chiuso');
        return isClosed ? 'event-center-closed' : 'event-center-special-hours';
      default:
        return 'event-generic';
    }
  }

  /**
   * Associa a ogni tipo di evento un'icona Material.
   */
  private getEventIcon(event: InstructorCalendarEventResponseDto): string {
    switch (event.tipo) {
      case 'LEZIONE':
        return 'sports_tennis';
      case 'ECCEZIONE_ISTRUTTORE':
        return 'event_busy';
      case 'ECCEZIONE_CENTRO':
        const isClosed = event.titolo?.toLowerCase().includes('chiuso') ||
                         event.motivo?.toLowerCase().includes('chiuso');
        return isClosed ? 'domain_disabled' : 'schedule';
      default:
        return 'event';
    }
  }

  /**
   * Converte una stringa data/ora backend in oggetto Date.
   */
  private parseDateTime(value: string): Date {
    return new Date(value);
  }

  /**
   * Formatta un orario in formato HH:mm italiano.
   */
  private formatTime(date: Date): string {
    return date.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Formatta una durata in minuti in forma leggibile.
   */
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

  /**
   * Calcola la distanza in minuti tra due date.
   */
  private minutesBetween(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / 60000);
  }

  /**
   * Calcola la posizione verticale percentuale di un evento o slot.
   */
  private getCalendarTopPct(dayStart: Date, value: Date, totalMinutes: number): number {
    const usablePct = 100 - this.calendarVerticalInsetPct * 2;
    return this.calendarVerticalInsetPct + (this.minutesBetween(dayStart, value) / totalMinutes) * usablePct;
  }

  /**
   * Calcola l'altezza percentuale di un evento in base alla durata.
   */
  private getCalendarHeightPct(durationMinutes: number, totalMinutes: number): number {
    const usablePct = 100 - this.calendarVerticalInsetPct * 2;
    return (durationMinutes / totalMinutes) * usablePct;
  }

  /**
   * Restituisce una nuova data spostata di un certo numero di giorni.
   */
  private addDays(date: Date, days: number): Date {
    const next = this.cloneDateOnly(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  /**
   * Crea una copia della data mantenendo solo giorno, mese e anno.
   */
  private cloneDateOnly(date: Date): Date {
    const clone = new Date(date);
    clone.setHours(0, 0, 0, 0);
    return clone;
  }

}
