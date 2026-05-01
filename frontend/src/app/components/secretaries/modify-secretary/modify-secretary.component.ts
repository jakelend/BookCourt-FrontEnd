import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { ManagerUpdateSecretaryRequestDto } from '../../../dto/request/manager/manager-create-secretary-request.dto';
import { ManagerSecretaryResponseDto } from '../../../dto/response/manager/manager-secretary-response.dto';
import { ManagerService } from '../../../services/manager.service';

interface EditableSecretary {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  fotoProfiloUrl: string | null;
}

@Component({
  selector: 'app-modify-secretary',
  imports: [CommonModule, FormsModule],
  templateUrl: './modify-secretary.component.html',
  styleUrl: './modify-secretary.component.css',
})
export class ModifySecretaryComponent implements OnInit, OnDestroy {
  @ViewChild('profilePhotoInput') private readonly profilePhotoInput?: ElementRef<HTMLInputElement>;

  profilePhotoFile: File | null = null;
  profilePhotoPreviewUrl = '';
  profilePhotoError = '';
  loading = true;
  submitError = '';
  submitSuccess = '';
  isSaving = false;

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
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (secretaries) => {
          const selectedSecretary = secretaries.find((secretary) => secretary.id === secretaryId);

          if (!selectedSecretary) {
            void this.router.navigate(['/dashboard/secretaries']);
            return;
          }

          this.hydrateSecretary(selectedSecretary);
        },
        error: () => {
          this.submitError = 'Impossibile caricare i dati della segretaria.';
        },
      });
  }

  modifySecretary(event: SubmitEvent): void {
    event.preventDefault();
    this.submitError = '';
    this.submitSuccess = '';

    if (!this.secretary.nome || !this.secretary.cognome || !this.secretary.email || !this.secretary.telefono) {
      this.submitError = 'Compila tutti i campi obbligatori.';
      return;
    }

    if (!this.isValidEmail(this.secretary.email.trim())) {
      this.submitError = 'Inserisci un indirizzo email valido.';
      return;
    }

    if (!/^[0-9]{10}$/.test(this.secretary.telefono.trim())) {
      this.submitError = 'Il telefono deve contenere esattamente 10 cifre.';
      return;
    }

    const payload: ManagerUpdateSecretaryRequestDto = {
      nome: this.secretary.nome.trim(),
      cognome: this.secretary.cognome.trim(),
      email: this.secretary.email.trim(),
      telefono: this.secretary.telefono.trim(),
    };

    this.isSaving = true;

    this.managerService
      .aggiornaSegreteria(this.secretary.id, payload, this.profilePhotoFile)
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: (updatedSecretary) => {
          this.submitSuccess = 'Segretaria aggiornata con successo.';
          this.profilePhotoFile = null;
          this.hydrateSecretary(updatedSecretary);
          void this.router.navigate(['/dashboard/secretaries']);
        },
        error: (error) => {
          this.submitError = this.extractErrorMessage(error, 'Impossibile aggiornare la segretaria.');
        },
      });
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

    this.revokeUploadedProfilePhotoPreview();
    this.profilePhotoFile = file;
    this.profilePhotoPreviewUrl = URL.createObjectURL(file);
  }

  clearProfilePhoto(): void {
    this.profilePhotoFile = null;
    this.revokeUploadedProfilePhotoPreview();
    this.profilePhotoPreviewUrl = this.buildImageUrl(this.secretary.fotoProfiloUrl);

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

    if (!this.profilePhotoFile) {
      this.profilePhotoPreviewUrl = this.buildImageUrl(secretary.fotoProfiloUrl);
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
    if (!this.profilePhotoPreviewUrl.startsWith('blob:')) {
      return;
    }

    URL.revokeObjectURL(this.profilePhotoPreviewUrl);
    this.profilePhotoPreviewUrl = '';
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
