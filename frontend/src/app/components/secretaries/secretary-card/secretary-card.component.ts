import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ManagerSecretaryResponseDto } from '../../../dto/response/manager/manager-secretary-response.dto';

export interface SecretaryToggleEvent {
  secretary: ManagerSecretaryResponseDto;
  nextActive: boolean;
}

@Component({
  selector: 'app-secretary-card',
  imports: [CommonModule],
  templateUrl: './secretary-card.component.html',
  styleUrl: './secretary-card.component.css',
})
export class SecretaryCardComponent implements OnChanges {
  @Input({ required: true }) secretary!: ManagerSecretaryResponseDto;
  @Input() togglePending = false;
  @Output() editSecretary = new EventEmitter<ManagerSecretaryResponseDto>();
  @Output() toggleSecretary = new EventEmitter<SecretaryToggleEvent>();

  private readonly backendBaseUrl = 'http://localhost:8080';
  private readonly defaultProfileImagePath = 'images/default/default-image-profile.png';

  imageLoadFailed = false;

  get fullName(): string {
    return `${this.secretary.nome} ${this.secretary.cognome}`.trim();
  }

  get initials(): string {
    const nome = this.secretary.nome?.trim() ?? '';
    const cognome = this.secretary.cognome?.trim() ?? '';

    return `${nome.charAt(0).toUpperCase()}${cognome.charAt(0).toUpperCase()}` || 'S';
  }

  get imageUrl(): string {
    if (this.imageLoadFailed) {
      return '';
    }

    const path = this.secretary.fotoProfiloUrl?.trim();

    if (!path || this.isInvalidImagePath(path)) {
      return '';
    }

    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    return path.startsWith('/') ? `${this.backendBaseUrl}${path}` : `${this.backendBaseUrl}/${path}`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['secretary']) {
      this.imageLoadFailed = false;
    }
  }

  onImageError(): void {
    this.imageLoadFailed = true;
  }

  get statusLabel(): string {
    return this.secretary.attivo ? 'Disponibile' : 'In pausa';
  }

  private isInvalidImagePath(path: string): boolean {
    const normalizedPath = path.trim().toLowerCase();

    return (
      normalizedPath === 'string' ||
      normalizedPath === 'null' ||
      normalizedPath === 'undefined' ||
      normalizedPath === this.defaultProfileImagePath ||
      normalizedPath === `/${this.defaultProfileImagePath}` ||
      normalizedPath.endsWith(`/${this.defaultProfileImagePath}`)
    );
  }

  edit(): void {
    this.editSecretary.emit(this.secretary);
  }

  toggleActive(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.toggleSecretary.emit({
      secretary: this.secretary,
      nextActive: input.checked,
    });
  }
}
