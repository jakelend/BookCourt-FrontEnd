import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { finalize, switchMap } from 'rxjs/operators';

import { ManagerUpdateFieldRequestDto } from '../../../dto/request/manager/manager-create-field-request.dto';
import { ManagerFieldImageResponseDto } from '../../../dto/response/manager/manager-field-image-response.dto';
import { ManagerFieldResponseDto, ManagerFieldSport } from '../../../dto/response/manager/manager-field-response.dto';
import { ManagerService } from '../../../services/manager.service';
import { extractBackendErrorMessage, extractBackendFieldErrors, FieldErrors } from '../../../util/error-message.util';
import { FieldSportType } from '../field-card/field-card.component';

interface EditableField {
  id: number;
  name: string;
  sportType: FieldSportType;
  hourlyRate: number | null;
  active: boolean;
}

interface FieldImagePreview {
  file: File | null;
  url: string;
  uploaded: boolean;
  existingImageId: number | null;
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
  selector: 'app-modify-field',
  imports: [CommonModule, FormsModule],
  templateUrl: './modify-field.component.html',
  styleUrl: './modify-field.component.css',
})
export class ModifyFieldComponent implements OnInit, OnDestroy {
  @ViewChild('fieldImagesInput') private readonly fieldImagesInput?: ElementRef<HTMLInputElement>;

  readonly sportTypes: FieldSportType[] = ['CALCETTO', 'TENNIS', 'PADEL'];
  readonly maxImages = 6;

  readonly imagePreviews = signal<FieldImagePreview[]>([]);
  readonly loading = signal(true);
  readonly isSaving = signal(false);
  readonly submitError = signal('');
  readonly submitSuccess = signal('');
  readonly fieldErrors = signal<FieldErrors<FieldErrorKey>>({});

  field: EditableField = {
    id: 0,
    name: '',
    sportType: 'TENNIS',
    hourlyRate: 0,
    active: true,
  };

  private readonly deletedExistingImageIds = new Set<number>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  ngOnInit(): void {
    const fieldId = Number(this.route.snapshot.paramMap.get('id'));

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
    };

    const uploadedImages = this.imagePreviews()
      .filter((preview) => preview.uploaded && preview.file)
      .map((preview) => preview.file as File);

    this.isSaving.set(true);

    const deleteRequest$: Observable<null> = this.deletedExistingImageIds.size
      ? this.managerService
          .eliminaImmaginiCampo(this.field.id, Array.from(this.deletedExistingImageIds))
          .pipe(switchMap(() => of(null)))
      : of(null);

    deleteRequest$
      .pipe(
        switchMap(() => this.managerService.aggiornaCampo(this.field.id, payload, uploadedImages)),
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
      this.field.hourlyRate = 0;
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
      ...files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
        uploaded: true,
        existingImageId: null,
      })),
    ]);

    input.value = '';
  }

  removeImage(index: number): void {
    const preview = this.imagePreviews()[index];

    if (!preview) {
      return;
    }

    if (preview.uploaded) {
      URL.revokeObjectURL(preview.url);
    }

    if (!preview.uploaded && preview.existingImageId != null) {
      this.deletedExistingImageIds.add(preview.existingImageId);
    }

    this.imagePreviews.update((currentPreviews) =>
      currentPreviews.filter((_, currentIndex) => currentIndex !== index),
    );

    this.clearFieldError('images');
  }

  cancel(): void {
    this.clearUploadedImages();
    void this.router.navigate(['/dashboard/fields']);
  }

  ngOnDestroy(): void {
    this.clearUploadedImages();
  }

  trackByImageUrl(_: number, preview: FieldImagePreview): string {
    return preview.url;
  }

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
        url: this.buildImageUrl(image.urlImmagine),
        uploaded: false,
        existingImageId: image.id,
      })),
    );
  }

  private buildImageUrl(path: string): string {
    if (!path) {
      return '';
    }

    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    return path.startsWith('/') ? `http://localhost:8080${path}` : `http://localhost:8080/${path}`;
  }

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

  private toHourlyRate(value: number | string | null): number | null {
    if (value == null || value === '') {
      return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
  }

  private isValidSport(value: string): value is ManagerFieldSport {
    return this.sportTypes.includes(value as FieldSportType);
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    return extractBackendErrorMessage(error, fallback);
  }
}
