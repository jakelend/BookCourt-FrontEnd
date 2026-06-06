import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ManagerInstructorResponseDto } from '../../../dto/response/manager/manager-instructor-response.dto';
import { ImageUrlUtil } from '../../../util/image-url.util';

/**
 * Evento emesso verso il componente padre quando l'utente cambia il toggle.
 * La card segnala solo l'intenzione di modifica, mentre il padre decide come gestirla.
 */
export interface InstructorToggleEvent {
  instructor: ManagerInstructorResponseDto;
  nextActive: boolean;
}

@Component({
  selector: 'app-instructor-card',
  imports: [CommonModule],
  templateUrl: './instructor-card.component.html',
  styleUrl: './instructor-card.component.css',
})
/**
 * Card singola usata nella schermata manager per mostrare un istruttore.
 * Qui ci sono solo logiche di visualizzazione e di emissione eventi verso il componente padre.
 */
export class InstructorCardComponent implements OnChanges {
  /** Dati dell'istruttore da visualizzare nella card. */
  @Input({ required: true }) instructor!: ManagerInstructorResponseDto;

  /** True quando il cambio stato è già stato inviato al backend e si aspetta risposta. */
  @Input() togglePending = false;

  /** Evento per aprire la pagina di modifica dell'istruttore. */
  @Output() editInstructor = new EventEmitter<ManagerInstructorResponseDto>();

  /** Evento per chiedere al padre l'attivazione o disattivazione dell'istruttore. */
  @Output() toggleInstructor = new EventEmitter<InstructorToggleEvent>();

  /** Se la foto fallisce il caricamento, il template userà il fallback con le iniziali. */
  imageLoadFailed = false;

  /** Nome completo già pronto da mostrare nella card. */
  get fullName(): string {
    return `${this.instructor.nome} ${this.instructor.cognome}`.trim();
  }

  /** Iniziali usate come fallback grafico quando manca la foto profilo. */
  get initials(): string {
    const nome = this.instructor.nome?.trim() ?? '';
    const cognome = this.instructor.cognome?.trim() ?? '';

    return `${nome.charAt(0).toUpperCase()}${cognome.charAt(0).toUpperCase()}` || 'I';
  }

  /**
   * Restituisce l'URL della foto profilo già normalizzato.
   * Se il caricamento è già fallito una volta, ritorna stringa vuota.
   */
  get imageUrl(): string {
    if (this.imageLoadFailed) {
      return '';
    }

    return ImageUrlUtil.normalizeProfileImageUrl(this.instructor.fotoProfiloUrl) ?? '';
  }

  /** Etichetta testuale dello stato corrente dell'istruttore. */
  get statusLabel(): string {
    return this.instructor.attivo ? 'Disponibile' : 'Non Disponibile';
  }

  /**
   * Quando arriva un nuovo istruttore come input, resetta lo stato dell'immagine.
   * Così la card può riprovare a mostrare la foto del nuovo elemento.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['instructor']) {
      this.imageLoadFailed = false;
    }
  }

  /** Segna il fallimento del caricamento immagine. */
  onImageError(): void {
    this.imageLoadFailed = true;
  }

  /** Testo pronto per mostrare la tariffa tennis. */
  get tennisRateLabel(): string {
    return this.instructor.costoOrarioTennis != null ? `EUR ${this.instructor.costoOrarioTennis}/h` : '—';
  }

  /** Testo pronto per mostrare la tariffa padel. */
  get padelRateLabel(): string {
    return this.instructor.costoOrarioPadel != null ? `EUR ${this.instructor.costoOrarioPadel}/h` : '—';
  }

  /** Chiede al componente padre di aprire la modifica di questo istruttore. */
  edit(): void {
    this.editInstructor.emit(this.instructor);
  }

  /** Propaga al padre il nuovo stato richiesto tramite toggle. */
  toggleActive(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.toggleInstructor.emit({
      instructor: this.instructor,
      nextActive: input.checked,
    });
  }
}
