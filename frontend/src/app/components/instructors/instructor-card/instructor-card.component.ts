import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ManagerInstructorResponseDto } from '../../../dto/response/manager/manager-instructor-response.dto';
import { ImageUrlUtil } from '../../../util/image-url.util';

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
export class InstructorCardComponent implements OnChanges {
  @Input({ required: true }) instructor!: ManagerInstructorResponseDto;
  @Input() togglePending = false;
  @Output() editInstructor = new EventEmitter<ManagerInstructorResponseDto>();
  @Output() toggleInstructor = new EventEmitter<InstructorToggleEvent>();

  imageLoadFailed = false;

  get fullName(): string {
    return `${this.instructor.nome} ${this.instructor.cognome}`.trim();
  }

  get initials(): string {
    const nome = this.instructor.nome?.trim() ?? '';
    const cognome = this.instructor.cognome?.trim() ?? '';

    return `${nome.charAt(0).toUpperCase()}${cognome.charAt(0).toUpperCase()}` || 'I';
  }

  get imageUrl(): string {
    if (this.imageLoadFailed) {
      return '';
    }

    return ImageUrlUtil.normalizeProfileImageUrl(this.instructor.fotoProfiloUrl) ?? '';
  }

  get statusLabel(): string {
    return this.instructor.attivo ? 'Disponibile' : 'Non Disponibile';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['instructor']) {
      this.imageLoadFailed = false;
    }
  }

  onImageError(): void {
    this.imageLoadFailed = true;
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
