import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, signal, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';

import { ManagerCreateSecretaryRequestDto } from '../../../dto/request/manager/manager-create-secretary-request.dto';
import { ManagerService } from '../../../services/manager.service';
import { extractBackendErrorMessage, extractBackendFieldErrors, FieldErrors } from '../../../util/error-message.util';

type FieldErrorKey =
  | 'profilePhoto'
  | 'nome'
  | 'cognome'
  | 'email'
  | 'telefono'
  | 'password'
  | 'fotoProfiloUrl';

const KNOWN_BACKEND_FIELDS: readonly FieldErrorKey[] = [
  'profilePhoto',
  'nome',
  'cognome',
  'email',
  'telefono',
  'password',
  'fotoProfiloUrl',
];

@Component({
  selector: 'app-create-secretary',
  imports: [CommonModule],
  templateUrl: './create-secretary.component.html',
  styleUrl: './create-secretary.component.css',
})
export class CreateSecretaryComponent implements OnDestroy {
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

  createSecretary(event: SubmitEvent): void {
    event.preventDefault();

    if (this.isLoading()) {
      return;
    }

    this.submitError.set('');
    this.submitSuccess.set('');
    this.fieldErrors.set({});

    const form = event.target as HTMLFormElement | null;

    if (!form) {
      this.submitError.set('Errore nel form. Riprova.');
      return;
    }

    const formData = new FormData(form);

    const nome = String(formData.get('nome') ?? '').trim();
    const cognome = String(formData.get('cognome') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    const telefono = String(formData.get('telefono') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    const isValid = this.validateForm({
      nome,
      cognome,
      email,
      telefono,
      password,
    });

    if (!isValid) {
      return;
    }

    const payload: ManagerCreateSecretaryRequestDto = {
      nome,
      cognome,
      email,
      telefono,
      password,
    };

    this.isLoading.set(true);

    this.managerService
      .creaSegreteria(payload, this.profilePhotoFile())
      .pipe(
        switchMap(() =>
          this.managerService.refreshSegreterie().pipe(
            catchError(() => of([])),
          ),
        ),
        finalize(() => {
          this.isLoading.set(false);
        }),
      )
      .subscribe({
        next: () => {
          this.submitSuccess.set('Segretaria creata con successo.');
          this.clearProfilePhoto();
          form.reset();

          void this.router.navigate(['/dashboard/secretaries']);
        },
        error: (error) => {
          const message = this.extractErrorMessage(error, 'Impossibile creare la segretaria.');

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

    if (fieldName === 'profilePhoto') {
      delete currentErrors.fotoProfiloUrl;
    }

    this.fieldErrors.set(currentErrors);

    if (Object.keys(currentErrors).length === 0) {
      this.submitError.set('');
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
    this.clearFieldError('profilePhoto');

    if (this.profilePhotoInput) {
      this.profilePhotoInput.nativeElement.value = '';
    }
  }

  cancel(): void {
    this.clearProfilePhoto();
    void this.router.navigate(['/dashboard/secretaries']);
  }

  ngOnDestroy(): void {
    this.revokeProfilePhotoPreview();
  }

  private validateForm(data: {
    nome: string;
    cognome: string;
    email: string;
    telefono: string;
    password: string;
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

    if (!data.password) {
      errors.password = 'La password è obbligatoria.';
    } else if (data.password.length < 6 || data.password.length > 72) {
      errors.password = 'La password deve contenere tra 6 e 72 caratteri.';
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

  private extractErrorMessage(error: unknown, fallback: string): string {
    return extractBackendErrorMessage(error, fallback);
  }
}
