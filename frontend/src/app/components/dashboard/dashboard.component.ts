import { Component } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Role } from '../../enumeration/role.enum';

/**
 * Componente della pagina iniziale della dashboard autenticata.
 *
 * Mostra un messaggio di benvenuto personalizzato in base all'utente
 * autenticato e al suo ruolo applicativo.
 */
@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  constructor(private readonly authService: AuthService) {}

  /**
   * Titolo di benvenuto mostrato nella dashboard.
   *
   * Usa nome e cognome dell'utente salvato in AuthService; se non disponibile,
   * usa una dicitura generica per evitare valori vuoti nel template.
   */
  get welcomeTitle(): string {
    const user = this.authService.getCurrentUser();
    const fullName = user ? `${user.nome} ${user.cognome}` : 'Utente';

    return `Ciao ${fullName}`;
  }

  /**
   * Messaggio descrittivo sotto al titolo.
   *
   * Cambia in base al ruolo per spiegare all'utente cosa può fare
   * dalla propria area riservata.
   */
  get welcomeMessage(): string {
    switch (this.authService.getCurrentUserRole()) {
      case Role.ISTRUTTORE:
        return 'Seleziona una funzione dal menu laterale per iniziare a gestire il tuo calendario e le tue attività.';
      case Role.MANAGER:
        return 'Seleziona una funzione dal menu laterale per iniziare a gestire il centro.';
      case Role.CLIENTE:
        return 'Seleziona una funzione dal menu laterale';
      case Role.SEGRETARIA:
        return 'Seleziona una funzione dal menu laterale per iniziare a gestire il centro e le attività.';
      default:
        return 'Seleziona una funzione dal menu laterale.';
    }
  }

  /**
   * Icona mostrata nella card di benvenuto.
   *
   * Serve solo per differenziare visivamente la dashboard dei vari ruoli.
   */
  get welcomeIcon(): string {
    switch (this.authService.getCurrentUserRole()) {
      case Role.MANAGER:
        return 'dashboard_customize';
      case Role.CLIENTE:
        return 'touch_app';
      default:
        return 'ads_click';
    }
  }
}
