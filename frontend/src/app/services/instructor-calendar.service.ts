/**
 * Servizio usato dall'istruttore per consultare la propria agenda giornaliera.
 *
 * Traduce la data selezionata nel formato atteso dal backend e invia la richiesta
 * all'endpoint dedicato all'utente istruttore autenticato.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { InstructorCalendarDayResponseDto } from '../dto/response/instructor/instructor-calendar-day-response.dto';

/**
 * Service Angular singleton per la consultazione agenda dell'istruttore autenticato.
 */
@Injectable({
  providedIn: 'root',
})
export class InstructorCalendarService {
  private readonly apiUrl = 'http://localhost:8080/api/istruttori/me/agenda-giornaliera';

  constructor(private readonly http: HttpClient) {}

  /**
   * Recupera l'agenda giornaliera dell'istruttore autenticato.
   * @param date Data selezionata nel calendario frontend.
   * @returns Observable con lezioni e indisponibilità della giornata.
   */
  getMyDailyAgenda(date: Date): Observable<InstructorCalendarDayResponseDto> {
    const params = new HttpParams().set('data', this.formatLocalDate(date));
    return this.http.get<InstructorCalendarDayResponseDto>(this.apiUrl, { params });
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
