import { CommonModule } from '@angular/common';
import { extractBackendErrorMessage } from '../../../util/error-message.util';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ManagerFieldResponseDto } from '../../../dto/response/manager/manager-field-response.dto';
import { ManagerService } from '../../../services/manager.service';
import { FieldCardComponent, FieldToggleEvent } from '../field-card/field-card.component';

/**
 * Filtro applicabile alla lista campi in base allo stato di disponibilità.
 */
type AvailabilityFilter = 'all' | 'active' | 'inactive';

@Component({
  selector: 'app-fields-page',
  imports: [CommonModule, FieldCardComponent],
  templateUrl: './fields-page.component.html',
  styleUrl: './fields-page.component.css',
})
/**
 * Pagina di gestione dei campi sportivi del manager.
 * Carica la lista campi, applica filtri e gestisce attivazione/disattivazione dei campi.
 */
export class FieldsPageComponent implements OnInit, OnDestroy {
  fields: ManagerFieldResponseDto[] = [];
  /**
   * Filtro corrente scelto dall'utente nella UI.
   */
  availabilityFilter: AvailabilityFilter = 'all';
  /**
   * Stati della pagina: caricamento iniziale, errore di caricamento ed errore sui toggle.
   */
  loading = true;
  errorMessage = '';
  toggleError = '';
  /**
   * Richieste di toggle attive, salvate per evitare doppie operazioni sullo stesso campo.
   */
  private readonly toggleRequests = new Map<number, Subscription>();

  /**
   * Inietta router e servizio manager usati per navigazione e chiamate API.
   */
  constructor(
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * All'apertura della pagina carica i campi dal backend.
   */
  ngOnInit(): void {
    this.loadFields();
  }

  /**
   * Annulla eventuali richieste di toggle ancora attive quando la pagina viene distrutta.
   */
  ngOnDestroy(): void {
    this.toggleRequests.forEach((request) => request.unsubscribe());
    this.toggleRequests.clear();
  }

  /**
   * Porta il manager alla pagina di creazione di un nuovo campo.
   */
  addField(): void {
    void this.router.navigate(['/dashboard/fields/create']);
  }

  /**
   * Porta il manager alla pagina di modifica del campo selezionato.
   */
  modifyField(field: ManagerFieldResponseDto): void {
    void this.router.navigate(['/dashboard/fields/modify', field.id]);
  }

  /**
   * Restituisce i campi filtrati secondo il filtro attivo.
   */
  get filteredFields(): ManagerFieldResponseDto[] {
    return this.fields.filter((field) => this.matchesAvailabilityFilter(field.attivo));
  }

  /**
   * Aggiorna il filtro di visualizzazione attivo.
   */
  setAvailabilityFilter(filter: AvailabilityFilter): void {
    this.availabilityFilter = filter;
  }

  /**
   * Gestisce la richiesta di attivare o disattivare un campo dalla card.
   */
  onToggleField(event: FieldToggleEvent): void {
    this.toggleError = '';
    const previousActive = event.field.attivo;

    this.toggleRequests.get(event.field.id)?.unsubscribe();
    this.setFieldActive(event.field.id, event.nextActive);

    const request$ = event.nextActive
      ? this.managerService.riattivaCampo(event.field.id)
      : this.managerService.disattivaCampo(event.field.id);

    const request = request$.subscribe({
      next: () => {
        if (this.toggleRequests.get(event.field.id) === request) {
          this.toggleRequests.delete(event.field.id);
        }
      },
      error: (error) => {
        if (this.toggleRequests.get(event.field.id) !== request) {
          return;
        }

        this.toggleRequests.delete(event.field.id);
        this.setFieldActive(event.field.id, previousActive);
        this.toggleError = this.extractErrorMessage(error, 'Impossibile aggiornare lo stato del campo.');
      },
    });

    this.toggleRequests.set(event.field.id, request);
  }

  /**
   * Indica se per il campo indicato è già in corso una richiesta di toggle.
   */
  isToggling(id: number): boolean {
    return this.toggleRequests.has(id);
  }

  /**
   * Funzione trackBy per ottimizzare il rendering delle card campo.
   */
  trackByFieldId(_: number, field: ManagerFieldResponseDto): string {
    return String(field.id);
  }

  /**
   * Riprova il caricamento dei campi dopo un errore.
   */
  retry(): void {
    this.loadFields();
  }

  /**
   * Verifica se uno stato attivo/inattivo rispetta il filtro corrente.
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
   * Carica o aggiorna la lista campi usando il ManagerService.
   */
  private loadFields(): void {
    this.loading = true;
    this.errorMessage = '';

    this.managerService
      .getCampi()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (fields) => {
          this.fields = fields;
        },
        error: (error) => {
          this.errorMessage = this.extractErrorMessage(error, 'Impossibile caricare i campi.');
        },
      });
  }

  /**
   * Aggiorna localmente lo stato del campo dopo una risposta positiva del backend.
   */
  private setFieldActive(id: number, active: boolean): void {
    this.fields = this.fields.map((field) =>
      field.id === id
        ? {
            ...field,
            attivo: active,
          }
        : field,
    );
  }

  /**
   * Estrae un messaggio leggibile da un errore backend.
   */
  private extractErrorMessage(error: unknown, fallback: string): string {
    return extractBackendErrorMessage(error, fallback);
  }
}
