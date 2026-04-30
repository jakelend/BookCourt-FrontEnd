import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface InstructorCardData {
  id: number;
  fullName: string;
  imageUrl: string;
  status: string;
  active: boolean;
  tennisRate: number;
  padelRate: number;
}

@Component({
  selector: 'app-instructor-card',
  imports: [CommonModule],
  templateUrl: './instructor-card.component.html',
  styleUrl: './instructor-card.component.css',
})
export class InstructorCardComponent {
  @Input({ required: true }) instructor!: InstructorCardData;
  @Output() editInstructor = new EventEmitter<InstructorCardData>();

  edit(): void {
    this.editInstructor.emit(this.instructor);
  }

  toggleActive(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.instructor.active = input.checked;
    this.instructor.status = input.checked ? 'Disponibile' : 'Non Disponibile';
  }
}
