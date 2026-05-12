import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ManagerSecretaryResponseDto } from '../../../dto/response/manager/manager-secretary-response.dto';

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
 * Card riutilizzabile per mostrare dati, foto e stato di una segretaria.
 */
export class SecretaryCardComponent implements OnChanges {
  /**
   * Segretaria da visualizzare nella card.
   */
  @Input({ required: true }) secretary!: ManagerSecretaryResponseDto;
  @Input() togglePending = false;
  /**
   * Eventi emessi al padre per modificare o attivare/disattivare la segretaria.
   */
  @Output() editSecretary = new EventEmitter<ManagerSecretaryResponseDto>();
  @Output() toggleSecretary = new EventEmitter<SecretaryToggleEvent>();

  /**
   * Base URL e immagine di fallback usate per visualizzare la foto profilo.
   */
  private readonly backendBaseUrl = 'http://localhost:8080';
  private readonly defaultProfileImagePath = 'images/default/default-image-profile.png';

  /**
   * Flag usato per mostrare le iniziali quando il caricamento dell'immagine fallisce.
   */
  imageLoadFailed = false;

  /**
   * Nome completo della segretaria.
   */
  get fullName(): string {
    return `${this.secretary.nome} ${this.secretary.cognome}`.trim();
  }

  /**
   * Iniziali mostrate quando non è disponibile una foto valida.
   */
  get initials(): string {
    const nome = this.secretary.nome?.trim() ?? '';
    const cognome = this.secretary.cognome?.trim() ?? '';

    return `${nome.charAt(0).toUpperCase()}${cognome.charAt(0).toUpperCase()}` || 'S';
  }

  /**
   * URL della foto profilo oppure immagine di default se il path non è valido.
   */
  get imageUrl(): string {
    if (this.imageLoadFailed) {
      return '';
    }

    const path = this.secretary.fotoProfiloUrl?.trim();

    if (!path || this.isInvalidImagePath(path)) {
      return '';
    }

    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    return path.startsWith('/') ? `${this.backendBaseUrl}${path}` : `${this.backendBaseUrl}/${path}`;
  }

  /**
   * Resetta lo stato di errore immagine quando cambia la segretaria visualizzata.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['secretary']) {
      this.imageLoadFailed = false;
    }
  }

  /**
   * Segna il fallimento del caricamento immagine per usare il fallback nel template.
   */
  onImageError(): void {
    this.imageLoadFailed = true;
  }

  /**
   * Etichetta dello stato attivo/inattivo.
   */
  get statusLabel(): string {
    return this.secretary.attivo ? 'Disponibile' : 'In pausa';
  }

  /**
   * Controlla se il path immagine è vuoto, placeholder o non utilizzabile.
   */
  private isInvalidImagePath(path: string): boolean {
    const normalizedPath = path.trim().toLowerCase();

    return (
      normalizedPath === 'string' ||
      normalizedPath === 'null' ||
      normalizedPath === 'undefined' ||
      normalizedPath === this.defaultProfileImagePath ||
      normalizedPath === `/${this.defaultProfileImagePath}` ||
      normalizedPath.endsWith(`/${this.defaultProfileImagePath}`)
    );
  }

  /**
   * Comunica al padre la richiesta di modificare la segretaria.
   */
  edit(): void {
    this.editSecretary.emit(this.secretary);
  }

  /**
   * Comunica al padre la richiesta di attivare/disattivare l'account segretaria.
   */
  toggleActive(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.toggleSecretary.emit({
      secretary: this.secretary,
      nextActive: input.checked,
    });
  }
}
