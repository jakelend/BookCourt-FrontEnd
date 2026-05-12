/**
 * Servizio usato dalla segreteria per la gestione delle manutenzioni dei campi.
 *
 * Consente di filtrare i campi per sport, visualizzare le manutenzioni in un
 * intervallo temporale, creare nuove manutenzioni ed eliminare quelle esistenti.
 */
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

/**
 * Service Angular singleton per la gestione delle manutenzioni dei campi.
 */
@Injectable({
  providedIn: 'root',
})
export class SecretaryMaintenanceService {
  private readonly campiApiUrl = 'http://localhost:8080/api/campi';
  private readonly segreteriaApiUrl = 'http://localhost:8080/api/segreteria';

  constructor(private readonly http: HttpClient) {}

  /**
   * Recupera i campi filtrati per sport per la schermata manutenzioni.
   * @param sport Sport selezionato dalla segreteria.
   * @returns Observable con le opzioni campo.
   */
  getCampiBySport(sport: MaintenanceSport): Observable<MaintenanceFieldOptionDto[]> {
    return this.http
      .get<MaintenanceFieldsBySportResponseDto>(`${this.campiApiUrl}/get-campi-on-tipo/${sport}`)
      .pipe(map((response) => response.campi ?? []));
  }

  /**
   * Recupera le manutenzioni di un campo in un intervallo temporale.
   * @param campoId Identificativo del campo.
   * @param inizio Inizio intervallo.
   * @param fine Fine intervallo.
   * @returns Observable con le manutenzioni trovate.
   */
  getManutenzioniCampo(campoId: number, inizio: string, fine: string): Observable<MaintenanceResponseDto[]> {
    const params = new HttpParams()
      .set('campoId', campoId)
      .set('inizio', inizio)
      .set('fine', fine);

    return this.http.get<MaintenanceResponseDto[]>(`${this.segreteriaApiUrl}/visualizzazione-manutenzioni`, { params });
  }

  /**
   * Crea una nuova manutenzione per un campo.
   * @param request Dati della manutenzione da inserire.
   * @returns Observable con la manutenzione creata.
   */
  creaManutenzione(request: CreateMaintenanceRequestDto): Observable<MaintenanceResponseDto> {
    return this.http.post<MaintenanceResponseDto>(`${this.segreteriaApiUrl}/inserimento-manutenzioni`, request);
  }

  /**
   * Elimina una manutenzione esistente.
   * @param manutenzioneId Identificativo della manutenzione.
   * @returns Observable vuoto al completamento.
   */
  eliminaManutenzione(manutenzioneId: number): Observable<void> {
    return this.http.delete<void>(`${this.segreteriaApiUrl}/eliminazione-manutenzioni/${manutenzioneId}`);
  }
}
