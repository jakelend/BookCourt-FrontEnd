import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { finalize } from 'rxjs';
import type { PrenotazioneConfermataResponseDto } from '../../../dto/response/booking/prenotazione-confermata-response.dto';
import { BookingService } from '../../../services/booking.service';
import { extractBackendErrorMessage } from '../../../util/error-message.util';

/**
 * Componente per la consultazione e l'annullamento delle prenotazioni future del cliente.
 *
 * Mostra solo le prenotazioni future restituite dal backend e permette
 * l'annullamento rispettando la regola delle 48 ore prima dell'inizio.
 */
@Component({
  selector: 'app-cancel-bookings',
  imports: [CommonModule],
  templateUrl: './cancel-bookings.component.html',
  styleUrl: './cancel-bookings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CancelBookingsComponent implements OnInit {

  readonly prenotazioni = signal<PrenotazioneConfermataResponseDto[]>([]);

  //  Indica se è in corso il caricamento delle prenotazioni future
  readonly isLoading = signal(false);

  // Id della prenotazione che si sta annullando, usato per disabilitare solo il relativo pulsante
  readonly cancellingPrenotazioneId = signal<number | null>(null);
  readonly errorMessage = signal('');
  readonly feedbackMessage = signal('');

  private readonly cancellationLimitHours = 48;

  constructor(private readonly bookingService: BookingService) {}

  // All'apertura della pagina carica le prenotazioni future del cliente autenticato
  ngOnInit(): void {
    this.loadPrenotazioniFuture();
  }

  /**
   * Recupera dal backend le prenotazioni future del cliente.
   *
   * Aggiorna gli stati reattivi di caricamento, errore e lista dati in modo
   * che il template possa reagire automaticamente con ChangeDetection OnPush.
   */
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

  /**
   * Gestisce il click di annullamento di una prenotazione.
   *
   * Prima applica il controllo frontend delle 48 ore, poi chiede conferma
   * all'utente e infine invoca l'API di annullamento.
   *
   * @param prenotazione prenotazione selezionata dal cliente.
   */
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

  /**
   * Verifica se una prenotazione può essere annullata dal cliente.
   *
   * La prenotazione deve essere ancora nello stato CREATA e deve iniziare
   * almeno 48 ore dopo il momento attuale.
   *
   * @param prenotazione prenotazione da controllare.
   * @returns true se il pulsante di annullamento deve essere abilitato.
   */
  canCancel(prenotazione: PrenotazioneConfermataResponseDto): boolean {
    const inizio = new Date(prenotazione.inizio).getTime();
    const adesso = Date.now();
    const limiteMs = this.cancellationLimitHours * 60 * 60 * 1000;

    return prenotazione.stato === 'CREATA' && inizio - adesso >= limiteMs;
  }

  /**
   * Indica se una specifica prenotazione è quella attualmente in annullamento.
   *
   * @param prenotazioneId id della prenotazione da confrontare.
   */
  isCancelling(prenotazioneId: number): boolean {
    return this.cancellingPrenotazioneId() === prenotazioneId;
  }

  /** Restituisce l'etichetta testuale dello stato di annullabilità mostrata nella card. */
  getCancelStatusLabel(prenotazione: PrenotazioneConfermataResponseDto): string {
    if (this.canCancel(prenotazione)) {
      return 'Annullabile';
    }

    return 'Meno di 48 ore';
  }

  /** Restituisce l'icona Material coerente con lo stato di annullabilità. */
  getCancelStatusIcon(prenotazione: PrenotazioneConfermataResponseDto): string {
    if (this.canCancel(prenotazione)) {
      return 'event_busy';
    }

    return 'lock_clock';
  }

  /** Restituisce il testo informativo che spiega perché la prenotazione è o non è annullabile. */
  getCancelInfoText(prenotazione: PrenotazioneConfermataResponseDto): string {
    if (this.canCancel(prenotazione)) {
      return 'Puoi ancora annullare questa prenotazione.';
    }

    return 'Non puoi più annullarla: mancano meno di 48 ore all’inizio.';
  }


  /**
   * Costruisce il nome del campo da mostrare nella card.
   *
   * Gestisce più possibili nomi provenienti dal DTO per mantenere compatibilità
   * con risposte backend leggermente diverse.
   */
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

  /** Format della data in italiano per la visualizzazione utente. */
  formatDate(value: string): string {
    return new Date(value).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  /** Format dell'intervallo orario nel formato HH:mm - HH:mm. */
  formatTimeRange(inizio: string, fine: string): string {
    return `${this.formatTime(inizio)} - ${this.formatTime(fine)}`;
  }

  /** Format di un importo in euro. */
  formatCurrency(value: number | null | undefined): string {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(Number(value ?? 0));
  }

  /** TrackBy usato da Angular per evitare render inutili della lista prenotazioni. */
  trackByPrenotazioneId(_: number, prenotazione: PrenotazioneConfermataResponseDto): number {
    return prenotazione.id;
  }

  /** Format interno dell'ora nel formato italiano HH:mm. */
  private formatTime(value: string): string {
    return new Date(value).toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
