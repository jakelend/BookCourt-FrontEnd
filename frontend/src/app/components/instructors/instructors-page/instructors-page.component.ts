import { CommonModule } from '@angular/common';
import { extractBackendErrorMessage } from '../../../util/error-message.util';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ManagerInstructorResponseDto } from '../../../dto/response/manager/manager-instructor-response.dto';
import { ManagerService } from '../../../services/manager.service';
import { InstructorCardComponent, InstructorToggleEvent } from '../instructor-card/instructor-card.component';

/**
 * Filtro applicabile alla lista istruttori in base allo stato attivo/inattivo.
 */
type AvailabilityFilter = 'all' | 'active' | 'inactive';

@Component({
  selector: 'app-instructors-page',
  imports: [CommonModule, InstructorCardComponent],
  templateUrl: './instructors-page.component.html',
  styleUrl: './instructors-page.component.css',
})
/**
 * Pagina manager per la gestione degli istruttori.
 * Carica la lista, applica filtri e gestisce attivazione/disattivazione.
 */
export class InstructorsPageComponent implements OnInit, OnDestroy {
  /**
   * Lista istruttori caricata dal backend.
   */
  instructors: ManagerInstructorResponseDto[] = [];
  availabilityFilter: AvailabilityFilter = 'all';
  /**
   * Stati della pagina e messaggi di errore mostrati nel template.
   */
  loading = true;
  errorMessage = '';
  toggleError = '';
  /**
   * Richieste di cambio stato attualmente in corso, indicizzate per id istruttore.
   */
  private readonly toggleRequests = new Map<number, Subscription>();

  /**
   * Inietta router e ManagerService per navigare e comunicare con il backend.
   */
  constructor(
    private readonly router: Router,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * Carica la lista istruttori all'apertura della pagina.
   */
  ngOnInit(): void {
    this.loadInstructors();
  }

  /**
   * Annulla eventuali richieste ancora attive alla distruzione del componente.
   */
  ngOnDestroy(): void {
    this.toggleRequests.forEach((request) => request.unsubscribe());
    this.toggleRequests.clear();
  }

  /**
   * Naviga alla pagina di creazione istruttore.
   */
  addInstructor(): void {
    void this.router.navigate(['/dashboard/instructors/create']);
  }

  /**
   * Naviga alla pagina di modifica dell'istruttore selezionato.
   */
  modifyInstructor(instructor: ManagerInstructorResponseDto): void {
    void this.router.navigate(['/dashboard/instructors/modify', instructor.id]);
  }

  /**
   * Restituisce gli istruttori filtrati secondo il filtro corrente.
   */
  get filteredInstructors(): ManagerInstructorResponseDto[] {
    return this.instructors.filter((instructor) => this.matchesAvailabilityFilter(instructor.attivo));
  }

  /**
   * Aggiorna il filtro attivo nella pagina.
   */
  setAvailabilityFilter(filter: AvailabilityFilter): void {
    this.availabilityFilter = filter;
  }

  /**
   * Gestisce la richiesta di attivare o disattivare un istruttore dalla card.
   */
  onToggleInstructor(event: InstructorToggleEvent): void {
    this.toggleError = '';
    const previousActive = event.instructor.attivo;

    this.toggleRequests.get(event.instructor.id)?.unsubscribe();

    /*
      Aggiorno subito la UI in modo ottimistico.
      Se il backend fallisce, sotto ripristino lo stato precedente.
    */
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

  /**
   * Indica se per quell'istruttore è già in corso una richiesta di toggle.
   */
  isToggling(id: number): boolean {
    return this.toggleRequests.has(id);
  }

  /**
   * Funzione trackBy per ottimizzare la lista card istruttore.
   */
  trackByInstructorId(_: number, instructor: ManagerInstructorResponseDto): string {
    return String(instructor.id);
  }

  /**
   * Riprova il caricamento dopo un errore.
   */
  retry(): void {
    this.loadInstructors();
  }

  /**
   * Verifica se lo stato dell'istruttore rispetta il filtro corrente.
   */
  private matchesAvailabilityFilter(active: boolean): boolean {
    if (this.availabilityFilter === 'active') {
      return active;
    }

    if (this.availabilityFilter === 'inactive') {
      return !active;
    }

    return true;
  }

  /**
   * Carica o aggiorna la lista istruttori dal ManagerService.
   */
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

  /**
   * Aggiorna localmente lo stato dell'istruttore dopo il successo backend.
   */
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

  /**
   * Estrae un messaggio di errore leggibile dal backend.
   */
  private extractErrorMessage(error: unknown, fallback: string): string {
    return extractBackendErrorMessage(error, fallback);
  }
}
