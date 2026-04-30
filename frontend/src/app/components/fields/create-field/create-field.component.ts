import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { FieldSportType } from '../field-card/field-card.component';
import { Router } from '@angular/router';

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

  constructor(private readonly router: Router) {}

  createField(event: SubmitEvent): void {
    event.preventDefault();
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
}
