import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, signal, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';

import { ManagerCreateInstructorRequestDto } from '../../../dto/request/manager/manager-create-instructor-request.dto';
import { ManagerService } from '../../../services/manager.service';
import { extractBackendErrorMessage, extractBackendFieldErrors, FieldErrors } from '../../../util/error-message.util';

type FieldErrorKey =
  | 'profilePhoto'
  | 'nome'
  | 'cognome'
  | 'email'
  | 'telefono'
  | 'password'
  | 'costoOrarioTennis'
  | 'costoOrarioPadel'
  | 'tariffe';

const KNOWN_BACKEND_FIELDS: readonly FieldErrorKey[] = [
  'profilePhoto',
  'nome',
  'cognome',
  'email',
  'telefono',
  'password',
  'costoOrarioTennis',
  'costoOrarioPadel',
  'tariffe',
];

@Component({
  selector: 'app-create-instructor',
  imports: [CommonModule],
  templateUrl: './create-instructor.component.html',
  styleUrl: './create-instructor.component.css',
})
export class CreateInstructorComponent implements OnDestroy {
  @ViewChild('profilePhotoInput') private readonly profilePhotoInput?: ElementRef<HTMLInputElement>;

  readonly profilePhotoFile = signal<File | null>(null);
  readonly profilePhotoPreviewUrl = signal('');

  readonly showPassword = signal(false);

  readonly isLoading = signal(false);
  readonly submitError = signal('');
  readonly submitSuccess = signal('');
  readonly fieldErrors = signal<FieldErrors<FieldErrorKey>>({});

  constructor(
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  createInstructor(event: SubmitEvent): void {
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

    const nome = String(formData.get('nome') ?? '').trim();
    const cognome = String(formData.get('cognome') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    const telefono = String(formData.get('telefono') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    const costoOrarioTennis = this.toOptionalNumber(formData.get('costoOrarioTennis'));
    const costoOrarioPadel = this.toOptionalNumber(formData.get('costoOrarioPadel'));

    const selectedProfilePhoto = this.profilePhotoFile();

    const isValid = this.validateForm({
      selectedProfilePhoto,
      nome,
      cognome,
      email,
      telefono,
      password,
      costoOrarioTennis,
      costoOrarioPadel,
    });

    if (!isValid) {
      return;
    }

    const payload: ManagerCreateInstructorRequestDto = {
      nome,
      cognome,
      email,
      telefono,
      password,
      costoOrarioTennis,
      costoOrarioPadel,
    };

    this.isLoading.set(true);

    this.managerService
      .creaIstruttore(payload, selectedProfilePhoto!)
      .pipe(
        switchMap(() => this.managerService.refreshIstruttori().pipe(catchError(() => of([])))),
        finalize(() => {
          this.isLoading.set(false);
        }),
      )
      .subscribe({
        next: () => {
          this.submitSuccess.set('Istruttore creato con successo.');
          this.clearProfilePhoto();
          form.reset();

          void this.router.navigate(['/dashboard/instructors']);
        },
        error: (error) => {
          const message = this.extractErrorMessage(error, "Impossibile creare l'istruttore.");

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

  togglePasswordVisibility(): void {
    this.showPassword.update((currentValue) => !currentValue);
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

    this.revokeProfilePhotoPreview();

    this.profilePhotoFile.set(file);
    this.profilePhotoPreviewUrl.set(URL.createObjectURL(file));
  }

  clearProfilePhoto(): void {
    this.profilePhotoFile.set(null);
    this.revokeProfilePhotoPreview();

    if (this.profilePhotoInput) {
      this.profilePhotoInput.nativeElement.value = '';
    }
  }

  cancel(): void {
    this.clearProfilePhoto();
    void this.router.navigate(['/dashboard/instructors']);
  }

  ngOnDestroy(): void {
    this.revokeProfilePhotoPreview();
  }

  private validateForm(data: {
    selectedProfilePhoto: File | null;
    nome: string;
    cognome: string;
    email: string;
    telefono: string;
    password: string;
    costoOrarioTennis: number | null;
    costoOrarioPadel: number | null;
  }): boolean {
    const errors: FieldErrors<FieldErrorKey> = {};

    if (!data.selectedProfilePhoto) {
      errors.profilePhoto = "La foto profilo dell'istruttore è obbligatoria.";
    }

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

    if (!data.password) {
      errors.password = 'La password è obbligatoria.';
    } else if (data.password.length < 6 || data.password.length > 72) {
      errors.password = 'La password deve contenere tra 6 e 72 caratteri.';
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

    return hasFieldErrors;
  }

  private revokeProfilePhotoPreview(): void {
    const previewUrl = this.profilePhotoPreviewUrl();

    if (!previewUrl) {
      return;
    }

    URL.revokeObjectURL(previewUrl);
    this.profilePhotoPreviewUrl.set('');
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private toOptionalNumber(value: FormDataEntryValue | null): number | null {
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
