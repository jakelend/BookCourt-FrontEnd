import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { BookingSport } from '../../../dto/response/booking/booking-field-response.dto';
import { PrenotazioneConfermataResponseDto } from '../../../services/booking.service';

/**
 * Pagina finale del flusso di prenotazione.
 *
 * Recupera da sessionStorage i dati salvati al momento della conferma e
 * mostra al cliente il riepilogo conclusivo della prenotazione appena creata.
 */
@Component({
  selector: 'app-booking-confirmation',
  imports: [CommonModule],
  templateUrl: './booking-confirmation.component.html',
  styleUrl: './booking-confirmation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingConfirmationComponent implements OnInit {
  /** Prenotazione confermata restituita dal backend e salvata temporaneamente in sessionStorage. */
  readonly prenotazione = signal<PrenotazioneConfermataResponseDto | null>(null);
  /** Dati descrittivi della prenotazione usati per il riepilogo visuale. */
  readonly selectedFieldName = signal('');
  readonly selectedSport = signal<BookingSport | null>(null);
  readonly selectedInstructorName = signal('Nessun istruttore');
  readonly selectedDateTitle = signal('');
  readonly selectedTimeLabel = signal('');
  readonly selectedDurationLabel = signal('');
  readonly selectedRacketsLabel = signal('Nessuna racchetta');
  /** Costi calcolati nella preview, usati come fallback se la risposta finale non contiene tutti i dettagli. */
  readonly previewCostoCampo = signal(0);
  readonly previewCostoIstruttore = signal(0);
  readonly previewCostoRacchette = signal(0);
  readonly previewTotale = signal(0);


  /** Etichetta leggibile dello sport selezionato. */
  readonly selectedSportLabel = computed(() => {
    switch (this.selectedSport()) {
      case 'CALCETTO':
        return 'Calcetto';
      case 'PADEL':
        return 'Padel';
      case 'TENNIS':
        return 'Tennis';
      default:
        return '-';
    }
  });

  /** Totale pagato: privilegia il totale della prenotazione confermata e usa la preview come fallback. */
  readonly totalPaid = computed(() => {
    const responseTotal = Number(this.prenotazione()?.costoTotale ?? 0);

    if (responseTotal > 0) {
      return responseTotal;
    }

    return this.previewTotale();
  });

  readonly hasInstructor = computed(() => {
    return Boolean(this.prenotazione()?.istruttoreId);
  });

  readonly isExtraSport = computed(() => {
    const sport = this.selectedSport();
    return sport === 'TENNIS' || sport === 'PADEL';
  });

  /** Inietta il Router per gestire le azioni di uscita dalla pagina di conferma. */
  constructor(private readonly router: Router) {}

  /**
   * Inizializza il riepilogo di conferma.
   *
   * Se non trova una prenotazione confermata in sessionStorage, riporta il
   * cliente all'inizio del flusso di prenotazione.
   */
  ngOnInit(): void {
    this.loadConfirmationContext();

    if (!this.prenotazione()) {
      void this.router.navigate(['/dashboard/prenotazioni']);
    }
  }

  /** Pulisce i dati temporanei del flusso e torna alla dashboard principale. */
  goToDashboard(): void {
    this.clearBookingFlowData();
    void this.router.navigate(['/dashboard']);
  }

  /** Pulisce i dati temporanei e avvia una nuova prenotazione. */
  startNewBooking(): void {
    this.clearBookingFlowData();
    void this.router.navigate(['/dashboard/prenotazioni']);
  }

  /** Pulisce i dati temporanei e porta il cliente alla sezione delle proprie prenotazioni. */
  goToMyBookings(): void {
    this.clearBookingFlowData();
    void this.router.navigate(['/dashboard/profile/bookings']);
  }

  /** Format di un importo in euro per il riepilogo finale. */
  formatCurrency(value: number | null | undefined): string {
    const amount = Number(value ?? 0);

    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  }

  /** Format completo di data e ora in italiano. */
  formatDateTime(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    return new Date(value).toLocaleString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Ricostruisce il contesto della schermata di conferma leggendo sessionStorage.
   *
   * I dati vengono salvati nella preview subito dopo la conferma, così questa
   * pagina può mostrare un riepilogo completo anche dopo il redirect.
   */
  private loadConfirmationContext(): void {
    const rawReservation = sessionStorage.getItem('booking.confirmedReservation');

    if (rawReservation) {
      try {
        this.prenotazione.set(JSON.parse(rawReservation) as PrenotazioneConfermataResponseDto);
      } catch (error) {
        console.error('Prenotazione confermata non leggibile:', error);
        this.prenotazione.set(null);
      }
    }

    const sport = sessionStorage.getItem('booking.confirmedSport')
      || sessionStorage.getItem('booking.selectedSport');

    if (sport === 'CALCETTO' || sport === 'PADEL' || sport === 'TENNIS') {
      this.selectedSport.set(sport);
    }

    this.selectedFieldName.set(
      sessionStorage.getItem('booking.confirmedFieldName')
      || sessionStorage.getItem('booking.selectedFieldName')
      || '',
    );
    this.selectedInstructorName.set(
      sessionStorage.getItem('booking.confirmedInstructorName')
      || sessionStorage.getItem('booking.selectedInstructorName')
      || 'Nessun istruttore',
    );
    this.selectedDateTitle.set(
      sessionStorage.getItem('booking.confirmedDateTitle')
      || this.buildDateTitleFromReservation(),
    );
    this.selectedTimeLabel.set(
      sessionStorage.getItem('booking.confirmedTimeLabel')
      || this.buildTimeLabelFromReservation(),
    );
    this.selectedDurationLabel.set(
      sessionStorage.getItem('booking.confirmedDurationLabel')
      || this.buildDurationLabelFromReservation(),
    );
    this.selectedRacketsLabel.set(
      sessionStorage.getItem('booking.confirmedRacketsLabel')
      || this.buildRacketsLabelFromReservation(),
    );

    this.previewCostoCampo.set(Number(sessionStorage.getItem('booking.previewCostoCampo') ?? 0));
    this.previewCostoIstruttore.set(Number(sessionStorage.getItem('booking.previewCostoIstruttore') ?? 0));
    this.previewCostoRacchette.set(Number(sessionStorage.getItem('booking.previewCostoRacchette') ?? 0));
    this.previewTotale.set(Number(sessionStorage.getItem('booking.previewTotale') ?? 0));
  }

  /** Ricava il titolo della data dalla prenotazione confermata, se non già salvato. */
  private buildDateTitleFromReservation(): string {
    const inizio = this.prenotazione()?.inizio;

    if (!inizio) {
      return '-';
    }

    return new Date(inizio).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  /** Ricava l'intervallo orario dalla prenotazione confermata. */
  private buildTimeLabelFromReservation(): string {
    const prenotazione = this.prenotazione();

    if (!prenotazione?.inizio || !prenotazione?.fine) {
      return '-';
    }

    return `${this.extractTime(prenotazione.inizio)} - ${this.extractTime(prenotazione.fine)}`;
  }

  /** Calcola la durata leggibile partendo da inizio e fine prenotazione. */
  private buildDurationLabelFromReservation(): string {
    const prenotazione = this.prenotazione();

    if (!prenotazione?.inizio || !prenotazione?.fine) {
      return '-';
    }

    const start = new Date(prenotazione.inizio);
    const end = new Date(prenotazione.fine);
    const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));

    if (minutes <= 0) {
      return '-';
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0 && remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}min`;
    }

    if (hours > 0) {
      return `${hours}h`;
    }

    return `${remainingMinutes}min`;
  }

  /** Costruisce l'etichetta relativa al numero di racchette selezionate. */
  private buildRacketsLabelFromReservation(): string {
    const count = Number(this.prenotazione()?.numeroRacchette ?? 0);

    if (count <= 0) {
      return 'Nessuna racchetta';
    }

    if (count === 1) {
      return '1 racchetta';
    }

    return `${count} racchette`;
  }

  /** Estrae solo l'orario HH:mm da una data ISO. */
  private extractTime(value: string): string {
    const date = new Date(value);

    return date.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Rimuove da sessionStorage tutte le chiavi temporanee usate dal flusso di prenotazione.
   *
   * Serve a evitare che una prenotazione successiva erediti dati vecchi.
   */
  private clearBookingFlowData(): void {
    const keysToRemove = [
      'booking.selectedSport',
      'booking.selectedFieldId',
      'booking.selectedFieldName',
      'booking.selectedDate',
      'booking.startTime',
      'booking.endTime',
      'booking.durationMinutes',
      'booking.conIstruttore',
      'booking.selectedInstructorId',
      'booking.selectedInstructorName',
      'booking.selectedInstructorHourlyRate',
      'booking.racketsCount',
      'booking.racketUnitPrice',
      'booking.racketsCost',
      'booking.lockId',
      'booking.lockSignature',
      'booking.lockExpiresAt',
      'booking.previewCostoCampo',
      'booking.previewCostoIstruttore',
      'booking.previewCostoRacchette',
      'booking.previewTotale',
      'booking.confirmedReservation',
      'booking.confirmedFieldName',
      'booking.confirmedSport',
      'booking.confirmedInstructorName',
      'booking.confirmedDateTitle',
      'booking.confirmedTimeLabel',
      'booking.confirmedDurationLabel',
      'booking.confirmedRacketsLabel',
      'booking.confirmedTotal',
    ];

    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
  }
}
