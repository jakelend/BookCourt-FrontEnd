/**
 * Servizio dedicato alla gestione dei feedback sulle prenotazioni concluse.
 *
 * Espone le chiamate per recuperare le prenotazioni recensibili, leggere i
 * feedback già inseriti dal cliente e creare un nuovo feedback associato a una
 * specifica prenotazione.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, take, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import type { CreateFeedbackRequestDto } from '../dto/request/feedback/create-feedback-request.dto';
import type { FeedbackPrenotazioneResponseDto } from '../dto/response/feedback/feedback-prenotazione-response.dto';
import type { PrenotazioneDaRecensireResponseDto } from '../dto/response/feedback/prenotazione-da-recensire-response.dto';

/**
 * Service Angular singleton che gestisce lettura e creazione dei feedback.
 */
@Injectable({
  providedIn: 'root',
})
export class FeedbackService {
  private readonly backendBaseUrl = environment.backendBaseUrl;
  private readonly feedbackApiUrl = `${this.backendBaseUrl}/api/feedback`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Recupera le prenotazioni concluse per cui il cliente può inserire un feedback.
   * @returns Observable con le prenotazioni recensibili.
   */
  getPrenotazioniDaRecensire(): Observable<PrenotazioneDaRecensireResponseDto[]> {
    return this.http
      .get<PrenotazioneDaRecensireResponseDto[]>(`${this.feedbackApiUrl}/da-recensire`)
      .pipe(
        timeout(10000),
        take(1),
        map((response) => response ?? []),
      );
  }

  /**
   * Recupera i feedback già inseriti dal cliente autenticato.
   * @returns Observable con i feedback dell'utente.
   */
  getMieiFeedback(): Observable<FeedbackPrenotazioneResponseDto[]> {
    return this.http
      .get<FeedbackPrenotazioneResponseDto[]>(`${this.feedbackApiUrl}/miei`)
      .pipe(
        timeout(10000),
        take(1),
        map((response) => response ?? []),
      );
  }

  /**
   * Crea un feedback associato a una prenotazione conclusa.
   * @param prenotazioneId Prenotazione da recensire.
   * @param request Valutazione e commento inseriti dal cliente.
   * @returns Observable con il feedback salvato.
   */
  creaFeedback(
    prenotazioneId: number,
    request: CreateFeedbackRequestDto,
  ): Observable<FeedbackPrenotazioneResponseDto> {
    return this.http
      .post<FeedbackPrenotazioneResponseDto>(
        `${this.feedbackApiUrl}/prenotazioni/${prenotazioneId}`,
        request,
      )
      .pipe(timeout(10000), take(1));
  }
}
