import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export interface InstructorCardData {
  fullName: string;
  role: string;
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
}
