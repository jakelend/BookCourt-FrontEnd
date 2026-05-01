import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';
import { ManagerCreateInstructorRequestDto } from '../../../dto/request/manager/manager-create-instructor-request.dto';
import { ManagerService } from '../../../services/manager.service';

@Component({
  selector: 'app-create-instructor',
  imports: [CommonModule],
  templateUrl: './create-instructor.component.html',
  styleUrl: './create-instructor.component.css',
})
export class CreateInstructorComponent implements OnDestroy {
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

  createInstructor(event: SubmitEvent): void {
    event.preventDefault();
    this.submitError = '';
    this.submitSuccess = '';

    const form = event.target as HTMLFormElement | null;
    if (!form) {
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

    if (!this.profilePhotoFile) {
      this.submitError = "La foto profilo dell'istruttore è obbligatoria.";
      return;
    }

    if (!nome || !cognome || !email || !telefono || !password) {
      this.submitError = 'Compila tutti i campi obbligatori.';
      return;
    }

    if (!this.isValidEmail(email)) {
      this.submitError = 'Inserisci un indirizzo email valido.';
      return;
    }

    if (password.length < 6 || password.length > 72) {
      this.submitError = 'La password deve contenere tra 6 e 72 caratteri.';
      return;
    }

    if (!/^[0-9]{10}$/.test(telefono)) {
      this.submitError = 'Il telefono deve contenere esattamente 10 cifre.';
      return;
    }

    if (costoOrarioTennis == null && costoOrarioPadel == null) {
      this.submitError = 'Devi impostare almeno una tariffa oraria maggiore di 0 per tennis o padel.';
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

    this.isLoading = true;

    this.managerService
      .creaIstruttore(payload, this.profilePhotoFile)
      .pipe(
        switchMap(() =>
          this.managerService.refreshIstruttori().pipe(
            catchError(() => of([])),
          ),
        ),
      )
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: () => {
          this.submitSuccess = 'Istruttore creato con successo.';
          this.clearProfilePhoto();
          form.reset();
          void this.router.navigate(['/dashboard/instructors']);
        },
        error: (error) => {
          this.submitError = this.extractErrorMessage(error, "Impossibile creare l'istruttore.");
        },
      });
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
    this.showPassword = !this.showPassword;
  }

  openProfilePhotoPicker(): void {
    this.profilePhotoInput?.nativeElement.click();
  }

  onProfilePhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.profilePhotoError = '';

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
    void this.router.navigate(['/dashboard/instructors']);
  }

  ngOnDestroy(): void {
    this.revokeProfilePhotoPreview();
  }

  private revokeProfilePhotoPreview(): void {
    if (!this.profilePhotoPreviewUrl) {
      return;
    }

    URL.revokeObjectURL(this.profilePhotoPreviewUrl);
    this.profilePhotoPreviewUrl = '';
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
    const maybeError = error as { error?: { message?: string; fields?: Record<string, string> }; status?: number };

    if (maybeError?.error?.message) {
      return maybeError.error.message;
    }

    if (maybeError?.error?.fields) {
      return Object.values(maybeError.error.fields)[0] ?? fallback;
    }

    if (maybeError?.status === 0) {
      return 'Backend non raggiungibile. Controlla che Spring Boot sia avviato sulla porta 8080.';
    }

    return fallback;
  }
}
