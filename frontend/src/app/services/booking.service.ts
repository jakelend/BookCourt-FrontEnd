/**
 * Servizio dedicato al flusso di prenotazione lato cliente.
 *
 * Contiene le chiamate HTTP necessarie per visualizzare i campi disponibili,
 * leggere il calendario di un campo, cercare eventuali istruttori disponibili,
 * creare il lock temporaneo sullo slot, calcolare la preview del costo,
 * confermare o annullare la prenotazione.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, take, timeout } from 'rxjs';
import {
  BookingFieldResponseDto,
  BookingSport,
  CampiPerSportApiResponseDto,
} from '../dto/response/booking/booking-field-response.dto';

/**
 * Tipi di evento che il calendario campo può ricevere dal backend.
 */
export type BookingCalendarEventType =
  | 'PRENOTAZIONE'
  | 'MANUTENZIONE'
  | 'LOCK'
  | 'FESTIVITA'
  | 'ECCEZIONE_ORARIO_CENTRO'
  | 'ECCEZIONE_ORARI_CENTRO'
  | string;

/**
 * Singolo evento del calendario campo, ad esempio prenotazione, manutenzione, lock o eccezione.
 */
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

/**
 * Risposta del calendario giornaliero di un campo sportivo.
 */
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

/**
 * DTO che rappresenta un istruttore disponibile nello slot selezionato.
 */
export interface BookingAvailableInstructorResponseDto {
  istruttoreId: number;
  nome: string;
  cognome: string;
  costoOrario: number | null;
  fotoProfiloUrl?: string | null;
}

/**
 * Payload usato per creare un lock temporaneo sullo slot scelto dal cliente.
 */
export interface CreateBookingLockRequestDto {
  campoId: number;
  inizio: string;
  durataMinuti: number;
  conIstruttore: boolean;
  istruttoreId?: number | null;
}

/**
 * Risposta della creazione lock, con intervallo bloccato e scadenza.
 */
export interface BookingLockResponseDto {
  lockId: number;
  campoId: number;
  istruttoreId: number | null;
  inizio: string;
  fine: string;
  stato: string;
  scadeIl: string;
}

/**
 * Payload usato per calcolare il costo prima della conferma della prenotazione.
 */
export interface BookingPreviewRequestDto {
  lockId: number;
  numeroPartecipanti: number;
  numeroRacchette: number;
}

/**
 * Dettaglio dei costi mostrati nella preview della prenotazione.
 */
export interface BookingPreviewResponseDto {
  costoCampo: number;
  costoIstruttore: number;
  costoRacchette: number;
  totale: number;
}

/**
 * Payload usato per trasformare il lock in una prenotazione confermata.
 */
export interface ConfermaPrenotazioneRequestDto {
  lockId: number;
  numeroPartecipanti: number;
  numeroRacchette: number;
}

/**
 * DTO della prenotazione restituito dopo conferma, lettura storico o annullamento.
 */
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

/**
 * Service Angular singleton che coordina il flusso frontend di prenotazione.
 */
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

  /**
   * Recupera i campi disponibili per lo sport selezionato e normalizza la risposta per la UI.
   * @param sport Sport scelto dall'utente nel flusso di prenotazione.
   * @returns Observable con i campi mostrabili nella selezione.
   */
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

  /**
   * Recupera il calendario giornaliero di un campo.
   * @param campoId Identificativo del campo.
   * @param data Data nel formato YYYY-MM-DD.
   * @returns Observable con apertura, chiusura ed eventi del campo.
   */
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

  /**
   * Recupera gli istruttori disponibili nello stesso intervallo della prenotazione.
   * @param campoId Campo scelto per la prenotazione.
   * @param inizio Data e ora di inizio slot in formato ISO.
   * @param fine Data e ora di fine slot in formato ISO.
   * @returns Observable con gli istruttori selezionabili.
   */
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

  /**
   * Crea il lock temporaneo sullo slot scelto prima della conferma definitiva.
   * @param request Dati dello slot da bloccare.
   * @returns Observable con le informazioni del lock creato.
   */
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

  /**
   * Calcola il riepilogo economico della prenotazione prima della conferma.
   * @param request Lock e opzioni selezionate dal cliente.
   * @returns Observable con costo campo, istruttore, racchette e totale.
   */
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

  /**
   * Conferma definitivamente la prenotazione partendo da un lock valido.
   * @param request Dati finali della prenotazione.
   * @returns Observable con la prenotazione confermata.
   */
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

  /**
   * Elimina un lock quando l'utente abbandona o annulla il flusso prima della conferma.
   * @param lockId Identificativo del lock da rilasciare.
   * @returns Observable vuoto al completamento dell'eliminazione.
   */
  eliminaLockPrenotazione(lockId: number): Observable<void> {
    return this.http
      .delete<void>(`${this.prenotazioniApiUrl}/eliminazione-lock/${lockId}`)
      .pipe(
        timeout(10000),
        take(1),
      );
  }

  /**
   * Recupera le prenotazioni future del cliente autenticato.
   * @returns Observable con l'elenco delle prenotazioni future.
   */
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

  /**
   * Annulla una prenotazione del cliente secondo le regole consentite dal backend.
   * @param prenotazioneId Identificativo della prenotazione da annullare.
   * @returns Observable con la prenotazione aggiornata.
   */
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


  /**
   * Calcola la scadenza frontend del countdown del lock.
   * @returns Timestamp ISO della scadenza usata dal timer dell'interfaccia.
   */
  private buildFrontendLockExpirationIso(): string {
    const expirationDate = new Date(
      Date.now() + this.frontendLockDurationSeconds * 1000,
    );

    return expirationDate.toISOString();
  }

  /**
   * Normalizza l'URL immagine restituito dal backend.
   * @param urlImmagine URL o path dell'immagine principale del campo.
   * @returns URL assoluto utilizzabile dal browser oppure null.
   */
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
