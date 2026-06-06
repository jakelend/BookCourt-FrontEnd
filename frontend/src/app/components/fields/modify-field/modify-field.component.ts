import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { ManagerUpdateFieldRequestDto } from '../../../dto/request/manager/manager-create-field-request.dto';
import { ManagerFieldImageResponseDto } from '../../../dto/response/manager/manager-field-image-response.dto';
import { ManagerFieldResponseDto, ManagerFieldSport } from '../../../dto/response/manager/manager-field-response.dto';
import { SPORTS, isSport } from '../../../enumeration/sport.enum';
import { ManagerService } from '../../../services/manager.service';
import { extractBackendErrorMessage, extractBackendFieldErrors, FieldErrors } from '../../../util/error-message.util';
import { ImageUrlUtil } from '../../../util/image-url.util';
import { FieldSportType } from '../field-card/field-card.component';

/**
 * Modello locale usato per mantenere i dati editabili del campo nel form.
 */
interface EditableField {
  id: number;
  name: string;
  sportType: FieldSportType;
  hourlyRate: number | null;
  active: boolean;
}

/**
 * Rappresenta un'immagine del campo, distinguendo tra immagine già salvata e nuovo file caricato.
 */
interface FieldImagePreview {
  file: File | null;
  url: string;
  uploaded: boolean;
  existingImageId: number | null;
}

/**
 * Chiavi degli errori di validazione gestiti nella modifica del campo.
 */
type FieldErrorKey = 'images' | 'nome' | 'sport' | 'costoOrario' | 'attivo' | 'idImmagini';

/**
 * Elenco dei campi backend che possono essere mostrati come errori puntuali nel form.
 */
const KNOWN_BACKEND_FIELDS: readonly FieldErrorKey[] = [
  'images',
  'nome',
  'sport',
  'costoOrario',
  'attivo',
  'idImmagini',
];

@Component({
  selector: 'app-modify-field',
  imports: [CommonModule, FormsModule],
  templateUrl: './modify-field.component.html',
  styleUrl: './modify-field.component.css',
})
/**
 * Componente di modifica di un campo sportivo esistente.
 * Carica il campo, gestisce modifiche dei dati principali e consente aggiunta/rimozione immagini.
 */
export class ModifyFieldComponent implements OnInit, OnDestroy {
  /**
   * Input file nascosto usato per selezionare nuove immagini del campo.
   */
  @ViewChild('fieldImagesInput') private readonly fieldImagesInput?: ElementRef<HTMLInputElement>;

  /**
   * Sport disponibili per il campo.
   */
  readonly sportTypes: FieldSportType[] = [...SPORTS];
  readonly maxImages = 6;

  /**
   * Preview reattive delle immagini esistenti e di quelle appena caricate.
   */
  readonly imagePreviews = signal<FieldImagePreview[]>([]);
  /**
   * Stati reattivi della pagina di modifica e degli errori del form.
   */
  readonly loading = signal(true);
  readonly isSaving = signal(false);
  readonly submitError = signal('');
  readonly submitSuccess = signal('');
  readonly fieldErrors = signal<FieldErrors<FieldErrorKey>>({});

  /**
   * Dati editabili del campo caricati dal backend e collegati al form.
   */
  field: EditableField = {
    id: 0,
    name: '',
    sportType: 'TENNIS',
    hourlyRate: 0,
    active: true,
  };

  /**
   * Id delle immagini già salvate che l'utente ha deciso di eliminare.
   */
  private readonly deletedExistingImageIds = new Set<number>();

  /**
   * Inietta route, router e ManagerService per leggere l'id, navigare e comunicare con il backend.
   */
  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * Legge l'id dalla route e carica dati del campo e immagini associate.
   */
  ngOnInit(): void {
    const fieldId = Number(this.route.snapshot.paramMap.get('id'));

    // Mi servono sia i dati del campo sia le immagini,
    // quindi con forkJoin aspetto entrambe le risposte.
    forkJoin({
      fields: this.managerService.getCampi(),
      images: this.managerService.getImmaginiCampo(fieldId),
    })
      .pipe(
        finalize(() => {
          this.loading.set(false);
        }),
      )
      .subscribe({
        next: ({ fields, images }) => {
          const selectedField = fields.find((field) => field.id === fieldId);

          if (!selectedField) {
            void this.router.navigate(['/dashboard/fields']);
            return;
          }

          this.hydrateField(selectedField, images);
        },
        error: (error) => {
          this.submitError.set(this.extractErrorMessage(error, 'Impossibile caricare i dati del campo.'));
        },
      });
  }

  /**
   * Gestisce il submit della modifica campo.
   * Valida i dati, costruisce il payload e invia al backend anche nuove immagini ed eliminazioni.
   */
  modifyField(event: SubmitEvent): void {
    event.preventDefault();

    if (this.isSaving()) {
      return;
    }

    this.submitError.set('');
    this.submitSuccess.set('');
    this.fieldErrors.set({});

    const nome = this.field.name.trim();
    const sport = this.field.sportType;
    const costoOrario = this.toHourlyRate(this.field.hourlyRate);

    const isValid = this.validateForm({
      nome,
      sport,
      costoOrario,
    });

    if (!isValid) {
      return;
    }

    const payload: ManagerUpdateFieldRequestDto = {
      nome,
      sport,
      costoOrario: costoOrario!,
      attivo: this.field.active,
      idImmaginiDaEliminare: Array.from(this.deletedExistingImageIds),
    };

    const uploadedImages = this.imagePreviews()
      .filter((preview) => preview.uploaded && preview.file)
      .map((preview) => preview.file as File);

    this.isSaving.set(true);

    this.managerService
      .aggiornaCampo(this.field.id, payload, uploadedImages)
      .pipe(
        finalize(() => {
          this.isSaving.set(false);
        }),
      )
      .subscribe({
        next: () => {
          this.submitSuccess.set('Campo aggiornato con successo.');

          void this.router.navigate(['/dashboard/fields']);
        },
        error: (error) => {
          const message = this.extractErrorMessage(error, 'Impossibile aggiornare il campo.');

          if (!this.applyBackendFieldErrors(error, message)) {
            this.submitError.set(message);
          }
        },
      });
  }

  /**
   * Restituisce l'errore associato a uno specifico campo del form.
   */
  fieldError(fieldName: FieldErrorKey): string {
    return this.fieldErrors()[fieldName] ?? '';
  }

  /**
   * Rimuove un errore di campo quando l'utente corregge il valore.
   */
  clearFieldError(fieldName: FieldErrorKey): void {
    const currentErrors = { ...this.fieldErrors() };

    delete currentErrors[fieldName];

    if (fieldName === 'images') {
      delete currentErrors.idImmagini;
    }

    this.fieldErrors.set(currentErrors);

    if (Object.keys(currentErrors).length === 0) {
      this.submitError.set('');
    }
  }

  /**
   * Blocca caratteri non validi nei campi numerici.
   */
  preventNegativeValue(event: KeyboardEvent): void {
    if (event.key === '-' || event.key === '+') {
      event.preventDefault();
    }
  }

  /**
   * Normalizza il costo orario evitando valori negativi.
   */
  normalizeHourlyRate(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);

    if (value < 0) {
      input.value = '0';
      this.field.hourlyRate = 0;
    }
  }

  /**
   * Apre il selettore delle immagini del campo.
   */
  openImagesPicker(): void {
    this.fieldImagesInput?.nativeElement.click();
  }

  /**
   * Valida le nuove immagini selezionate e ne crea le preview locali.
   */
  onImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    this.clearFieldError('images');

    if (!files.length) {
      return;
    }

    if (this.imagePreviews().length + files.length > this.maxImages) {
      input.value = '';
      this.setFieldError('images', `Puoi caricare al massimo ${this.maxImages} immagini.`);
      return;
    }

    for (const file of files) {
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        input.value = '';
        this.setFieldError('images', 'Carica solo file JPG o PNG.');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        input.value = '';
        this.setFieldError('images', 'Ogni immagine non può superare 5MB.');
        return;
      }
    }

    this.imagePreviews.update((currentPreviews) => [
      ...currentPreviews,
      ...files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
        uploaded: true,
        existingImageId: null,
      })),
    ]);

    input.value = '';
  }

  /**
   * Rimuove un'immagine dalla lista.
   * Se era già salvata, memorizza il suo id per comunicarne l'eliminazione al backend.
   */
  removeImage(index: number): void {
    const preview = this.imagePreviews()[index];

    if (!preview) {
      return;
    }

    if (this.imagePreviews().length <= 1) {
      // Anche in modifica tengo almeno una immagine,
      // per non lasciare il campo senza copertina.
      this.setFieldError('images', 'Il campo deve avere almeno una immagine.');
      return;
    }

    if (preview.uploaded) {
      URL.revokeObjectURL(preview.url);
    }

    if (!preview.uploaded && preview.existingImageId != null) {
      // Le immagini vecchie non le elimino subito davvero:
      // mi salvo l'id e lo mando al backend al submit.
      this.deletedExistingImageIds.add(preview.existingImageId);
    }

    this.imagePreviews.update((currentPreviews) =>
      currentPreviews.filter((_, currentIndex) => currentIndex !== index),
    );

    this.clearFieldError('images');
  }

  /**
   * Annulla la modifica e torna alla lista campi.
   */
  cancel(): void {
    this.clearUploadedImages();
    void this.router.navigate(['/dashboard/fields']);
  }

  /**
   * Libera gli URL temporanei delle immagini caricate localmente.
   */
  ngOnDestroy(): void {
    this.clearUploadedImages();
  }

  /**
   * Funzione trackBy per la lista delle preview immagini.
   */
  trackByImageUrl(_: number, preview: FieldImagePreview): string {
    return preview.url;
  }

  /**
   * Valida nome, sport, costo e vincolo sulle immagini prima del salvataggio.
   */
  private validateForm(data: {
    nome: string;
    sport: string;
    costoOrario: number | null;
  }): boolean {
    const errors: FieldErrors<FieldErrorKey> = {};

    if (!data.nome) {
      errors.nome = 'Il nome del campo è obbligatorio.';
    } else if (data.nome.length > 100) {
      errors.nome = 'Il nome del campo non può superare 100 caratteri.';
    }

    if (!data.sport) {
      errors.sport = 'Lo sport è obbligatorio.';
    } else if (!this.isValidSport(data.sport)) {
      errors.sport = 'Seleziona uno sport valido.';
    }

    if (data.costoOrario == null) {
      errors.costoOrario = 'La tariffa oraria è obbligatoria.';
    } else if (!Number.isFinite(data.costoOrario)) {
      errors.costoOrario = 'Inserisci una tariffa oraria valida.';
    } else if (data.costoOrario < 0) {
      errors.costoOrario = 'Il costo orario non può essere negativo.';
    } else if (!/^\d{1,8}(\.\d{1,2})?$/.test(String(data.costoOrario))) {
      errors.costoOrario = 'Il costo orario deve avere massimo 8 cifre intere e 2 decimali.';
    }
    if (this.imagePreviews().length < 1) {
      errors.images = 'Il campo deve avere almeno una immagine.';
    }

    this.fieldErrors.set(errors);

    return Object.keys(errors).length === 0;
  }

  /**
   * Imposta un messaggio di errore su un campo specifico.
   */
  private setFieldError(fieldName: FieldErrorKey, message: string): void {
    this.fieldErrors.update((currentErrors) => ({
      ...currentErrors,
      [fieldName]: message,
    }));
  }

  /**
   * Trasforma gli errori di validazione backend in errori mostrabili sui campi del form.
   */
  private applyBackendFieldErrors(error: unknown, fallbackMessage: string): boolean {
    const mappedErrors = extractBackendFieldErrors(error, KNOWN_BACKEND_FIELDS);
    let hasFieldErrors = false;

    if (Object.keys(mappedErrors).length > 0) {
      this.fieldErrors.update((currentErrors) => ({
        ...currentErrors,
        ...mappedErrors,
      }));
      hasFieldErrors = true;
    }

    const normalizedMessage = fallbackMessage.toLowerCase();

    if (normalizedMessage.includes('nome')) {
      this.setFieldError('nome', fallbackMessage);
      hasFieldErrors = true;
    }

    if (normalizedMessage.includes('sport')) {
      this.setFieldError('sport', fallbackMessage);
      hasFieldErrors = true;
    }

    if (normalizedMessage.includes('costo') || normalizedMessage.includes('tariffa')) {
      this.setFieldError('costoOrario', fallbackMessage);
      hasFieldErrors = true;
    }

    if (normalizedMessage.includes('immagin') || normalizedMessage.includes('foto')) {
      this.setFieldError('images', fallbackMessage);
      hasFieldErrors = true;
    }

    return hasFieldErrors;
  }

  /**
   * Popola lo stato locale del form partendo dai dati campo e dalle immagini ricevute dal backend.
   */
  private hydrateField(field: ManagerFieldResponseDto, images: ManagerFieldImageResponseDto[]): void {
    this.field = {
      id: field.id,
      name: field.nome,
      sportType: field.sport,
      hourlyRate: field.costoOrario,
      active: field.attivo,
    };

    this.deletedExistingImageIds.clear();
    this.imagePreviews.set(
      images.map((image) => ({
        file: null,
        url: ImageUrlUtil.normalizeBackendImageUrl(image.urlImmagine) ?? '',
        uploaded: false,
        existingImageId: image.id,
      })),
    );
  }

  /**
   * Revoca gli URL temporanei delle sole immagini caricate localmente.
   */
  private clearUploadedImages(): void {
    for (const preview of this.imagePreviews()) {
      if (preview.uploaded) {
        URL.revokeObjectURL(preview.url);
      }
    }

    if (this.fieldImagesInput) {
      this.fieldImagesInput.nativeElement.value = '';
    }
  }

  /**
   * Converte il costo orario in numero valido oppure null.
   */
  private toHourlyRate(value: number | string | null): number | null {
    if (value == null || value === '') {
      return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
  }

  /**
   * Type guard per verificare che lo sport sia uno dei valori gestiti dal backend.
   */
  private isValidSport(value: string): value is ManagerFieldSport {
    return isSport(value);
  }

  /**
   * Estrae un messaggio di errore leggibile da mostrare nella pagina.
   */
  private extractErrorMessage(error: unknown, fallback: string): string {
    return extractBackendErrorMessage(error, fallback);
  }
}
