import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { FeedbackService, PrenotazioneDaRecensireResponseDto } from '../../../services/feedback.service';
import { extractBackendErrorMessage } from '../../../util/error-message.util';

@Component({
  selector: 'app-pending-feedback-bookings',
  imports: [CommonModule, FormsModule],
  templateUrl: './pending-feedback-bookings.component.html',
  styleUrl: './pending-feedback-bookings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendingFeedbackBookingsComponent implements OnInit {
  readonly prenotazioni = signal<PrenotazioneDaRecensireResponseDto[]>([]);
  readonly selectedPrenotazioneId = signal<number | null>(null);
  readonly valutazione = signal(5);
  readonly commento = signal('');

  readonly isLoading = signal(false);
  readonly submittingPrenotazioneId = signal<number | null>(null);
  readonly errorMessage = signal('');
  readonly feedbackMessage = signal('');

  readonly ratingOptions = [1, 2, 3, 4, 5];
  readonly maxCommentLength = 500;

  readonly selectedPrenotazione = computed(() => {
    const id = this.selectedPrenotazioneId();

    if (!id) {
      return null;
    }

    return this.prenotazioni().find((prenotazione) => prenotazione.prenotazioneId === id) ?? null;
  });

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

  constructor(private readonly feedbackService: FeedbackService) {}

  ngOnInit(): void {
    this.loadPrenotazioniDaRecensire();
  }

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

  openFeedbackForm(prenotazione: PrenotazioneDaRecensireResponseDto): void {
    if (!prenotazione.recensibile || prenotazione.feedbackGiaInserito) {
      return;
    }

    this.selectedPrenotazioneId.set(prenotazione.prenotazioneId);
    this.valutazione.set(5);
    this.commento.set('');
    this.errorMessage.set('');
    this.feedbackMessage.set('');
  }

  closeFeedbackForm(): void {
    this.selectedPrenotazioneId.set(null);
    this.valutazione.set(5);
    this.commento.set('');
  }

  setRating(value: number): void {
    this.valutazione.set(value);
  }

  setComment(value: string): void {
    this.commento.set(value.slice(0, this.maxCommentLength));
  }

  submitFeedback(): void {
    const prenotazione = this.selectedPrenotazione();

    if (!prenotazione || !this.canSubmitFeedback()) {
      this.errorMessage.set('Controlla valutazione e commento prima di inviare il feedback.');
      return;
    }

    this.submittingPrenotazioneId.set(prenotazione.prenotazioneId);
    this.errorMessage.set('');
    this.feedbackMessage.set('');

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

  isFormOpen(prenotazioneId: number): boolean {
    return this.selectedPrenotazioneId() === prenotazioneId;
  }

  isSubmitting(prenotazioneId: number): boolean {
    return this.submittingPrenotazioneId() === prenotazioneId;
  }

  getBookingStatusLabel(prenotazione: PrenotazioneDaRecensireResponseDto): string {
    if (prenotazione.feedbackGiaInserito) {
      return 'Feedback già inserito';
    }

    if (prenotazione.recensibile) {
      return 'Recensibile';
    }

    return 'Non ancora conclusa';
  }

  getBookingStatusIcon(prenotazione: PrenotazioneDaRecensireResponseDto): string {
    if (prenotazione.feedbackGiaInserito) {
      return 'check_circle';
    }

    if (prenotazione.recensibile) {
      return 'rate_review';
    }

    return 'schedule';
  }

  getFieldName(prenotazione: PrenotazioneDaRecensireResponseDto): string {
    const nomeCampo = prenotazione.nomeCampo?.trim();

    if (nomeCampo) {
      return nomeCampo;
    }

    return `Campo #${prenotazione.campoId}`;
  }

  hasInstructor(prenotazione: PrenotazioneDaRecensireResponseDto): boolean {
    return !!this.getInstructorName(prenotazione);
  }

  getInstructorName(prenotazione: PrenotazioneDaRecensireResponseDto): string {
    const nome = prenotazione.nomeIstruttore?.trim() ?? '';
    const cognome = prenotazione.cognomeIstruttore?.trim() ?? '';

    return `${nome} ${cognome}`.trim();
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  formatTimeRange(inizio: string, fine: string): string {
    return `${this.formatTime(inizio)} - ${this.formatTime(fine)}`;
  }

  trackByPrenotazioneId(_: number, prenotazione: PrenotazioneDaRecensireResponseDto): number {
    return prenotazione.prenotazioneId;
  }

  private formatTime(value: string): string {
    return new Date(value).toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
