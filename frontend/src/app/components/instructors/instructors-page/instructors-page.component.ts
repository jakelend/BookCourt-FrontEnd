import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import {
  InstructorCardComponent,
  InstructorCardData,
} from '../instructor-card/instructor-card.component';

@Component({
  selector: 'app-instructors-page',
  imports: [CommonModule, InstructorCardComponent],
  templateUrl: './instructors-page.component.html',
  styleUrl: './instructors-page.component.css',
})
export class InstructorsPageComponent {
  readonly instructors: InstructorCardData[] = [
    {
      id: 1,
      fullName: 'Elena Rodriguez',
      imageUrl:
        'https://images.unsplash.com/photo-1544717302-de2939b7ef71?auto=format&fit=crop&w=900&q=80',
      status: 'Disponibile',
      active: true,
      tennisRate: 75,
      padelRate: 70,
    },
    {
      id: 2,
      fullName: 'Marco Silva',
      imageUrl:
        'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=900&q=80',
      status: 'Disponibile',
      active: true,
      tennisRate: 65,
      padelRate: 75,
    },
    {
      id: 3,
      fullName: 'Sarah Chen',
      imageUrl:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80',
      status: 'In pausa',
      active: false,
      tennisRate: 50,
      padelRate: 50,
    },
  ];

  constructor(private readonly router: Router) {}

  addInstructor(): void {
    void this.router.navigate(['/dashboard/instructors/create']);
  }

  modifyInstructor(instructor: InstructorCardData): void {
    void this.router.navigate(['/dashboard/instructors/modify', instructor.id]);
  }

  trackByInstructorName(_: number, instructor: InstructorCardData): string {
    return String(instructor.id);
  }
}
