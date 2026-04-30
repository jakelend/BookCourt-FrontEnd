import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';

interface SportPreviewCard {
  label?: string;
  title: string;
  description: string;
  imageUrl: string;
  layoutClass: string;
}

interface ManagementFeature {
  icon: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-preview',
  imports: [CommonModule],
  templateUrl: './preview.component.html',
  styleUrl: './preview.component.css',
})
export class PreviewComponent {
  readonly currentYear = new Date().getFullYear();

  // Uso un array per evitare di ripetere tre blocchi HTML quasi uguali.
  // In questo modo, se domani aggiungiamo un nuovo sport, basta aggiungere un oggetto qui.
  readonly sportCards: SportPreviewCard[] = [
    {
      label: 'Calcetto',
      title: 'Campi da Calcio',
      description:
        'Prenota campi in erba sintetica premium per partite tra amici e tornei settimanali.',
      imageUrl:
        'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1400&q=80',
      layoutClass: 'sport-card-large',
    },
    {
      label: 'In Tendenza',
      title: 'Campi da Padel',
      description: 'Scopri lo sport in più rapida crescita con campi moderni e manto perfetto.',
      imageUrl:
        'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1000&q=80',
      layoutClass: 'sport-card-small',
    },
    {
      title: 'Campi da Tennis',
      description: 'Terra rossa, cemento o erba: scegli la superficie più adatta alla tua partita.',
      imageUrl:
        'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80',
      layoutClass: 'sport-card-medium',
    },
  ];

  readonly managementFeatures: ManagementFeature[] = [
    {
      icon: 'admin_panel_settings',
      title: 'Direttore del Centro',
      description:
        'Gestisce campi, account del personale, immagini e configurazioni principali del centro sportivo.',
    },
    {
      icon: 'support_agent',
      title: 'Segreteria',
      description:
        'Gestisce manutenzioni, eccezioni di orario, prenotazioni impattate e chat con i clienti.',
    },
    {
      icon: 'sports_tennis',
      title: 'Dashboard Istruttore',
      description:
        'Consulta lezioni giornaliere, indisponibilità e slot in cui può essere assegnato.',
    },
  ];

  constructor(private readonly router: Router) {}

  goToLogin(): void {
    // Navigazione semplice verso la pagina di login.
    void this.router.navigate(['/login']);
  }

  goToRegister(): void {
    // Navigazione semplice verso la pagina di registrazione.
    void this.router.navigate(['/register']);
  }

  trackByTitle(_: number, item: { title: string }): string {
    // trackBy utile per far lavorare meglio Angular quando stampa liste con ngFor.
    return item.title;
  }
}
