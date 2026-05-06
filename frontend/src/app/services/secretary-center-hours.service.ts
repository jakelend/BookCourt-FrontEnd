import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateCenterHoursExceptionRequestDto } from '../dto/request/secretary/create-center-hours-exception-request.dto';
import { CenterHoursExceptionResponseDto } from '../dto/response/secretary/center-hours-exception-response.dto';

@Injectable({
  providedIn: 'root',
})
export class SecretaryCenterHoursService {
  private readonly centroApiUrl = 'http://localhost:8080/api/centro';
  private readonly segreteriaApiUrl = 'http://localhost:8080/api/segreteria';

  constructor(private readonly http: HttpClient) {}

  getEccezioniOrarioCentro(
    dataInizio: string,
    dataFine: string,
  ): Observable<CenterHoursExceptionResponseDto[]> {
    const params = new HttpParams()
      .set('dataInizio', dataInizio)
      .set('dataFine', dataFine);

    return this.http.get<CenterHoursExceptionResponseDto[]>(
      `${this.centroApiUrl}/eccezioni-orario`,
      { params },
    );
  }

  creaEccezioneOrarioCentro(
    request: CreateCenterHoursExceptionRequestDto,
  ): Observable<CenterHoursExceptionResponseDto> {
    return this.http.post<CenterHoursExceptionResponseDto>(
      `${this.segreteriaApiUrl}/inserimento-eccezioni-orario-centro`,
      request,
    );
  }

  eliminaEccezioneOrarioCentro(eccezioneId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.segreteriaApiUrl}/eliminazione-eccezioni-orario-centro/${eccezioneId}`,
    );
  }
}
