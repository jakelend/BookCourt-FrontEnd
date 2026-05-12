import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ManagerFieldResponseDto } from '../../../dto/response/manager/manager-field-response.dto';

export type FieldSportType = 'CALCETTO' | 'TENNIS' | 'PADEL';
export type FieldCardMode = 'management' | 'selection';

export interface FieldToggleEvent {
  field: ManagerFieldResponseDto;
  nextActive: boolean;
}

@Component({
  selector: 'app-field-card',
  imports: [CommonModule],
  templateUrl: './field-card.component.html',
  styleUrl: './field-card.component.css',
})
/**
 * Card riutilizzabile per visualizzare un campo sportivo.
 * Può lavorare sia in modalità gestione manager sia in modalità selezione campo durante la prenotazione.
 */
export class FieldCardComponent {
  /**
   * Campo da visualizzare nella card.
   */
  @Input({ required: true }) field!: ManagerFieldResponseDto;
  @Input() togglePending = false;
  /**
   * Modalità di utilizzo della card: gestione oppure selezione.
   */
  @Input() mode: FieldCardMode = 'management';

  /**
   * Eventi emessi verso il componente padre quando l'utente modifica, seleziona o attiva/disattiva il campo.
   */
  @Output() editField = new EventEmitter<ManagerFieldResponseDto>();
  @Output() toggleField = new EventEmitter<FieldToggleEvent>();
  @Output() selectField = new EventEmitter<ManagerFieldResponseDto>();

  /**
   * Base URL usata per trasformare percorsi immagine relativi in URL assoluti visualizzabili dal browser.
   */
  private readonly backendBaseUrl = 'http://localhost:8080';

  /**
   * Indica se la card è usata nel flusso di prenotazione come scelta del campo.
   */
  get isSelectionMode(): boolean {
    return this.mode === 'selection';
  }

  /**
   * Restituisce l'immagine principale del campo oppure un'immagine di default se assente.
   */
  get coverImageUrl(): string {
    const path = this.field.urlImmaginePrincipale;

    if (!path) {
      return '';
    }

    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    return path.startsWith('/') ? `${this.backendBaseUrl}${path}` : `${this.backendBaseUrl}/${path}`;
  }

  /**
   * Etichetta testuale dello stato attivo/inattivo del campo.
   */
  get statusLabel(): string {
    return this.field.attivo ? 'Disponibile' : 'Disattivo';
  }

  /**
   * Costo orario formattato in euro per la visualizzazione.
   */
  get hourlyRateLabel(): string {
    return `EUR ${this.field.costoOrario}/h`;
  }

  /**
   * Propaga al padre la richiesta di modifica del campo, evitando conflitti con il click della card.
   */
  edit(event: MouseEvent): void {
    event.stopPropagation();
    this.editField.emit(this.field);
  }

  /**
   * Se la card è selezionabile, comunica al padre il campo scelto dall'utente.
   */
  select(): void {
    if (!this.isSelectionMode || !this.field.attivo) {
      return;
    }

    this.selectField.emit(this.field);
  }

  /**
   * Permette la selezione via tastiera con Enter o Space per migliorare l'accessibilità.
   */
  onCardKeydown(event: KeyboardEvent): void {
    if (!this.isSelectionMode) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.select();
    }
  }

  /**
   * Emette l'evento di attivazione/disattivazione del campo richiesto dal manager.
   */
  toggleActive(event: Event): void {
    event.stopPropagation();

    const input = event.target as HTMLInputElement;

    this.toggleField.emit({
      field: this.field,
      nextActive: input.checked,
    });
  }
}
