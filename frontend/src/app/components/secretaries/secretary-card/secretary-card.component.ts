import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ManagerSecretaryResponseDto } from '../../../dto/response/manager/manager-secretary-response.dto';

export interface SecretaryToggleEvent {
  secretary: ManagerSecretaryResponseDto;
  nextActive: boolean;
}

@Component({
  selector: 'app-secretary-card',
  imports: [CommonModule],
  templateUrl: './secretary-card.component.html',
  styleUrl: './secretary-card.component.css',
})
export class SecretaryCardComponent {
  @Input({ required: true }) secretary!: ManagerSecretaryResponseDto;
  @Input() togglePending = false;
  @Output() editSecretary = new EventEmitter<ManagerSecretaryResponseDto>();
  @Output() toggleSecretary = new EventEmitter<SecretaryToggleEvent>();

  private readonly backendBaseUrl = 'http://localhost:8080';

  get fullName(): string {
    return `${this.secretary.nome} ${this.secretary.cognome}`.trim();
  }

  get imageUrl(): string {
    const path = this.secretary.fotoProfiloUrl;

    if (!path) {
      return '';
    }

    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    return path.startsWith('/') ? `${this.backendBaseUrl}${path}` : `${this.backendBaseUrl}/${path}`;
  }

  get statusLabel(): string {
    return this.secretary.attivo ? 'Disponibile' : 'In pausa';
  }

  edit(): void {
    this.editSecretary.emit(this.secretary);
  }

  toggleActive(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.toggleSecretary.emit({
      secretary: this.secretary,
      nextActive: input.checked,
    });
  }
}
