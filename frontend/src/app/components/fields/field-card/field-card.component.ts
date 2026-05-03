import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ManagerFieldResponseDto } from '../../../dto/response/manager/manager-field-response.dto';

export type FieldSportType = 'CALCETTO' | 'TENNIS' | 'PADEL';
export type FieldCardMode = 'management' | 'selection';

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
  @Input() mode: FieldCardMode = 'management';

  @Output() editField = new EventEmitter<ManagerFieldResponseDto>();
  @Output() toggleField = new EventEmitter<FieldToggleEvent>();
  @Output() selectField = new EventEmitter<ManagerFieldResponseDto>();

  private readonly backendBaseUrl = 'http://localhost:8080';

  get isSelectionMode(): boolean {
    return this.mode === 'selection';
  }

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

  edit(event: MouseEvent): void {
    event.stopPropagation();
    this.editField.emit(this.field);
  }

  select(): void {
    if (!this.isSelectionMode || !this.field.attivo) {
      return;
    }

    this.selectField.emit(this.field);
  }

  onCardKeydown(event: KeyboardEvent): void {
    if (!this.isSelectionMode) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.select();
    }
  }

  toggleActive(event: Event): void {
    event.stopPropagation();

    const input = event.target as HTMLInputElement;

    this.toggleField.emit({
      field: this.field,
      nextActive: input.checked,
    });
  }
}
