import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type FieldSportType = 'CALCETTO' | 'TENNIS' | 'PADEL';

export interface FieldCardData {
  id: number;
  name: string;
  sportType: FieldSportType;
  hourlyRate: number;
  active: boolean;
  images: string[];
}

@Component({
  selector: 'app-field-card',
  imports: [CommonModule],
  templateUrl: './field-card.component.html',
  styleUrl: './field-card.component.css',
})
export class FieldCardComponent {
  @Input({ required: true }) field!: FieldCardData;
  @Output() editField = new EventEmitter<FieldCardData>();

  get coverImageUrl(): string {
    return this.field.images[0] ?? '';
  }

  get statusLabel(): string {
    return this.field.active ? 'Disponibile' : 'Disattivo';
  }

  edit(): void {
    this.editField.emit(this.field);
  }

  toggleActive(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.field.active = input.checked;
  }
}
