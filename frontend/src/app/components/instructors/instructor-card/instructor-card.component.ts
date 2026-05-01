import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ManagerInstructorResponseDto } from '../../../dto/response/manager/manager-instructor-response.dto';

export interface InstructorToggleEvent {
  instructor: ManagerInstructorResponseDto;
  nextActive: boolean;
}

@Component({
  selector: 'app-instructor-card',
  imports: [CommonModule],
  templateUrl: './instructor-card.component.html',
  styleUrl: './instructor-card.component.css',
})
export class InstructorCardComponent {
  @Input({ required: true }) instructor!: ManagerInstructorResponseDto;
  @Input() togglePending = false;
  @Output() editInstructor = new EventEmitter<ManagerInstructorResponseDto>();
  @Output() toggleInstructor = new EventEmitter<InstructorToggleEvent>();

  private readonly backendBaseUrl = 'http://localhost:8080';

  get fullName(): string {
    return `${this.instructor.nome} ${this.instructor.cognome}`.trim();
  }

  get imageUrl(): string {
    const path = this.instructor.fotoProfiloUrl;

    if (!path) {
      return '';
    }

    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    return path.startsWith('/') ? `${this.backendBaseUrl}${path}` : `${this.backendBaseUrl}/${path}`;
  }

  get statusLabel(): string {
    return this.instructor.attivo ? 'Disponibile' : 'Non Disponibile';
  }

  get tennisRateLabel(): string {
    return this.instructor.costoOrarioTennis != null ? `EUR ${this.instructor.costoOrarioTennis}/h` : '—';
  }

  get padelRateLabel(): string {
    return this.instructor.costoOrarioPadel != null ? `EUR ${this.instructor.costoOrarioPadel}/h` : '—';
  }

  edit(): void {
    this.editInstructor.emit(this.instructor);
  }

  toggleActive(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.toggleInstructor.emit({
      instructor: this.instructor,
      nextActive: input.checked,
    });
  }
}
