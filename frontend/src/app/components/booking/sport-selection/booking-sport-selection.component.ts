import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';

type BookingSport = 'CALCETTO' | 'PADEL' | 'TENNIS';

interface BookingStep {
  label: string;
}

interface SportOption {
  code: BookingSport;
  name: string;
  imageUrl: string;
  alt: string;
}

@Component({
  selector: 'app-booking-sport-selection',
  imports: [CommonModule],
  templateUrl: './booking-sport-selection.component.html',
  styleUrl: './booking-sport-selection.component.css',
})
export class BookingSportSelectionComponent {
  readonly currentStep = 1;

  constructor(private readonly router: Router) {}

  readonly steps: BookingStep[] = [
    { label: 'Sport' },
    { label: 'Campo' },
    { label: 'Data e ora' },
    { label: 'Extra' },
    { label: 'Riepilogo' },
    { label: 'Pagamento' },
  ];

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

  selectedSport: BookingSport | null = this.readSavedSport();

  get totalSteps(): number {
    return this.steps.length;
  }

  get progressPercentage(): number {
    return (this.currentStep / this.totalSteps) * 100;
  }

  selectSport(sport: SportOption): void {
    this.selectedSport = sport.code;
    sessionStorage.setItem('booking.selectedSport', sport.code);

    void this.router.navigate(['/dashboard/prenotazioni/campi'], {
      queryParams: { sport: sport.code },
    });
  }

  isSelected(sport: SportOption): boolean {
    return this.selectedSport === sport.code;
  }

  trackBySportCode(_: number, sport: SportOption): BookingSport {
    return sport.code;
  }

  trackByStepLabel(_: number, step: BookingStep): string {
    return step.label;
  }

  private readSavedSport(): BookingSport | null {
    const savedSport = sessionStorage.getItem('booking.selectedSport');

    if (savedSport === 'CALCETTO' || savedSport === 'PADEL' || savedSport === 'TENNIS') {
      return savedSport;
    }

    return null;
  }
}
