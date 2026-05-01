import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-change-password',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.css',
})
export class ChangePasswordComponent {
  submitted = false;
  isLoading = false;
  changePasswordError = '';
  changePasswordSuccess = '';
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmNewPassword = false;

  changePasswordForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
  ) {
    this.changePasswordForm = this.fb.group(
      {
        currentPassword: ['', [Validators.required]],
        newPassword: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(72)]],
        confirmNewPassword: ['', [Validators.required]],
      },
      { validators: this.passwordsMatchValidator },
    );
  }

  get currentPassword() {
    return this.changePasswordForm.get('currentPassword');
  }

  get newPassword() {
    return this.changePasswordForm.get('newPassword');
  }

  get confirmNewPassword() {
    return this.changePasswordForm.get('confirmNewPassword');
  }

  onSubmit(): void {
    this.submitted = true;
    this.changePasswordError = '';
    this.changePasswordSuccess = '';

    if (this.changePasswordForm.invalid) {
      this.changePasswordForm.markAllAsTouched();
      return;
    }

    const currentUser = this.authService.getCurrentUser();

    if (!currentUser?.email) {
      this.changePasswordError = 'Sessione non valida. Effettua di nuovo il login.';
      return;
    }

    this.isLoading = true;

    this.authService
      .changePassword({
        email: currentUser.email,
        passwordCorrente: String(this.currentPassword?.value ?? ''),
        passwordNuova: String(this.newPassword?.value ?? ''),
        ripetutaPasswordNuova: String(this.confirmNewPassword?.value ?? ''),
      })
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (response) => {
          this.changePasswordSuccess = response.message || 'Password modificata correttamente.';
          this.changePasswordForm.reset();
          this.submitted = false;
        },
        error: (error) => {
          this.changePasswordError = this.extractErrorMessage(error);
        },
      });
  }

  toggleCurrentPasswordVisibility(): void {
    this.showCurrentPassword = !this.showCurrentPassword;
  }

  toggleNewPasswordVisibility(): void {
    this.showNewPassword = !this.showNewPassword;
  }

  toggleConfirmNewPasswordVisibility(): void {
    this.showConfirmNewPassword = !this.showConfirmNewPassword;
  }

  private passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('newPassword')?.value;
    const confirmNewPassword = control.get('confirmNewPassword')?.value;

    if (!newPassword || !confirmNewPassword) {
      return null;
    }

    return newPassword === confirmNewPassword ? null : { passwordsMismatch: true };
  }

  private extractErrorMessage(error: unknown): string {
    const maybeError = error as { error?: { message?: string; fields?: Record<string, string> }; status?: number };

    if (maybeError?.error?.message) {
      return maybeError.error.message;
    }

    if (maybeError?.error?.fields) {
      return Object.values(maybeError.error.fields)[0] ?? 'Cambio password non riuscito.';
    }

    if (maybeError?.status === 0) {
      return 'Backend non raggiungibile. Controlla che Spring Boot sia avviato sulla porta 8080.';
    }

    return 'Cambio password non riuscito. Controlla i dati inseriti e riprova.';
  }
}
