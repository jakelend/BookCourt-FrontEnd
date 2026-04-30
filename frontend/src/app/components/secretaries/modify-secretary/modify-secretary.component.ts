import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

interface EditableSecretary {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  password: string;
  fotoProfiloUrl: string;
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

  secretary: EditableSecretary = {
    id: 0,
    nome: '',
    cognome: '',
    email: '',
    telefono: '',
    password: '',
    fotoProfiloUrl: '',
  };

  private readonly secretaries: EditableSecretary[] = [
    {
      id: 1,
      nome: 'Giulia',
      cognome: 'Conti',
      email: 'giulia.conti@bookcourt.it',
      telefono: '+39 333 210 4567',
      password: '',
      fotoProfiloUrl:
        'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 2,
      nome: 'Laura',
      cognome: 'Bianchi',
      email: 'laura.bianchi@bookcourt.it',
      telefono: '+39 333 654 9988',
      password: '',
      fotoProfiloUrl:
        'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 3,
      nome: 'Marta',
      cognome: 'Ferri',
      email: 'marta.ferri@bookcourt.it',
      telefono: '+39 333 900 1122',
      password: '',
      fotoProfiloUrl:
        'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=80',
    },
  ];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const secretaryId = Number(this.route.snapshot.paramMap.get('id'));
    const selectedSecretary = this.secretaries.find((secretary) => secretary.id === secretaryId);

    if (!selectedSecretary) {
      void this.router.navigate(['/dashboard/secretaries']);
      return;
    }

    this.secretary = { ...selectedSecretary };
    this.profilePhotoPreviewUrl = selectedSecretary.fotoProfiloUrl;
  }

  modifySecretary(event: SubmitEvent): void {
    event.preventDefault();
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
    this.profilePhotoPreviewUrl = this.secretary.fotoProfiloUrl;

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

  private revokeUploadedProfilePhotoPreview(): void {
    if (!this.profilePhotoFile || !this.profilePhotoPreviewUrl.startsWith('blob:')) {
      return;
    }

    URL.revokeObjectURL(this.profilePhotoPreviewUrl);
    this.profilePhotoPreviewUrl = '';
  }
}
