import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, take, timeout } from 'rxjs';
import {
  BookingFieldResponseDto,
  BookingSport,
  CampiPerSportApiResponseDto,
} from '../dto/response/booking/booking-field-response.dto';

export type BookingCalendarEventType =
  | 'PRENOTAZIONE'
  | 'MANUTENZIONE'
  | 'LOCK'
  | 'FESTIVITA'
  | 'ECCEZIONE_ORARIO_CENTRO'
  | 'ECCEZIONE_ORARI_CENTRO'
  | string;

export interface BookingCalendarEventResponseDto {
  tipo: BookingCalendarEventType;
  titolo: string;
  inizio: string;
  fine: string;
  selezionabile: boolean;
  prenotazioneId: number | null;
  lockId: number | null;
  istruttoreId: number | null;
}

export interface BookingFieldCalendarResponseDto {
  apertura: string;
  campoId: number;
  chiuso: boolean;
  chiusura: string;
  data: string;
  eventi: BookingCalendarEventResponseDto[];
  nomeCampo: string;
  sport: BookingSport;
}

export interface BookingAvailableInstructorResponseDto {
  istruttoreId: number;
  nome: string;
  cognome: string;
  costoOrario: number | null;
  fotoProfiloUrl?: string | null;
}

export interface CreateBookingLockRequestDto {
  campoId: number;
  inizio: string;
  durataMinuti: number;
  conIstruttore: boolean;
  istruttoreId?: number | null;
}

export interface BookingLockResponseDto {
  lockId: number;
  campoId: number;
  istruttoreId: number | null;
  inizio: string;
  fine: string;
  stato: string;
  scadeIl: string;
}

export interface BookingPreviewRequestDto {
  lockId: number;
  numeroPartecipanti: number;
  numeroRacchette: number;
}

export interface BookingPreviewResponseDto {
  costoCampo: number;
  costoIstruttore: number;
  costoRacchette: number;
  totale: number;
}

export interface ConfermaPrenotazioneRequestDto {
  lockId: number;
  numeroPartecipanti: number;
  numeroRacchette: number;
}

export interface PrenotazioneConfermataResponseDto {
  id: number;
  campoId: number;
  nomeCampo?: string | null;
  campoNome?: string | null;
  nomeCampoSportivo?: string | null;
  clienteId: number;
  istruttoreId: number | null;
  inizio: string;
  fine: string;
  numeroPartecipanti: number | null;
  numeroRacchette: number;
  costoTotale: number;
  stato: string;
  feedbackInserito: boolean;
  recensibile: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class BookingService {
  private readonly backendBaseUrl = 'http://localhost:8080';
  private readonly campiApiUrl = `${this.backendBaseUrl}/api/campi`;
  private readonly prenotazioniApiUrl = `${this.backendBaseUrl}/api/prenotazioni`;

  /*
    Durata del timer frontend del lock in secondi.
    Il countdown parte quando l'utente conferma data e ora e deve restare
    continuo fino alla conferma della prenotazione.
  */
  private readonly frontendLockDurationSeconds = 300;

  constructor(private readonly http: HttpClient) {}

  getCampiDisponibiliPerSport(sport: BookingSport): Observable<BookingFieldResponseDto[]> {
    const encodedSport = encodeURIComponent(sport);

    return this.http
      .get<CampiPerSportApiResponseDto>(
        `${this.campiApiUrl}/get-campi-on-tipo/${encodedSport}`,
      )
      .pipe(
        timeout(10000),
        take(1),
        map((response) =>
          (response.campi ?? []).map((campo) => ({
            id: campo.idCampo,
            nome: campo.nome,
            sport,
            costoOrario: Number(campo.costoOrario),
            attivo: true,
            urlImmaginePrincipale: this.buildImageUrl(campo.urlImmagine),
          })),
        ),
      );
  }

  getCalendarioCampo(
    campoId: number,
    data: string,
  ): Observable<BookingFieldCalendarResponseDto> {
    const params = new HttpParams().set('data', data);

    return this.http
      .get<BookingFieldCalendarResponseDto>(
        `${this.campiApiUrl}/${campoId}/calendario`,
        { params },
      )
      .pipe(
        timeout(10000),
        take(1),
        map((response) => ({
          ...response,
          eventi: response.eventi ?? [],
        })),
      );
  }

  getIstruttoriDisponibili(
    campoId: number,
    inizio: string,
    fine: string,
  ): Observable<BookingAvailableInstructorResponseDto[]> {
    const params = new HttpParams()
      .set('campoId', String(campoId))
      .set('inizio', inizio)
      .set('fine', fine);

    return this.http
      .get<BookingAvailableInstructorResponseDto[]>(
        `${this.prenotazioniApiUrl}/istruttori-disponibili`,
        { params },
      )
      .pipe(
        timeout(10000),
        take(1),
        map((response) => response ?? []),
      );
  }

  creaLockPrenotazione(request: CreateBookingLockRequestDto): Observable<BookingLockResponseDto> {
    return this.http
      .post<BookingLockResponseDto>(
        `${this.prenotazioniApiUrl}/creazione-lock`,
        request,
      )
      .pipe(
        timeout(10000),
        take(1),
        map((response) => ({
          ...response,
          scadeIl: this.buildFrontendLockExpirationIso(),
        })),
      );
  }

  getPreviewPrenotazione(request: BookingPreviewRequestDto): Observable<BookingPreviewResponseDto> {
    return this.http
      .post<BookingPreviewResponseDto>(
        `${this.prenotazioniApiUrl}/preview`,
        request,
      )
      .pipe(
        timeout(10000),
        take(1),
        map((response) => ({
          costoCampo: Number(response.costoCampo ?? 0),
          costoIstruttore: Number(response.costoIstruttore ?? 0),
          costoRacchette: Number(response.costoRacchette ?? 0),
          totale: Number(response.totale ?? 0),
        })),
      );
  }

  confermaPrenotazione(
    request: ConfermaPrenotazioneRequestDto,
  ): Observable<PrenotazioneConfermataResponseDto> {
    return this.http
      .post<PrenotazioneConfermataResponseDto>(
        `${this.prenotazioniApiUrl}/creazione`,
        request,
      )
      .pipe(
        timeout(10000),
        take(1),
        map((response) => ({
          ...response,
          costoTotale: Number(response.costoTotale ?? 0),
        })),
      );
  }

  eliminaLockPrenotazione(lockId: number): Observable<void> {
    return this.http
      .delete<void>(`${this.prenotazioniApiUrl}/eliminazione-lock/${lockId}`)
      .pipe(
        timeout(10000),
        take(1),
      );
  }

  getMiePrenotazioniFuture(): Observable<PrenotazioneConfermataResponseDto[]> {
    return this.http
      .get<PrenotazioneConfermataResponseDto[]>(`${this.prenotazioniApiUrl}/mie`)
      .pipe(
        timeout(10000),
        take(1),
        map((response) =>
          (response ?? []).map((prenotazione) => ({
            ...prenotazione,
            costoTotale: Number(prenotazione.costoTotale ?? 0),
          })),
        ),
      );
  }

  annullaPrenotazione(prenotazioneId: number): Observable<PrenotazioneConfermataResponseDto> {
    return this.http
      .delete<PrenotazioneConfermataResponseDto>(
        `${this.prenotazioniApiUrl}/annullamento/${prenotazioneId}`,
      )
      .pipe(
        timeout(10000),
        take(1),
        map((response) => ({
          ...response,
          costoTotale: Number(response.costoTotale ?? 0),
        })),
      );
  }


  private buildFrontendLockExpirationIso(): string {
    const expirationDate = new Date(
      Date.now() + this.frontendLockDurationSeconds * 1000,
    );

    return expirationDate.toISOString();
  }

  private buildImageUrl(urlImmagine: string | null): string | null {
    const url = urlImmagine?.trim();

    if (!url || url === 'string' || url === 'null' || url === 'undefined') {
      return null;
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    if (url.startsWith('/images/')) {
      return `${this.backendBaseUrl}${url}`;
    }

    console.warn('URL immagine non valida ricevuta dal backend:', url);
    return null;
  }
}
