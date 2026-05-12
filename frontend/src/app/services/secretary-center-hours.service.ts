/**
 * Servizio usato dalla segreteria per gestire le eccezioni di orario del centro.
 *
 * Permette di leggere le giornate/intervalli con orario modificato o chiusura,
 * creare nuove eccezioni ed eliminare quelle esistenti.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateCenterHoursExceptionRequestDto } from '../dto/request/secretary/create-center-hours-exception-request.dto';
import { CenterHoursExceptionResponseDto } from '../dto/response/secretary/center-hours-exception-response.dto';

/**
 * Service Angular singleton per le eccezioni orarie del centro sportivo.
 */
@Injectable({
  providedIn: 'root',
})
export class SecretaryCenterHoursService {
  private readonly centroApiUrl = 'http://localhost:8080/api/centro';
  private readonly segreteriaApiUrl = 'http://localhost:8080/api/segreteria';

  constructor(private readonly http: HttpClient) {}

  /**
   * Recupera le eccezioni di orario del centro in un intervallo di date.
   * @param dataInizio Data iniziale del filtro.
   * @param dataFine Data finale del filtro.
   * @returns Observable con le eccezioni trovate.
   */
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

  /**
   * Crea una nuova eccezione di orario del centro.
   * @param request Dati dell'eccezione da inserire.
   * @returns Observable con l'eccezione creata.
   */
  creaEccezioneOrarioCentro(
    request: CreateCenterHoursExceptionRequestDto,
  ): Observable<CenterHoursExceptionResponseDto> {
    return this.http.post<CenterHoursExceptionResponseDto>(
      `${this.segreteriaApiUrl}/inserimento-eccezioni-orario-centro`,
      request,
    );
  }

  /**
   * Elimina una eccezione di orario del centro.
   * @param eccezioneId Identificativo dell'eccezione.
   * @returns Observable vuoto al completamento.
   */
  eliminaEccezioneOrarioCentro(eccezioneId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.segreteriaApiUrl}/eliminazione-eccezioni-orario-centro/${eccezioneId}`,
    );
  }
}
