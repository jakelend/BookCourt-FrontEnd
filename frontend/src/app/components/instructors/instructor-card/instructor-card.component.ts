import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ManagerInstructorResponseDto } from '../../../dto/response/manager/manager-instructor-response.dto';

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
 * Card riutilizzabile per mostrare dati, foto, tariffe e stato di un istruttore.
 */
export class InstructorCardComponent {
  /**
   * Istruttore da visualizzare nella card.
   */
  @Input({ required: true }) instructor!: ManagerInstructorResponseDto;
  @Input() togglePending = false;
  /**
   * Eventi emessi al padre per modificare o attivare/disattivare l'istruttore.
   */
  @Output() editInstructor = new EventEmitter<ManagerInstructorResponseDto>();
  @Output() toggleInstructor = new EventEmitter<InstructorToggleEvent>();

  /**
   * Base URL usata per costruire l'indirizzo completo della foto profilo.
   */
  private readonly backendBaseUrl = 'http://localhost:8080';

  /**
   * Nome completo dell'istruttore.
   */
  get fullName(): string {
    return `${this.instructor.nome} ${this.instructor.cognome}`.trim();
  }

  /**
   * URL della foto profilo oppure immagine di default se non disponibile.
   */
  get imageUrl(): string {
    const path = this.instructor.fotoProfiloUrl;

    if (!path) {
      return '';
    }

    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    return path.startsWith('/') ? `${this.backendBaseUrl}${path}` : `${this.backendBaseUrl}/${path}`;
  }

  /**
   * Etichetta testuale dello stato attivo/inattivo.
   */
  get statusLabel(): string {
    return this.instructor.attivo ? 'Disponibile' : 'Non Disponibile';
  }

  /**
   * Tariffa tennis formattata oppure trattino se non configurata.
   */
  get tennisRateLabel(): string {
    return this.instructor.costoOrarioTennis != null ? `EUR ${this.instructor.costoOrarioTennis}/h` : '—';
  }

  /**
   * Tariffa padel formattata oppure trattino se non configurata.
   */
  get padelRateLabel(): string {
    return this.instructor.costoOrarioPadel != null ? `EUR ${this.instructor.costoOrarioPadel}/h` : '—';
  }

  /**
   * Comunica al padre la richiesta di modificare l'istruttore.
   */
  edit(): void {
    this.editInstructor.emit(this.instructor);
  }

  /**
   * Comunica al padre la richiesta di attivare o disattivare l'istruttore.
   */
  toggleActive(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.toggleInstructor.emit({
      instructor: this.instructor,
      nextActive: input.checked,
    });
  }
}
