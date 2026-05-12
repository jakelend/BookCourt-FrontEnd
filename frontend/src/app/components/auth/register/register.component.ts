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
  /** Indica se l'utente ha provato a inviare il form. */
  submitted = false;

  /** Indica se è in corso la chiamata HTTP di registrazione. */
  isLoading = false;

  /** Messaggio di errore mostrato quando la registrazione fallisce. */
  registerError = '';

  /** Controlla la visibilità della password principale. */
  showPassword = false;

  /** Controlla la visibilità della password di conferma. */
  showConfirmPassword = false;

  /** Form reattivo con i dati necessari alla registrazione del cliente. */
  registerForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {
    /*
      Form di registrazione cliente.
      I validatori controllano campi obbligatori, formato email, telefono
      e lunghezza password prima di inviare i dati al backend.
    */
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

  /** Restituisce il controllo del nome. */
  get nome() {
    return this.registerForm.get('nome');
  }

  /** Restituisce il controllo del cognome. */
  get cognome() {
    return this.registerForm.get('cognome');
  }

  /** Restituisce il controllo dell'email. */
  get email() {
    return this.registerForm.get('email');
  }

  /** Restituisce il controllo del telefono. */
  get telefono() {
    return this.registerForm.get('telefono');
  }

  /** Restituisce il controllo della password. */
  get password() {
    return this.registerForm.get('password');
  }

  /** Restituisce il controllo della conferma password. */
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

  /** Porta l'utente alla pagina di login. */
  onLogin(): void {
    void this.router.navigate(['/login']);
  }

  /** Alterna la visualizzazione della password principale. */
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  /** Alterna la visualizzazione della conferma password. */
  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  /** Porta l'utente alla pagina pubblica di preview. */
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

  /**
   * Estrae dal backend un messaggio di errore comprensibile per la registrazione.
   *
   * @param error Errore HTTP ricevuto dalla chiamata di registrazione.
   * @returns Messaggio da visualizzare all'utente.
   */
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
