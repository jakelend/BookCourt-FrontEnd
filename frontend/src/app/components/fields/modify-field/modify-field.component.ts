import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FieldSportType } from '../field-card/field-card.component';

interface EditableField {
  id: number;
  name: string;
  sportType: FieldSportType;
  hourlyRate: number;
  active: boolean;
  images: string[];
}

interface FieldImagePreview {
  file: File | null;
  url: string;
  uploaded: boolean;
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

  field: EditableField = {
    id: 0,
    name: '',
    sportType: 'TENNIS',
    hourlyRate: 0,
    active: true,
    images: [],
  };

  private readonly fields: EditableField[] = [
    {
      id: 1,
      name: 'Campo Tennis Centrale',
      sportType: 'TENNIS',
      hourlyRate: 32,
      active: true,
      images: [
        'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=900&q=80',
      ],
    },
    {
      id: 2,
      name: 'Campo Padel Indoor',
      sportType: 'PADEL',
      hourlyRate: 40,
      active: true,
      images: [
        'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=900&q=80',
      ],
    },
    {
      id: 3,
      name: 'Campo Calcetto 5',
      sportType: 'CALCETTO',
      hourlyRate: 55,
      active: false,
      images: [
        'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?auto=format&fit=crop&w=900&q=80',
      ],
    },
  ];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const fieldId = Number(this.route.snapshot.paramMap.get('id'));
    const selectedField = this.fields.find((field) => field.id === fieldId);

    if (!selectedField) {
      void this.router.navigate(['/dashboard/fields']);
      return;
    }

    this.field = { ...selectedField, images: [...selectedField.images] };
    this.imagePreviews = selectedField.images.map((url) => ({ file: null, url, uploaded: false }));
  }

  modifyField(event: SubmitEvent): void {
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
}
