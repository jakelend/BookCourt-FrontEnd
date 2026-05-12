import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Modello usato per stampare le card degli sport nella pagina introduttiva.
 */
interface SportPreviewCard {
  /** Etichetta opzionale mostrata sopra la card, ad esempio "In Tendenza". */
  label?: string;

  /** Titolo principale della card. */
  title: string;

  /** Descrizione breve dello sport o del tipo di campo. */
  description: string;

  /** URL dell'immagine usata come anteprima. */
  imageUrl: string;

  /** Classe CSS che determina dimensione e disposizione della card. */
  layoutClass: string;
}

/**
 * Modello usato per descrivere una funzionalità gestionale del centro.
 */
interface ManagementFeature {
  /** Nome dell'icona Material mostrata nella card. */
  icon: string;

  /** Titolo della funzionalità o del ruolo gestionale. */
  title: string;

  /** Descrizione testuale mostrata all'utente. */
  description: string;
}

/**
 * Componente della pagina introduttiva pubblica.
 *
 * Presenta il servizio BookCourt, mostra gli sport disponibili e permette
 * all'utente di andare alla login o alla registrazione.
 */
@Component({
  selector: 'app-intro',
  imports: [CommonModule],
  templateUrl: './intro.component.html',
  styleUrl: './intro.component.css',
})
export class IntroComponent {
  /** Anno corrente mostrato nel footer della pagina. */
  readonly currentYear = new Date().getFullYear();

  /**
   * Card degli sport visualizzate nella pagina pubblica.
   *
   * Uso un array per evitare di ripetere tre blocchi HTML quasi uguali.
   * In questo modo, se domani aggiungiamo un nuovo sport, basta aggiungere
   * un nuovo oggetto senza cambiare la struttura del template.
   */
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

  /** Card che descrivono le principali aree gestionali dell'applicazione. */
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

  /** Naviga verso la pagina di login. */
  goToLogin(): void {
    void this.router.navigate(['/login']);
  }

  /** Naviga verso la pagina di registrazione cliente. */
  goToRegister(): void {
    void this.router.navigate(['/register']);
  }

  /**
   * Funzione trackBy usata negli ngFor del template.
   *
   * @param _ Indice dell'elemento, non necessario in questa logica.
   * @param item Elemento della lista che contiene almeno il titolo.
   * @returns Titolo dell'elemento, usato da Angular come chiave stabile.
   */
  trackByTitle(_: number, item: { title: string }): string {
    return item.title;
  }
}
