import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';
import type { LoginRequestDto } from '../../../dto/request/auth/login-request.dto';
import { AuthService } from '../../../services/auth.service';
import { extractBackendErrorMessage } from '../../../util/error-message.util';

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
  readonly submitted = signal(false);
  readonly isLoading = signal(false);
  readonly loginError = signal('');
  showPassword = false;
  loginForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  get email() {
    return this.loginForm.get('email');
  }

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
          Se questa seconda chiamata fallisce, il login resta comunque valido,
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

          // Se una guard aveva reindirizzato l'utente al login, dopo l'accesso
          // torno alla pagina richiesta
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

          if (returnUrl) {
            void this.router.navigateByUrl(returnUrl);
            return;
          }

          // Altrimenti porto l'utente nella dashboard prevista per il suo ruolo
          const role = this.authService.getCurrentUserRole();
          void this.router.navigateByUrl(this.authService.getRedirectUrlForRole(role));
        },
        error: (error) => {
          this.loginError.set(extractBackendErrorMessage(error, 'Email o password non validi. Riprova.'));
        },
      });
  }

  onForgotPassword(): void {
    void this.router.navigate(['/forgot-password']);
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onRegister(): void {
    void this.router.navigate(['/register']);
  }

  onPreview(): void {
    void this.router.navigate(['/preview']);
  }
}
