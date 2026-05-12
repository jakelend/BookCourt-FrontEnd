/**
 * Servizio usato dalla segreteria per consultare e modificare il calendario istruttori.
 *
 * Espone le chiamate per recuperare l'elenco istruttori, leggere l'agenda
 * giornaliera di uno specifico istruttore e inserire/eliminare periodi di
 * indisponibilità.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SecretaryInstructorUnavailabilityRequestDto } from '../dto/request/secretary/secretary-instructor-unavailability-request.dto';
import { SecretaryInstructorCalendarDayResponseDto } from '../dto/response/secretary/secretary-instructor-calendar-day-response.dto';
import { SecretaryInstructorResponseDto } from '../dto/response/secretary/secretary-instructor-response.dto';

/**
 * Service Angular singleton per la gestione calendario istruttori lato segreteria.
 */
@Injectable({
  providedIn: 'root',
})
export class SecretaryInstructorCalendarService {
  private readonly secretaryApiUrl = 'http://localhost:8080/api/segreteria';

  constructor(private readonly http: HttpClient) {}

  /**
   * Recupera gli istruttori visibili alla segreteria.
   * @returns Observable con l'elenco istruttori.
   */
  getInstructors(): Observable<SecretaryInstructorResponseDto[]> {
    return this.http.get<SecretaryInstructorResponseDto[]>(`${this.secretaryApiUrl}/istruttori`);
  }

  /**
   * Recupera l'agenda giornaliera di uno specifico istruttore.
   * @param instructorId Identificativo dell'istruttore.
   * @param date Data selezionata.
   * @returns Observable con agenda e indisponibilità della giornata.
   */
  getInstructorDailyAgenda(
    instructorId: number,
    date: Date,
  ): Observable<SecretaryInstructorCalendarDayResponseDto> {
    const params = new HttpParams().set('data', this.formatLocalDate(date));

    return this.http.get<SecretaryInstructorCalendarDayResponseDto>(
      `${this.secretaryApiUrl}/istruttori/${instructorId}/agenda-giornaliera`,
      { params },
    );
  }

  /**
   * Inserisce una nuova indisponibilità nel calendario di un istruttore.
   * @param request Dati dell'indisponibilità.
   * @returns Observable con risposta del backend.
   */
  createInstructorUnavailability(
    request: SecretaryInstructorUnavailabilityRequestDto,
  ): Observable<unknown> {
    return this.http.post(
      `${this.secretaryApiUrl}/inserimento-eccezioni-calendario-istruttori`,
      request,
    );
  }

  /**
   * Elimina una indisponibilità dal calendario istruttore.
   * @param exceptionId Identificativo dell'indisponibilità.
   * @returns Observable vuoto al completamento.
   */
  deleteInstructorUnavailability(exceptionId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.secretaryApiUrl}/eliminazione-eccezioni-calendario-istruttori/${exceptionId}`,
    );
  }

  /**
   * Formatta una data JavaScript nel formato locale YYYY-MM-DD richiesto dal backend.
   * @param date Data da convertire.
   * @returns Stringa data senza orario.
   */
  private formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
