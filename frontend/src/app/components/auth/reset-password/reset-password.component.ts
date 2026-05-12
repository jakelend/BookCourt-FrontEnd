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
  /** Indica se l'utente ha provato a inviare il form. */
  submitted = false;

  /** Indica se è in corso la chiamata HTTP di cambio password tramite token. */
  isLoading = false;

  /** Messaggio di errore mostrato quando il reset fallisce. */
  resetPasswordError = '';

  /** Messaggio di successo mostrato quando la password viene aggiornata. */
  resetPasswordSuccess = '';

  /** Token di recupero letto dal path o dalla query string. */
  token = '';

  /** Controlla la visibilità del campo nuova password. */
  showNewPassword = false;

  /** Controlla la visibilità del campo conferma nuova password. */
  showConfirmNewPassword = false;

  /** Form reattivo con nuova password e conferma nuova password. */
  resetPasswordForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    /*
      Form per impostare la nuova password dopo il link ricevuto via email.
      Oltre ai validatori base, applico un validatore custom per controllare
      che le due password inserite coincidano.
    */
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

  /** Restituisce il controllo della nuova password. */
  get nuovaPassword() {
    return this.resetPasswordForm.get('nuovaPassword');
  }

  /** Restituisce il controllo della conferma nuova password. */
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
          this.resetPasswordError = this.extractResetPasswordErrorMessage(error);
        },
      });
  }

  /** Porta l'utente alla pagina di login. */
  onLogin(): void {
    void this.router.navigate(['/login']);
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

  /**
   * Estrae un messaggio leggibile dagli errori della procedura di reset.
   *
   * @param error Errore HTTP o generico ricevuto dal backend.
   * @returns Messaggio da mostrare all'utente.
   */
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
