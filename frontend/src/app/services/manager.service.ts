/**
 * Servizio applicativo usato dal manager per la gestione di staff e campi sportivi.
 *
 * Centralizza le chiamate HTTP per istruttori, segreterie, campi e immagini.
 * Per migliorare la reattività dell'interfaccia mantiene una cache in memoria e
 * in sessionStorage, invalidandola dopo operazioni di creazione, modifica,
 * attivazione/disattivazione o aggiornamento immagini.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, tap, throwError } from 'rxjs';
import { ManagerCreateFieldRequestDto, ManagerUpdateFieldRequestDto } from '../dto/request/manager/manager-create-field-request.dto';
import { ManagerCreateInstructorRequestDto, ManagerUpdateInstructorRequestDto } from '../dto/request/manager/manager-create-instructor-request.dto';
import { ManagerCreateSecretaryRequestDto, ManagerUpdateSecretaryRequestDto } from '../dto/request/manager/manager-create-secretary-request.dto';
import { ManagerFieldImageResponseDto, ManagerFieldImagesEnvelopeResponseDto } from '../dto/response/manager/manager-field-image-response.dto';
import { ManagerFieldResponseDto } from '../dto/response/manager/manager-field-response.dto';
import { ManagerInstructorResponseDto } from '../dto/response/manager/manager-instructor-response.dto';
import { ManagerSecretaryResponseDto } from '../dto/response/manager/manager-secretary-response.dto';

/**
 * Forma della risposta backend usata quando la creazione o modifica campo restituisce messaggio e campo.
 */
interface WrappedFieldResponse {
  message: string;
  campo: ManagerFieldResponseDto;
}

/**
 * Forma della risposta backend usata quando l'aggiornamento istruttore restituisce messaggio e istruttore.
 */
interface WrappedInstructorUpdateResponse {
  message: string;
  istruttore: ManagerInstructorResponseDto;
}

/**
 * Forma della risposta backend usata quando l'aggiornamento segreteria restituisce messaggio e segretaria.
 */
interface WrappedSecretaryUpdateResponse {
  message: string;
  segretaria: ManagerSecretaryResponseDto;
}

/**
 * Service Angular singleton che raggruppa le operazioni manageriali su staff e campi.
 */
@Injectable({
  providedIn: 'root',
})
export class ManagerService {
  private readonly managerApiUrl = 'http://localhost:8080/api/manager';
  private readonly campiApiUrl = 'http://localhost:8080/api/campi';
  private readonly instructorsStorageKey = 'bookcourt_manager_instructors';
  private readonly secretariesStorageKey = 'bookcourt_manager_secretaries';
  private readonly fieldsStorageKey = 'bookcourt_manager_fields';
  // Richieste HTTP condivise con shareReplay per evitare chiamate duplicate mentre un caricamento è già in corso.
  private instructorsRequest$?: Observable<ManagerInstructorResponseDto[]>;
  private secretariesRequest$?: Observable<ManagerSecretaryResponseDto[]>;
  private fieldsRequest$?: Observable<ManagerFieldResponseDto[]>;
  // Cache in memoria usata per restituire subito i dati già caricati.
  private instructorsCache?: ManagerInstructorResponseDto[];
  private secretariesCache?: ManagerSecretaryResponseDto[];
  private fieldsCache?: ManagerFieldResponseDto[];
  // Versioni cache: impediscono che risposte HTTP vecchie sovrascrivano cache già invalidate.
  private instructorsCacheVersion = 0;
  private secretariesCacheVersion = 0;
  private fieldsCacheVersion = 0;

  constructor(private readonly http: HttpClient) {}

  /**
   * Recupera l'elenco istruttori usando cache in memoria, sessionStorage o backend.
   * @returns Observable con la lista istruttori.
   */
  getIstruttori(): Observable<ManagerInstructorResponseDto[]> {
    if (this.instructorsCache) {
      return of(this.instructorsCache);
    }

    const storedInstructors = this.readStoredInstructors();

    if (storedInstructors) {
      this.instructorsCache = storedInstructors;
      this.refreshInstructorsCache();
      return of(storedInstructors);
    }

    const cacheVersion = this.instructorsCacheVersion;

    this.instructorsRequest$ ??= this.http
      .get<ManagerInstructorResponseDto[]>(`${this.managerApiUrl}/istruttori`)
      .pipe(
        tap((instructors) => this.setInstructorsCache(instructors, cacheVersion)),
        catchError((error) => {
          this.instructorsRequest$ = undefined;
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.instructorsRequest$;
  }

  /**
   * Recupera l'elenco segreterie usando cache in memoria, sessionStorage o backend.
   * @returns Observable con la lista segreterie.
   */
  getSegreterie(): Observable<ManagerSecretaryResponseDto[]> {
    if (this.secretariesCache) {
      return of(this.secretariesCache);
    }

    const storedSecretaries = this.readStoredList<ManagerSecretaryResponseDto>(this.secretariesStorageKey);

    if (storedSecretaries) {
      this.secretariesCache = storedSecretaries;
      this.refreshSecretariesCache();
      return of(storedSecretaries);
    }

    const cacheVersion = this.secretariesCacheVersion;

    this.secretariesRequest$ ??= this.http
      .get<ManagerSecretaryResponseDto[]>(`${this.managerApiUrl}/segreterie`)
      .pipe(
        tap((secretaries) => this.setSecretariesCache(secretaries, cacheVersion)),
        catchError((error) => {
          this.secretariesRequest$ = undefined;
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.secretariesRequest$;
  }

  /**
   * Recupera l'elenco campi usando cache in memoria, sessionStorage o backend.
   * @returns Observable con la lista campi sportivi.
   */
  getCampi(): Observable<ManagerFieldResponseDto[]> {
    if (this.fieldsCache) {
      return of(this.fieldsCache);
    }

    const storedFields = this.readStoredList<ManagerFieldResponseDto>(this.fieldsStorageKey);

    if (storedFields) {
      this.fieldsCache = storedFields;
      this.refreshFieldsCache();
      return of(storedFields);
    }

    const cacheVersion = this.fieldsCacheVersion;

    this.fieldsRequest$ ??= this.http
      .get<ManagerFieldResponseDto[]>(`${this.managerApiUrl}/campi`)
      .pipe(
        tap((fields) => this.setFieldsCache(fields, cacheVersion)),
        catchError((error) => {
          this.fieldsRequest$ = undefined;
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.fieldsRequest$;
  }

  /**
   * Precarica istruttori, segreterie e campi per velocizzare le schermate manageriali.
   */
  preloadStaffManagementLists(): void {
    this.getIstruttori().subscribe({ error: () => undefined });
    this.getSegreterie().subscribe({ error: () => undefined });
    this.getCampi().subscribe({ error: () => undefined });
  }

  /**
   * Recupera le immagini associate a un campo sportivo.
   * @param idCampo Identificativo del campo.
   * @returns Observable con le immagini del campo.
   */
  getImmaginiCampo(idCampo: number): Observable<ManagerFieldImageResponseDto[]> {
    return this.http
      .get<ManagerFieldImagesEnvelopeResponseDto>(`${this.campiApiUrl}/${idCampo}/immagini`)
      .pipe(map((response) => response.immagini ?? []));
  }

  /**
   * Crea un nuovo istruttore inviando dati JSON e foto tramite FormData.
   * @param data Dati anagrafici e professionali dell'istruttore.
   * @param foto Foto profilo dell'istruttore.
   * @returns Observable con l'istruttore creato.
   */
  creaIstruttore(
    data: ManagerCreateInstructorRequestDto,
    foto: File | null,
  ): Observable<ManagerInstructorResponseDto> {
    const formData = this.buildSinglePhotoFormData(data, foto);
    return this.http
      .post<ManagerInstructorResponseDto>(`${this.managerApiUrl}/crea/istruttori`, formData)
      .pipe(tap(() => this.clearInstructorsCache()));
  }

  /**
   * Invalida la cache istruttori e forza un nuovo caricamento dal backend.
   * @returns Observable con lista istruttori aggiornata.
   */
  refreshIstruttori(): Observable<ManagerInstructorResponseDto[]> {
    this.clearInstructorsCache();
    const cacheVersion = this.instructorsCacheVersion;

    this.instructorsRequest$ = this.http.get<ManagerInstructorResponseDto[]>(`${this.managerApiUrl}/istruttori`).pipe(
      tap((instructors) => this.setInstructorsCache(instructors, cacheVersion)),
      catchError((error) => {
        this.instructorsRequest$ = undefined;
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.instructorsRequest$;
  }

  /**
   * Aggiorna i dati di un istruttore e allinea la cache locale.
   * @param idIstruttore Identificativo dell'istruttore.
   * @param data Dati aggiornati.
   * @param foto Nuova foto oppure null.
   * @returns Observable con l'istruttore aggiornato.
   */
  aggiornaIstruttore(
    idIstruttore: number,
    data: ManagerUpdateInstructorRequestDto,
    foto: File | null,
  ): Observable<ManagerInstructorResponseDto> {
    const formData = this.buildSinglePhotoFormData(data, foto);
    return this.http
      .put<WrappedInstructorUpdateResponse>(`${this.managerApiUrl}/istruttori/${idIstruttore}/aggiorna-istruttore`, formData)
      .pipe(
        map((response) => response.istruttore),
        tap((instructor) => this.updateInstructorCache(instructor)),
      );
  }

  /**
   * Crea un nuovo account segreteria inviando dati e foto tramite FormData.
   * @param data Dati della segretaria.
   * @param foto Foto profilo oppure null.
   * @returns Observable con la segretaria creata.
   */
  creaSegreteria(
    data: ManagerCreateSecretaryRequestDto,
    foto: File | null,
  ): Observable<ManagerSecretaryResponseDto> {
    const formData = this.buildSinglePhotoFormData(data, foto);
    return this.http
      .post<ManagerSecretaryResponseDto>(`${this.managerApiUrl}/crea/segreterie`, formData)
      .pipe(tap(() => this.clearSecretariesCache()));
  }

  /**
   * Invalida la cache segreterie e forza un nuovo caricamento dal backend.
   * @returns Observable con lista segreterie aggiornata.
   */
  refreshSegreterie(): Observable<ManagerSecretaryResponseDto[]> {
    this.clearSecretariesCache();
    const cacheVersion = this.secretariesCacheVersion;

    this.secretariesRequest$ = this.http.get<ManagerSecretaryResponseDto[]>(`${this.managerApiUrl}/segreterie`).pipe(
      tap((secretaries) => this.setSecretariesCache(secretaries, cacheVersion)),
      catchError((error) => {
        this.secretariesRequest$ = undefined;
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.secretariesRequest$;
  }

  /**
   * Aggiorna i dati di una segretaria e allinea la cache locale.
   * @param idSegreteria Identificativo della segretaria.
   * @param data Dati aggiornati.
   * @param foto Nuova foto oppure null.
   * @returns Observable con la segretaria aggiornata.
   */
  aggiornaSegreteria(
    idSegreteria: number,
    data: ManagerUpdateSecretaryRequestDto,
    foto: File | null,
  ): Observable<ManagerSecretaryResponseDto> {
    const formData = this.buildSinglePhotoFormData(data, foto);
    return this.http
      .put<WrappedSecretaryUpdateResponse>(`${this.managerApiUrl}/segretarie/${idSegreteria}/aggiorna-segretaria`, formData)
      .pipe(
        map((response) => response.segretaria),
        tap((secretary) => this.updateSecretaryCache(secretary)),
      );
  }

  /**
   * Disattiva un utente gestito dal manager e aggiorna lo stato nella cache locale.
   * @param idUtente Identificativo dell'utente.
   * @returns Observable con messaggio testuale del backend.
   */
  disattivaUtente(idUtente: number): Observable<string> {
    return this.http
      .patch(`${this.managerApiUrl}/utenti/${idUtente}/disattiva`, {}, { responseType: 'text' })
      .pipe(tap(() => this.updateCachedUserActiveState(idUtente, false)));
  }

  /**
   * Riattiva un utente gestito dal manager e aggiorna lo stato nella cache locale.
   * @param idUtente Identificativo dell'utente.
   * @returns Observable con messaggio testuale del backend.
   */
  riattivaUtente(idUtente: number): Observable<string> {
    return this.http
      .patch(`${this.managerApiUrl}/utenti/${idUtente}/riattiva`, {}, { responseType: 'text' })
      .pipe(tap(() => this.updateCachedUserActiveState(idUtente, true)));
  }

  /**
   * Crea un nuovo campo sportivo inviando dati e immagini tramite FormData.
   * @param data Dati del campo.
   * @param immagini Immagini iniziali del campo.
   * @returns Observable con il campo creato.
   */
  creaCampo(data: ManagerCreateFieldRequestDto, immagini: File[]): Observable<ManagerFieldResponseDto> {
    const formData = new FormData();
    formData.append('data', new Blob([JSON.stringify(data)], { type: 'application/json' }));

    immagini.forEach((immagine) => {
      formData.append('foto', immagine);
    });

    return this.http
      .post<WrappedFieldResponse>(`${this.managerApiUrl}/crea/campi`, formData)
      .pipe(
        map((response) => response.campo),
        tap(() => this.clearFieldsCache()),
      );
  }

  /**
   * Invalida la cache campi e forza un nuovo caricamento dal backend.
   * @returns Observable con lista campi aggiornata.
   */
  refreshCampi(): Observable<ManagerFieldResponseDto[]> {
    this.clearFieldsCache();
    const cacheVersion = this.fieldsCacheVersion;

    this.fieldsRequest$ = this.http.get<ManagerFieldResponseDto[]>(`${this.managerApiUrl}/campi`).pipe(
      tap((fields) => this.setFieldsCache(fields, cacheVersion)),
      catchError((error) => {
        this.fieldsRequest$ = undefined;
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.fieldsRequest$;
  }

  /**
   * Aggiorna i dati di un campo e carica eventuali nuove immagini.
   * @param idCampo Identificativo del campo.
   * @param data Dati aggiornati.
   * @param nuoveImmagini Immagini da aggiungere.
   * @returns Observable con il campo aggiornato.
   */
  aggiornaCampo(
    idCampo: number,
    data: ManagerUpdateFieldRequestDto,
    nuoveImmagini: File[],
  ): Observable<ManagerFieldResponseDto> {
    const formData = new FormData();
    formData.append('data', new Blob([JSON.stringify(data)], { type: 'application/json' }));

    nuoveImmagini.forEach((immagine) => {
      formData.append('foto', immagine);
    });

    return this.http
      .put<WrappedFieldResponse>(`${this.managerApiUrl}/${idCampo}/aggiorna`, formData)
      .pipe(
        map((response) => response.campo),
        tap((field) => this.updateFieldCache(field)),
      );
  }

  /**
   * Elimina immagini specifiche associate a un campo.
   * @param idCampo Identificativo del campo.
   * @param idImmagini Identificativi delle immagini da eliminare.
   * @returns Observable con messaggio di esito.
   */
  eliminaImmaginiCampo(idCampo: number, idImmagini: number[]): Observable<{ message: string }> {
    return this.http
      .post<{ message: string }>(`${this.managerApiUrl}/${idCampo}/immagini/elimina`, { idImmagini })
      .pipe(tap(() => this.clearFieldsCache()));
  }

  /**
   * Disattiva un campo sportivo e aggiorna la cache locale.
   * @param idCampo Identificativo del campo.
   * @returns Observable con messaggio testuale del backend.
   */
  disattivaCampo(idCampo: number): Observable<string> {
    return this.http
      .patch(`${this.managerApiUrl}/${idCampo}/disattiva`, {}, { responseType: 'text' })
      .pipe(tap(() => this.updateFieldActiveCache(idCampo, false)));
  }

  /**
   * Riattiva un campo sportivo e aggiorna la cache locale.
   * @param idCampo Identificativo del campo.
   * @returns Observable con messaggio testuale del backend.
   */
  riattivaCampo(idCampo: number): Observable<string> {
    return this.http
      .patch(`${this.managerApiUrl}/${idCampo}/riattiva`, {}, { responseType: 'text' })
      .pipe(tap(() => this.updateFieldActiveCache(idCampo, true)));
  }

  /**
   * Invalida la cache degli istruttori in memoria e in sessionStorage.
   */
  private clearInstructorsCache(): void {
    this.instructorsCacheVersion += 1;
    this.instructorsRequest$ = undefined;
    this.instructorsCache = undefined;
    sessionStorage.removeItem(this.instructorsStorageKey);
  }

  /**
   * Invalida la cache delle segreterie in memoria e in sessionStorage.
   */
  private clearSecretariesCache(): void {
    this.secretariesCacheVersion += 1;
    this.secretariesRequest$ = undefined;
    this.secretariesCache = undefined;
    sessionStorage.removeItem(this.secretariesStorageKey);
  }

  /**
   * Invalida la cache dei campi in memoria e in sessionStorage.
   */
  private clearFieldsCache(): void {
    this.fieldsCacheVersion += 1;
    this.fieldsRequest$ = undefined;
    this.fieldsCache = undefined;
    sessionStorage.removeItem(this.fieldsStorageKey);
  }

  /**
   * Sostituisce nella cache locale un istruttore appena aggiornato.
   * @param updatedInstructor Istruttore aggiornato.
   */
  private updateInstructorCache(updatedInstructor: ManagerInstructorResponseDto): void {
    if (!this.instructorsCache) {
      return;
    }

    this.instructorsCache = this.instructorsCache.map((instructor) =>
      instructor.id === updatedInstructor.id ? updatedInstructor : instructor,
    );
    this.storeList(this.instructorsStorageKey, this.instructorsCache);
    this.instructorsRequest$ = of(this.instructorsCache).pipe(shareReplay({ bufferSize: 1, refCount: false }));
  }

  /**
   * Aggiorna in cache lo stato attivo/non attivo di istruttori o segreterie.
   * @param idUtente Identificativo dell'utente.
   * @param active Nuovo stato di attivazione.
   */
  private updateCachedUserActiveState(idUtente: number, active: boolean): void {
    if (this.instructorsCache?.some((instructor) => instructor.id === idUtente)) {
      this.instructorsCache = this.instructorsCache.map((instructor) =>
        instructor.id === idUtente ? { ...instructor, attivo: active } : instructor,
      );
      this.storeList(this.instructorsStorageKey, this.instructorsCache);
      this.instructorsRequest$ = of(this.instructorsCache).pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }

    if (this.secretariesCache?.some((secretary) => secretary.id === idUtente)) {
      this.secretariesCache = this.secretariesCache.map((secretary) =>
        secretary.id === idUtente ? { ...secretary, attivo: active } : secretary,
      );
      this.storeList(this.secretariesStorageKey, this.secretariesCache);
      this.secretariesRequest$ = of(this.secretariesCache).pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }
  }

  /**
   * Costruisce il FormData standard per richieste con dati JSON e una singola foto.
   * @param data Oggetto dati da inviare come JSON.
   * @param foto File immagine opzionale.
   * @returns FormData pronto per la richiesta HTTP.
   */
  private buildSinglePhotoFormData(data: object, foto: File | null): FormData {
    const formData = new FormData();
    formData.append('data', new Blob([JSON.stringify(data)], { type: 'application/json' }));

    if (foto) {
      formData.append('foto', foto);
    }

    return formData;
  }

  /**
   * Aggiorna in background la cache istruttori mantenendo il controllo di versione.
   */
  private refreshInstructorsCache(): void {
    const cacheVersion = this.instructorsCacheVersion;

    this.http.get<ManagerInstructorResponseDto[]>(`${this.managerApiUrl}/istruttori`).subscribe({
      next: (instructors) => this.setInstructorsCache(instructors, cacheVersion),
      error: () => undefined,
    });
  }

  /**
   * Salva la lista istruttori in cache se la versione è ancora valida.
   * @param instructors Lista istruttori.
   * @param cacheVersion Versione cache usata per evitare aggiornamenti obsoleti.
   */
  private setInstructorsCache(
    instructors: ManagerInstructorResponseDto[],
    cacheVersion = this.instructorsCacheVersion,
  ): void {
    if (cacheVersion !== this.instructorsCacheVersion) {
      return;
    }

    this.instructorsCache = instructors;
    this.storeList(this.instructorsStorageKey, instructors);
  }

  /**
   * Legge la lista istruttori salvata in sessionStorage.
   * @returns Lista istruttori oppure null.
   */
  private readStoredInstructors(): ManagerInstructorResponseDto[] | null {
    return this.readStoredList<ManagerInstructorResponseDto>(this.instructorsStorageKey);
  }

  /**
   * Aggiorna in background la cache segreterie mantenendo il controllo di versione.
   */
  private refreshSecretariesCache(): void {
    const cacheVersion = this.secretariesCacheVersion;

    this.http.get<ManagerSecretaryResponseDto[]>(`${this.managerApiUrl}/segreterie`).subscribe({
      next: (secretaries) => this.setSecretariesCache(secretaries, cacheVersion),
      error: () => undefined,
    });
  }

  /**
   * Aggiorna in background la cache campi mantenendo il controllo di versione.
   */
  private refreshFieldsCache(): void {
    const cacheVersion = this.fieldsCacheVersion;

    this.http.get<ManagerFieldResponseDto[]>(`${this.managerApiUrl}/campi`).subscribe({
      next: (fields) => this.setFieldsCache(fields, cacheVersion),
      error: () => undefined,
    });
  }

  /**
   * Salva la lista segreterie in cache se la versione è ancora valida.
   * @param secretaries Lista segreterie.
   * @param cacheVersion Versione cache usata per evitare aggiornamenti obsoleti.
   */
  private setSecretariesCache(
    secretaries: ManagerSecretaryResponseDto[],
    cacheVersion = this.secretariesCacheVersion,
  ): void {
    if (cacheVersion !== this.secretariesCacheVersion) {
      return;
    }

    this.secretariesCache = secretaries;
    this.storeList(this.secretariesStorageKey, secretaries);
  }

  /**
   * Salva la lista campi in cache se la versione è ancora valida.
   * @param fields Lista campi.
   * @param cacheVersion Versione cache usata per evitare aggiornamenti obsoleti.
   */
  private setFieldsCache(fields: ManagerFieldResponseDto[], cacheVersion = this.fieldsCacheVersion): void {
    if (cacheVersion !== this.fieldsCacheVersion) {
      return;
    }

    this.fieldsCache = fields;
    this.storeList(this.fieldsStorageKey, fields);
  }

  /**
   * Sostituisce nella cache locale una segretaria appena aggiornata.
   * @param updatedSecretary Segretaria aggiornata.
   */
  private updateSecretaryCache(updatedSecretary: ManagerSecretaryResponseDto): void {
    if (!this.secretariesCache) {
      return;
    }

    this.secretariesCache = this.secretariesCache.map((secretary) =>
      secretary.id === updatedSecretary.id ? updatedSecretary : secretary,
    );
    this.storeList(this.secretariesStorageKey, this.secretariesCache);
    this.secretariesRequest$ = of(this.secretariesCache).pipe(shareReplay({ bufferSize: 1, refCount: false }));
  }

  /**
   * Sostituisce nella cache locale un campo appena aggiornato.
   * @param updatedField Campo aggiornato.
   */
  private updateFieldCache(updatedField: ManagerFieldResponseDto): void {
    if (!this.fieldsCache) {
      return;
    }

    this.fieldsCache = this.fieldsCache.map((field) => (field.id === updatedField.id ? updatedField : field));
    this.storeList(this.fieldsStorageKey, this.fieldsCache);
    this.fieldsRequest$ = of(this.fieldsCache).pipe(shareReplay({ bufferSize: 1, refCount: false }));
  }

  /**
   * Aggiorna in cache lo stato attivo/non attivo di un campo.
   * @param idCampo Identificativo del campo.
   * @param active Nuovo stato di attivazione.
   */
  private updateFieldActiveCache(idCampo: number, active: boolean): void {
    if (!this.fieldsCache?.some((field) => field.id === idCampo)) {
      return;
    }

    this.fieldsCache = this.fieldsCache.map((field) => (field.id === idCampo ? { ...field, attivo: active } : field));
    this.storeList(this.fieldsStorageKey, this.fieldsCache);
    this.fieldsRequest$ = of(this.fieldsCache).pipe(shareReplay({ bufferSize: 1, refCount: false }));
  }

  private readStoredList<T>(storageKey: string): T[] | null {
    const rawInstructors = sessionStorage.getItem(storageKey);

    if (!rawInstructors) {
      return null;
    }

    try {
      const parsedInstructors = JSON.parse(rawInstructors) as unknown;
      return Array.isArray(parsedInstructors) ? (parsedInstructors as T[]) : null;
    } catch {
      sessionStorage.removeItem(storageKey);
      return null;
    }
  }

  /**
   * Salva una lista generica in sessionStorage.
   * @param storageKey Chiave sessionStorage.
   * @param items Elementi da salvare.
   */
  private storeList(storageKey: string, items: unknown[]): void {
    sessionStorage.setItem(storageKey, JSON.stringify(items));
  }
}
