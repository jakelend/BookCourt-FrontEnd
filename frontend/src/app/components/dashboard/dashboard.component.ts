import { Component } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Role } from '../../enumeration/role.enum';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  constructor(private readonly authService: AuthService) {}

  get welcomeTitle(): string {
    const user = this.authService.getCurrentUser();
    const fullName = user ? `${user.nome} ${user.cognome}` : 'Utente';

    return `Ciao ${fullName}`;
  }

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
