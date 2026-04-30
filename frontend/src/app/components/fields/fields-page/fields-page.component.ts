import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FieldCardComponent, FieldCardData } from '../field-card/field-card.component';

@Component({
  selector: 'app-fields-page',
  imports: [CommonModule, FieldCardComponent],
  templateUrl: './fields-page.component.html',
  styleUrl: './fields-page.component.css',
})
export class FieldsPageComponent {
  readonly fields: FieldCardData[] = [
    {
      id: 1,
      name: 'Campo Tennis Centrale',
      sportType: 'TENNIS',
      hourlyRate: 32,
      active: true,
      images: [
        'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=900&q=80',
      ],
    },
    {
      id: 2,
      name: 'Campo Padel Indoor',
      sportType: 'PADEL',
      hourlyRate: 40,
      active: true,
      images: [
        'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=900&q=80',
      ],
    },
    {
      id: 3,
      name: 'Campo Calcetto 5',
      sportType: 'CALCETTO',
      hourlyRate: 55,
      active: false,
      images: [
        'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?auto=format&fit=crop&w=900&q=80',
      ],
    },
  ];

  constructor(private readonly router: Router) {}

  addField(): void {
    void this.router.navigate(['/dashboard/fields/create']);
  }

  modifyField(field: FieldCardData): void {
    void this.router.navigate(['/dashboard/fields/modify', field.id]);
  }

  trackByFieldId(_: number, field: FieldCardData): string {
    return String(field.id);
  }
}
