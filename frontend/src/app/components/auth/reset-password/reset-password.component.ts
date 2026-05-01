import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService, ResetPasswordRequestDto } from '../../../services/auth.service';

@Component({
  selector: 'app-reset-password',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.css',
})
export class ResetPasswordComponent implements OnInit {
  submitted = false;
  isLoading = false;
  resetPasswordError = '';
  resetPasswordSuccess = '';
  token = '';
  showNewPassword = false;
  showConfirmNewPassword = false;

  resetPasswordForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    // Form per impostare la nuova password dopo il link ricevuto via email.
    // Controllo anche che le due password coincidano.
    this.resetPasswordForm = this.fb.group(
      {
        nuovaPassword: [
          '',
          [Validators.required, Validators.minLength(6), Validators.maxLength(72)],
        ],
        confermaNuovaPassword: ['', [Validators.required]],
      },
      { validators: this.passwordsMatchValidator },
    );
  }

  ngOnInit(): void {
    // Supporto sia /reset-password?token=... sia /reset-password/:token.
    // Così il frontend funziona anche se il backend cambia leggermente formato del link.
    const tokenFromPath = this.route.snapshot.paramMap.get('token');
    const tokenFromQuery = this.route.snapshot.queryParamMap.get('token');

    this.token = tokenFromPath || tokenFromQuery || '';

    if (!this.token) {
      this.resetPasswordError =
        'Token di recupero mancante. Apri il link ricevuto via email oppure richiedi un nuovo recupero password.';
    }
  }

  get nuovaPassword() {
    return this.resetPasswordForm.get('nuovaPassword');
  }

  get confermaNuovaPassword() {
    return this.resetPasswordForm.get('confermaNuovaPassword');
  }

  onSubmit(): void {
    this.submitted = true;
    this.resetPasswordError = '';
    this.resetPasswordSuccess = '';

    if (!this.token) {
      this.resetPasswordError =
        'Token di recupero mancante. Richiedi nuovamente il recupero password.';
      return;
    }

    if (this.resetPasswordForm.invalid) {
      this.resetPasswordForm.markAllAsTouched();
      return;
    }

    const payload: ResetPasswordRequestDto = {
      token: this.token,
      passwordNuova: this.nuovaPassword?.value ?? '',
      ripetutaPasswordNuova: this.confermaNuovaPassword?.value ?? '',
    };

    this.isLoading = true;

    this.authService
      .resetPassword(payload)
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (response) => {
          this.resetPasswordSuccess =
            response?.message || 'Password modificata correttamente. Ora puoi effettuare il login.';

          this.resetPasswordForm.reset();
          this.submitted = false;

          // Lascio leggere il messaggio di successo e poi torno automaticamente al login.
          setTimeout(() => {
            void this.router.navigate(['/login']);
          }, 1500);
        },
        error: (error) => {
          this.resetPasswordError = this.extractResetPasswordErrorMessage(error);
        },
      });
  }

  onLogin(): void {
    void this.router.navigate(['/login']);
  }

  toggleNewPasswordVisibility(): void {
    this.showNewPassword = !this.showNewPassword;
  }

  toggleConfirmNewPasswordVisibility(): void {
    this.showConfirmNewPassword = !this.showConfirmNewPassword;
  }

  private passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
    const nuovaPassword = control.get('nuovaPassword')?.value;
    const confermaNuovaPassword = control.get('confermaNuovaPassword')?.value;

    if (!nuovaPassword || !confermaNuovaPassword) {
      return null;
    }

    return nuovaPassword === confermaNuovaPassword ? null : { passwordsMismatch: true };
  }

  private extractResetPasswordErrorMessage(error: any): string {
    if (error?.error?.message) {
      return error.error.message;
    }

    if (error?.error?.fields) {
      const firstFieldError = Object.values(error.error.fields)[0];
      return String(firstFieldError);
    }

    if (error?.status === 0) {
      return 'Backend non raggiungibile. Controlla che Spring Boot sia avviato sulla porta 8080.';
    }

    if (error?.status === 400) {
      return 'Token non valido o password non corretta.';
    }

    if (error?.status === 410) {
      return 'Token scaduto. Richiedi nuovamente il recupero password.';
    }

    return 'Non è stato possibile modificare la password. Riprova.';
  }
}
