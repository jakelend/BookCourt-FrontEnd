import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { InstructorCalendarDayResponseDto } from '../dto/response/instructor/instructor-calendar-day-response.dto';

@Injectable({
  providedIn: 'root',
})
export class InstructorCalendarService {
  private readonly apiUrl = 'http://localhost:8080/api/istruttori/me/agenda-giornaliera';

  constructor(private readonly http: HttpClient) {}

  getMyDailyAgenda(date: Date): Observable<InstructorCalendarDayResponseDto> {
    const params = new HttpParams().set('data', this.formatLocalDate(date));
    return this.http.get<InstructorCalendarDayResponseDto>(this.apiUrl, { params });
  }

  private formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
