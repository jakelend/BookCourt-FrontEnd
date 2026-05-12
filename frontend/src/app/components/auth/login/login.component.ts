import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';
import { AuthService, LoginRequestDto } from '../../../services/auth.service';

/**
 * Componente della pagina di login.
 *
 * Gestisce l'autenticazione dell'utente tramite email e password,
 * mostra eventuali errori di validazione o di risposta del backend
 * e, dopo il login, reindirizza l'utente alla pagina corretta in base al ruolo.
 */
@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  /** Indica se l'utente ha provato a inviare il form almeno una volta. */
  readonly submitted = signal(false);

  /** Indica se è in corso la chiamata HTTP di login. */
  readonly isLoading = signal(false);

  /** Messaggio di errore mostrato nella pagina in caso di login fallito. */
  readonly loginError = signal('');

  /** Controlla la visibilità della password nel campo input. */
  showPassword = false;

  /** Form reattivo contenente email e password dell'utente. */
  loginForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    /*
      Creo il form di login con validazioni lato frontend.
      Questi controlli non sostituiscono quelli del backend, ma evitano
      chiamate inutili quando i dati sono già chiaramente non validi.
    */
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  /** Restituisce il controllo del form relativo all'email. */
  get email() {
    return this.loginForm.get('email');
  }

  /** Restituisce il controllo del form relativo alla password. */
  get password() {
    return this.loginForm.get('password');
  }

  /**
   * Gestisce l'invio del form di login.
   *
   * Se il form è valido, costruisce il payload, invia le credenziali
   * al backend e aggiorna il profilo utente corrente. Alla fine della procedura
   * porta l'utente alla pagina richiesta dalla guard oppure alla dashboard del ruolo.
   */
  onSubmit(): void {
    this.submitted.set(true);
    this.loginError.set('');

    // Se il form non è valido, evidenzio tutti gli errori e non chiamo il backend.
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const payload: LoginRequestDto = {
      email: String(this.email?.value ?? '').trim(),
      password: this.password?.value ?? '',
    };

    this.isLoading.set(true);

    this.authService
      .login(payload)
      .pipe(
        /*
          Dopo il login provo a caricare il profilo completo.
          Se questa seconda chiamata fallisce, il login resta comunque valido:
          per questo motivo intercetto l'errore e restituisco null.
        */
        switchMap(() =>
          this.authService.getCurrentProfile().pipe(
            catchError(() => of(null)),
          ),
        ),
      )
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (profile) => {
          if (profile) {
            this.authService.updateCurrentUserProfilePhoto(profile.fotoProfiloUrl);
          }

          // Se una guard aveva reindirizzato l'utente al login, dopo l'accesso torno alla pagina richiesta.
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

          if (returnUrl) {
            void this.router.navigateByUrl(returnUrl);
            return;
          }

          // Altrimenti porto l'utente nella dashboard prevista per il suo ruolo.
          const role = this.authService.getCurrentUserRole();
          void this.router.navigateByUrl(this.authService.getRedirectUrlForRole(role));
        },
        error: (error) => {
          this.loginError.set(this.extractLoginErrorMessage(error));
        },
      });
  }

  /** Porta l'utente alla pagina di recupero password. */
  onForgotPassword(): void {
    void this.router.navigate(['/forgot-password']);
  }

  /** Alterna la visualizzazione della password in chiaro/nascosta. */
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  /** Porta l'utente alla pagina di registrazione cliente. */
  onRegister(): void {
    void this.router.navigate(['/register']);
  }

  /** Porta l'utente alla pagina pubblica di preview. */
  onPreview(): void {
    void this.router.navigate(['/preview']);
  }

  /**
   * Estrae un messaggio leggibile dagli errori restituiti dal backend.
   *
   * @param error Errore HTTP o errore generico ricevuto durante il login.
   * @returns Messaggio da mostrare all'utente nella pagina di login.
   */
  private extractLoginErrorMessage(error: any): string {
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

    return 'Email o password non validi. Riprova.';
  }
}
