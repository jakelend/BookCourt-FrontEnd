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

/**
 * Modalità possibili per un'eccezione orario: chiusura totale oppure orario personalizzato.
 */
type CenterHoursExceptionMode = 'CLOSED' | 'CUSTOM_HOURS';
/**
 * Tipo di feedback mostrato dopo creazione o cancellazione dell'eccezione.
 */
type FeedbackType = 'success' | 'error' | '';

/**
 * Tacca oraria usata dalla griglia del calendario giornaliero.
 */
interface CalendarHourSlot {
  label: string;
  topPct: number;
}

/**
 * Vista grafica di un'eccezione orario centro posizionata nel calendario.
 */
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
/**
 * Pagina segretaria per gestire le eccezioni orario del centro.
 * Permette di chiudere un giorno intero o impostare un orario eccezionale di apertura/chiusura.
 */
export class CenterHoursExceptionsComponent implements OnInit {
  /**
   * Stato reattivo della data selezionata e dei campi del form eccezione.
   */
  readonly selectedDate = signal(this.formatLocalDate(new Date()));
  readonly mode = signal<CenterHoursExceptionMode>('CUSTOM_HOURS');
  readonly openingTime = signal('08:00');
  readonly closingTime = signal('23:00');
  readonly reason = signal('');

  /**
   * Eccezioni caricate dal backend e strutture grafiche del calendario.
   */
  readonly exceptions = signal<CenterHoursExceptionResponseDto[]>([]);
  readonly hourSlots = signal<CalendarHourSlot[]>([]);
  readonly eventViews = signal<CenterHoursCalendarEventView[]>([]);

  /**
   * Stati di caricamento, salvataggio, eliminazione e messaggi della pagina.
   */
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly deletingId = signal<number | null>(null);

  readonly errorMessage = signal('');
  readonly formErrorMessage = signal('');
  readonly feedbackMessage = signal('');
  readonly feedbackType = signal<FeedbackType>('');

  /**
   * Data selezionata convertita in oggetto Date per il datepicker.
   */
  readonly selectedDateValue = computed(() => this.parseLocalDate(this.selectedDate()));

  /**
   * Titolo leggibile della data selezionata.
   */
  readonly selectedDateTitle = computed(() => {
    return this.parseLocalDate(this.selectedDate()).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  });

  /**
   * Eccezione presente per il giorno selezionato; il backend ne consente una per data.
   */
  readonly currentException = computed(() => this.exceptions()[0] ?? null);

  /**
   * Indica se è possibile creare una nuova eccezione per la data selezionata.
   */
  readonly canCreateException = computed(() => {
    return !this.currentException() && !this.loading() && !this.saving();
  });

  /**
   * Margine verticale usato per posizionare correttamente gli eventi nel calendario.
   */
  private readonly calendarVerticalInsetPct = 2.4;

  /**
   * Inietta il servizio segretaria per le API delle eccezioni orario centro.
   */
  constructor(private readonly centerHoursService: SecretaryCenterHoursService) {}

  /**
   * Inizializza calendario e carica eventuali eccezioni della data corrente.
   */
  ngOnInit(): void {
    this.rebuildCalendar();
    this.loadExceptions();
  }

  /**
   * Gestisce la selezione della data dal datepicker Material.
   */
  onDateSelected(date: Date | null): void {
    if (!date) {
      return;
    }

    this.selectedDate.set(this.formatLocalDate(date));
    this.onSelectedDateChange();
  }

  /**
   * Gestisce la selezione della data da input HTML nativo.
   */
  onDateSelectedNative(value: string): void {
    if (!value) {
      return;
    }
    this.selectedDate.set(value);
    this.onSelectedDateChange();
  }

  /**
   * Porta la vista alla data odierna.
   */
  goToToday(): void {
    this.selectedDate.set(this.formatLocalDate(new Date()));
    this.onSelectedDateChange();
  }

  /**
   * Mostra il giorno precedente.
   */
  goToPreviousDay(): void {
    this.selectedDate.set(this.formatLocalDate(this.addDays(this.parseLocalDate(this.selectedDate()), -1)));
    this.onSelectedDateChange();
  }

  /**
   * Mostra il giorno successivo.
   */
  goToNextDay(): void {
    this.selectedDate.set(this.formatLocalDate(this.addDays(this.parseLocalDate(this.selectedDate()), 1)));
    this.onSelectedDateChange();
  }

  /**
   * Cambia il tipo di eccezione che la segretaria vuole creare.
   *
   * Se la modalità è CLOSED, il centro viene considerato chiuso
   * per tutta la giornata e gli orari non vengono inviati al backend.
   *
   * Se la modalità è CUSTOM_HOURS, la segretaria deve scegliere
   * ora di apertura e ora di chiusura del centro.
   */
  setMode(mode: CenterHoursExceptionMode): void {
    this.mode.set(mode);
    this.formErrorMessage.set('');
    this.clearFeedback();
  }

  /**
   * Gestisce il toggle "centro chiuso tutto il giorno".
   *
   * Quando il toggle è attivo, viene selezionata la modalità CLOSED.
   * Quando il toggle è spento, viene selezionata la modalità CUSTOM_HOURS.
   */
  toggleMode(isClosed: boolean): void {
    this.setMode(isClosed ? 'CLOSED' : 'CUSTOM_HOURS');
  }

  /**
   * Aggiorna l'orario di apertura del form.
   */
  setOpeningTime(value: string): void {
    this.openingTime.set(value);
  }

  /**
   * Aggiorna l'orario di chiusura del form.
   */
  setClosingTime(value: string): void {
    this.closingTime.set(value);
  }

  /**
   * Aggiorna il motivo dell'eccezione.
   */
  setReason(value: string): void {
    this.reason.set(value ?? '');
  }

  /**
   * Crea l'eccezione orario centro per la data selezionata.
   * Dopo il successo il backend gestisce l'annullamento delle prenotazioni impattate.
   */
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

  /**
   * Elimina l'eccezione orario centro selezionata.
   */
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

  /**
   * Riprova il caricamento delle eccezioni dopo un errore.
   */
  retry(): void {
    this.loadExceptions();
  }

  /**
   * Indica se il form è impostato su chiusura giornaliera.
   */
  isClosedMode(): boolean {
    return this.mode() === 'CLOSED';
  }

  /**
   * Indica se il form è impostato su orario personalizzato.
   */
  isCustomHoursMode(): boolean {
    return this.mode() === 'CUSTOM_HOURS';
  }

  /**
   * Indica se l'eccezione specificata è in fase di eliminazione.
   */
  isDeleting(exceptionId: number): boolean {
    return this.deletingId() === exceptionId;
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
  trackByEvent(_: number, event: CenterHoursCalendarEventView): number {
    return event.id;
  }

  /**
   * Funzione trackBy per la lista delle eccezioni.
   */
  trackByException(_: number, exception: CenterHoursExceptionResponseDto): number {
    return exception.id;
  }

  /**
   * Costruisce il titolo leggibile dell'eccezione mostrata nella UI.
   */
  formatExceptionTitle(exception: CenterHoursExceptionResponseDto): string {
    if (exception.chiuso) {
      return 'Centro chiuso tutto il giorno';
    }

    return `Orario eccezionale ${this.formatNullableTime(exception.oraApertura)} - ${this.formatNullableTime(exception.oraChiusura)}`;
  }

  /**
   * Restituisce il motivo dell'eccezione oppure un testo di fallback.
   */
  formatExceptionSubtitle(exception: CenterHoursExceptionResponseDto): string {
    return exception.motivo?.trim() || 'Nessun motivo indicato';
  }

  /**
   * Formatta una data yyyy-MM-dd in formato italiano.
   */
  formatDisplayDate(value: string): string {
    return this.parseLocalDate(value).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  /**
   * Resetta messaggi e ricarica le eccezioni quando cambia la data selezionata.
   */
  private onSelectedDateChange(): void {
    this.formErrorMessage.set('');
    this.clearFeedback();
    this.loadExceptions();
  }

  /**
   * Carica dal backend le eccezioni orario centro per la data selezionata.
   */
  private loadExceptions(): void {
    const selectedDate = this.selectedDate();

    this.loading.set(true);
    this.errorMessage.set('');

    this.centerHoursService
      .getEccezioniOrarioCentro(selectedDate, selectedDate)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (exceptions) => {
          /*
            Chiedo lo stesso giorno sia come inizio sia come fine
            per recuperare solo l'eventuale eccezione della data selezionata.
          */
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

  /**
   * Ricostruisce griglia oraria ed eventi grafici del calendario.
   */
  private rebuildCalendar(): void {
    const dayStart = this.buildDateTime(this.selectedDate(), '08:00');
    const dayEnd = this.addDays(this.buildDateTime(this.selectedDate(), '00:00'), 1);
    const totalMinutes = Math.max(60, this.minutesBetween(dayStart, dayEnd));

    this.hourSlots.set(this.buildHourSlots(dayStart, dayEnd, totalMinutes));
    this.eventViews.set(this.exceptions()
      .map((exception) => this.toCalendarEventView(exception, dayStart, dayEnd, totalMinutes))
      .filter((event): event is CenterHoursCalendarEventView => !!event));
  }

  /**
   * Converte un'eccezione backend in evento grafico del calendario.
   */
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

  /**
   * Controlla i dati inseriti nel form.
   *
   * Se il centro è chiuso tutto il giorno non servono gli orari.
   * Se invece la segretaria vuole personalizzare l'orario,
   * allora apertura e chiusura sono obbligatorie.
   */
  private validateForm(): string {
    if (this.isClosedMode()) {
      return '';
    }

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

  /**
   * Costruisce la request da mandare al backend.
   *
   * Caso centro chiuso:
   * - chiuso = true
   * - oraApertura = null
   * - oraChiusura = null
   *
   * Caso orario personalizzato:
   * - chiuso = false
   * - oraApertura valorizzata
   * - oraChiusura valorizzata
   */
  private buildCreateRequest(): CreateCenterHoursExceptionRequestDto {
    const closedAllDay = this.isClosedMode();

    return {
      data: this.selectedDate(),
      chiuso: closedAllDay,
      oraApertura: closedAllDay ? null : this.openingTime(),
      oraChiusura: closedAllDay ? null : this.closingTime(),
      motivo: this.reason().trim() || null,
    };
  }

  /**
   * Pulisce il messaggio di feedback mostrato nella UI.
   */
  private clearFeedback(): void {
    this.feedbackMessage.set('');
    this.feedbackType.set('');
  }

  /**
   * Genera gli slot orari della griglia calendario.
   */
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

  /**
   * Combina data e ora in un oggetto Date locale.
   */
  private buildDateTime(date: string, time: string): Date {
    const normalizedTime = time.length === 5 ? `${time}:00` : time;
    return new Date(`${date}T${normalizedTime}`);
  }

  /**
   * Converte yyyy-MM-dd in Date locale senza problemi di timezone.
   */
  private parseLocalDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  /**
   * Formatta una Date locale in yyyy-MM-dd.
   */
  private formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  /**
   * Formatta un orario in HH:mm.
   */
  private formatTime(date: Date): string {
    return date.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Formatta un orario opzionale gestendo i valori null.
   */
  private formatNullableTime(value: string | null): string {
    if (!value) {
      return '--:--';
    }

    return value.slice(0, 5);
  }

  /**
   * Calcola la differenza in minuti tra due date.
   */
  private minutesBetween(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / 60000);
  }

  /**
   * Calcola la posizione verticale percentuale nel calendario.
   */
  private getCalendarTopPct(dayStart: Date, value: Date, totalMinutes: number): number {
    const usablePct = 100 - this.calendarVerticalInsetPct * 2;
    return this.calendarVerticalInsetPct + (this.minutesBetween(dayStart, value) / totalMinutes) * usablePct;
  }

  /**
   * Calcola l'altezza percentuale dell'evento nel calendario.
   */
  private getCalendarHeightPct(durationMinutes: number, totalMinutes: number): number {
    const usablePct = 100 - this.calendarVerticalInsetPct * 2;
    return Math.max(5, (durationMinutes / totalMinutes) * usablePct);
  }

  /**
   * Restituisce una nuova data spostata di un certo numero di giorni.
   */
  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }
}
