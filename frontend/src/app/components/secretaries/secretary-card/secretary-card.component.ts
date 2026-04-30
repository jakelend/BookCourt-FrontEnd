import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface SecretaryCardData {
  id: number;
  fullName: string;
  imageUrl: string;
  status: string;
  active: boolean;
  email: string;
  phone: string;
}

@Component({
  selector: 'app-secretary-card',
  imports: [CommonModule],
  templateUrl: './secretary-card.component.html',
  styleUrl: './secretary-card.component.css',
})
export class SecretaryCardComponent {
  @Input({ required: true }) secretary!: SecretaryCardData;
  @Output() editSecretary = new EventEmitter<SecretaryCardData>();

  edit(): void {
    this.editSecretary.emit(this.secretary);
  }

  toggleActive(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.secretary.active = input.checked;
    this.secretary.status = input.checked ? 'Disponibile' : 'In pausa';
  }
}
