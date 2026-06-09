import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
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

/**
 * Componente per il cambio password da utente autenticato.
 *
 * A differenza del reset password, qui l'utente è già loggato e deve
 * inserire la password corrente insieme alla nuova password.
 */
@Component({
  selector: 'app-change-password',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.css',
})
export class ChangePasswordComponent {
  /** Indica se l'utente ha provato a inviare il form. */
  submitted = false;

  /** Indica se è in corso la chiamata HTTP di cambio password. */
  readonly isLoading = signal(false);

  /** Messaggio di errore mostrato nella pagina. */
  readonly changePasswordError = signal('');

  /** Messaggio di successo mostrato dopo il cambio password. */
  readonly changePasswordSuccess = signal('');

  /** Controlla la visibilità della password corrente. */
  showCurrentPassword = false;

  /** Controlla la visibilità della nuova password. */
  showNewPassword = false;

  /** Controlla la visibilità della conferma nuova password. */
  showConfirmNewPassword = false;

  /** Form reattivo usato per cambiare la password dell'utente autenticato. */
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
      { validators: [this.passwordsMatchValidator, this.newPasswordDifferentValidator] },
    );
  }

  /** Restituisce il controllo della password corrente. */
  get currentPassword() {
    return this.changePasswordForm.get('currentPassword');
  }

  /** Restituisce il controllo della nuova password. */
  get newPassword() {
    return this.changePasswordForm.get('newPassword');
  }

  /** Restituisce il controllo della conferma nuova password. */
  get confirmNewPassword() {
    return this.changePasswordForm.get('confirmNewPassword');
  }

  /**
   * Gestisce l'invio del form di cambio password.
   *
   * Recupera l'utente corrente dalla sessione locale, costruisce il payload
   * richiesto dal backend e mostra l'esito della chiamata nella pagina.
   */
  onSubmit(): void {
    this.submitted = true;
    this.changePasswordError.set('');
    this.changePasswordSuccess.set('');

    if (this.changePasswordForm.invalid) {
      this.changePasswordForm.markAllAsTouched();
      return;
    }

    const currentUser = this.authService.getCurrentUser();

    // Recupero l'email dalla sessione,
    // perche il backend deve sapere su quale account cambiare la password.
    if (!currentUser?.email) {
      this.changePasswordError.set('Sessione non valida. Effettua di nuovo il login.');
      return;
    }

    this.isLoading.set(true);

    this.authService
      .changePassword({
        email: currentUser.email,
        passwordCorrente: String(this.currentPassword?.value ?? ''),
        passwordNuova: String(this.newPassword?.value ?? ''),
        ripetutaPasswordNuova: String(this.confirmNewPassword?.value ?? ''),
      })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (response) => {
          this.changePasswordSuccess.set(response.message || 'Password modificata correttamente.');
          this.changePasswordForm.reset();
          this.submitted = false;
        },
        error: (error) => {
          this.changePasswordError.set(this.extractErrorMessage(error));
        },
      });
  }

  /** Alterna la visibilità della password corrente. */
  toggleCurrentPasswordVisibility(): void {
    this.showCurrentPassword = !this.showCurrentPassword;
  }

  /** Alterna la visibilità della nuova password. */
  toggleNewPasswordVisibility(): void {
    this.showNewPassword = !this.showNewPassword;
  }

  /** Alterna la visibilità della conferma nuova password. */
  toggleConfirmNewPasswordVisibility(): void {
    this.showConfirmNewPassword = !this.showConfirmNewPassword;
  }

  /**
   * Validatore custom che controlla la corrispondenza tra nuova password e conferma.
   *
   * @param control FormGroup contenente i campi newPassword e confirmNewPassword.
   * @returns null se coincidono, altrimenti errore passwordsMismatch.
   */
  private passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('newPassword')?.value;
    const confirmNewPassword = control.get('confirmNewPassword')?.value;

    if (!newPassword || !confirmNewPassword) {
      return null;
    }

    return newPassword === confirmNewPassword ? null : { passwordsMismatch: true };
  }

  /**
   * Validatore custom che impedisce di impostare come nuova password quella già in uso.
   *
   * @param control FormGroup contenente i campi currentPassword e newPassword.
   * @returns null se sono diverse, altrimenti errore passwordSameAsCurrent mostrato in UI.
   */
  private newPasswordDifferentValidator(control: AbstractControl): ValidationErrors | null {
    const currentPassword = control.get('currentPassword')?.value;
    const newPassword = control.get('newPassword')?.value;

    if (!currentPassword || !newPassword) {
      return null;
    }

    return currentPassword === newPassword ? { passwordSameAsCurrent: true } : null;
  }

  /**
   * Estrae un messaggio utente dagli errori della chiamata di cambio password.
   *
   * @param error Errore sconosciuto ricevuto dal backend o dal client HTTP.
   * @returns Messaggio leggibile da mostrare nel template.
   */
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
