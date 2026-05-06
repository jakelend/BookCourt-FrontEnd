import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { BookingService, PrenotazioneConfermataResponseDto } from '../../../services/booking.service';
import { extractBackendErrorMessage } from '../../../util/error-message.util';

@Component({
  selector: 'app-cancel-bookings',
  imports: [CommonModule],
  templateUrl: './cancel-bookings.component.html',
  styleUrl: './cancel-bookings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CancelBookingsComponent implements OnInit {
  readonly prenotazioni = signal<PrenotazioneConfermataResponseDto[]>([]);
  readonly isLoading = signal(false);
  readonly cancellingPrenotazioneId = signal<number | null>(null);
  readonly errorMessage = signal('');
  readonly feedbackMessage = signal('');

  private readonly cancellationLimitHours = 48;

  constructor(private readonly bookingService: BookingService) {}

  ngOnInit(): void {
    this.loadPrenotazioniFuture();
  }

  loadPrenotazioniFuture(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.feedbackMessage.set('');

    this.bookingService
      .getMiePrenotazioniFuture()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (prenotazioni) => {
          this.prenotazioni.set(prenotazioni);
        },
        error: (error) => {
          console.error('Errore caricamento prenotazioni future:', error);
          this.errorMessage.set(
            extractBackendErrorMessage(
              error,
              'Non è stato possibile caricare le prenotazioni future.',
            ),
          );
        },
      });
  }

  annullaPrenotazione(prenotazione: PrenotazioneConfermataResponseDto): void {
    if (!this.canCancel(prenotazione)) {
      this.errorMessage.set(
        'Questa prenotazione non può essere annullata: devi annullare almeno 48 ore prima dell’inizio.',
      );
      return;
    }

    const conferma = window.confirm(
      `Vuoi annullare la prenotazione del ${this.formatDate(prenotazione.inizio)} alle ${this.formatTime(prenotazione.inizio)}?`,
    );

    if (!conferma) {
      return;
    }

    this.cancellingPrenotazioneId.set(prenotazione.id);
    this.errorMessage.set('');
    this.feedbackMessage.set('');

    this.bookingService
      .annullaPrenotazione(prenotazione.id)
      .pipe(finalize(() => this.cancellingPrenotazioneId.set(null)))
      .subscribe({
        next: () => {
          this.feedbackMessage.set('Prenotazione annullata correttamente.');
          this.loadPrenotazioniFuture();
        },
        error: (error) => {
          console.error('Errore annullamento prenotazione:', error);
          this.errorMessage.set(
            extractBackendErrorMessage(
              error,
              'Non è stato possibile annullare la prenotazione.',
            ),
          );
        },
      });
  }

  canCancel(prenotazione: PrenotazioneConfermataResponseDto): boolean {
    const inizio = new Date(prenotazione.inizio).getTime();
    const adesso = Date.now();
    const limiteMs = this.cancellationLimitHours * 60 * 60 * 1000;

    return prenotazione.stato === 'CREATA' && inizio - adesso >= limiteMs;
  }

  isCancelling(prenotazioneId: number): boolean {
    return this.cancellingPrenotazioneId() === prenotazioneId;
  }

  getCancelStatusLabel(prenotazione: PrenotazioneConfermataResponseDto): string {
    if (this.canCancel(prenotazione)) {
      return 'Annullabile';
    }

    return 'Meno di 48 ore';
  }

  getCancelStatusIcon(prenotazione: PrenotazioneConfermataResponseDto): string {
    if (this.canCancel(prenotazione)) {
      return 'event_busy';
    }

    return 'lock_clock';
  }

  getCancelInfoText(prenotazione: PrenotazioneConfermataResponseDto): string {
    if (this.canCancel(prenotazione)) {
      return 'Puoi ancora annullare questa prenotazione.';
    }

    return 'Non puoi più annullarla: mancano meno di 48 ore all’inizio.';
  }


  getCampoLabel(prenotazione: PrenotazioneConfermataResponseDto): string {
    const nomeCampo =
      prenotazione.nomeCampo ??
      prenotazione.campoNome ??
      prenotazione.nomeCampoSportivo ??
      '';

    const nomePulito = nomeCampo.trim();

    if (nomePulito) {
      return nomePulito;
    }

    return `Campo #${prenotazione.campoId}`;
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

  formatCurrency(value: number | null | undefined): string {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(Number(value ?? 0));
  }

  trackByPrenotazioneId(_: number, prenotazione: PrenotazioneConfermataResponseDto): number {
    return prenotazione.id;
  }

  private formatTime(value: string): string {
    return new Date(value).toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
