import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { Router } from '@angular/router';

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

  constructor(private readonly router: Router) {}

  createSecretary(event: SubmitEvent): void {
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

  private revokeProfilePhotoPreview(): void {
    if (!this.profilePhotoPreviewUrl) {
      return;
    }

    URL.revokeObjectURL(this.profilePhotoPreviewUrl);
    this.profilePhotoPreviewUrl = '';
  }
}
