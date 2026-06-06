import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, signal, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';

import { ManagerCreateInstructorRequestDto } from '../../../dto/request/manager/manager-create-instructor-request.dto';
import { ManagerService } from '../../../services/manager.service';
import { extractBackendErrorMessage, extractBackendFieldErrors, FieldErrors } from '../../../util/error-message.util';

/**
 * Chiavi degli errori di validazione gestiti nel form di creazione istruttore.
 */
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
/**
 * Componente usato dal manager per creare un nuovo istruttore.
 * Gestisce dati anagrafici, credenziali, tariffe orarie e foto profilo obbligatoria.
 */
export class CreateInstructorComponent implements OnDestroy {
  /**
   * Input file nascosto usato per selezionare la foto profilo dell'istruttore.
   */
  @ViewChild('profilePhotoInput') private readonly profilePhotoInput?: ElementRef<HTMLInputElement>;

  /**
   * File immagine selezionato e URL temporaneo usato per mostrarne l'anteprima.
   */
  readonly profilePhotoFile = signal<File | null>(null);
  readonly profilePhotoPreviewUrl = signal('');

  /**
   * Stato che controlla la visibilità della password nel form.
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
   * Inietta router e ManagerService per creare l'istruttore e aggiornare la lista.
   */
  constructor(
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * Gestisce il submit del form, valida i dati e invia payload più foto profilo al backend.
   */
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
        /*
          Dopo la creazione provo anche a ricaricare la lista istruttori del manager.
          Se il refresh fallisce, non blocco comunque il flusso di creazione appena concluso.
        */
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

  /**
   * Restituisce il messaggio di errore associato a un campo del form.
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

    if (fieldName === 'costoOrarioTennis' || fieldName === 'costoOrarioPadel') {
      delete currentErrors.tariffe;
    }

    this.fieldErrors.set(currentErrors);

    if (Object.keys(currentErrors).length === 0) {
      this.submitError.set('');
    }
  }

  /**
   * Impedisce l'inserimento di segni nei campi numerici delle tariffe.
   */
  preventNegativeValue(event: KeyboardEvent): void {
    if (event.key === '-' || event.key === '+') {
      event.preventDefault();
    }
  }

  /**
   * Corregge eventuali valori negativi inseriti nelle tariffe orarie.
   */
  normalizeHourlyRate(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);

    if (value < 0) {
      input.value = '0';
    }
  }

  /**
   * Mostra o nasconde la password digitata nel form.
   */
  togglePasswordVisibility(): void {
    this.showPassword.update((currentValue) => !currentValue);
  }

  /**
   * Apre il selettore file della foto profilo.
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
   * Rimuove la foto profilo selezionata e libera la preview locale.
   */
  clearProfilePhoto(): void {
    this.profilePhotoFile.set(null);
    this.revokeProfilePhotoPreview();

    if (this.profilePhotoInput) {
      this.profilePhotoInput.nativeElement.value = '';
    }
  }

  /**
   * Annulla la creazione e torna alla lista istruttori.
   */
  cancel(): void {
    this.clearProfilePhoto();
    void this.router.navigate(['/dashboard/instructors']);
  }

  /**
   * Libera l'URL temporaneo della foto profilo quando il componente viene distrutto.
   */
  ngOnDestroy(): void {
    this.revokeProfilePhotoPreview();
  }

  /**
   * Valida campi obbligatori, email, password, telefono, tariffe e foto profilo.
   */
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
   * Mappa gli errori backend sui campi del form istruttore.
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

    return hasFieldErrors;
  }

  /**
   * Revoca l'URL temporaneo della foto profilo caricata localmente.
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
   * Converte una tariffa opzionale in numero oppure null.
   */
  private toOptionalNumber(value: FormDataEntryValue | null): number | null {
    if (value == null || String(value).trim() === '') {
      return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
  }

  /**
   * Estrae un messaggio di errore leggibile da una risposta backend.
   */
  private extractErrorMessage(error: unknown, fallback: string): string {
    return extractBackendErrorMessage(error, fallback);
  }
}
