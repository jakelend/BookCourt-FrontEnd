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
import { AuthService, RegisterClienteRequestDto } from '../../../services/auth.service';

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
    // Form di registrazione cliente.
    // Qui faccio i controlli principali prima di inviare i dati al backend.
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

  onSubmit(): void {
    this.submitted = true;
    this.registerError = '';

    // Se almeno un campo non rispetta le validazioni, non invio nulla al backend.
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const payload: RegisterClienteRequestDto = {
      nome: String(this.nome?.value ?? '').trim(),
      cognome: String(this.cognome?.value ?? '').trim(),
      email: String(this.email?.value ?? '').trim(),
      telefono: String(this.telefono?.value ?? '').trim(),
      password: this.password?.value ?? '',
      fotoProfiloUrl: null,
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
          this.registerError = this.extractRegisterErrorMessage(error);
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

  private passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;

    if (!password || !confirmPassword) {
      return null;
    }

    return password === confirmPassword ? null : { passwordsMismatch: true };
  }

  private extractRegisterErrorMessage(error: any): string {
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

    if (error?.status === 409) {
      return 'Email o telefono già registrati.';
    }

    return 'Registrazione non riuscita. Controlla i dati inseriti e riprova.';
  }
}
