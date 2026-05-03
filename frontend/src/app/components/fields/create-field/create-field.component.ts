import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, signal, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';

import { ManagerCreateFieldRequestDto } from '../../../dto/request/manager/manager-create-field-request.dto';
import { ManagerFieldSport } from '../../../dto/response/manager/manager-field-response.dto';
import { ManagerService } from '../../../services/manager.service';
import { extractBackendErrorMessage, extractBackendFieldErrors, FieldErrors } from '../../../util/error-message.util';
import { FieldSportType } from '../field-card/field-card.component';

interface FieldImagePreview {
  file: File;
  url: string;
}

type FieldErrorKey = 'images' | 'nome' | 'sport' | 'costoOrario' | 'attivo' | 'idImmagini';

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
export class CreateFieldComponent implements OnDestroy {
  @ViewChild('fieldImagesInput') private readonly fieldImagesInput?: ElementRef<HTMLInputElement>;

  readonly sportTypes: FieldSportType[] = ['CALCETTO', 'TENNIS', 'PADEL'];
  readonly maxImages = 6;

  readonly imagePreviews = signal<FieldImagePreview[]>([]);
  readonly isLoading = signal(false);
  readonly submitError = signal('');
  readonly submitSuccess = signal('');
  readonly fieldErrors = signal<FieldErrors<FieldErrorKey>>({});

  constructor(
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

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

  fieldError(fieldName: FieldErrorKey): string {
    return this.fieldErrors()[fieldName] ?? '';
  }

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

  preventNegativeValue(event: KeyboardEvent): void {
    if (event.key === '-' || event.key === '+') {
      event.preventDefault();
    }
  }

  normalizeHourlyRate(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);

    if (value < 0) {
      input.value = '0';
    }
  }

  openImagesPicker(): void {
    this.fieldImagesInput?.nativeElement.click();
  }

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

  cancel(): void {
    this.clearImages();
    void this.router.navigate(['/dashboard/fields']);
  }

  ngOnDestroy(): void {
    this.clearImages();
  }

  trackByImageUrl(_: number, preview: FieldImagePreview): string {
    return preview.url;
  }

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

    this.fieldErrors.set(errors);

    return Object.keys(errors).length === 0;
  }

  private setFieldError(fieldName: FieldErrorKey, message: string): void {
    this.fieldErrors.update((currentErrors) => ({
      ...currentErrors,
      [fieldName]: message,
    }));
  }

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

  private toHourlyRate(rawValue: string): number | null {
    if (!rawValue) {
      return null;
    }

    const numericValue = Number(rawValue);

    return Number.isFinite(numericValue) ? numericValue : null;
  }

  private isValidSport(value: string): value is ManagerFieldSport {
    return this.sportTypes.includes(value as FieldSportType);
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    return extractBackendErrorMessage(error, fallback);
  }
}
