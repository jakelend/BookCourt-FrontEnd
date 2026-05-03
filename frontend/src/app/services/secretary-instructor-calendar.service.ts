import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SecretaryInstructorUnavailabilityRequestDto } from '../dto/request/secretary/secretary-instructor-unavailability-request.dto';
import { SecretaryInstructorCalendarDayResponseDto } from '../dto/response/secretary/secretary-instructor-calendar-day-response.dto';
import { SecretaryInstructorResponseDto } from '../dto/response/secretary/secretary-instructor-response.dto';

@Injectable({
  providedIn: 'root',
})
export class SecretaryInstructorCalendarService {
  private readonly secretaryApiUrl = 'http://localhost:8080/api/segreteria';

  constructor(private readonly http: HttpClient) {}

  getInstructors(): Observable<SecretaryInstructorResponseDto[]> {
    return this.http.get<SecretaryInstructorResponseDto[]>(`${this.secretaryApiUrl}/istruttori`);
  }

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

  createInstructorUnavailability(
    request: SecretaryInstructorUnavailabilityRequestDto,
  ): Observable<unknown> {
    return this.http.post(
      `${this.secretaryApiUrl}/inserimento-eccezioni-calendario-istruttori`,
      request,
    );
  }

  deleteInstructorUnavailability(exceptionId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.secretaryApiUrl}/eliminazione-eccezioni-calendario-istruttori/${exceptionId}`,
    );
  }

  private formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
