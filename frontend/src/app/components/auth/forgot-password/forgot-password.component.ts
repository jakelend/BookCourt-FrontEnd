import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService, ForgotPasswordRequestDto } from '../../../services/auth.service';

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
  /** Indica se l'utente ha provato a inviare il form. */
  submitted = false;

  /** Indica se è in corso la chiamata HTTP di recupero password. */
  isLoading = false;

  /** Messaggio di errore mostrato quando la richiesta fallisce. */
  recoveryError = '';

  /** Messaggio di conferma mostrato quando la richiesta viene accettata. */
  recoverySuccess = '';

  /** Form reattivo contenente solo l'email dell'utente. */
  forgotPasswordForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {
    /*
      In questa pagina serve solo l'email.
      Il backend poi genera il token e invia il link per cambiare la password.
    */
    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  /** Restituisce il controllo del form relativo all'email. */
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
      email: String(this.email?.value ?? '').trim(),
    };

    this.isLoading = true;

    this.authService
      .forgotPassword(payload)
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (response) => {
          // Messaggio volutamente generico: evita di dire chiaramente se l'email esiste oppure no.
          this.recoverySuccess =
            response?.message ||
            'Se l’email è registrata, riceverai un link per creare una nuova password.';

          this.forgotPasswordForm.reset();
          this.submitted = false;
        },
        error: (error) => {
          this.recoveryError = this.extractRecoveryErrorMessage(error);
        },
      });
  }

  /** Porta l'utente alla pagina di login. */
  onLogin(): void {
    void this.router.navigate(['/login']);
  }

  /**
   * Estrae un messaggio leggibile dagli errori della richiesta di recupero.
   *
   * @param error Errore HTTP o generico restituito dal backend.
   * @returns Messaggio da mostrare nella pagina.
   */
  private extractRecoveryErrorMessage(error: any): string {
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

    return 'Non è stato possibile inviare l’email di recupero. Riprova.';
  }
}
