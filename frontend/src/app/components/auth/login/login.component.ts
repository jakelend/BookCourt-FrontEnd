import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';
import { AuthService, LoginRequestDto } from '../../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  submitted = false;
  isLoading = false;
  loginError = '';

  loginForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    // Creo il form di login con i controlli principali.
    // Le validazioni base vengono fatte già lato frontend per migliorare l'esperienza utente.
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

  onSubmit(): void {
    this.submitted = true;
    this.loginError = '';

    // Se il form non è valido, evidenzio tutti gli errori e non chiamo il backend.
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const payload: LoginRequestDto = {
      email: String(this.email?.value ?? '').trim(),
      password: this.password?.value ?? '',
    };

    this.isLoading = true;

    this.authService
      .login(payload)
      .pipe(
        switchMap(() =>
          this.authService.getCurrentProfile().pipe(
            catchError(() => of(null)),
          ),
        ),
      )
      .pipe(finalize(() => (this.isLoading = false)))
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
          this.loginError = this.extractLoginErrorMessage(error);
        },
      });
  }

  onForgotPassword(): void {
    // Collegamento alla pagina dove l'utente inserisce l'email per il recupero password.
    void this.router.navigate(['/forgot-password']);
  }

  onRegister(): void {
    void this.router.navigate(['/register']);
  }

  onPreview(): void {
    void this.router.navigate(['/preview']);
  }

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
