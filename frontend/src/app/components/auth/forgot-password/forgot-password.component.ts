import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import type { ForgotPasswordRequestDto } from '../../../dto/request/auth/forgot-password-request.dto';
import { AuthService } from '../../../services/auth.service';
import { extractBackendErrorMessage } from '../../../util/error-message.util';

/**
 * Componente della pagina "password dimenticata".
 *
 * Permette all'utente di inserire la propria email per richiedere
 * l'invio del link di recupero password. La generazione del token
 * e l'invio dell'email sono gestiti dal backend.
 */
@Component({
  selector: 'app-forgot-password',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.css',
})
export class ForgotPasswordComponent {
  submitted = false;
  isLoading = false;
  recoveryError = '';
  recoverySuccess = '';
  forgotPasswordForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {
    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  get email() {
    return this.forgotPasswordForm.get('email');
  }

  /**
   * Gestisce l'invio della richiesta di recupero password.
   *
   * Se l'email è formalmente valida, invia il DTO al backend e mostra
   * un messaggio di conferma o di errore in base alla risposta ricevuta.
   */
  onSubmit(): void {
    this.submitted = true;
    this.recoveryError = '';
    this.recoverySuccess = '';

    if (this.forgotPasswordForm.invalid) {
      this.forgotPasswordForm.markAllAsTouched();
      return;
    }

    const payload: ForgotPasswordRequestDto = {
      // Tolgo spazi inutili dall'email prima di inviarla.
      email: String(this.email?.value ?? '').trim(),
    };

    this.isLoading = true;

    this.authService
      .forgotPassword(payload)
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (response) => {
          // Messaggio volutamente generico: non rivela se l'email esiste.
          this.recoverySuccess =
            response?.message ||
            'Se l’email è registrata, riceverai un link per creare una nuova password.';

          this.forgotPasswordForm.reset();
          this.submitted = false;
        },
        error: (error) => {
          this.recoveryError = extractBackendErrorMessage(
            error,
            'Non è stato possibile inviare l’email di recupero. Riprova.',
          );
        },
      });
  }

  onLogin(): void {
    void this.router.navigate(['/login']);
  }
}
