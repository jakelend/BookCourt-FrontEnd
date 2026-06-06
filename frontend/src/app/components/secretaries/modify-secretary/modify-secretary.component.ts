import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { ManagerUpdateSecretaryRequestDto } from '../../../dto/request/manager/manager-create-secretary-request.dto';
import { ManagerSecretaryResponseDto } from '../../../dto/response/manager/manager-secretary-response.dto';
import { ManagerService } from '../../../services/manager.service';
import { extractBackendErrorMessage, extractBackendFieldErrors, FieldErrors } from '../../../util/error-message.util';
import { ImageUrlUtil } from '../../../util/image-url.util';

/**
 * Modello locale con i dati modificabili della segretaria.
 */
interface EditableSecretary {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  fotoProfiloUrl: string | null;
}

/**
 * Chiavi degli errori di validazione gestiti nel form di modifica segretaria.
 */
type FieldErrorKey =
  | 'profilePhoto'
  | 'nome'
  | 'cognome'
  | 'email'
  | 'telefono'
  | 'fotoProfiloUrl';

/**
 * Elenco dei campi backend riconosciuti e mappabili sugli errori del form.
 */
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
/**
 * Componente manager per modificare una segretaria esistente.
 * Gestisce dati anagrafici, email, telefono, stato attivo e foto profilo opzionale.
 */
export class ModifySecretaryComponent implements OnInit, OnDestroy {
  /**
   * Input file nascosto usato per selezionare una nuova foto profilo.
   */
  @ViewChild('profilePhotoInput') private readonly profilePhotoInput?: ElementRef<HTMLInputElement>;

  /**
   * Nuova foto selezionata e URL temporaneo per l'anteprima.
   */
  readonly profilePhotoFile = signal<File | null>(null);
  readonly profilePhotoPreviewUrl = signal('');

  /**
   * Stati reattivi di caricamento, salvataggio, messaggi ed errori del form.
   */
  readonly loading = signal(true);
  readonly isSaving = signal(false);
  readonly submitError = signal('');
  readonly submitSuccess = signal('');
  readonly fieldErrors = signal<FieldErrors<FieldErrorKey>>({});

  /**
   * Dati editabili della segretaria caricati dal backend e collegati al form.
   */
  secretary: EditableSecretary = {
    id: 0,
    nome: '',
    cognome: '',
    email: '',
    telefono: '',
    fotoProfiloUrl: '',
  };

  /**
   * Inietta route, router e ManagerService per leggere l'id e salvare le modifiche.
   */
  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * Legge l'id dalla route e carica la segretaria da modificare.
   */
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

  /**
   * Valida il form e invia al backend le modifiche della segretaria.
   */
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

    /*
      Nel payload mando solo i campi testuali.
      La nuova foto, se presente, viene passata separatamente al service.
    */
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

  /**
   * Restituisce l'errore associato a un campo del form.
   */
  fieldError(fieldName: FieldErrorKey): string {
    return this.fieldErrors()[fieldName] ?? '';
  }

  /**
   * Cancella l'errore del campo modificato dall'utente.
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
   * Apre il selettore file per la foto profilo.
   */
  openProfilePhotoPicker(): void {
    this.profilePhotoInput?.nativeElement.click();
  }

  /**
   * Valida il file immagine selezionato e crea la preview locale.
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

    this.revokeUploadedProfilePhotoPreview();

    this.profilePhotoFile.set(file);
    this.profilePhotoPreviewUrl.set(URL.createObjectURL(file));
  }

  /**
   * Rimuove la nuova foto caricata e ripristina l'immagine precedente se presente.
   */
  clearProfilePhoto(): void {
    this.profilePhotoFile.set(null);
    this.revokeUploadedProfilePhotoPreview();
    this.profilePhotoPreviewUrl.set(ImageUrlUtil.normalizeProfileImageUrl(this.secretary.fotoProfiloUrl) ?? '');
    this.clearFieldError('profilePhoto');

    if (this.profilePhotoInput) {
      this.profilePhotoInput.nativeElement.value = '';
    }
  }

  /**
   * Annulla la modifica e torna alla lista segretarie.
   */
  cancel(): void {
    this.clearProfilePhoto();
    void this.router.navigate(['/dashboard/secretaries']);
  }

  /**
   * Revoca eventuali URL temporanei quando il componente viene distrutto.
   */
  ngOnDestroy(): void {
    this.revokeUploadedProfilePhotoPreview();
  }

  /**
   * Valida dati anagrafici, email e telefono prima del salvataggio.
   */
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

  /**
   * Imposta un errore puntuale su un campo del form.
   */
  private setFieldError(fieldName: FieldErrorKey, message: string): void {
    this.fieldErrors.update((currentErrors) => ({
      ...currentErrors,
      [fieldName]: message,
    }));
  }

  /**
   * Mappa gli errori backend sui campi del form segretaria.
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
   * Verifica il formato base dell'indirizzo email.
   */
  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /**
   * Popola lo stato locale con i dati della segretaria ricevuti dal backend.
   */
  private hydrateSecretary(secretary: ManagerSecretaryResponseDto): void {
    this.secretary = {
      id: secretary.id,
      nome: secretary.nome,
      cognome: secretary.cognome,
      email: secretary.email,
      telefono: secretary.telefono,
      fotoProfiloUrl: secretary.fotoProfiloUrl,
    };

    /*
      Se non e' stata scelta una nuova foto locale, tengo come anteprima
      l'immagine attuale arrivata dal backend.
    */
    if (!this.profilePhotoFile()) {
      this.profilePhotoPreviewUrl.set(ImageUrlUtil.normalizeProfileImageUrl(secretary.fotoProfiloUrl) ?? '');
    }
  }

  /**
   * Revoca l'URL temporaneo della nuova foto caricata.
   */
  private revokeUploadedProfilePhotoPreview(): void {
    const previewUrl = this.profilePhotoPreviewUrl();

    if (!previewUrl.startsWith('blob:')) {
      return;
    }

    URL.revokeObjectURL(previewUrl);
    this.profilePhotoPreviewUrl.set('');
  }

  /**
   * Estrae un messaggio di errore leggibile dalla risposta backend.
   */
  private extractErrorMessage(error: unknown, fallback: string): string {
    return extractBackendErrorMessage(error, fallback);
  }
}
