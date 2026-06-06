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
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import type { RegisterClienteRequestDto } from '../../../dto/request/auth/register-cliente-request.dto';
import { AuthService } from '../../../services/auth.service';
import { extractBackendErrorMessage } from '../../../util/error-message.util';

/**
 * Componente della pagina di registrazione cliente.
 *
 * Gestisce il form di creazione account, valida i dati inseriti,
 * controlla che password e conferma password coincidano e invia
 * la richiesta di registrazione al backend tramite AuthService.
 */
@Component({
  selector: 'app-register',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
  submitted = false;
  isLoading = false;
  registerError = '';
  showPassword = false;
  showConfirmPassword = false;
  registerForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {
    this.registerForm = this.fb.group(
      {
        nome: ['', [Validators.required]],
        cognome: ['', [Validators.required]],
        email: ['', [Validators.required, Validators.email]],
        telefono: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
        password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(72)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordsMatchValidator },
    );
  }

  get nome() {
    return this.registerForm.get('nome');
  }

  get cognome() {
    return this.registerForm.get('cognome');
  }

  get email() {
    return this.registerForm.get('email');
  }

  get telefono() {
    return this.registerForm.get('telefono');
  }

  get password() {
    return this.registerForm.get('password');
  }

  get confirmPassword() {
    return this.registerForm.get('confirmPassword');
  }

  /**
   * Gestisce l'invio del form di registrazione.
   *
   * Se il form è valido, costruisce il DTO richiesto dal backend e crea
   * un nuovo account cliente. Dopo la registrazione, l'utente viene portato
   * direttamente alla dashboard coerente con il ruolo salvato in sessione.
   */
  onSubmit(): void {
    this.submitted = true;
    this.registerError = '';

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const payload: RegisterClienteRequestDto = {
      // Tolgo eventuali spazi iniziali e finali,
      // cosi al backend mando dati gia puliti.
      nome: String(this.nome?.value ?? '').trim(),
      cognome: String(this.cognome?.value ?? '').trim(),
      email: String(this.email?.value ?? '').trim(),
      telefono: String(this.telefono?.value ?? '').trim(),
      password: this.password?.value ?? '',
    };

    this.isLoading = true;

    this.authService
      .registerCliente(payload)
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: () => {

          // Dopo la registrazione il backend restituisce già la sessione.
          // Quindi mando direttamente l'utente nella dashboard.
          const role = this.authService.getCurrentUserRole();
          void this.router.navigateByUrl(this.authService.getRedirectUrlForRole(role));
        },
        error: (error) => {
          this.registerError = extractBackendErrorMessage(
            error,
            'Registrazione non riuscita. Controlla i dati inseriti e riprova.',
            {
              statusMessages: {
                409: 'Email o telefono già registrati.',
              },
            },
          );
        },
      });
  }

  onLogin(): void {
    void this.router.navigate(['/login']);
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  onPreview(): void {
    void this.router.navigate(['/preview']);
  }

  /**
   * Validatore custom applicato all'intero form.
   *
   * @param control FormGroup contenente password e conferma password.
   * @returns null se le password coincidono, altrimenti errore passwordsMismatch.
   */
  private passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;

    if (!password || !confirmPassword) {
      return null;
    }

    return password === confirmPassword ? null : { passwordsMismatch: true };
  }

}
