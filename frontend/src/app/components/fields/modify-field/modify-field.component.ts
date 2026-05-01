import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { finalize, switchMap } from 'rxjs/operators';
import { ManagerFieldImageResponseDto } from '../../../dto/response/manager/manager-field-image-response.dto';
import { ManagerFieldResponseDto } from '../../../dto/response/manager/manager-field-response.dto';
import { ManagerService } from '../../../services/manager.service';
import { FieldSportType } from '../field-card/field-card.component';

interface EditableField {
  id: number;
  name: string;
  sportType: FieldSportType;
  hourlyRate: number;
  active: boolean;
}

interface FieldImagePreview {
  file: File | null;
  url: string;
  uploaded: boolean;
  existingImageId: number | null;
}

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

  imagePreviews: FieldImagePreview[] = [];
  imagesError = '';
  loading = true;
  submitError = '';
  submitSuccess = '';
  isSaving = false;

  field: EditableField = {
    id: 0,
    name: '',
    sportType: 'TENNIS',
    hourlyRate: 0,
    active: true,
  };

  private deletedExistingImageIds = new Set<number>();

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
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: ({ fields, images }) => {
          const selectedField = fields.find((field) => field.id === fieldId);

          if (!selectedField) {
            void this.router.navigate(['/dashboard/fields']);
            return;
          }

          this.hydrateField(selectedField, images);
        },
        error: () => {
          this.submitError = 'Impossibile caricare i dati del campo.';
        },
      });
  }

  modifyField(event: SubmitEvent): void {
    event.preventDefault();
    this.submitError = '';
    this.submitSuccess = '';

    if (!this.field.name || !this.field.sportType) {
      this.submitError = 'Compila tutti i campi obbligatori.';
      return;
    }

    if (!Number.isFinite(this.field.hourlyRate) || this.field.hourlyRate < 0) {
      this.submitError = 'Inserisci una tariffa oraria valida.';
      return;
    }

    const payload = {
      nome: this.field.name.trim(),
      sport: this.field.sportType,
      costoOrario: this.field.hourlyRate,
      attivo: this.field.active,
    };

    const uploadedImages = this.imagePreviews
      .filter((preview) => preview.uploaded && preview.file)
      .map((preview) => preview.file as File);

    this.isSaving = true;

    const deleteRequest$: Observable<null> = this.deletedExistingImageIds.size
      ? this.managerService
          .eliminaImmaginiCampo(this.field.id, Array.from(this.deletedExistingImageIds))
          .pipe(switchMap(() => of(null)))
      : of(null);

    deleteRequest$
      .pipe(
        switchMap(() => this.managerService.aggiornaCampo(this.field.id, payload, uploadedImages)),
        finalize(() => (this.isSaving = false)),
      )
      .subscribe({
        next: () => {
          this.submitSuccess = 'Campo aggiornato con successo.';
          void this.router.navigate(['/dashboard/fields']);
        },
        error: (error) => {
          this.submitError = this.extractErrorMessage(error, 'Impossibile aggiornare il campo.');
        },
      });
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

    this.imagesError = '';

    if (!files.length) {
      return;
    }

    if (this.imagePreviews.length + files.length > this.maxImages) {
      input.value = '';
      this.imagesError = `Puoi caricare al massimo ${this.maxImages} immagini.`;
      return;
    }

    for (const file of files) {
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        input.value = '';
        this.imagesError = 'Carica solo file JPG o PNG.';
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        input.value = '';
        this.imagesError = 'Ogni immagine non può superare 5MB.';
        return;
      }
    }

    this.imagePreviews = [
      ...this.imagePreviews,
      ...files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
        uploaded: true,
        existingImageId: null,
      })),
    ];
    input.value = '';
  }

  removeImage(index: number): void {
    const preview = this.imagePreviews[index];

    if (!preview) {
      return;
    }

    if (preview.uploaded) {
      URL.revokeObjectURL(preview.url);
    }

    if (!preview.uploaded && preview.existingImageId != null) {
      this.deletedExistingImageIds.add(preview.existingImageId);
    }

    this.imagePreviews = this.imagePreviews.filter((_, currentIndex) => currentIndex !== index);
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

  private hydrateField(field: ManagerFieldResponseDto, images: ManagerFieldImageResponseDto[]): void {
    this.field = {
      id: field.id,
      name: field.nome,
      sportType: field.sport,
      hourlyRate: field.costoOrario,
      active: field.attivo,
    };

    this.deletedExistingImageIds.clear();
    this.imagePreviews = images.map((image) => ({
      file: null,
      url: this.buildImageUrl(image.urlImmagine),
      uploaded: false,
      existingImageId: image.id,
    }));
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
    for (const preview of this.imagePreviews) {
      if (preview.uploaded) {
        URL.revokeObjectURL(preview.url);
      }
    }

    if (this.fieldImagesInput) {
      this.fieldImagesInput.nativeElement.value = '';
    }
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    const maybeError = error as { error?: { message?: string; fields?: Record<string, string> }; status?: number };

    if (maybeError?.error?.message) {
      return maybeError.error.message;
    }

    if (maybeError?.error?.fields) {
      return Object.values(maybeError.error.fields)[0] ?? fallback;
    }

    if (maybeError?.status === 0) {
      return 'Backend non raggiungibile. Controlla che Spring Boot sia avviato sulla porta 8080.';
    }

    return fallback;
  }
}
