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
import { environment } from '../../environments/environment';
import type { BookingPreviewRequestDto } from '../dto/request/booking/booking-preview-request.dto';
import type { ConfermaPrenotazioneRequestDto } from '../dto/request/booking/conferma-prenotazione-request.dto';
import type { CreateBookingLockRequestDto } from '../dto/request/booking/create-booking-lock-request.dto';
import type { BookingAvailableInstructorResponseDto } from '../dto/response/booking/booking-available-instructor-response.dto';
import type { BookingFieldCalendarResponseDto } from '../dto/response/booking/booking-calendar-response.dto';
import type {
  BookingFieldResponseDto,
  BookingSport,
  CampiPerSportApiResponseDto,
} from '../dto/response/booking/booking-field-response.dto';
import type { BookingLockResponseDto } from '../dto/response/booking/booking-lock-response.dto';
import type { BookingPreviewResponseDto } from '../dto/response/booking/booking-preview-response.dto';
import type { PrenotazioneConfermataResponseDto } from '../dto/response/booking/prenotazione-confermata-response.dto';
import { ImageUrlUtil } from '../util/image-url.util';

/**
 * Service Angular singleton che coordina il flusso frontend di prenotazione.
 */
@Injectable({
  providedIn: 'root',
})
export class BookingService {
  private readonly backendBaseUrl = environment.backendBaseUrl;
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
            urlImmaginePrincipale: ImageUrlUtil.normalizeBackendImageUrl(campo.urlImmagine),
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

}
