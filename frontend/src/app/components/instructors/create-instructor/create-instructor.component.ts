import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-create-instructor',
  imports: [CommonModule],
  templateUrl: './create-instructor.component.html',
  styleUrl: './create-instructor.component.css',
})
export class CreateInstructorComponent {
  constructor(private readonly router: Router) {}

  createInstructor(event: SubmitEvent): void {
    event.preventDefault();
  }

  cancel(): void {
    void this.router.navigate(['/dashboard']);
  }
}
