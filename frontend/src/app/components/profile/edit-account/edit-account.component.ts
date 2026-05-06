import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize, map, switchMap } from 'rxjs/operators';
import { AuthService, ProfileResponseDto } from '../../../services/auth.service';
import { extractBackendErrorMessage } from '../../../util/error-message.util';

@Component({
  selector: 'app-edit-account',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './edit-account.component.html',
  styleUrl: './edit-account.component.css',
})
export class EditAccountComponent implements OnInit {
  readonly isLoadingProfile = signal(false);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  submitted = false;
  currentProfile: ProfileResponseDto | null = null;

  readonly accountForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {
    this.accountForm = this.fb.group({
      nome: ['', [Validators.required, Validators.maxLength(80)]],
      cognome: ['', [Validators.required, Validators.maxLength(80)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
      telefono: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
    });
  }

  ngOnInit(): void {
    this.loadProfile();
  }

  get nome() {
    return this.accountForm.get('nome');
  }

  get cognome() {
    return this.accountForm.get('cognome');
  }

  get email() {
    return this.accountForm.get('email');
  }

  get telefono() {
    return this.accountForm.get('telefono');
  }

  loadProfile(): void {
    this.isLoadingProfile.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.authService
      .getCurrentProfile()
      .pipe(finalize(() => this.isLoadingProfile.set(false)))
      .subscribe({
        next: (profile) => {
          this.currentProfile = profile;
          this.authService.updateCurrentUserFromProfile(profile);
          this.accountForm.patchValue({
            nome: profile.nome ?? '',
            cognome: profile.cognome ?? '',
            email: profile.email ?? '',
            telefono: profile.telefono ?? '',
          });
        },
        error: (error) => {
          this.errorMessage.set(extractBackendErrorMessage(error, 'Operazione non riuscita. Riprova.'));
        },
      });
  }

  onSubmit(): void {
    this.submitted = true;
    this.errorMessage.set('');
    this.successMessage.set('');

    if (this.accountForm.invalid) {
      this.accountForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);

    const formValue = this.accountForm.getRawValue();

    this.authService
      .updatePersonalData({
        nome: String(formValue.nome ?? '').trim(),
        cognome: String(formValue.cognome ?? '').trim(),
        email: String(formValue.email ?? '').trim(),
        telefono: String(formValue.telefono ?? '').trim(),
      })
      .pipe(
        /*
          Ordine corretto:
          1. updatePersonalData aggiorna il database;
          2. solo dopo richiamiamo /api/auth/me;
          3. AuthService aggiorna il localStorage e notifica la topbar.
        */
        switchMap((response) =>
          this.authService.refreshCurrentUserFromAuthMe().pipe(map(() => response)),
        ),
        finalize(() => this.isSaving.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.currentProfile = response.cliente;
          this.submitted = false;
          this.successMessage.set(response.message || 'Dati account aggiornati correttamente.');

          this.accountForm.patchValue({
            nome: response.cliente.nome ?? '',
            cognome: response.cliente.cognome ?? '',
            email: response.cliente.email ?? '',
            telefono: response.cliente.telefono ?? '',
          });
        },
        error: (error) => {
          this.errorMessage.set(extractBackendErrorMessage(error, 'Operazione non riuscita. Riprova.'));
        },
      });
  }

  goBackToDashboard(): void {
    void this.router.navigate(['/dashboard']);
  }
}
