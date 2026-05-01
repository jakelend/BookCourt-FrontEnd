import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { ManagerUpdateInstructorRequestDto } from '../../../dto/request/manager/manager-create-instructor-request.dto';
import { ManagerInstructorResponseDto } from '../../../dto/response/manager/manager-instructor-response.dto';
import { ManagerService } from '../../../services/manager.service';

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

@Component({
  selector: 'app-modify-instructor',
  imports: [CommonModule, FormsModule],
  templateUrl: './modify-instructor.component.html',
  styleUrl: './modify-instructor.component.css',
})
export class ModifyInstructorComponent implements OnInit, OnDestroy {
  @ViewChild('profilePhotoInput') private readonly profilePhotoInput?: ElementRef<HTMLInputElement>;

  profilePhotoFile: File | null = null;
  profilePhotoPreviewUrl = '';
  profilePhotoError = '';
  loading = true;
  submitError = '';
  submitSuccess = '';
  isSaving = false;

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
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (instructors) => {
          const selectedInstructor = instructors.find((instructor) => instructor.id === instructorId);

          if (!selectedInstructor) {
            void this.router.navigate(['/dashboard/instructors']);
            return;
          }

          this.hydrateInstructor(selectedInstructor);
        },
        error: () => {
          this.submitError = "Impossibile caricare i dati dell'istruttore.";
        },
      });
  }

  modifyInstructor(event: SubmitEvent): void {
    event.preventDefault();
    this.submitError = '';
    this.submitSuccess = '';

    if (!this.instructor.nome || !this.instructor.cognome || !this.instructor.email || !this.instructor.telefono) {
      this.submitError = 'Compila tutti i campi obbligatori.';
      return;
    }

    if (!this.isValidEmail(this.instructor.email.trim())) {
      this.submitError = 'Inserisci un indirizzo email valido.';
      return;
    }

    if (!/^[0-9]{10}$/.test(this.instructor.telefono.trim())) {
      this.submitError = 'Il telefono deve contenere esattamente 10 cifre.';
      return;
    }

    if (!this.isValidOptionalRate(this.instructor.costoOrarioTennis) || !this.isValidOptionalRate(this.instructor.costoOrarioPadel)) {
      this.submitError = 'Le tariffe inserite devono essere maggiori di 0.';
      return;
    }

    if (this.instructor.costoOrarioTennis == null && this.instructor.costoOrarioPadel == null) {
      this.submitError = 'Devi impostare almeno una tariffa oraria maggiore di 0 per tennis o padel.';
      return;
    }

    const payload: ManagerUpdateInstructorRequestDto = {
      nome: this.instructor.nome.trim(),
      cognome: this.instructor.cognome.trim(),
      email: this.instructor.email.trim(),
      telefono: this.instructor.telefono.trim(),
      costoOrarioTennis: this.instructor.costoOrarioTennis,
      costoOrarioPadel: this.instructor.costoOrarioPadel,
    };

    this.isSaving = true;

    this.managerService
      .aggiornaIstruttore(this.instructor.id, payload, this.profilePhotoFile)
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: (updatedInstructor) => {
          this.submitSuccess = 'Istruttore aggiornato con successo.';
          this.profilePhotoFile = null;
          this.hydrateInstructor(updatedInstructor);
          void this.router.navigate(['/dashboard/instructors']);
        },
        error: (error) => {
          this.submitError = this.extractErrorMessage(error, "Impossibile aggiornare l'istruttore.");
        },
      });
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
    this.profilePhotoPreviewUrl = this.buildImageUrl(this.instructor.fotoProfiloUrl);

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

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isValidOptionalRate(value: number | null): boolean {
    return value == null || (Number.isFinite(Number(value)) && Number(value) > 0);
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

    if (!this.profilePhotoFile) {
      this.profilePhotoPreviewUrl = this.buildImageUrl(instructor.fotoProfiloUrl);
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
