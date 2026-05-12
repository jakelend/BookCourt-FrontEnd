import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import {
  BookingFieldResponseDto,
  BookingSport,
} from '../../../dto/response/booking/booking-field-response.dto';
import { BookingService } from '../../../services/booking.service';

/**
 * Singolo step mostrato nella timeline del flusso di prenotazione.
 */
interface BookingStep {
  label: string;
}

type FieldImageState = 'loading' | 'loaded' | 'error';

/**
 * Secondo step della prenotazione: scelta del campo sportivo.
 *
 * Carica dal backend i campi compatibili con lo sport scelto, gestisce lo
 * stato delle immagini e salva il campo selezionato per gli step successivi.
 */
@Component({
  selector: 'app-booking-field-selection',
  imports: [CommonModule],
  templateUrl: './booking-field-selection.component.html',
  styleUrl: './booking-field-selection.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingFieldSelectionComponent implements OnInit {
  readonly currentStep = 2;

  readonly steps: BookingStep[] = [
    { label: 'Sport' },
    { label: 'Campo' },
    { label: 'Data e ora' },
    { label: 'Extra' },
    { label: 'Riepilogo' },
    { label: 'Pagamento' },
  ];

  /** Sport scelto nello step precedente, letto da query param o sessionStorage. */
  readonly selectedSport = signal<BookingSport | null>(null);
  /** Lista reattiva dei campi caricati per lo sport selezionato. */
  readonly fields = signal<BookingFieldResponseDto[]>([]);
  readonly selectedFieldId = signal<number | null>(null);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  /** Mappa degli stati di caricamento immagine, indicizzata per id campo. */
  private readonly fieldImageStates = signal<Record<number, FieldImageState>>({});

  /** Computed usato dal template per sapere se ci sono campi disponibili. */
  readonly hasFields = computed(() => this.fields().length > 0);

  readonly showLoading = computed(
    () => this.isLoading() && !this.hasFields() && !this.errorMessage(),
  );

  readonly showError = computed(() => !!this.errorMessage());

  readonly showFields = computed(
    () => this.hasFields() && !this.errorMessage(),
  );

  readonly showEmpty = computed(
    () => !this.isLoading() && !this.errorMessage() && !this.hasFields(),
  );

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

  /** Inietta route, router e service di prenotazione usati per caricare e selezionare i campi. */
  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly bookingService: BookingService,
  ) {}

  /**
   * Inizializza lo step campo.
   *
   * Se lo sport non è presente o non è valido, riporta l'utente allo step precedente;
   * altrimenti carica i campi dal backend.
   */
  ngOnInit(): void {
    const sport = this.readSelectedSport();
    this.selectedSport.set(sport);

    if (!sport) {
      void this.router.navigate(['/dashboard/prenotazioni']);
      return;
    }

    this.selectedFieldId.set(this.readSavedFieldId());
    this.loadFields();
  }

  /** Numero totale di step del wizard. */
  get totalSteps(): number {
    return this.steps.length;
  }

  /**
   * Carica i campi disponibili per lo sport selezionato.
   *
   * Gestisce loading, messaggi di errore e stato iniziale delle immagini delle card.
   */
  loadFields(): void {
    const sport = this.selectedSport();

    if (!sport) {
      this.fields.set([]);
      this.isLoading.set(false);
      this.errorMessage.set('Sport non selezionato.');
      this.fieldImageStates.set({});
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.fields.set([]);
    this.fieldImageStates.set({});

    console.log('Sport selezionato nella pagina campi:', sport);

    this.bookingService
      .getCampiDisponibiliPerSport(sport)
      .pipe(
        finalize(() => {
          this.isLoading.set(false);
        }),
      )
      .subscribe({
        next: (fields) => {
          console.log('Campi ricevuti nel componente:', fields);

          this.fields.set(fields);
          this.fieldImageStates.set(this.buildInitialImageStates(fields));
          this.cleanSavedFieldIfNotPresent();
        },
        error: (error) => {
          console.error('Errore caricamento campi per sport:', sport, error);

          this.fields.set([]);
          this.fieldImageStates.set({});
          this.errorMessage.set(this.buildLoadFieldsErrorMessage(error, sport));
        },
      });
  }

  /**
   * Salva il campo selezionato e passa allo step data/ora.
   *
   * @param field campo scelto dal cliente.
   */
  selectField(field: BookingFieldResponseDto): void {
    if (!field.attivo) {
      return;
    }

    this.selectedFieldId.set(field.id);

    sessionStorage.setItem('booking.selectedFieldId', String(field.id));
    sessionStorage.setItem('booking.selectedFieldName', field.nome);

    void this.router.navigate(['/dashboard/prenotazioni/orario']);
  }

  /** Gestisce il click sul pulsante interno alla card evitando la propagazione del click alla card stessa. */
  selectFieldFromButton(field: BookingFieldResponseDto, event: MouseEvent): void {
    event.stopPropagation();
    this.selectField(field);
  }

  /** Permette la selezione della card tramite tastiera, con Enter o Spazio. */
  onFieldCardKeydown(event: KeyboardEvent, field: BookingFieldResponseDto): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    this.selectField(field);
  }

  /** Torna allo step di scelta sport. */
  goBack(): void {
    void this.router.navigate(['/dashboard/prenotazioni']);
  }

  /** Verifica se la card campo è quella attualmente selezionata. */
  isSelected(field: BookingFieldResponseDto): boolean {
    return this.selectedFieldId() === field.id;
  }

  /** Indica se l'immagine del campo è ancora in caricamento. */
  isFieldImageLoading(field: BookingFieldResponseDto): boolean {
    return this.fieldImageStates()[field.id] === 'loading';
  }

  /** Indica se l'immagine del campo è stata caricata correttamente. */
  isFieldImageLoaded(field: BookingFieldResponseDto): boolean {
    return this.fieldImageStates()[field.id] === 'loaded';
  }

  /** Indica se l'immagine del campo ha generato errore di caricamento. */
  isFieldImageError(field: BookingFieldResponseDto): boolean {
    return (
      !field.urlImmaginePrincipale ||
      this.fieldImageStates()[field.id] === 'error'
    );
  }

  /** Aggiorna lo stato immagine quando il browser completa il caricamento. */
  onFieldImageLoad(field: BookingFieldResponseDto): void {
    this.setFieldImageState(field.id, 'loaded');
  }

  /** Aggiorna lo stato immagine in caso di errore e permette di mostrare il fallback. */
  onFieldImageError(field: BookingFieldResponseDto): void {
    console.warn(
      'Immagine campo non caricata:',
      field.nome,
      field.urlImmaginePrincipale,
    );

    this.setFieldImageState(field.id, 'error');
  }

  /** Costruisce il sottotitolo della card campo con sport e numero giocatori. */
  getFieldSubtitle(field: BookingFieldResponseDto): string {
    return this.getSportLabel(field.sport);
  }

  /** Format della tariffa oraria del campo. */
  getHourlyRateLabel(field: BookingFieldResponseDto): string {
    return `€${field.costoOrario}/h`;
  }

  /** TrackBy usato per ottimizzare il rendering della lista campi. */
  trackByFieldId(_: number, field: BookingFieldResponseDto): number {
    return field.id;
  }

  /** TrackBy usato per la timeline degli step. */
  trackByStepLabel(_: number, step: BookingStep): string {
    return step.label;
  }

  /** Determina se uno step precedente deve risultare completato nella timeline. */
  isStepCompleted(index: number): boolean {
    return index + 1 <= this.currentStep;
  }

  /** Aggiorna in modo immutabile lo stato immagine di un singolo campo. */
  private setFieldImageState(fieldId: number, state: FieldImageState): void {
    this.fieldImageStates.update((currentStates) => ({
      ...currentStates,
      [fieldId]: state,
    }));
  }

  /** Crea la mappa iniziale degli stati immagine per i campi appena caricati. */
  private buildInitialImageStates(
    fields: BookingFieldResponseDto[],
  ): Record<number, FieldImageState> {
    return fields.reduce<Record<number, FieldImageState>>((states, field) => {
      states[field.id] = field.urlImmaginePrincipale ? 'loading' : 'error';
      return states;
    }, {});
  }

  /** Traduce l'errore di caricamento campi in un messaggio comprensibile per l'utente. */
  private buildLoadFieldsErrorMessage(error: any, sport: BookingSport): string {
    if (error?.name === 'TimeoutError') {
      return 'La richiesta dei campi sta impiegando troppo tempo. Controlla il backend e riprova.';
    }

    if (error?.status === 0) {
      return 'Il frontend non riesce a raggiungere il backend. Controlla che Spring Boot sia avviato su porta 8080.';
    }

    if (error?.status === 400) {
      return `Sport non valido inviato al backend: ${sport}. Deve essere CALCETTO, PADEL o TENNIS.`;
    }

    if (error?.status === 401 || error?.status === 403) {
      return 'Non sei autorizzato a visualizzare i campi. Effettua di nuovo il login come cliente.';
    }

    return 'Non è stato possibile caricare i campi disponibili. Controlla la console del browser e del backend.';
  }

  /** Converte il codice sport backend in etichetta leggibile. */
  private getSportLabel(sport: BookingSport): string {
    switch (sport) {
      case 'CALCETTO':
        return 'Calcetto';
      case 'PADEL':
        return 'Padel';
      case 'TENNIS':
        return 'Tennis';
    }
  }

  /**
   * Recupera lo sport da query param o sessionStorage.
   *
   * Accetta solo valori supportati dal flusso di prenotazione.
   */
  private readSelectedSport(): BookingSport | null {
    const sportFromQuery = this.route.snapshot.queryParamMap.get('sport');
    const sportFromSession = sessionStorage.getItem('booking.selectedSport');
    const sport = sportFromQuery ?? sportFromSession;

    if (sport === 'CALCETTO' || sport === 'PADEL' || sport === 'TENNIS') {
      return sport;
    }

    return null;
  }

  /** Legge l'eventuale campo precedentemente selezionato da sessionStorage. */
  private readSavedFieldId(): number | null {
    const savedFieldId = sessionStorage.getItem('booking.selectedFieldId');

    if (!savedFieldId) {
      return null;
    }

    const parsedId = Number(savedFieldId);
    return Number.isFinite(parsedId) ? parsedId : null;
  }

  /** Rimuove la selezione salvata se il campo non è più presente nella lista caricata. */
  private cleanSavedFieldIfNotPresent(): void {
    const selectedFieldId = this.selectedFieldId();

    if (!selectedFieldId) {
      return;
    }

    const selectedFieldStillExists = this.fields().some(
      (field) => field.id === selectedFieldId,
    );

    if (selectedFieldStillExists) {
      return;
    }

    this.selectedFieldId.set(null);
    sessionStorage.removeItem('booking.selectedFieldId');
    sessionStorage.removeItem('booking.selectedFieldName');
  }
}
