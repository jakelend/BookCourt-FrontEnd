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

interface BookingStep {
  label: string;
}

type FieldImageState = 'loading' | 'loaded' | 'error';

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

  readonly selectedSport = signal<BookingSport | null>(null);
  readonly fields = signal<BookingFieldResponseDto[]>([]);
  readonly selectedFieldId = signal<number | null>(null);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  private readonly fieldImageStates = signal<Record<number, FieldImageState>>({});

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

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly bookingService: BookingService,
  ) {}

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

  get totalSteps(): number {
    return this.steps.length;
  }

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

  selectField(field: BookingFieldResponseDto): void {
    if (!field.attivo) {
      return;
    }

    this.selectedFieldId.set(field.id);

    sessionStorage.setItem('booking.selectedFieldId', String(field.id));
    sessionStorage.setItem('booking.selectedFieldName', field.nome);

    /*
      Prossimo step:
      void this.router.navigate(['/dashboard/prenotazioni/orario']);
    */
  }

  selectFieldFromButton(field: BookingFieldResponseDto, event: MouseEvent): void {
    event.stopPropagation();
    this.selectField(field);
  }

  onFieldCardKeydown(event: KeyboardEvent, field: BookingFieldResponseDto): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    this.selectField(field);
  }

  goBack(): void {
    void this.router.navigate(['/dashboard/prenotazioni']);
  }

  isSelected(field: BookingFieldResponseDto): boolean {
    return this.selectedFieldId() === field.id;
  }

  isFieldImageLoading(field: BookingFieldResponseDto): boolean {
    return this.fieldImageStates()[field.id] === 'loading';
  }

  isFieldImageLoaded(field: BookingFieldResponseDto): boolean {
    return this.fieldImageStates()[field.id] === 'loaded';
  }

  isFieldImageError(field: BookingFieldResponseDto): boolean {
    return (
      !field.urlImmaginePrincipale ||
      this.fieldImageStates()[field.id] === 'error'
    );
  }

  onFieldImageLoad(field: BookingFieldResponseDto): void {
    this.setFieldImageState(field.id, 'loaded');
  }

  onFieldImageError(field: BookingFieldResponseDto): void {
    console.warn(
      'Immagine campo non caricata:',
      field.nome,
      field.urlImmaginePrincipale,
    );

    this.setFieldImageState(field.id, 'error');
  }

  getFieldSubtitle(field: BookingFieldResponseDto): string {
    return this.getSportLabel(field.sport);
  }

  getHourlyRateLabel(field: BookingFieldResponseDto): string {
    return `€${field.costoOrario}/h`;
  }

  trackByFieldId(_: number, field: BookingFieldResponseDto): number {
    return field.id;
  }

  trackByStepLabel(_: number, step: BookingStep): string {
    return step.label;
  }

  isStepCompleted(index: number): boolean {
    return index + 1 <= this.currentStep;
  }

  private setFieldImageState(fieldId: number, state: FieldImageState): void {
    this.fieldImageStates.update((currentStates) => ({
      ...currentStates,
      [fieldId]: state,
    }));
  }

  private buildInitialImageStates(
    fields: BookingFieldResponseDto[],
  ): Record<number, FieldImageState> {
    return fields.reduce<Record<number, FieldImageState>>((states, field) => {
      states[field.id] = field.urlImmaginePrincipale ? 'loading' : 'error';
      return states;
    }, {});
  }

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

  private readSelectedSport(): BookingSport | null {
    const sportFromQuery = this.route.snapshot.queryParamMap.get('sport');
    const sportFromSession = sessionStorage.getItem('booking.selectedSport');
    const sport = sportFromQuery ?? sportFromSession;

    if (sport === 'CALCETTO' || sport === 'PADEL' || sport === 'TENNIS') {
      return sport;
    }

    return null;
  }

  private readSavedFieldId(): number | null {
    const savedFieldId = sessionStorage.getItem('booking.selectedFieldId');

    if (!savedFieldId) {
      return null;
    }

    const parsedId = Number(savedFieldId);
    return Number.isFinite(parsedId) ? parsedId : null;
  }

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
