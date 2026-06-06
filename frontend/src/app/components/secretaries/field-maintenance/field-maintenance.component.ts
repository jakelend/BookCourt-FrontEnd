import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { finalize } from 'rxjs/operators';
import { CreateMaintenanceRequestDto } from '../../../dto/request/secretary/create-maintenance-request.dto';
import {
  MaintenanceFieldOptionDto,
  MaintenanceResponseDto,
  MaintenanceSport,
} from '../../../dto/response/secretary/maintenance-response.dto';
import { SecretaryMaintenanceService } from '../../../services/secretary-maintenance.service';
import { extractBackendErrorMessage } from '../../../util/error-message.util';

/**
 * Opzione sport mostrata nella prima fase della gestione manutenzioni.
 */
interface SportOption {
  value: MaintenanceSport;
  label: string;
  icon: string;
}

/**
 * Singola tacca oraria mostrata nel calendario giornaliero manutenzioni.
 */
interface CalendarHourSlot {
  label: string;
  topPct: number;
}

/**
 * Vista grafica di una manutenzione, già trasformata in posizione e altezza percentuale.
 */
interface MaintenanceEventView {
  id: number;
  source: MaintenanceResponseDto;
  topPct: number;
  heightPct: number;
  timeLabel: string;
  title: string;
}

/**
 * Tipo di feedback visivo mostrato dopo creazione o cancellazione manutenzione.
 */
type FeedbackType = 'success' | 'error' | '';

@Component({
  selector: 'app-field-maintenance',
  imports: [CommonModule, FormsModule, MatDatepickerModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './field-maintenance.component.html',
  styleUrl: './field-maintenance.component.css',
})
/**
 * Pagina segretaria per la gestione delle manutenzioni dei campi.
 * Il flusso è: scelta sport, scelta campo, selezione data/orario e creazione o cancellazione manutenzione.
 */
export class FieldMaintenanceComponent implements OnInit {
  /**
   * Elenco degli sport disponibili nella prima scelta del flusso.
   */
  readonly sports: SportOption[] = [
    {
      value: 'CALCETTO',
      label: 'Calcetto',
      icon: 'sports_soccer',
    },
    {
      value: 'TENNIS',
      label: 'Tennis',
      icon: 'sports_tennis',
    },
    {
      value: 'PADEL',
      label: 'Padel',
      icon: 'sports_tennis',
    },
  ];

  /**
   * Stato reattivo della selezione sport/campo/data e del form manutenzione.
   */
  readonly selectedSport = signal<MaintenanceSport | null>(null);
  readonly fields = signal<MaintenanceFieldOptionDto[]>([]);
  readonly selectedFieldId = signal<number | null>(null);
  readonly selectedDate = signal(this.formatLocalDate(new Date()));

  readonly startDate = signal(this.selectedDate());
  readonly startTime = signal('08:00');
  readonly endDate = signal(this.selectedDate());
  readonly endTime = signal('09:00');
  readonly reason = signal('');

  /**
   * Manutenzioni caricate per il campo e il giorno selezionati.
   */
  readonly maintenances = signal<MaintenanceResponseDto[]>([]);
  readonly hourSlots = signal<CalendarHourSlot[]>([]);
  readonly eventViews = signal<MaintenanceEventView[]>([]);

  /**
   * Stati di caricamento, salvataggio, cancellazione e messaggi della pagina.
   */
  readonly loadingFields = signal(false);
  readonly loadingMaintenances = signal(false);
  readonly saving = signal(false);
  readonly deletingId = signal<number | null>(null);

  readonly fieldsErrorMessage = signal('');
  readonly maintenancesErrorMessage = signal('');
  readonly formErrorMessage = signal('');
  readonly feedbackMessage = signal('');
  readonly feedbackType = signal<FeedbackType>('');

  /**
   * Etichetta leggibile dello sport selezionato.
   */
  readonly selectedSportLabel = computed(() => {
    return this.sports.find((sport) => sport.value === this.selectedSport())?.label ?? 'Sport non selezionato';
  });

  /**
   * Campo attualmente selezionato, ricavato dall'id salvato nel signal.
   */
  readonly selectedField = computed(() => {
    return this.fields().find((field) => field.idCampo === this.selectedFieldId()) ?? null;
  });

  /**
   * Titolo leggibile della data selezionata nel calendario.
   */
  readonly selectedDateTitle = computed(() => {
    return this.toDateOnly(this.selectedDate()).toLocaleDateString('it-IT', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  });

  /**
   * Data selezionata convertita in oggetto Date per il datepicker.
   */
  readonly selectedDateValue = computed(() => this.toDateOnly(this.selectedDate()));

  /**
   * Indica se il form può creare una manutenzione nello stato corrente della pagina.
   */
  readonly canCreateMaintenance = computed(() => {
    return !!this.selectedSport() && !!this.selectedFieldId() && !this.saving() && !this.loadingFields();
  });

  /**
   * Margine verticale usato per posizionare meglio gli eventi nel calendario.
   */
  private readonly calendarVerticalInsetPct = 2.4;

  /**
   * Inietta il servizio segretaria dedicato a campi e manutenzioni.
   */
  constructor(private readonly maintenanceService: SecretaryMaintenanceService) {}

  /**
   * Inizializza la griglia del calendario appena il componente viene aperto.
   */
  ngOnInit(): void {
    this.rebuildCalendar();
  }

  /**
   * Imposta lo sport selezionato e carica i campi disponibili per quello sport.
   */
  selectSport(sport: MaintenanceSport): void {
    if (this.selectedSport() === sport) {
      return;
    }

    this.selectedSport.set(sport);
    this.fields.set([]);
    this.selectedFieldId.set(null);
    this.maintenances.set([]);
    this.eventViews.set([]);
    this.fieldsErrorMessage.set('');
    this.maintenancesErrorMessage.set('');
    this.clearFeedback();
    this.loadFieldsBySport(sport);
  }

  /**
   * Imposta il campo selezionato e carica le manutenzioni del giorno.
   */
  selectField(field: MaintenanceFieldOptionDto): void {
    this.selectedFieldId.set(field.idCampo);
    this.clearFeedback();
    this.loadMaintenances();
  }

  /**
   * Aggiorna form e calendario quando cambia la data selezionata.
   */
  onSelectedDateChange(): void {
    this.startDate.set(this.selectedDate());
    this.endDate.set(this.selectedDate());
    this.clearFeedback();
    this.rebuildCalendar();

    if (this.selectedFieldId()) {
      this.loadMaintenances();
    }
  }

  /**
   * Gestisce la selezione della data dal datepicker.
   */
  onDateSelected(date: Date | null): void {
    if (!date) {
      return;
    }

    this.selectedDate.set(this.formatLocalDate(date));
    this.onSelectedDateChange();
  }

  /**
   * Porta il calendario alla data odierna.
   */
  goToToday(): void {
    this.selectedDate.set(this.formatLocalDate(new Date()));
    this.onSelectedDateChange();
  }

  /**
   * Mostra il giorno precedente.
   */
  goToPreviousDay(): void {
    this.selectedDate.set(this.formatLocalDate(this.addDays(this.toDateOnly(this.selectedDate()), -1)));
    this.onSelectedDateChange();
  }

  /**
   * Mostra il giorno successivo.
   */
  goToNextDay(): void {
    this.selectedDate.set(this.formatLocalDate(this.addDays(this.toDateOnly(this.selectedDate()), 1)));
    this.onSelectedDateChange();
  }

  /**
   * Precompila il form per creare una manutenzione su tutta la giornata selezionata.
   */
  setFullDayMaintenance(): void {
    this.startDate.set(this.selectedDate());
    this.startTime.set('08:00');
    this.endDate.set(this.formatLocalDate(this.addDays(this.toDateOnly(this.selectedDate()), 1)));
    this.endTime.set('00:00');
  }

  /**
   * Ripristina il form manutenzione ai valori iniziali della data selezionata.
   */
  resetForm(): void {
    this.startDate.set(this.selectedDate());
    this.startTime.set('08:00');
    this.endDate.set(this.selectedDate());
    this.endTime.set('09:00');
    this.reason.set('');
    this.formErrorMessage.set('');
    this.clearFeedback();
  }

  /**
   * Crea una manutenzione per il campo selezionato.
   * Il backend si occupa dell'annullamento automatico delle prenotazioni impattate.
   */
  createMaintenance(): void {
    this.formErrorMessage.set('');
    this.clearFeedback();

    const validationError = this.validateMaintenanceForm();
    if (validationError) {
      this.formErrorMessage.set(validationError);
      return;
    }

    const request: CreateMaintenanceRequestDto = {
      campoId: this.selectedFieldId() as number,
      inizio: this.buildBackendDateTime(this.startDate(), this.startTime()),
      fine: this.buildBackendDateTime(this.endDate(), this.endTime()),
      motivo: this.reason().trim() || null,
    };

    this.saving.set(true);

    this.maintenanceService
      .creaManutenzione(request)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.feedbackType.set('success');
          this.feedbackMessage.set('Manutenzione inserita correttamente.');
          this.reason.set('');
          this.loadMaintenances();
        },
        error: (error) => {
          this.feedbackType.set('error');
          this.feedbackMessage.set(extractBackendErrorMessage(error, 'Impossibile inserire la manutenzione.'));
        },
      });
  }

  /**
   * Elimina una manutenzione esistente e ricarica il calendario del campo.
   */
  deleteMaintenance(maintenance: MaintenanceResponseDto): void {
    this.clearFeedback();
    this.deletingId.set(maintenance.id);

    this.maintenanceService
      .eliminaManutenzione(maintenance.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe({
        next: () => {
          this.feedbackType.set('success');
          this.feedbackMessage.set('Manutenzione eliminata correttamente.');
          this.loadMaintenances();
        },
        error: (error) => {
          this.feedbackType.set('error');
          this.feedbackMessage.set(extractBackendErrorMessage(error, 'Impossibile eliminare la manutenzione.'));
        },
      });
  }

  /**
   * Riprova il caricamento dei campi per lo sport selezionato.
   */
  retryFields(): void {
    const sport = this.selectedSport();
    if (sport) {
      this.loadFieldsBySport(sport);
    }
  }

  /**
   * Riprova il caricamento delle manutenzioni per campo e data correnti.
   */
  retryMaintenances(): void {
    this.loadMaintenances();
  }

  /**
   * Indica se uno sport è quello attualmente selezionato.
   */
  isSportSelected(sport: MaintenanceSport): boolean {
    return this.selectedSport() === sport;
  }

  /**
   * Indica se una card campo rappresenta il campo selezionato.
   */
  isFieldSelected(field: MaintenanceFieldOptionDto): boolean {
    return this.selectedFieldId() === field.idCampo;
  }

  /**
   * Indica se la manutenzione specificata è in fase di eliminazione.
   */
  isDeleting(maintenanceId: number): boolean {
    return this.deletingId() === maintenanceId;
  }

  /**
   * Funzione trackBy per la lista sport.
   */
  trackBySport(_: number, sport: SportOption): string {
    return sport.value;
  }

  /**
   * Funzione trackBy per la lista campi.
   */
  trackByField(_: number, field: MaintenanceFieldOptionDto): number {
    return field.idCampo;
  }

  /**
   * Funzione trackBy per la lista manutenzioni.
   */
  trackByMaintenance(_: number, maintenance: MaintenanceResponseDto): number {
    return maintenance.id;
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
  trackByEvent(_: number, event: MaintenanceEventView): number {
    return event.id;
  }

  /**
   * Formatta un valore numerico come importo in euro.
   */
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  }

  /**
   * Formatta una data/ora backend in forma italiana leggibile.
   */
  formatDateTime(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Formatta l'intervallo temporale di una manutenzione.
   */
  formatMaintenanceRange(maintenance: MaintenanceResponseDto): string {
    return `${this.formatDateTime(maintenance.inizio)} → ${this.formatDateTime(maintenance.fine)}`;
  }

  /**
   * Aggiorna la data di inizio della manutenzione nel form.
   */
  setStartDate(value: string): void {
    this.startDate.set(value);
  }

  /**
   * Aggiorna l'ora di inizio della manutenzione nel form.
   */
  setStartTime(value: string): void {
    this.startTime.set(value);
  }

  /**
   * Aggiorna la data di fine della manutenzione nel form.
   */
  setEndDate(value: string): void {
    this.endDate.set(value);
  }

  /**
   * Aggiorna l'ora di fine della manutenzione nel form.
   */
  setEndTime(value: string): void {
    this.endTime.set(value);
  }

  /**
   * Aggiorna il motivo della manutenzione.
   */
  setReason(value: string): void {
    this.reason.set(value);
  }

  /**
   * Carica i campi associati allo sport scelto.
   */
  private loadFieldsBySport(sport: MaintenanceSport): void {
    this.loadingFields.set(true);
    this.fieldsErrorMessage.set('');

    this.maintenanceService
      .getCampiBySport(sport)
      .pipe(finalize(() => this.loadingFields.set(false)))
      .subscribe({
        next: (fields) => {
          this.fields.set(fields);
        },
        error: (error) => {
          this.fields.set([]);
          this.fieldsErrorMessage.set(extractBackendErrorMessage(error, 'Impossibile caricare i campi dello sport selezionato.'));
        },
      });
  }

  /**
   * Carica le manutenzioni del campo selezionato per il giorno corrente.
   */
  private loadMaintenances(): void {
    const selectedFieldId = this.selectedFieldId();
    if (!selectedFieldId) {
      return;
    }

    this.loadingMaintenances.set(true);
    this.maintenancesErrorMessage.set('');

    const range = this.getSelectedDaySearchRange();

    this.maintenanceService
      .getManutenzioniCampo(selectedFieldId, range.inizio, range.fine)
      .pipe(finalize(() => this.loadingMaintenances.set(false)))
      .subscribe({
        next: (maintenances) => {
          this.maintenances.set(maintenances);
          this.rebuildCalendar();
        },
        error: (error) => {
          this.maintenances.set([]);
          this.eventViews.set([]);
          this.maintenancesErrorMessage.set(extractBackendErrorMessage(error, 'Impossibile caricare le manutenzioni.'));
        },
      });
  }

  /**
   * Valida presenza del campo e correttezza dell'intervallo temporale.
   */
  private validateMaintenanceForm(): string {
    if (!this.selectedSport()) {
      return 'Seleziona prima lo sport.';
    }

    if (!this.selectedFieldId()) {
      return 'Seleziona il campo su cui effettuare la manutenzione.';
    }

    if (!this.startDate() || !this.startTime() || !this.endDate() || !this.endTime()) {
      return 'Inserisci data e ora di inizio/fine manutenzione.';
    }

    const start = new Date(this.buildHtmlDateTime(this.startDate(), this.startTime()));
    const end = new Date(this.buildHtmlDateTime(this.endDate(), this.endTime()));

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return 'Formato data/ora non valido.';
    }

    if (end <= start) {
      return 'La fine della manutenzione deve essere successiva all\'inizio.';
    }

    return '';
  }

  /**
   * Ricostruisce griglia oraria ed eventi manutenzione del calendario.
   */
  private rebuildCalendar(): void {
    const dayStart = new Date(this.buildHtmlDateTime(this.selectedDate(), '08:00'));
    const dayEnd = new Date(this.buildHtmlDateTime(this.formatLocalDate(this.addDays(dayStart, 1)), '00:00'));
    const totalMinutes = Math.max(60, this.minutesBetween(dayStart, dayEnd));

    /*
      La vista calendario rappresenta solo il giorno selezionato.
      Per questo converto tutte le manutenzioni in blocchi grafici ritagliati su quel range.
    */
    this.hourSlots.set(this.buildHourSlots(dayStart, dayEnd, totalMinutes));
    this.eventViews.set(this.maintenances()
      .map((maintenance) => this.toMaintenanceEventView(maintenance, dayStart, dayEnd, totalMinutes))
      .filter((event): event is MaintenanceEventView => !!event));
  }

  /**
   * Genera gli slot orari del calendario giornaliero.
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
   * Converte una manutenzione backend in blocco grafico del calendario.
   */
  private toMaintenanceEventView(
    maintenance: MaintenanceResponseDto,
    dayStart: Date,
    dayEnd: Date,
    totalMinutes: number,
  ): MaintenanceEventView | null {
    const start = new Date(maintenance.inizio);
    const end = new Date(maintenance.fine);

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
      id: maintenance.id,
      source: maintenance,
      topPct: this.getCalendarTopPct(dayStart, clampedStart, totalMinutes),
      heightPct: this.getCalendarHeightPct(durationMinutes, totalMinutes),
      timeLabel: `${this.formatTime(start)} - ${this.formatTime(end)}`,
      title: maintenance.motivo?.trim() || 'Manutenzione campo',
    };
  }

  /**
   * Calcola il range di ricerca backend relativo al giorno selezionato.
   */
  private getSelectedDaySearchRange(): { inizio: string; fine: string } {
    const start = this.buildBackendDateTime(this.selectedDate(), '00:00');
    const endDate = this.formatLocalDate(this.addDays(this.toDateOnly(this.selectedDate()), 1));
    const end = this.buildBackendDateTime(endDate, '00:00');

    return { inizio: start, fine: end };
  }

  /**
   * Costruisce la data/ora nel formato atteso dal backend.
   */
  private buildBackendDateTime(date: string, time: string): string {
    return `${date}T${this.normalizeTime(time)}:00`;
  }

  /**
   * Costruisce una data/ora locale per i controlli HTML e i calcoli UI.
   */
  private buildHtmlDateTime(date: string, time: string): string {
    return `${date}T${this.normalizeTime(time)}`;
  }

  /**
   * Normalizza un orario in formato HH:mm:ss.
   */
  private normalizeTime(time: string): string {
    return time.length === 5 ? time : time.slice(0, 5);
  }

  /**
   * Converte una stringa yyyy-MM-dd in Date locale senza shift di timezone.
   */
  private toDateOnly(value: string): Date {
    return new Date(`${value}T00:00:00`);
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
   * Restituisce una nuova data spostata di un certo numero di giorni.
   */
  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  /**
   * Calcola i minuti tra due date.
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
   * Calcola l'altezza percentuale di un evento manutenzione.
   */
  private getCalendarHeightPct(durationMinutes: number, totalMinutes: number): number {
    const usablePct = 100 - this.calendarVerticalInsetPct * 2;
    return (durationMinutes / totalMinutes) * usablePct;
  }

  /**
   * Formatta l'orario in HH:mm.
   */
  private formatTime(date: Date): string {
    return date.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Pulisce messaggio e tipo di feedback mostrati nella UI.
   */
  private clearFeedback(): void {
    this.feedbackMessage.set('');
    this.feedbackType.set('');
  }
}
