import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ManagerFieldResponseDto } from '../../../dto/response/manager/manager-field-response.dto';
import { ManagerService } from '../../../services/manager.service';
import { FieldCardComponent, FieldToggleEvent } from '../field-card/field-card.component';

@Component({
  selector: 'app-fields-page',
  imports: [CommonModule, FieldCardComponent],
  templateUrl: './fields-page.component.html',
  styleUrl: './fields-page.component.css',
})
export class FieldsPageComponent implements OnInit, OnDestroy {
  fields: ManagerFieldResponseDto[] = [];
  loading = true;
  errorMessage = '';
  toggleError = '';
  private readonly toggleRequests = new Map<number, Subscription>();

  constructor(
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  ngOnInit(): void {
    this.loadFields();
  }

  ngOnDestroy(): void {
    this.toggleRequests.forEach((request) => request.unsubscribe());
    this.toggleRequests.clear();
  }

  addField(): void {
    void this.router.navigate(['/dashboard/fields/create']);
  }

  modifyField(field: ManagerFieldResponseDto): void {
    void this.router.navigate(['/dashboard/fields/modify', field.id]);
  }

  onToggleField(event: FieldToggleEvent): void {
    this.toggleError = '';
    const previousActive = event.field.attivo;

    this.toggleRequests.get(event.field.id)?.unsubscribe();
    this.setFieldActive(event.field.id, event.nextActive);

    const request$ = event.nextActive
      ? this.managerService.riattivaCampo(event.field.id)
      : this.managerService.disattivaCampo(event.field.id);

    const request = request$.subscribe({
      next: () => {
        if (this.toggleRequests.get(event.field.id) === request) {
          this.toggleRequests.delete(event.field.id);
        }
      },
      error: (error) => {
        if (this.toggleRequests.get(event.field.id) !== request) {
          return;
        }

        this.toggleRequests.delete(event.field.id);
        this.setFieldActive(event.field.id, previousActive);
        this.toggleError = this.extractErrorMessage(error, 'Impossibile aggiornare lo stato del campo.');
      },
    });

    this.toggleRequests.set(event.field.id, request);
  }

  isToggling(id: number): boolean {
    return this.toggleRequests.has(id);
  }

  trackByFieldId(_: number, field: ManagerFieldResponseDto): string {
    return String(field.id);
  }

  retry(): void {
    this.loadFields();
  }

  private loadFields(): void {
    this.loading = true;
    this.errorMessage = '';

    this.managerService
      .getCampi()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (fields) => {
          this.fields = fields;
        },
        error: (error) => {
          this.errorMessage = this.extractErrorMessage(error, 'Impossibile caricare i campi.');
        },
      });
  }

  private setFieldActive(id: number, active: boolean): void {
    this.fields = this.fields.map((field) =>
      field.id === id
        ? {
            ...field,
            attivo: active,
          }
        : field,
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
