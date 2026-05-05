import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { CreateMaintenanceRequestDto } from '../dto/request/secretary/create-maintenance-request.dto';
import {
  MaintenanceFieldsBySportResponseDto,
  MaintenanceFieldOptionDto,
  MaintenanceResponseDto,
  MaintenanceSport,
} from '../dto/response/secretary/maintenance-response.dto';

@Injectable({
  providedIn: 'root',
})
export class SecretaryMaintenanceService {
  private readonly campiApiUrl = 'http://localhost:8080/api/campi';
  private readonly segreteriaApiUrl = 'http://localhost:8080/api/segreteria';

  constructor(private readonly http: HttpClient) {}

  getCampiBySport(sport: MaintenanceSport): Observable<MaintenanceFieldOptionDto[]> {
    return this.http
      .get<MaintenanceFieldsBySportResponseDto>(`${this.campiApiUrl}/get-campi-on-tipo/${sport}`)
      .pipe(map((response) => response.campi ?? []));
  }

  getManutenzioniCampo(campoId: number, inizio: string, fine: string): Observable<MaintenanceResponseDto[]> {
    const params = new HttpParams()
      .set('campoId', campoId)
      .set('inizio', inizio)
      .set('fine', fine);

    return this.http.get<MaintenanceResponseDto[]>(`${this.segreteriaApiUrl}/visualizzazione-manutenzioni`, { params });
  }

  creaManutenzione(request: CreateMaintenanceRequestDto): Observable<MaintenanceResponseDto> {
    return this.http.post<MaintenanceResponseDto>(`${this.segreteriaApiUrl}/inserimento-manutenzioni`, request);
  }

  eliminaManutenzione(manutenzioneId: number): Observable<void> {
    return this.http.delete<void>(`${this.segreteriaApiUrl}/eliminazione-manutenzioni/${manutenzioneId}`);
  }
}
