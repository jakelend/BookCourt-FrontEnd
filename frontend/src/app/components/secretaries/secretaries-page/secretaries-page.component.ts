import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ManagerSecretaryResponseDto } from '../../../dto/response/manager/manager-secretary-response.dto';
import { ManagerService } from '../../../services/manager.service';
import { SecretaryCardComponent, SecretaryToggleEvent } from '../secretary-card/secretary-card.component';

@Component({
  selector: 'app-secretaries-page',
  imports: [CommonModule, SecretaryCardComponent],
  templateUrl: './secretaries-page.component.html',
  styleUrl: './secretaries-page.component.css',
})
export class SecretariesPageComponent implements OnInit, OnDestroy {
  secretaries: ManagerSecretaryResponseDto[] = [];
  loading = true;
  errorMessage = '';
  toggleError = '';
  private readonly toggleRequests = new Map<number, Subscription>();

  constructor(
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  ngOnInit(): void {
    this.loadSecretaries();
  }

  ngOnDestroy(): void {
    this.toggleRequests.forEach((request) => request.unsubscribe());
    this.toggleRequests.clear();
  }

  addSecretary(): void {
    void this.router.navigate(['/dashboard/secretaries/create']);
  }

  modifySecretary(secretary: ManagerSecretaryResponseDto): void {
    void this.router.navigate(['/dashboard/secretaries/modify', secretary.id]);
  }

  onToggleSecretary(event: SecretaryToggleEvent): void {
    this.toggleError = '';
    const previousActive = event.secretary.attivo;

    this.toggleRequests.get(event.secretary.id)?.unsubscribe();
    this.setSecretaryActive(event.secretary.id, event.nextActive);

    const request$ = event.nextActive
      ? this.managerService.riattivaUtente(event.secretary.id)
      : this.managerService.disattivaUtente(event.secretary.id);

    const request = request$.subscribe({
      next: () => {
        if (this.toggleRequests.get(event.secretary.id) === request) {
          this.toggleRequests.delete(event.secretary.id);
        }
      },
      error: (error) => {
        if (this.toggleRequests.get(event.secretary.id) !== request) {
          return;
        }

        this.toggleRequests.delete(event.secretary.id);
        this.setSecretaryActive(event.secretary.id, previousActive);
        this.toggleError = this.extractErrorMessage(error, 'Impossibile aggiornare lo stato della segretaria.');
      },
    });

    this.toggleRequests.set(event.secretary.id, request);
  }

  isToggling(id: number): boolean {
    return this.toggleRequests.has(id);
  }

  trackBySecretaryId(_: number, secretary: ManagerSecretaryResponseDto): string {
    return String(secretary.id);
  }

  retry(): void {
    this.loadSecretaries();
  }

  private loadSecretaries(): void {
    this.loading = true;
    this.errorMessage = '';

    this.managerService
      .getSegreterie()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (secretaries) => {
          this.secretaries = secretaries;
        },
        error: (error) => {
          this.errorMessage = this.extractErrorMessage(error, 'Impossibile caricare le segretarie.');
        },
      });
  }

  private setSecretaryActive(id: number, active: boolean): void {
    this.secretaries = this.secretaries.map((secretary) =>
      secretary.id === id
        ? {
            ...secretary,
            attivo: active,
          }
        : secretary,
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
