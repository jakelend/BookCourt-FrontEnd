import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { EMPTY, Observable, of } from 'rxjs';
import { catchError, finalize, switchMap, take, timeout } from 'rxjs/operators';
import { ManagerCreateSecretaryRequestDto } from '../../../dto/request/manager/manager-create-secretary-request.dto';
import { ManagerService } from '../../../services/manager.service';

@Component({
  selector: 'app-create-secretary',
  imports: [CommonModule],
  templateUrl: './create-secretary.component.html',
  styleUrl: './create-secretary.component.css',
})
export class CreateSecretaryComponent implements OnDestroy {
  @ViewChild('profilePhotoInput') private readonly profilePhotoInput?: ElementRef<HTMLInputElement>;

  profilePhotoFile: File | null = null;
  profilePhotoPreviewUrl = '';
  profilePhotoError = '';
  submitError = '';
  submitSuccess = '';
  isLoading = false;
  showPassword = false;

  constructor(
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  createSecretary(event: SubmitEvent): void {
    event.preventDefault();

    this.submitError = '';
    this.submitSuccess = '';
    this.profilePhotoError = '';

    const form = event.target as HTMLFormElement | null;

    if (!form) {
      this.submitError = 'Errore nel form. Riprova.';
      return;
    }

    const formData = new FormData(form);

    const nome = String(formData.get('nome') ?? '').trim();
    const cognome = String(formData.get('cognome') ?? '').trim();
    const email = String(formData.get('email') ?? '')
      .trim()
      .toLowerCase();
    const telefono = String(formData.get('telefono') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    if (!nome || !cognome || !email || !telefono || !password) {
      this.submitError = 'Compila tutti i campi obbligatori.';
      return;
    }

    if (!this.isValidEmail(email)) {
      this.submitError = 'Inserisci un indirizzo email valido.';
      return;
    }

    if (!/^[0-9]{10}$/.test(telefono)) {
      this.submitError = 'Il telefono deve contenere esattamente 10 cifre.';
      return;
    }

    if (password.length < 6 || password.length > 72) {
      this.submitError = 'La password deve contenere tra 6 e 72 caratteri.';
      return;
    }

    if (this.profilePhotoError) {
      this.submitError = this.profilePhotoError;
      return;
    }

    const payload: ManagerCreateSecretaryRequestDto = {
      nome,
      cognome,
      email,
      telefono,
      password,
    };

    this.isLoading = true;

    this.loadSegreterieForDuplicateCheck()
      .pipe(
        take(1),

        /*
         * Se il controllo preventivo fallisce, non blocchiamo la creazione:
         * sarà comunque il backend a bloccare email/telefono duplicati con 409.
         */
        catchError(() => of([])),

        switchMap((segretarie) => {
          const emailDuplicata = segretarie.some(
            (segretaria) =>
              String(segretaria.email ?? '')
                .trim()
                .toLowerCase() === email,
          );

          if (emailDuplicata) {
            this.submitError = 'Email già registrata. Inserisci un altro indirizzo email.';
            return EMPTY;
          }

          const telefonoDuplicato = segretarie.some(
            (segretaria) => String(segretaria.telefono ?? '').trim() === telefono,
          );

          if (telefonoDuplicato) {
            this.submitError = 'Numero di telefono già registrato. Inserisci un altro numero.';
            return EMPTY;
          }

          return this.managerService
            .creaSegreteria(payload, this.profilePhotoFile)
            .pipe(timeout(10000));
        }),

        finalize(() => {
          this.isLoading = false;
        }),
      )
      .subscribe({
        next: () => {
          this.submitSuccess = 'Segretaria creata con successo.';
          this.clearProfilePhoto();
          form.reset();

          setTimeout(() => {
            void this.router.navigate(['/dashboard/secretaries']);
          }, 300);
        },
        error: (error) => {
          this.submitError = this.extractErrorMessage(error, 'Impossibile creare la segretaria.');
        },
      });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  openProfilePhotoPicker(): void {
    this.profilePhotoInput?.nativeElement.click();
  }

  onProfilePhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.profilePhotoError = '';
    this.submitError = '';

    if (!file) {
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      this.clearProfilePhoto();
      input.value = '';
      this.profilePhotoError = 'Carica un file JPG o PNG.';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.clearProfilePhoto();
      input.value = '';
      this.profilePhotoError = 'La foto non può superare 5MB.';
      return;
    }

    this.revokeProfilePhotoPreview();
    this.profilePhotoFile = file;
    this.profilePhotoPreviewUrl = URL.createObjectURL(file);
  }

  clearProfilePhoto(): void {
    this.profilePhotoFile = null;
    this.revokeProfilePhotoPreview();

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

  private loadSegreterieForDuplicateCheck(): Observable<
    Array<{ email?: string; telefono?: string }>
  > {
    const serviceWithRefresh = this.managerService as ManagerService & {
      refreshSegreterie?: () => Observable<Array<{ email?: string; telefono?: string }>>;
    };

    if (typeof serviceWithRefresh.refreshSegreterie === 'function') {
      return serviceWithRefresh.refreshSegreterie();
    }

    return this.managerService.getSegreterie() as Observable<
      Array<{ email?: string; telefono?: string }>
    >;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private revokeProfilePhotoPreview(): void {
    if (!this.profilePhotoPreviewUrl) {
      return;
    }

    URL.revokeObjectURL(this.profilePhotoPreviewUrl);
    this.profilePhotoPreviewUrl = '';
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    const maybeError = error as {
      error?: {
        message?: string;
        fields?: Record<string, string>;
        error?: string;
      };
      status?: number;
      name?: string;
    };

    if (maybeError?.name === 'TimeoutError') {
      return 'Richiesta scaduta: il backend non ha risposto. Controlla il terminale Spring Boot.';
    }

    if (maybeError?.error?.message) {
      return maybeError.error.message;
    }

    if (maybeError?.error?.fields) {
      return Object.values(maybeError.error.fields)[0] ?? fallback;
    }

    if (maybeError?.status === 409) {
      return 'Email o numero di telefono già registrati.';
    }

    if (maybeError?.status === 400) {
      return 'Dati non validi. Controlla i campi inseriti.';
    }

    if (maybeError?.status === 401) {
      return 'Sessione scaduta. Effettua nuovamente il login.';
    }

    if (maybeError?.status === 403) {
      return 'Non hai i permessi per creare una segretaria.';
    }

    if (maybeError?.status === 0) {
      return 'Backend non raggiungibile. Controlla che Spring Boot sia avviato sulla porta 8080.';
    }

    return fallback;
  }
}
