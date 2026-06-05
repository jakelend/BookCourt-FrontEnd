import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, signal, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';

import { ManagerCreateFieldRequestDto } from '../../../dto/request/manager/manager-create-field-request.dto';
import { ManagerFieldSport } from '../../../dto/response/manager/manager-field-response.dto';
import { SPORTS, isSport } from '../../../enumeration/sport.enum';
import { ManagerService } from '../../../services/manager.service';
import { extractBackendErrorMessage, extractBackendFieldErrors, FieldErrors } from '../../../util/error-message.util';
import { FieldSportType } from '../field-card/field-card.component';

/**
 * Rappresenta un'immagine selezionata localmente con il file originale e l'URL temporaneo di preview.
 */
interface FieldImagePreview {
  file: File;
  url: string;
}

/**
 * Chiavi dei possibili errori di validazione gestiti lato frontend/backend per il form campo.
 */
type FieldErrorKey = 'images' | 'nome' | 'sport' | 'costoOrario' | 'attivo' | 'idImmagini';

/**
 * Campi backend riconosciuti e mappabili sui messaggi di errore del form.
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
  selector: 'app-create-field',
  imports: [CommonModule],
  templateUrl: './create-field.component.html',
  styleUrl: './create-field.component.css',
})
/**
 * Componente usato dal manager per creare un nuovo campo sportivo.
 * Gestisce validazione del form, caricamento immagini, preview locale e invio al backend.
 */
export class CreateFieldComponent implements OnDestroy {
  /**
   * Riferimento all'input file nascosto usato per aprire il selettore immagini da pulsante custom.
   */
  @ViewChild('fieldImagesInput') private readonly fieldImagesInput?: ElementRef<HTMLInputElement>;

  /**
   * Sport selezionabili nella creazione del campo.
   */
  readonly sportTypes: FieldSportType[] = [...SPORTS];
  readonly maxImages = 6;

  /**
   * Lista reattiva delle immagini selezionate prima del salvataggio.
   */
  readonly imagePreviews = signal<FieldImagePreview[]>([]);
  /**
   * Signal di stato del form: caricamento, successo, errore generale ed errori per singolo campo.
   */
  readonly isLoading = signal(false);
  readonly submitError = signal('');
  readonly submitSuccess = signal('');
  readonly fieldErrors = signal<FieldErrors<FieldErrorKey>>({});

  /**
   * Inietta router e servizio manager per salvataggio del campo e refresh della lista campi.
   */
  constructor(
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * Gestisce il submit del form di creazione campo.
   * Legge i dati dal form, valida input e immagini, crea il payload e invia tutto al backend.
   */
  createField(event: SubmitEvent): void {
    event.preventDefault();

    if (this.isLoading()) {
      return;
    }

    this.submitError.set('');
    this.submitSuccess.set('');
    this.fieldErrors.set({});

    const form = event.target as HTMLFormElement | null;

    if (!form) {
      this.submitError.set('Errore nella lettura del form.');
      return;
    }

    const formData = new FormData(form);
    const nome = String(formData.get('name') ?? '').trim();
    const sport = String(formData.get('sportType') ?? '').trim() as ManagerFieldSport;
    const hourlyRateRaw = String(formData.get('hourlyRate') ?? '').trim();
    const costoOrario = this.toHourlyRate(hourlyRateRaw);

    const isValid = this.validateForm({
      nome,
      sport,
      hourlyRateRaw,
      costoOrario,
    });

    if (!isValid) {
      return;
    }

    const payload: ManagerCreateFieldRequestDto = {
      nome,
      sport,
      costoOrario: costoOrario!,
      attivo: true,
    };

    this.isLoading.set(true);

    this.managerService
      .creaCampo(payload, this.imagePreviews().map((preview) => preview.file))
      .pipe(
        switchMap(() =>
          this.managerService.refreshCampi().pipe(
            catchError(() => of([])),
          ),
        ),
        finalize(() => {
          this.isLoading.set(false);
        }),
      )
      .subscribe({
        next: () => {
          this.submitSuccess.set('Campo creato con successo.');
          this.clearImages();
          form.reset();

          void this.router.navigate(['/dashboard/fields']);
        },
        error: (error) => {
          const message = this.extractErrorMessage(error, 'Impossibile creare il campo.');

          if (!this.applyBackendFieldErrors(error, message)) {
            this.submitError.set(message);
          }
        },
      });
  }

  /**
   * Restituisce il messaggio di errore associato a un campo specifico.
   */
  fieldError(fieldName: FieldErrorKey): string {
    return this.fieldErrors()[fieldName] ?? '';
  }

  /**
   * Cancella l'errore di un campo quando l'utente modifica l'input corrispondente.
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
   * Blocca l'inserimento manuale di segni non ammessi nei campi numerici.
   */
  preventNegativeValue(event: KeyboardEvent): void {
    if (event.key === '-' || event.key === '+') {
      event.preventDefault();
    }
  }

  /**
   * Normalizza il costo orario evitando valori negativi nell'input HTML.
   */
  normalizeHourlyRate(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);

    if (value < 0) {
      input.value = '0';
    }
  }

  /**
   * Apre programmaticamente il selettore file per le immagini del campo.
   */
  openImagesPicker(): void {
    this.fieldImagesInput?.nativeElement.click();
  }

  /**
   * Gestisce le immagini scelte dall'utente.
   * Controlla numero massimo, formato e dimensione prima di creare le preview locali.
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
      ...files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);

    input.value = '';
  }

  /**
   * Rimuove una preview immagine e libera l'URL temporaneo creato con URL.createObjectURL.
   */
  removeImage(index: number): void {
    const preview = this.imagePreviews()[index];

    if (!preview) {
      return;
    }

    URL.revokeObjectURL(preview.url);

    this.imagePreviews.update((currentPreviews) =>
      currentPreviews.filter((_, currentIndex) => currentIndex !== index),
    );

    this.clearFieldError('images');
  }

  /**
   * Annulla la creazione, pulisce le preview e torna alla lista campi.
   */
  cancel(): void {
    this.clearImages();
    void this.router.navigate(['/dashboard/fields']);
  }

  /**
   * Libera gli URL temporanei delle immagini quando il componente viene distrutto.
   */
  ngOnDestroy(): void {
    this.clearImages();
  }

  /**
   * Funzione trackBy per ottimizzare il rendering delle preview immagini.
   */
  trackByImageUrl(_: number, preview: FieldImagePreview): string {
    return preview.url;
  }

  /**
   * Valida i dati principali del form prima di inviarli al backend.
   */
  private validateForm(data: {
    nome: string;
    sport: string;
    hourlyRateRaw: string;
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

    if (!data.hourlyRateRaw) {
      errors.costoOrario = 'La tariffa oraria è obbligatoria.';
    } else if (data.costoOrario == null) {
      errors.costoOrario = 'Inserisci una tariffa oraria valida.';
    } else if (data.costoOrario < 0) {
      errors.costoOrario = 'Il costo orario non può essere negativo.';
    } else if (!/^\d{1,8}(\.\d{1,2})?$/.test(data.hourlyRateRaw)) {
      errors.costoOrario = 'Il costo orario deve avere massimo 8 cifre intere e 2 decimali.';
    }

    if (this.imagePreviews().length < 1) {
      errors.images = 'Carica almeno una immagine del campo.';
    }

    this.fieldErrors.set(errors);

    return Object.keys(errors).length === 0;
  }

  /**
   * Imposta un errore puntuale su un campo del form.
   */
  private setFieldError(fieldName: FieldErrorKey, message: string): void {
    this.fieldErrors.update((currentErrors) => ({
      ...currentErrors,
      [fieldName]: message,
    }));
  }

  /**
   * Mappa gli errori di validazione restituiti dal backend sui campi del form.
   * Restituisce true se almeno un errore è stato applicato.
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
   * Rimuove tutte le immagini selezionate e revoca gli URL di preview.
   */
  private clearImages(): void {
    for (const preview of this.imagePreviews()) {
      URL.revokeObjectURL(preview.url);
    }

    this.imagePreviews.set([]);
    this.clearFieldError('images');

    if (this.fieldImagesInput) {
      this.fieldImagesInput.nativeElement.value = '';
    }
  }

  /**
   * Converte il valore testuale del costo orario in numero valido oppure null.
   */
  private toHourlyRate(rawValue: string): number | null {
    if (!rawValue) {
      return null;
    }

    const numericValue = Number(rawValue);

    return Number.isFinite(numericValue) ? numericValue : null;
  }

  /**
   * Type guard che verifica se lo sport ricevuto dal form è uno sport valido per il backend.
   */
  private isValidSport(value: string): value is ManagerFieldSport {
    return isSport(value);
  }

  /**
   * Estrae un messaggio di errore leggibile da una risposta backend.
   */
  private extractErrorMessage(error: unknown, fallback: string): string {
    return extractBackendErrorMessage(error, fallback);
  }
}
