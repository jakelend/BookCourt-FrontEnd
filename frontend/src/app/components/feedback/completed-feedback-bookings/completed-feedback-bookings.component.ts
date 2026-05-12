import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { FeedbackPrenotazioneResponseDto, FeedbackService } from '../../../services/feedback.service';
import { extractBackendErrorMessage } from '../../../util/error-message.util';

@Component({
  selector: 'app-completed-feedback-bookings',
  imports: [CommonModule],
  templateUrl: './completed-feedback-bookings.component.html',
  styleUrl: './completed-feedback-bookings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * Pagina che mostra i feedback già lasciati dal cliente sulle prenotazioni concluse.
 * Il componente si limita a caricare i dati dal servizio e a prepararli in formato leggibile per il template.
 */
export class CompletedFeedbackBookingsComponent implements OnInit {
  /**
   * Lista reattiva dei feedback già completati.
   */
  readonly feedbacks = signal<FeedbackPrenotazioneResponseDto[]>([]);
  /**
   * Stato di caricamento ed eventuale errore mostrati nella pagina.
   */
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  /**
   * Indici usati dal template per disegnare le cinque stelle della valutazione.
   */
  readonly starIndexes = [1, 2, 3, 4, 5];

  /**
   * Inietta il servizio che espone le API di feedback.
   */
  constructor(private readonly feedbackService: FeedbackService) {}

  /**
   * All'apertura della pagina carica l'elenco dei feedback completati.
   */
  ngOnInit(): void {
    this.loadFeedbacks();
  }

  /**
   * Recupera dal backend i feedback già inseriti dall'utente.
   */
  loadFeedbacks(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.feedbackService
      .getMieiFeedback()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (feedbacks) => {
          this.feedbacks.set(feedbacks);
        },
        error: (error) => {
          console.error('Errore caricamento feedback conclusi:', error);
          this.errorMessage.set(
            extractBackendErrorMessage(
              error,
              'Non è stato possibile caricare le prenotazioni concluse.',
            ),
          );
        },
      });
  }

  /**
   * Indica se una specifica stella deve risultare piena per il feedback indicato.
   */
  isStarActive(feedback: FeedbackPrenotazioneResponseDto, star: number): boolean {
    return star <= feedback.valutazione;
  }

  /**
   * Restituisce il commento del feedback oppure un testo di fallback se assente.
   */
  getComment(feedback: FeedbackPrenotazioneResponseDto): string {
    const commento = feedback.commento?.trim();
    return commento ? commento : 'Nessun commento inserito.';
  }

  /**
   * Ricava il nome del campo associato alla prenotazione recensita.
   */
  getFieldName(feedback: FeedbackPrenotazioneResponseDto): string {
    const nomeCampo = feedback.nomeCampo?.trim();

    if (nomeCampo) {
      return nomeCampo;
    }

    if (feedback.campoId) {
      return `Campo #${feedback.campoId}`;
    }

    return 'Campo non disponibile';
  }

  /**
   * Indica se nella prenotazione recensita era presente un istruttore.
   */
  hasInstructor(feedback: FeedbackPrenotazioneResponseDto): boolean {
    return !!this.getInstructorName(feedback);
  }

  /**
   * Restituisce il nome completo dell'istruttore associato al feedback.
   */
  getInstructorName(feedback: FeedbackPrenotazioneResponseDto): string {
    const nome = feedback.nomeIstruttore?.trim() ?? '';
    const cognome = feedback.cognomeIstruttore?.trim() ?? '';

    return `${nome} ${cognome}`.trim();
  }

  /**
   * Controlla se il feedback contiene gli estremi temporali della prenotazione.
   */
  hasBookingDate(feedback: FeedbackPrenotazioneResponseDto): boolean {
    return !!feedback.inizio && !!feedback.fine;
  }

  /**
   * Formatta la data della prenotazione in formato italiano.
   */
  formatBookingDate(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    return new Date(value).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  /**
   * Formatta l'intervallo orario della prenotazione recensita.
   */
  formatTimeRange(inizio: string | null | undefined, fine: string | null | undefined): string {
    if (!inizio || !fine) {
      return '-';
    }

    return `${this.formatTime(inizio)} - ${this.formatTime(fine)}`;
  }

  /**
   * Formatta data e ora in cui il feedback è stato creato.
   */
  formatCreatedAt(value: string): string {
    return new Date(value).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Funzione trackBy per evitare render inutili nella lista dei feedback.
   */
  trackByFeedbackId(_: number, feedback: FeedbackPrenotazioneResponseDto): number {
    return feedback.id;
  }

  /**
   * Estrae e formatta solo la parte oraria da una data ISO.
   */
  private formatTime(value: string): string {
    return new Date(value).toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
