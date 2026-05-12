import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize, map, switchMap } from 'rxjs/operators';
import { AuthService, ProfileResponseDto } from '../../../services/auth.service';
import { extractBackendErrorMessage } from '../../../util/error-message.util';

/**
 * Componente per la modifica dei dati personali dell'account cliente.
 *
 * Carica il profilo dell'utente autenticato, popola il form e permette
 * di aggiornare nome, cognome, email e telefono mantenendo sincronizzati
 * backend, AuthService, localStorage e intestazione della dashboard.
 */
@Component({
  selector: 'app-edit-account',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './edit-account.component.html',
  styleUrl: './edit-account.component.css',
})
export class EditAccountComponent implements OnInit {
  /** Indica se è in corso il caricamento del profilo corrente. */
  readonly isLoadingProfile = signal(false);

  /** Indica se è in corso il salvataggio delle modifiche. */
  readonly isSaving = signal(false);

  /** Messaggio di errore mostrato nel template. */
  readonly errorMessage = signal('');

  /** Messaggio di successo mostrato nel template. */
  readonly successMessage = signal('');

  /** Indica se l'utente ha già provato a salvare il form. */
  submitted = false;

  /** Profilo correntemente caricato dal backend. */
  currentProfile: ProfileResponseDto | null = null;

  /** Form reattivo con i dati modificabili dell'account. */
  readonly accountForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {
    this.accountForm = this.fb.group({
      nome: ['', [Validators.required, Validators.maxLength(80)]],
      cognome: ['', [Validators.required, Validators.maxLength(80)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
      telefono: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
    });
  }

  /** All'avvio della pagina carica i dati dell'utente autenticato. */
  ngOnInit(): void {
    this.loadProfile();
  }

  /** Restituisce il controllo del nome. */
  get nome() {
    return this.accountForm.get('nome');
  }

  /** Restituisce il controllo del cognome. */
  get cognome() {
    return this.accountForm.get('cognome');
  }

  /** Restituisce il controllo dell'email. */
  get email() {
    return this.accountForm.get('email');
  }

  /** Restituisce il controllo del telefono. */
  get telefono() {
    return this.accountForm.get('telefono');
  }

  /**
   * Carica dal backend il profilo dell'utente corrente.
   *
   * Dopo il caricamento aggiorna anche AuthService, così i dati salvati
   * localmente restano allineati con quelli restituiti dal backend.
   */
  loadProfile(): void {
    this.isLoadingProfile.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.authService
      .getCurrentProfile()
      .pipe(finalize(() => this.isLoadingProfile.set(false)))
      .subscribe({
        next: (profile) => {
          this.currentProfile = profile;
          this.authService.updateCurrentUserFromProfile(profile);
          this.accountForm.patchValue({
            nome: profile.nome ?? '',
            cognome: profile.cognome ?? '',
            email: profile.email ?? '',
            telefono: profile.telefono ?? '',
          });
        },
        error: (error) => {
          this.errorMessage.set(extractBackendErrorMessage(error, 'Operazione non riuscita. Riprova.'));
        },
      });
  }

  /**
   * Gestisce il salvataggio dei dati personali.
   *
   * La sequenza è importante: prima aggiorna i dati personali, poi richiama
   * /api/auth/me tramite AuthService per rigenerare lo stato locale aggiornato.
   */
  onSubmit(): void {
    this.submitted = true;
    this.errorMessage.set('');
    this.successMessage.set('');

    if (this.accountForm.invalid) {
      this.accountForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);

    const formValue = this.accountForm.getRawValue();

    this.authService
      .updatePersonalData({
        nome: String(formValue.nome ?? '').trim(),
        cognome: String(formValue.cognome ?? '').trim(),
        email: String(formValue.email ?? '').trim(),
        telefono: String(formValue.telefono ?? '').trim(),
      })
      .pipe(
        /*
          Ordine corretto:
          1. updatePersonalData aggiorna il database;
          2. solo dopo richiamiamo /api/auth/me;
          3. AuthService aggiorna il localStorage e notifica la topbar.
        */
        switchMap((response) =>
          this.authService.refreshCurrentUserFromAuthMe().pipe(map(() => response)),
        ),
        finalize(() => this.isSaving.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.currentProfile = response.cliente;
          this.submitted = false;
          this.successMessage.set(response.message || 'Dati account aggiornati correttamente.');

          this.accountForm.patchValue({
            nome: response.cliente.nome ?? '',
            cognome: response.cliente.cognome ?? '',
            email: response.cliente.email ?? '',
            telefono: response.cliente.telefono ?? '',
          });
        },
        error: (error) => {
          this.errorMessage.set(extractBackendErrorMessage(error, 'Operazione non riuscita. Riprova.'));
        },
      });
  }

  /** Torna alla dashboard principale dell'utente. */
  goBackToDashboard(): void {
    void this.router.navigate(['/dashboard']);
  }
}
