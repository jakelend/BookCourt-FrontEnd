import { Component } from '@angular/core';

/**
 * Componente della pagina iniziale della dashboard autenticata.
 *
 * La dashboard viene mantenuta come area vuota di appoggio:
 * il layout principale resta gestito da SidebarHeaderComponent,
 * mentre le funzionalità reali vengono aperte dal menu laterale.
 */
@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  // Qui non c'e logica vera:
  // il componente serve solo come punto di appoggio del layout autenticato.
}
