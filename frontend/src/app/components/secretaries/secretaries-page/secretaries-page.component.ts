import { CommonModule } from '@angular/common';
import { extractBackendErrorMessage } from '../../../util/error-message.util';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ManagerSecretaryResponseDto } from '../../../dto/response/manager/manager-secretary-response.dto';
import { ManagerService } from '../../../services/manager.service';
import { SecretaryCardComponent, SecretaryToggleEvent } from '../secretary-card/secretary-card.component';

/**
 * Filtro applicabile alla lista segretarie in base allo stato attivo/inattivo.
 */
type AvailabilityFilter = 'all' | 'active' | 'inactive';

@Component({
  selector: 'app-secretaries-page',
  imports: [CommonModule, SecretaryCardComponent],
  templateUrl: './secretaries-page.component.html',
  styleUrl: './secretaries-page.component.css',
})
/**
 * Pagina manager per la gestione delle segretarie.
 * Carica la lista, applica filtri e gestisce attivazione/disattivazione account.
 */
export class SecretariesPageComponent implements OnInit, OnDestroy {
  /**
   * Lista segretarie caricata dal backend.
   */
  secretaries: ManagerSecretaryResponseDto[] = [];
  availabilityFilter: AvailabilityFilter = 'all';
  /**
   * Stati della pagina e messaggi di errore mostrati nel template.
   */
  loading = true;
  errorMessage = '';
  toggleError = '';
  /**
   * Richieste di cambio stato in corso, indicizzate per id segretaria.
   */
  private readonly toggleRequests = new Map<number, Subscription>();

  /**
   * Inietta router e ManagerService per navigazione e chiamate API.
   */
  constructor(
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * Carica la lista segretarie all'apertura della pagina.
   */
  ngOnInit(): void {
    this.loadSecretaries();
  }

  /**
   * Annulla eventuali richieste pendenti alla distruzione del componente.
   */
  ngOnDestroy(): void {
    this.toggleRequests.forEach((request) => request.unsubscribe());
    this.toggleRequests.clear();
  }

  /**
   * Naviga alla pagina di creazione segretaria.
   */
  addSecretary(): void {
    void this.router.navigate(['/dashboard/secretaries/create']);
  }

  /**
   * Naviga alla pagina di modifica della segretaria selezionata.
   */
  modifySecretary(secretary: ManagerSecretaryResponseDto): void {
    void this.router.navigate(['/dashboard/secretaries/modify', secretary.id]);
  }

  /**
   * Restituisce le segretarie filtrate in base al filtro corrente.
   */
  get filteredSecretaries(): ManagerSecretaryResponseDto[] {
    return this.secretaries.filter((secretary) => this.matchesAvailabilityFilter(secretary.attivo));
  }

  /**
   * Aggiorna il filtro attivo.
   */
  setAvailabilityFilter(filter: AvailabilityFilter): void {
    this.availabilityFilter = filter;
  }

  /**
   * Gestisce la richiesta di attivare o disattivare una segretaria dalla card.
   */
  onToggleSecretary(event: SecretaryToggleEvent): void {
    this.toggleError = '';
    const previousActive = event.secretary.attivo;

    this.toggleRequests.get(event.secretary.id)?.unsubscribe();

    /*
      Aggiorno subito la lista a video per rendere il toggle piu reattivo.
      Se il backend risponde con errore, sotto rimetto il valore originale.
    */
    this.setSecretaryActive(event.secretary.id, event.nextActive);

    const request$ = event.nextActive
      ? this.managerService.riattivaUtente(event.secretary.id)
      : this.managerService.disattivaUtente(event.secretary.id);

    const request = request$.subscribe({
      next: () => {
        if (this.toggleRequests.get(event.secretary.id) === request) {
          this.toggleRequests.delete(event.secretary.id);
        }
      },
      error: (error) => {
        if (this.toggleRequests.get(event.secretary.id) !== request) {
          return;
        }

        this.toggleRequests.delete(event.secretary.id);
        this.setSecretaryActive(event.secretary.id, previousActive);
        this.toggleError = this.extractErrorMessage(error, 'Impossibile aggiornare lo stato della segretaria.');
      },
    });

    this.toggleRequests.set(event.secretary.id, request);
  }

  /**
   * Indica se per quella segretaria è già in corso una richiesta di toggle.
   */
  isToggling(id: number): boolean {
    return this.toggleRequests.has(id);
  }

  /**
   * Funzione trackBy per ottimizzare la lista card segretarie.
   */
  trackBySecretaryId(_: number, secretary: ManagerSecretaryResponseDto): string {
    return String(secretary.id);
  }

  /**
   * Riprova il caricamento dopo un errore.
   */
  retry(): void {
    this.loadSecretaries();
  }

  /**
   * Verifica se lo stato della segretaria rispetta il filtro corrente.
   */
  private matchesAvailabilityFilter(active: boolean): boolean {
    if (this.availabilityFilter === 'active') {
      return active;
    }

    if (this.availabilityFilter === 'inactive') {
      return !active;
    }

    return true;
  }

  /**
   * Carica o aggiorna la lista segretarie tramite ManagerService.
   */
  private loadSecretaries(): void {
    this.loading = true;
    this.errorMessage = '';

    this.managerService
      .getSegreterie()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (secretaries) => {
          this.secretaries = secretaries;
        },
        error: (error) => {
          this.errorMessage = this.extractErrorMessage(error, 'Impossibile caricare le segretarie.');
        },
      });
  }

  /**
   * Aggiorna localmente lo stato della segretaria dopo il successo backend.
   */
  private setSecretaryActive(id: number, active: boolean): void {
    this.secretaries = this.secretaries.map((secretary) =>
      secretary.id === id
        ? {
            ...secretary,
            attivo: active,
          }
        : secretary,
    );
  }

  /**
   * Estrae un messaggio di errore leggibile dal backend.
   */
  private extractErrorMessage(error: unknown, fallback: string): string {
    return extractBackendErrorMessage(error, fallback);
  }
}
