import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

interface EditableInstructor {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  password: string;
  costoOrarioTennis: number;
  costoOrarioPadel: number;
  fotoProfiloUrl: string;
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

  instructor: EditableInstructor = {
    id: 0,
    nome: '',
    cognome: '',
    email: '',
    telefono: '',
    password: '',
    costoOrarioTennis: 0,
    costoOrarioPadel: 0,
    fotoProfiloUrl: '',
  };

  private readonly instructors: EditableInstructor[] = [
    {
      id: 1,
      nome: 'Elena',
      cognome: 'Rodriguez',
      email: 'elena.rodriguez@bookcourt.it',
      telefono: '+39 333 111 2233',
      password: '',
      costoOrarioTennis: 75,
      costoOrarioPadel: 70,
      fotoProfiloUrl:
        'https://images.unsplash.com/photo-1544717302-de2939b7ef71?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 2,
      nome: 'Marco',
      cognome: 'Silva',
      email: 'marco.silva@bookcourt.it',
      telefono: '+39 333 444 5566',
      password: '',
      costoOrarioTennis: 65,
      costoOrarioPadel: 75,
      fotoProfiloUrl:
        'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 3,
      nome: 'Sarah',
      cognome: 'Chen',
      email: 'sarah.chen@bookcourt.it',
      telefono: '+39 333 777 8899',
      password: '',
      costoOrarioTennis: 50,
      costoOrarioPadel: 50,
      fotoProfiloUrl:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80',
    },
  ];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const instructorId = Number(this.route.snapshot.paramMap.get('id'));
    const selectedInstructor = this.instructors.find((instructor) => instructor.id === instructorId);

    if (!selectedInstructor) {
      void this.router.navigate(['/dashboard/instructors']);
      return;
    }

    this.instructor = { ...selectedInstructor };
    this.profilePhotoPreviewUrl = selectedInstructor.fotoProfiloUrl;
  }

  modifyInstructor(event: SubmitEvent): void {
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
    this.profilePhotoPreviewUrl = this.instructor.fotoProfiloUrl;

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

  private revokeUploadedProfilePhotoPreview(): void {
    if (!this.profilePhotoFile || !this.profilePhotoPreviewUrl.startsWith('blob:')) {
      return;
    }

    URL.revokeObjectURL(this.profilePhotoPreviewUrl);
    this.profilePhotoPreviewUrl = '';
  }
}
