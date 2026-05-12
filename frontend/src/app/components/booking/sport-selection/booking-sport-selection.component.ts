import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';

type BookingSport = 'CALCETTO' | 'PADEL' | 'TENNIS';

/**
 * Singolo step mostrato nella timeline del flusso di prenotazione.
 */
interface BookingStep {
  label: string;
}

/**
 * Opzione sportiva visualizzata nella prima schermata della prenotazione.
 */
interface SportOption {
  code: BookingSport;
  name: string;
  imageUrl: string;
  alt: string;
}

/**
 * Primo step della prenotazione: scelta dello sport.
 *
 * Salva lo sport selezionato in sessionStorage e porta il cliente allo step
 * successivo, dove verranno caricati i campi compatibili con quello sport.
 */
@Component({
  selector: 'app-booking-sport-selection',
  imports: [CommonModule],
  templateUrl: './booking-sport-selection.component.html',
  styleUrl: './booking-sport-selection.component.css',
})
export class BookingSportSelectionComponent {
  /** Step corrente nella timeline del wizard di prenotazione. */
  readonly currentStep = 1;

  /** Inietta il Router per passare allo step successivo dopo la selezione. */
  constructor(private readonly router: Router) {}

  /** Elenco degli step mostrati nella barra di avanzamento. */
  readonly steps: BookingStep[] = [
    { label: 'Sport' },
    { label: 'Campo' },
    { label: 'Data e ora' },
    { label: 'Extra' },
    { label: 'Riepilogo' },
    { label: 'Pagamento' },
  ];

  /** Opzioni sport disponibili nella UI di prenotazione. */
  readonly sports: SportOption[] = [
    {
      code: 'CALCETTO',
      name: 'Calcetto',
      imageUrl:
        'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=900&q=80',
      alt: 'Pallone da calcetto su campo sintetico',
    },
    {
      code: 'PADEL',
      name: 'Padel',
      imageUrl:
        'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=900&q=80',
      alt: 'Campo da padel con pareti in vetro',
    },
    {
      code: 'TENNIS',
      name: 'Tennis',
      imageUrl:
        'https://images.unsplash.com/photo-1530915365347-e35b749a0381?auto=format&fit=crop&w=900&q=80',
      alt: 'Pallina da tennis su campo in terra rossa',
    },
  ];

  /** Sport selezionato, ripristinato da sessionStorage se l'utente torna indietro nel flusso. */

  selectedSport: BookingSport | null = this.readSavedSport();

  /** Numero totale di step del wizard. */
  get totalSteps(): number {
    return this.steps.length;
  }

  /** Percentuale di avanzamento usata dalla progress bar. */
  get progressPercentage(): number {
    return (this.currentStep / this.totalSteps) * 100;
  }

  /**
   * Salva lo sport scelto e naviga alla selezione campo.
   *
   * @param sport opzione sport selezionata dal cliente.
   */
  selectSport(sport: SportOption): void {
    this.selectedSport = sport.code;
    sessionStorage.setItem('booking.selectedSport', sport.code);

    void this.router.navigate(['/dashboard/prenotazioni/campi'], {
      queryParams: { sport: sport.code },
    });
  }

  /** Verifica se una card sport corrisponde allo sport attualmente selezionato. */
  isSelected(sport: SportOption): boolean {
    return this.selectedSport === sport.code;
  }

  /** TrackBy usato da Angular per ottimizzare il rendering delle card sport. */
  trackBySportCode(_: number, sport: SportOption): BookingSport {
    return sport.code;
  }

  /** TrackBy usato per la timeline degli step. */
  trackByStepLabel(_: number, step: BookingStep): string {
    return step.label;
  }

  /**
   * Legge da sessionStorage lo sport selezionato in precedenza.
   *
   * Accetta solo valori noti, così eventuali dati sporchi non entrano nello stato del componente.
   */
  private readSavedSport(): BookingSport | null {
    const savedSport = sessionStorage.getItem('booking.selectedSport');

    if (savedSport === 'CALCETTO' || savedSport === 'PADEL' || savedSport === 'TENNIS') {
      return savedSport;
    }

    return null;
  }
}
