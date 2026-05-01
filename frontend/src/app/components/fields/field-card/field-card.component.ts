import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ManagerFieldResponseDto } from '../../../dto/response/manager/manager-field-response.dto';

export type FieldSportType = 'CALCETTO' | 'TENNIS' | 'PADEL';

export interface FieldToggleEvent {
  field: ManagerFieldResponseDto;
  nextActive: boolean;
}

@Component({
  selector: 'app-field-card',
  imports: [CommonModule],
  templateUrl: './field-card.component.html',
  styleUrl: './field-card.component.css',
})
export class FieldCardComponent {
  @Input({ required: true }) field!: ManagerFieldResponseDto;
  @Input() togglePending = false;
  @Output() editField = new EventEmitter<ManagerFieldResponseDto>();
  @Output() toggleField = new EventEmitter<FieldToggleEvent>();

  private readonly backendBaseUrl = 'http://localhost:8080';

  get coverImageUrl(): string {
    const path = this.field.urlImmaginePrincipale;

    if (!path) {
      return '';
    }

    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    return path.startsWith('/') ? `${this.backendBaseUrl}${path}` : `${this.backendBaseUrl}/${path}`;
  }

  get statusLabel(): string {
    return this.field.attivo ? 'Disponibile' : 'Disattivo';
  }

  get hourlyRateLabel(): string {
    return `EUR ${this.field.costoOrario}/h`;
  }

  edit(): void {
    this.editField.emit(this.field);
  }

  toggleActive(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.toggleField.emit({
      field: this.field,
      nextActive: input.checked,
    });
  }
}
