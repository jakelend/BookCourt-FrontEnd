import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';
import { ManagerCreateFieldRequestDto } from '../../../dto/request/manager/manager-create-field-request.dto';
import { ManagerFieldSport } from '../../../dto/response/manager/manager-field-response.dto';
import { ManagerService } from '../../../services/manager.service';
import { FieldSportType } from '../field-card/field-card.component';

interface FieldImagePreview {
  file: File;
  url: string;
}

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

  imagePreviews: FieldImagePreview[] = [];
  imagesError = '';
  submitError = '';
  submitSuccess = '';
  isLoading = false;

  constructor(
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  createField(event: SubmitEvent): void {
    event.preventDefault();
    this.submitError = '';
    this.submitSuccess = '';

    const form = event.target as HTMLFormElement | null;
    if (!form) {
      return;
    }

    const formData = new FormData(form);
    const nome = String(formData.get('name') ?? '').trim();
    const sport = String(formData.get('sportType') ?? '').trim() as ManagerFieldSport;
    const costoOrario = Number(formData.get('hourlyRate') ?? 0);

    if (!nome || !sport) {
      this.submitError = 'Compila tutti i campi obbligatori.';
      return;
    }

    if (!Number.isFinite(costoOrario) || costoOrario < 0) {
      this.submitError = 'Inserisci una tariffa oraria valida.';
      return;
    }

    const payload: ManagerCreateFieldRequestDto = {
      nome,
      sport,
      costoOrario,
      attivo: true,
    };

    this.isLoading = true;

    this.managerService
      .creaCampo(payload, this.imagePreviews.map((preview) => preview.file))
      .pipe(
        switchMap(() =>
          this.managerService.refreshCampi().pipe(
            catchError(() => of([])),
          ),
        ),
        finalize(() => (this.isLoading = false)),
      )
      .subscribe({
        next: () => {
          this.submitSuccess = 'Campo creato con successo.';
          this.clearImages();
          form.reset();
          void this.router.navigate(['/dashboard/fields']);
        },
        error: (error) => {
          this.submitError = this.extractErrorMessage(error, 'Impossibile creare il campo.');
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
      ...files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ];
    input.value = '';
  }

  removeImage(index: number): void {
    const preview = this.imagePreviews[index];

    if (!preview) {
      return;
    }

    URL.revokeObjectURL(preview.url);
    this.imagePreviews = this.imagePreviews.filter((_, currentIndex) => currentIndex !== index);
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

  private clearImages(): void {
    for (const preview of this.imagePreviews) {
      URL.revokeObjectURL(preview.url);
    }

    this.imagePreviews = [];

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
