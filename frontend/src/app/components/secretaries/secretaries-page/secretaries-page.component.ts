import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import {
  SecretaryCardComponent,
  SecretaryCardData,
} from '../secretary-card/secretary-card.component';

@Component({
  selector: 'app-secretaries-page',
  imports: [CommonModule, SecretaryCardComponent],
  templateUrl: './secretaries-page.component.html',
  styleUrl: './secretaries-page.component.css',
})
export class SecretariesPageComponent {
  readonly secretaries: SecretaryCardData[] = [
    {
      id: 1,
      fullName: 'Giulia Conti',
      imageUrl:
        'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=900&q=80',
      status: 'Disponibile',
      active: true,
      email: 'giulia.conti@bookcourt.it',
      phone: '+39 333 210 4567',
    },
    {
      id: 2,
      fullName: 'Laura Bianchi',
      imageUrl:
        'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=900&q=80',
      status: 'Disponibile',
      active: true,
      email: 'laura.bianchi@bookcourt.it',
      phone: '+39 333 654 9988',
    },
    {
      id: 3,
      fullName: 'Marta Ferri',
      imageUrl:
        'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=80',
      status: 'In pausa',
      active: false,
      email: 'marta.ferri@bookcourt.it',
      phone: '+39 333 900 1122',
    },
  ];

  constructor(private readonly router: Router) {}

  addSecretary(): void {
    void this.router.navigate(['/dashboard/secretaries/create']);
  }

  modifySecretary(secretary: SecretaryCardData): void {
    void this.router.navigate(['/dashboard/secretaries/modify', secretary.id]);
  }

  trackBySecretaryId(_: number, secretary: SecretaryCardData): string {
    return String(secretary.id);
  }
}
