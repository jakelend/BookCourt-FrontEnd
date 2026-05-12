import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, signal, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';

import { ManagerCreateSecretaryRequestDto } from '../../../dto/request/manager/manager-create-secretary-request.dto';
import { ManagerService } from '../../../services/manager.service';
import { extractBackendErrorMessage, extractBackendFieldErrors, FieldErrors } from '../../../util/error-message.util';

/**
 * Chiavi degli errori di validazione gestiti nel form di creazione segretaria.
 */
type FieldErrorKey =
  | 'profilePhoto'
  | 'nome'
  | 'cognome'
  | 'email'
  | 'telefono'
  | 'password'
  | 'fotoProfiloUrl';

/**
 * Elenco dei campi backend riconosciuti e mostrabili come errori puntuali nel form.
 */
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
/**
 * Componente usato dal manager per creare una nuova segretaria.
 * Gestisce dati anagrafici, credenziali e foto profilo opzionale.
 */
export class CreateSecretaryComponent implements OnDestroy {
  /**
   * Input file nascosto per selezionare la foto profilo opzionale.
   */
  @ViewChild('profilePhotoInput') private readonly profilePhotoInput?: ElementRef<HTMLInputElement>;

  /**
   * File foto selezionato e URL temporaneo per mostrarne l'anteprima.
   */
  readonly profilePhotoFile = signal<File | null>(null);
  readonly profilePhotoPreviewUrl = signal('');

  /**
   * Controlla se la password è visibile nel form.
   */
  readonly showPassword = signal(false);

  /**
   * Stati reattivi di invio, esito e validazione del form.
   */
  readonly isLoading = signal(false);
  readonly submitError = signal('');
  readonly submitSuccess = signal('');
  readonly fieldErrors = signal<FieldErrors<FieldErrorKey>>({});

  /**
   * Inietta router e ManagerService per creare la segretaria e aggiornare la lista.
   */
  constructor(
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * Gestisce il submit del form, valida i dati e invia la richiesta al backend.
   */
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

  /**
   * Restituisce il messaggio di errore di un campo specifico.
   */
  fieldError(fieldName: FieldErrorKey): string {
    return this.fieldErrors()[fieldName] ?? '';
  }

  /**
   * Rimuove l'errore del campo modificato dall'utente.
   */
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

  /**
   * Mostra o nasconde la password inserita.
   */
  togglePasswordVisibility(): void {
    this.showPassword.update((currentValue) => !currentValue);
  }

  /**
   * Apre il selettore della foto profilo.
   */
  openProfilePhotoPicker(): void {
    this.profilePhotoInput?.nativeElement.click();
  }

  /**
   * Valida la foto selezionata e crea l'anteprima locale.
   */
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

  /**
   * Rimuove la foto selezionata e libera l'URL temporaneo.
   */
  clearProfilePhoto(): void {
    this.profilePhotoFile.set(null);
    this.revokeProfilePhotoPreview();
    this.clearFieldError('profilePhoto');

    if (this.profilePhotoInput) {
      this.profilePhotoInput.nativeElement.value = '';
    }
  }

  /**
   * Annulla la creazione e torna alla lista segretarie.
   */
  cancel(): void {
    this.clearProfilePhoto();
    void this.router.navigate(['/dashboard/secretaries']);
  }

  /**
   * Revoca eventuali URL temporanei quando il componente viene distrutto.
   */
  ngOnDestroy(): void {
    this.revokeProfilePhotoPreview();
  }

  /**
   * Valida dati obbligatori, email, password, telefono e formato immagine.
   */
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

  /**
   * Imposta un errore puntuale nel form.
   */
  private setFieldError(fieldName: FieldErrorKey, message: string): void {
    this.fieldErrors.update((currentErrors) => ({
      ...currentErrors,
      [fieldName]: message,
    }));
  }

  /**
   * Mappa gli errori backend sui campi della creazione segretaria.
   */
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

  /**
   * Revoca l'URL temporaneo della foto profilo selezionata.
   */
  private revokeProfilePhotoPreview(): void {
    const previewUrl = this.profilePhotoPreviewUrl();

    if (!previewUrl) {
      return;
    }

    URL.revokeObjectURL(previewUrl);
    this.profilePhotoPreviewUrl.set('');
  }

  /**
   * Verifica il formato base dell'indirizzo email.
   */
  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /**
   * Estrae un messaggio di errore leggibile dal backend.
   */
  private extractErrorMessage(error: unknown, fallback: string): string {
    return extractBackendErrorMessage(error, fallback);
  }
}
