import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ManagerSecretaryResponseDto } from '../../../dto/response/manager/manager-secretary-response.dto';
import { ImageUrlUtil } from '../../../util/image-url.util';

/**
 * Evento emesso verso il componente padre quando cambia il toggle di stato.
 */
export interface SecretaryToggleEvent {
  secretary: ManagerSecretaryResponseDto;
  nextActive: boolean;
}

@Component({
  selector: 'app-secretary-card',
  imports: [CommonModule],
  templateUrl: './secretary-card.component.html',
  styleUrl: './secretary-card.component.css',
})
/**
 * Card singola usata nella lista delle segretarie.
 * Anche qui il salvataggio vero non viene fatto localmente ma delegato al componente padre.
 */
export class SecretaryCardComponent implements OnChanges {
  /** Dati della segretaria da visualizzare. */
  @Input({ required: true }) secretary!: ManagerSecretaryResponseDto;

  /** True quando è già partita la richiesta backend per cambiare lo stato della segretaria. */
  @Input() togglePending = false;

  /** Evento per aprire la modifica della segretaria. */
  @Output() editSecretary = new EventEmitter<ManagerSecretaryResponseDto>();

  /** Evento per chiedere al padre il cambio stato attivo/non attivo. */
  @Output() toggleSecretary = new EventEmitter<SecretaryToggleEvent>();

  /** Se la foto non si carica, il template passa al fallback con le iniziali. */
  imageLoadFailed = false;

  /** Nome completo già pronto per il template. */
  get fullName(): string {
    return `${this.secretary.nome} ${this.secretary.cognome}`.trim();
  }

  /** Iniziali mostrate quando la foto profilo non è disponibile. */
  get initials(): string {
    const nome = this.secretary.nome?.trim() ?? '';
    const cognome = this.secretary.cognome?.trim() ?? '';

    return `${nome.charAt(0).toUpperCase()}${cognome.charAt(0).toUpperCase()}` || 'S';
  }

  /**
   * Restituisce l'URL della foto già normalizzato.
   * Se il caricamento ha già fallito, ritorna stringa vuota per usare il fallback.
   */
  get imageUrl(): string {
    if (this.imageLoadFailed) {
      return '';
    }

    return ImageUrlUtil.normalizeProfileImageUrl(this.secretary.fotoProfiloUrl) ?? '';
  }

  /**
   * Quando cambia la segretaria passata in input, resetta lo stato immagine
   * così la nuova card può riprovare a caricare la foto corretta.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['secretary']) {
      this.imageLoadFailed = false;
    }
  }

  /** Segna il fallimento del caricamento foto. */
  onImageError(): void {
    this.imageLoadFailed = true;
  }

  /** Etichetta testuale dello stato della segretaria. */
  get statusLabel(): string {
    return this.secretary.attivo ? 'Disponibile' : 'In pausa';
  }

  /** Chiede al componente padre di aprire la pagina di modifica. */
  edit(): void {
    this.editSecretary.emit(this.secretary);
  }

  /** Propaga al componente padre il nuovo valore del toggle. */
  toggleActive(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.toggleSecretary.emit({
      secretary: this.secretary,
      nextActive: input.checked,
    });
  }
}
