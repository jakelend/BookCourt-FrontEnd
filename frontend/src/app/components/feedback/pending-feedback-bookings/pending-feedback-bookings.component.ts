import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import type { PrenotazioneDaRecensireResponseDto } from '../../../dto/response/feedback/prenotazione-da-recensire-response.dto';
import { FeedbackService } from '../../../services/feedback.service';
import { extractBackendErrorMessage } from '../../../util/error-message.util';

@Component({
  selector: 'app-pending-feedback-bookings',
  imports: [CommonModule, FormsModule],
  templateUrl: './pending-feedback-bookings.component.html',
  styleUrl: './pending-feedback-bookings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * Pagina delle prenotazioni concluse che possono ancora essere recensite.
 * Gestisce apertura del form, rating, commento e invio del feedback al backend.
 */
export class PendingFeedbackBookingsComponent implements OnInit {
  /**
   * Lista reattiva delle prenotazioni per cui il cliente può lasciare un feedback.
   */
  readonly prenotazioni = signal<PrenotazioneDaRecensireResponseDto[]>([]);
  /**
   * Id della prenotazione per cui il form di feedback è attualmente aperto.
   */
  readonly selectedPrenotazioneId = signal<number | null>(null);
  /**
   * Valutazione selezionata dall'utente; parte da 5 stelle come valore predefinito.
   */
  readonly valutazione = signal(5);
  readonly commento = signal('');

  /**
   * Stati di caricamento, invio ed eventuali messaggi mostrati nel template.
   */
  readonly isLoading = signal(false);
  readonly submittingPrenotazioneId = signal<number | null>(null);
  readonly errorMessage = signal('');
  readonly feedbackMessage = signal('');

  /**
   * Valori possibili della valutazione visualizzati come stelle o pulsanti nel template.
   */
  readonly ratingOptions = [1, 2, 3, 4, 5];
  readonly maxCommentLength = 500;

  /**
   * Prenotazione selezionata ricavata automaticamente dall'id salvato nel signal.
   */
  readonly selectedPrenotazione = computed(() => {
    const id = this.selectedPrenotazioneId();

    if (!id) {
      return null;
    }

    return this.prenotazioni().find((prenotazione) => prenotazione.prenotazioneId === id) ?? null;
  });

  /**
   * Indica se il form contiene dati validi e può essere inviato.
   */
  readonly canSubmitFeedback = computed(() => {
    const prenotazione = this.selectedPrenotazione();
    const valutazione = this.valutazione();
    const commento = this.commento();

    return (
      !!prenotazione &&
      prenotazione.recensibile &&
      !prenotazione.feedbackGiaInserito &&
      valutazione >= 1 &&
      valutazione <= 5 &&
      commento.length <= this.maxCommentLength &&
      this.submittingPrenotazioneId() === null
    );
  });

  /**
   * Inietta il servizio che gestisce le chiamate API dei feedback.
   */
  constructor(private readonly feedbackService: FeedbackService) {}

  /**
   * All'apertura della pagina carica le prenotazioni ancora da recensire.
   */
  ngOnInit(): void {
    this.loadPrenotazioniDaRecensire();
  }

  /**
   * Carica dal backend le prenotazioni concluse che non hanno ancora un feedback.
   */
  loadPrenotazioniDaRecensire(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.feedbackMessage.set('');

    this.feedbackService
      .getPrenotazioniDaRecensire()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (prenotazioni) => {
          this.prenotazioni.set(prenotazioni);
        },
        error: (error) => {
          console.error('Errore caricamento prenotazioni da recensire:', error);
          this.errorMessage.set(
            extractBackendErrorMessage(
              error,
              'Non è stato possibile caricare le prenotazioni da recensire.',
            ),
          );
        },
      });
  }

  /**
   * Apre il form di feedback per la prenotazione scelta e resetta i campi del form.
   */
  openFeedbackForm(prenotazione: PrenotazioneDaRecensireResponseDto): void {
    if (!prenotazione.recensibile || prenotazione.feedbackGiaInserito) {
      return;
    }

    // Quando apro il form riparto pulito,
    // cosi non mi porto dietro voto o testo della prenotazione prima.
    this.selectedPrenotazioneId.set(prenotazione.prenotazioneId);
    this.valutazione.set(5);
    this.commento.set('');
    this.errorMessage.set('');
    this.feedbackMessage.set('');
  }

  /**
   * Chiude il form di feedback e ripulisce lo stato locale della selezione.
   */
  closeFeedbackForm(): void {
    this.selectedPrenotazioneId.set(null);
    this.valutazione.set(5);
    this.commento.set('');
  }

  /**
   * Aggiorna la valutazione selezionata dall'utente.
   */
  setRating(value: number): void {
    this.valutazione.set(value);
  }

  /**
   * Aggiorna il commento limitandolo alla lunghezza massima consentita.
   */
  setComment(value: string): void {
    this.commento.set(value.slice(0, this.maxCommentLength));
  }

  /**
   * Invia il feedback al backend per la prenotazione selezionata.
   * Dopo il successo rimuove la prenotazione dalla lista delle recensioni pendenti.
   */
  submitFeedback(): void {
    const prenotazione = this.selectedPrenotazione();

    if (!prenotazione || !this.canSubmitFeedback()) {
      this.errorMessage.set('Controlla valutazione e commento prima di inviare il feedback.');
      return;
    }

    this.submittingPrenotazioneId.set(prenotazione.prenotazioneId);
    this.errorMessage.set('');
    this.feedbackMessage.set('');

    // Tolgo spazi inutili dal commento,
    // ma non lo rendo obbligatorio: anche il solo voto ha senso.
    this.feedbackService
      .creaFeedback(prenotazione.prenotazioneId, {
        valutazione: this.valutazione(),
        commento: this.commento().trim(),
      })
      .pipe(finalize(() => this.submittingPrenotazioneId.set(null)))
      .subscribe({
        next: () => {
          this.feedbackMessage.set('Feedback inviato correttamente.');
          this.closeFeedbackForm();
          this.loadPrenotazioniDaRecensire();
        },
        error: (error) => {
          console.error('Errore invio feedback:', error);
          this.errorMessage.set(
            extractBackendErrorMessage(
              error,
              'Non è stato possibile inviare il feedback.',
            ),
          );
        },
      });
  }

  /**
   * Indica se il form è aperto per una determinata prenotazione.
   */
  isFormOpen(prenotazioneId: number): boolean {
    return this.selectedPrenotazioneId() === prenotazioneId;
  }

  /**
   * Indica se è in corso l'invio del feedback per una specifica prenotazione.
   */
  isSubmitting(prenotazioneId: number): boolean {
    return this.submittingPrenotazioneId() === prenotazioneId;
  }

  /**
   * Restituisce un'etichetta leggibile per lo stato della prenotazione.
   */
  getBookingStatusLabel(prenotazione: PrenotazioneDaRecensireResponseDto): string {
    if (prenotazione.feedbackGiaInserito) {
      return 'Feedback già inserito';
    }

    if (prenotazione.recensibile) {
      return 'Recensibile';
    }

    return 'Non ancora conclusa';
  }

  /**
   * Restituisce l'icona da associare allo stato della prenotazione.
   */
  getBookingStatusIcon(prenotazione: PrenotazioneDaRecensireResponseDto): string {
    if (prenotazione.feedbackGiaInserito) {
      return 'check_circle';
    }

    if (prenotazione.recensibile) {
      return 'rate_review';
    }

    return 'schedule';
  }

  /**
   * Ricava il nome del campo dalla prenotazione da recensire.
   */
  getFieldName(prenotazione: PrenotazioneDaRecensireResponseDto): string {
    const nomeCampo = prenotazione.nomeCampo?.trim();

    if (nomeCampo) {
      return nomeCampo;
    }

    return `Campo #${prenotazione.campoId}`;
  }

  /**
   * Indica se la prenotazione aveva un istruttore associato.
   */
  hasInstructor(prenotazione: PrenotazioneDaRecensireResponseDto): boolean {
    return !!this.getInstructorName(prenotazione);
  }

  /**
   * Restituisce il nome completo dell'istruttore della prenotazione.
   */
  getInstructorName(prenotazione: PrenotazioneDaRecensireResponseDto): string {
    const nome = prenotazione.nomeIstruttore?.trim() ?? '';
    const cognome = prenotazione.cognomeIstruttore?.trim() ?? '';

    return `${nome} ${cognome}`.trim();
  }

  /**
   * Formatta la data della prenotazione in italiano.
   */
  formatDate(value: string): string {
    return new Date(value).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  /**
   * Formatta l'intervallo orario della prenotazione.
   */
  formatTimeRange(inizio: string, fine: string): string {
    return `${this.formatTime(inizio)} - ${this.formatTime(fine)}`;
  }

  /**
   * Funzione trackBy per ottimizzare il rendering della lista prenotazioni.
   */
  trackByPrenotazioneId(_: number, prenotazione: PrenotazioneDaRecensireResponseDto): number {
    return prenotazione.prenotazioneId;
  }

  /**
   * Estrae l'orario da una stringa data/ora ISO.
   */
  private formatTime(value: string): string {
    return new Date(value).toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
