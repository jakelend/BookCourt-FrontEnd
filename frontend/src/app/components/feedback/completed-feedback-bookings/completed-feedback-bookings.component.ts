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
export class CompletedFeedbackBookingsComponent implements OnInit {
  readonly feedbacks = signal<FeedbackPrenotazioneResponseDto[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  readonly starIndexes = [1, 2, 3, 4, 5];

  constructor(private readonly feedbackService: FeedbackService) {}

  ngOnInit(): void {
    this.loadFeedbacks();
  }

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

  isStarActive(feedback: FeedbackPrenotazioneResponseDto, star: number): boolean {
    return star <= feedback.valutazione;
  }

  getComment(feedback: FeedbackPrenotazioneResponseDto): string {
    const commento = feedback.commento?.trim();
    return commento ? commento : 'Nessun commento inserito.';
  }

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

  trackByFeedbackId(_: number, feedback: FeedbackPrenotazioneResponseDto): number {
    return feedback.id;
  }
}
