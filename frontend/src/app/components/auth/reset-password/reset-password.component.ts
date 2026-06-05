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
import type { ResetPasswordRequestDto } from '../../../dto/request/auth/reset-password-request.dto';
import { AuthService } from '../../../services/auth.service';
import { extractBackendErrorMessage } from '../../../util/error-message.util';

/**
 * Componente della pagina di reset password.
 *
 * Viene aperto tramite il link ricevuto via email e usa il token presente
 * nella route o nella query string per impostare una nuova password.
 */
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
    this.resetPasswordForm = this.fb.group(
      {
        nuovaPassword: ['',
          [Validators.required, Validators.minLength(6), Validators.maxLength(72)],
        ],
        confermaNuovaPassword: ['', [Validators.required]],
      },
      { validators: this.passwordsMatchValidator },
    );
  }

  /**
   * All'inizializzazione legge il token dalla route.
   *
   * Il componente supporta sia il formato /reset-password/:token
   * sia il formato /reset-password?token=... .
   */
  ngOnInit(): void {
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

  /**
   * Gestisce l'invio del form di reset password.
   *
   * Se il token esiste e il form è valido, invia al backend il token
   * e la nuova password. Dopo il successo riporta automaticamente al login.
   */
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
          this.resetPasswordError = extractBackendErrorMessage(
            error,
            'Non è stato possibile modificare la password. Riprova.',
            {
              statusMessages: {
                400: 'Token non valido o password non corretta.',
                410: 'Token scaduto. Richiedi nuovamente il recupero password.',
              },
            },
          );
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

  /**
   * Validatore custom che controlla la coincidenza tra le due password.
   *
   * @param control FormGroup che contiene nuovaPassword e confermaNuovaPassword.
   * @returns null se coincidono, altrimenti errore passwordsMismatch.
   */
  private passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
    const nuovaPassword = control.get('nuovaPassword')?.value;
    const confermaNuovaPassword = control.get('confermaNuovaPassword')?.value;

    if (!nuovaPassword || !confermaNuovaPassword) {
      return null;
    }

    return nuovaPassword === confermaNuovaPassword ? null : { passwordsMismatch: true };
  }

}
