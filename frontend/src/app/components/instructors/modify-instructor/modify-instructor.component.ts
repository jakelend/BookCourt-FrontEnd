import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { ManagerUpdateInstructorRequestDto } from '../../../dto/request/manager/manager-create-instructor-request.dto';
import { ManagerInstructorResponseDto } from '../../../dto/response/manager/manager-instructor-response.dto';
import { ManagerService } from '../../../services/manager.service';
import { extractBackendErrorMessage, extractBackendFieldErrors, FieldErrors } from '../../../util/error-message.util';

interface EditableInstructor {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  costoOrarioTennis: number | null;
  costoOrarioPadel: number | null;
  fotoProfiloUrl: string | null;
}

type FieldErrorKey =
  | 'profilePhoto'
  | 'nome'
  | 'cognome'
  | 'email'
  | 'telefono'
  | 'costoOrarioTennis'
  | 'costoOrarioPadel'
  | 'tariffe'
  | 'fotoProfiloUrl';

const KNOWN_BACKEND_FIELDS: readonly FieldErrorKey[] = [
  'profilePhoto',
  'nome',
  'cognome',
  'email',
  'telefono',
  'costoOrarioTennis',
  'costoOrarioPadel',
  'tariffe',
  'fotoProfiloUrl',
];

@Component({
  selector: 'app-modify-instructor',
  imports: [CommonModule, FormsModule],
  templateUrl: './modify-instructor.component.html',
  styleUrl: './modify-instructor.component.css',
})
export class ModifyInstructorComponent implements OnInit, OnDestroy {
  @ViewChild('profilePhotoInput') private readonly profilePhotoInput?: ElementRef<HTMLInputElement>;

  readonly profilePhotoFile = signal<File | null>(null);
  readonly profilePhotoPreviewUrl = signal('');

  readonly loading = signal(true);
  readonly isSaving = signal(false);
  readonly submitError = signal('');
  readonly submitSuccess = signal('');
  readonly fieldErrors = signal<FieldErrors<FieldErrorKey>>({});

  instructor: EditableInstructor = {
    id: 0,
    nome: '',
    cognome: '',
    email: '',
    telefono: '',
    costoOrarioTennis: null,
    costoOrarioPadel: null,
    fotoProfiloUrl: '',
  };

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  ngOnInit(): void {
    const instructorId = Number(this.route.snapshot.paramMap.get('id'));

    this.managerService
      .getIstruttori()
      .pipe(
        finalize(() => {
          this.loading.set(false);
        }),
      )
      .subscribe({
        next: (instructors) => {
          const selectedInstructor = instructors.find((instructor) => instructor.id === instructorId);

          if (!selectedInstructor) {
            void this.router.navigate(['/dashboard/instructors']);
            return;
          }

          this.hydrateInstructor(selectedInstructor);
        },
        error: (error) => {
          this.submitError.set(this.extractErrorMessage(error, "Impossibile caricare i dati dell'istruttore."));
        },
      });
  }

  modifyInstructor(event: SubmitEvent): void {
    event.preventDefault();

    if (this.isSaving()) {
      return;
    }

    this.submitError.set('');
    this.submitSuccess.set('');
    this.fieldErrors.set({});

    const nome = this.instructor.nome.trim();
    const cognome = this.instructor.cognome.trim();
    const email = this.instructor.email.trim();
    const telefono = this.instructor.telefono.trim();
    const costoOrarioTennis = this.toOptionalNumber(this.instructor.costoOrarioTennis);
    const costoOrarioPadel = this.toOptionalNumber(this.instructor.costoOrarioPadel);

    const isValid = this.validateForm({
      nome,
      cognome,
      email,
      telefono,
      costoOrarioTennis,
      costoOrarioPadel,
    });

    if (!isValid) {
      return;
    }

    const payload: ManagerUpdateInstructorRequestDto = {
      nome,
      cognome,
      email,
      telefono,
      costoOrarioTennis,
      costoOrarioPadel,
    };

    this.isSaving.set(true);

    this.managerService
      .aggiornaIstruttore(this.instructor.id, payload, this.profilePhotoFile())
      .pipe(
        finalize(() => {
          this.isSaving.set(false);
        }),
      )
      .subscribe({
        next: (updatedInstructor) => {
          this.submitSuccess.set('Istruttore aggiornato con successo.');
          this.profilePhotoFile.set(null);
          this.hydrateInstructor(updatedInstructor);

          void this.router.navigate(['/dashboard/instructors']);
        },
        error: (error) => {
          const message = this.extractErrorMessage(error, "Impossibile aggiornare l'istruttore.");

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

    if (fieldName === 'costoOrarioTennis' || fieldName === 'costoOrarioPadel') {
      delete currentErrors.tariffe;
    }

    if (fieldName === 'profilePhoto') {
      delete currentErrors.fotoProfiloUrl;
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

  normalizeTennisRate(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);

    if (value < 0) {
      input.value = '0';
      this.instructor.costoOrarioTennis = 0;
    }
  }

  normalizePadelRate(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);

    if (value < 0) {
      input.value = '0';
      this.instructor.costoOrarioPadel = 0;
    }
  }

  openProfilePhotoPicker(): void {
    this.profilePhotoInput?.nativeElement.click();
  }

  onProfilePhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.clearFieldError('profilePhoto');

    if (!file) {
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      this.clearProfilePhoto();
      input.value = '';
      this.setFieldError('profilePhoto', 'Carica un file JPG o PNG.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.clearProfilePhoto();
      input.value = '';
      this.setFieldError('profilePhoto', 'La foto non può superare 5MB.');
      return;
    }

    this.revokeUploadedProfilePhotoPreview();
    this.profilePhotoFile.set(file);
    this.profilePhotoPreviewUrl.set(URL.createObjectURL(file));
  }

  clearProfilePhoto(): void {
    this.profilePhotoFile.set(null);
    this.revokeUploadedProfilePhotoPreview();
    this.profilePhotoPreviewUrl.set(this.buildImageUrl(this.instructor.fotoProfiloUrl));
    this.clearFieldError('profilePhoto');

    if (this.profilePhotoInput) {
      this.profilePhotoInput.nativeElement.value = '';
    }
  }

  cancel(): void {
    this.clearProfilePhoto();
    void this.router.navigate(['/dashboard/instructors']);
  }

  ngOnDestroy(): void {
    this.revokeUploadedProfilePhotoPreview();
  }

  private validateForm(data: {
    nome: string;
    cognome: string;
    email: string;
    telefono: string;
    costoOrarioTennis: number | null;
    costoOrarioPadel: number | null;
  }): boolean {
    const errors: FieldErrors<FieldErrorKey> = {};

    if (!data.nome) {
      errors.nome = 'Il nome è obbligatorio.';
    } else if (data.nome.length > 50) {
      errors.nome = 'Il nome non può superare 50 caratteri.';
    }

    if (!data.cognome) {
      errors.cognome = 'Il cognome è obbligatorio.';
    } else if (data.cognome.length > 50) {
      errors.cognome = 'Il cognome non può superare 50 caratteri.';
    }

    if (!data.email) {
      errors.email = "L'email è obbligatoria.";
    } else if (!this.isValidEmail(data.email)) {
      errors.email = 'Inserisci un indirizzo email valido.';
    } else if (data.email.length > 255) {
      errors.email = "L'email non può superare 255 caratteri.";
    }

    if (!data.telefono) {
      errors.telefono = 'Il telefono è obbligatorio.';
    } else if (!/^[0-9]{10}$/.test(data.telefono)) {
      errors.telefono = 'Il telefono deve contenere esattamente 10 cifre.';
    }

    if (data.costoOrarioTennis == null && data.costoOrarioPadel == null) {
      errors.tariffe = 'Devi impostare almeno una tariffa oraria maggiore di 0 per tennis o padel.';
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

    if (normalizedMessage.includes('telefono')) {
      this.setFieldError('telefono', fallbackMessage);
      hasFieldErrors = true;
    }

    if (normalizedMessage.includes('email')) {
      this.setFieldError('email', fallbackMessage);
      hasFieldErrors = true;
    }

    if (normalizedMessage.includes('foto') || normalizedMessage.includes('immagine')) {
      this.setFieldError('profilePhoto', fallbackMessage);
      hasFieldErrors = true;
    }

    return hasFieldErrors;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private hydrateInstructor(instructor: ManagerInstructorResponseDto): void {
    this.instructor = {
      id: instructor.id,
      nome: instructor.nome,
      cognome: instructor.cognome,
      email: instructor.email,
      telefono: instructor.telefono,
      costoOrarioTennis: instructor.costoOrarioTennis,
      costoOrarioPadel: instructor.costoOrarioPadel,
      fotoProfiloUrl: instructor.fotoProfiloUrl,
    };

    if (!this.profilePhotoFile()) {
      this.profilePhotoPreviewUrl.set(this.buildImageUrl(instructor.fotoProfiloUrl));
    }
  }

  private buildImageUrl(path: string | null): string {
    if (!path) {
      return '';
    }

    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    return path.startsWith('/') ? `http://localhost:8080${path}` : `http://localhost:8080/${path}`;
  }

  private revokeUploadedProfilePhotoPreview(): void {
    const previewUrl = this.profilePhotoPreviewUrl();

    if (!previewUrl.startsWith('blob:')) {
      return;
    }

    URL.revokeObjectURL(previewUrl);
    this.profilePhotoPreviewUrl.set('');
  }

  private toOptionalNumber(value: number | string | null): number | null {
    if (value == null || String(value).trim() === '') {
      return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    return extractBackendErrorMessage(error, fallback);
  }
}
