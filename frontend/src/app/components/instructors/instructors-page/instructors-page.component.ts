import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ManagerInstructorResponseDto } from '../../../dto/response/manager/manager-instructor-response.dto';
import { ManagerService } from '../../../services/manager.service';
import { InstructorCardComponent, InstructorToggleEvent } from '../instructor-card/instructor-card.component';

@Component({
  selector: 'app-instructors-page',
  imports: [CommonModule, InstructorCardComponent],
  templateUrl: './instructors-page.component.html',
  styleUrl: './instructors-page.component.css',
})
export class InstructorsPageComponent implements OnInit, OnDestroy {
  instructors: ManagerInstructorResponseDto[] = [];
  loading = true;
  errorMessage = '';
  toggleError = '';
  private readonly toggleRequests = new Map<number, Subscription>();

  constructor(
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  ngOnInit(): void {
    this.loadInstructors();
  }

  ngOnDestroy(): void {
    this.toggleRequests.forEach((request) => request.unsubscribe());
    this.toggleRequests.clear();
  }

  addInstructor(): void {
    void this.router.navigate(['/dashboard/instructors/create']);
  }

  modifyInstructor(instructor: ManagerInstructorResponseDto): void {
    void this.router.navigate(['/dashboard/instructors/modify', instructor.id]);
  }

  onToggleInstructor(event: InstructorToggleEvent): void {
    this.toggleError = '';
    const previousActive = event.instructor.attivo;

    this.toggleRequests.get(event.instructor.id)?.unsubscribe();
    this.setInstructorActive(event.instructor.id, event.nextActive);

    const request$ = event.nextActive
      ? this.managerService.riattivaUtente(event.instructor.id)
      : this.managerService.disattivaUtente(event.instructor.id);

    const request = request$.subscribe({
      next: () => {
        if (this.toggleRequests.get(event.instructor.id) === request) {
          this.toggleRequests.delete(event.instructor.id);
        }
      },
      error: (error) => {
        if (this.toggleRequests.get(event.instructor.id) !== request) {
          return;
        }

        this.toggleRequests.delete(event.instructor.id);
        this.setInstructorActive(event.instructor.id, previousActive);
        this.toggleError = this.extractErrorMessage(error, "Impossibile aggiornare lo stato dell'istruttore.");
      },
    });

    this.toggleRequests.set(event.instructor.id, request);
  }

  isToggling(id: number): boolean {
    return this.toggleRequests.has(id);
  }

  trackByInstructorId(_: number, instructor: ManagerInstructorResponseDto): string {
    return String(instructor.id);
  }

  retry(): void {
    this.loadInstructors();
  }

  private loadInstructors(): void {
    this.loading = true;
    this.errorMessage = '';

    this.managerService
      .getIstruttori()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (instructors) => {
          this.instructors = instructors;
        },
        error: (error) => {
          this.errorMessage = this.extractErrorMessage(error, 'Impossibile caricare gli istruttori.');
        },
      });
  }

  private setInstructorActive(id: number, active: boolean): void {
    this.instructors = this.instructors.map((instructor) =>
      instructor.id === id
        ? {
            ...instructor,
            attivo: active,
          }
        : instructor,
    );
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    const maybeError = error as { error?: { message?: string; fields?: Record<string, string> }; status?: number };

    if (maybeError?.error?.message) {
      return maybeError.error.message;
    }

    if (maybeError?.error?.fields) {
      return Object.values(maybeError.error.fields)[0] ?? fallback;
    }

    if (maybeError?.status === 0) {
      return 'Backend non raggiungibile. Controlla che Spring Boot sia avviato sulla porta 8080.';
    }

    return fallback;
  }
}
