import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, take, timeout } from 'rxjs';

export interface PrenotazioneDaRecensireResponseDto {
  prenotazioneId: number;
  campoId: number;
  nomeCampo?: string | null;
  inizio: string;
  fine: string;
  istruttoreId?: number | null;
  nomeIstruttore?: string | null;
  cognomeIstruttore?: string | null;
  feedbackGiaInserito: boolean;
  recensibile: boolean;
}

export interface CreateFeedbackRequestDto {
  valutazione: number;
  commento: string;
}

export interface FeedbackPrenotazioneResponseDto {
  id: number;
  prenotazioneId: number;
  clienteId: number;
  campoId?: number | null;
  nomeCampo?: string | null;
  inizio?: string | null;
  fine?: string | null;
  istruttoreId?: number | null;
  nomeIstruttore?: string | null;
  cognomeIstruttore?: string | null;
  valutazione: number;
  commento: string | null;
  creatoIl: string;
}

@Injectable({
  providedIn: 'root',
})
export class FeedbackService {
  private readonly backendBaseUrl = 'http://localhost:8080';
  private readonly feedbackApiUrl = `${this.backendBaseUrl}/api/feedback`;

  constructor(private readonly http: HttpClient) {}

  getPrenotazioniDaRecensire(): Observable<PrenotazioneDaRecensireResponseDto[]> {
    return this.http
      .get<PrenotazioneDaRecensireResponseDto[]>(`${this.feedbackApiUrl}/da-recensire`)
      .pipe(
        timeout(10000),
        take(1),
        map((response) => response ?? []),
      );
  }

  getMieiFeedback(): Observable<FeedbackPrenotazioneResponseDto[]> {
    return this.http
      .get<FeedbackPrenotazioneResponseDto[]>(`${this.feedbackApiUrl}/miei`)
      .pipe(
        timeout(10000),
        take(1),
        map((response) => response ?? []),
      );
  }

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
