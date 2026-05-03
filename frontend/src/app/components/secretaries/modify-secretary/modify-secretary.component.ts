import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { ManagerUpdateSecretaryRequestDto } from '../../../dto/request/manager/manager-create-secretary-request.dto';
import { ManagerSecretaryResponseDto } from '../../../dto/response/manager/manager-secretary-response.dto';
import { ManagerService } from '../../../services/manager.service';
import { extractBackendErrorMessage, extractBackendFieldErrors, FieldErrors } from '../../../util/error-message.util';

interface EditableSecretary {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  fotoProfiloUrl: string | null;
}

type FieldErrorKey =
  | 'profilePhoto'
  | 'nome'
  | 'cognome'
  | 'email'
  | 'telefono'
  | 'fotoProfiloUrl';

const KNOWN_BACKEND_FIELDS: readonly FieldErrorKey[] = [
  'profilePhoto',
  'nome',
  'cognome',
  'email',
  'telefono',
  'fotoProfiloUrl',
];

@Component({
  selector: 'app-modify-secretary',
  imports: [CommonModule, FormsModule],
  templateUrl: './modify-secretary.component.html',
  styleUrl: './modify-secretary.component.css',
})
export class ModifySecretaryComponent implements OnInit, OnDestroy {
  @ViewChild('profilePhotoInput') private readonly profilePhotoInput?: ElementRef<HTMLInputElement>;

  readonly profilePhotoFile = signal<File | null>(null);
  readonly profilePhotoPreviewUrl = signal('');

  readonly loading = signal(true);
  readonly isSaving = signal(false);
  readonly submitError = signal('');
  readonly submitSuccess = signal('');
  readonly fieldErrors = signal<FieldErrors<FieldErrorKey>>({});

  secretary: EditableSecretary = {
    id: 0,
    nome: '',
    cognome: '',
    email: '',
    telefono: '',
    fotoProfiloUrl: '',
  };

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  ngOnInit(): void {
    const secretaryId = Number(this.route.snapshot.paramMap.get('id'));

    this.managerService
      .getSegreterie()
      .pipe(
        finalize(() => {
          this.loading.set(false);
        }),
      )
      .subscribe({
        next: (secretaries) => {
          const selectedSecretary = secretaries.find((secretary) => secretary.id === secretaryId);

          if (!selectedSecretary) {
            void this.router.navigate(['/dashboard/secretaries']);
            return;
          }

          this.hydrateSecretary(selectedSecretary);
        },
        error: (error) => {
          this.submitError.set(this.extractErrorMessage(error, 'Impossibile caricare i dati della segretaria.'));
        },
      });
  }

  modifySecretary(event: SubmitEvent): void {
    event.preventDefault();

    if (this.isSaving()) {
      return;
    }

    this.submitError.set('');
    this.submitSuccess.set('');
    this.fieldErrors.set({});

    const nome = this.secretary.nome.trim();
    const cognome = this.secretary.cognome.trim();
    const email = this.secretary.email.trim().toLowerCase();
    const telefono = this.secretary.telefono.trim();

    const isValid = this.validateForm({
      nome,
      cognome,
      email,
      telefono,
    });

    if (!isValid) {
      return;
    }

    const payload: ManagerUpdateSecretaryRequestDto = {
      nome,
      cognome,
      email,
      telefono,
    };

    this.isSaving.set(true);

    this.managerService
      .aggiornaSegreteria(this.secretary.id, payload, this.profilePhotoFile())
      .pipe(
        finalize(() => {
          this.isSaving.set(false);
        }),
      )
      .subscribe({
        next: (updatedSecretary) => {
          this.submitSuccess.set('Segretaria aggiornata con successo.');
          this.profilePhotoFile.set(null);
          this.hydrateSecretary(updatedSecretary);

          void this.router.navigate(['/dashboard/secretaries']);
        },
        error: (error) => {
          const message = this.extractErrorMessage(error, 'Impossibile aggiornare la segretaria.');

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
    this.profilePhotoPreviewUrl.set(this.buildImageUrl(this.secretary.fotoProfiloUrl));
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
    this.revokeUploadedProfilePhotoPreview();
  }

  private validateForm(data: {
    nome: string;
    cognome: string;
    email: string;
    telefono: string;
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

  private hydrateSecretary(secretary: ManagerSecretaryResponseDto): void {
    this.secretary = {
      id: secretary.id,
      nome: secretary.nome,
      cognome: secretary.cognome,
      email: secretary.email,
      telefono: secretary.telefono,
      fotoProfiloUrl: secretary.fotoProfiloUrl,
    };

    if (!this.profilePhotoFile()) {
      this.profilePhotoPreviewUrl.set(this.buildImageUrl(secretary.fotoProfiloUrl));
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

  private extractErrorMessage(error: unknown, fallback: string): string {
    return extractBackendErrorMessage(error, fallback);
  }
}
