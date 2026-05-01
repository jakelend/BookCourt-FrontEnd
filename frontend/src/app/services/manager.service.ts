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

interface WrappedFieldResponse {
  message: string;
  campo: ManagerFieldResponseDto;
}

interface WrappedInstructorUpdateResponse {
  message: string;
  istruttore: ManagerInstructorResponseDto;
}

interface WrappedSecretaryUpdateResponse {
  message: string;
  segretaria: ManagerSecretaryResponseDto;
}

@Injectable({
  providedIn: 'root',
})
export class ManagerService {
  private readonly managerApiUrl = 'http://localhost:8080/api/manager';
  private readonly campiApiUrl = 'http://localhost:8080/api/campi';
  private readonly instructorsStorageKey = 'bookcourt_manager_instructors';
  private readonly secretariesStorageKey = 'bookcourt_manager_secretaries';
  private readonly fieldsStorageKey = 'bookcourt_manager_fields';
  private instructorsRequest$?: Observable<ManagerInstructorResponseDto[]>;
  private secretariesRequest$?: Observable<ManagerSecretaryResponseDto[]>;
  private fieldsRequest$?: Observable<ManagerFieldResponseDto[]>;
  private instructorsCache?: ManagerInstructorResponseDto[];
  private secretariesCache?: ManagerSecretaryResponseDto[];
  private fieldsCache?: ManagerFieldResponseDto[];
  private instructorsCacheVersion = 0;
  private secretariesCacheVersion = 0;
  private fieldsCacheVersion = 0;

  constructor(private readonly http: HttpClient) {}

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

  preloadStaffManagementLists(): void {
    this.getIstruttori().subscribe({ error: () => undefined });
    this.getSegreterie().subscribe({ error: () => undefined });
    this.getCampi().subscribe({ error: () => undefined });
  }

  getImmaginiCampo(idCampo: number): Observable<ManagerFieldImageResponseDto[]> {
    return this.http
      .get<ManagerFieldImagesEnvelopeResponseDto>(`${this.campiApiUrl}/${idCampo}/immagini`)
      .pipe(map((response) => response.immagini ?? []));
  }

  creaIstruttore(data: ManagerCreateInstructorRequestDto, foto: File | null): Observable<string> {
    const formData = this.buildSinglePhotoFormData(data, foto);
    return this.http
      .post(`${this.managerApiUrl}/crea/istruttori`, formData, { responseType: 'text' })
      .pipe(tap(() => this.clearInstructorsCache()));
  }

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

  creaSegreteria(data: ManagerCreateSecretaryRequestDto, foto: File | null): Observable<string> {
    const formData = this.buildSinglePhotoFormData(data, foto);
    return this.http
      .post(`${this.managerApiUrl}/crea/segreterie`, formData, { responseType: 'text' })
      .pipe(tap(() => this.clearSecretariesCache()));
  }

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

  disattivaUtente(idUtente: number): Observable<string> {
    return this.http
      .patch(`${this.managerApiUrl}/utenti/${idUtente}/disattiva`, {}, { responseType: 'text' })
      .pipe(tap(() => this.updateCachedUserActiveState(idUtente, false)));
  }

  riattivaUtente(idUtente: number): Observable<string> {
    return this.http
      .patch(`${this.managerApiUrl}/utenti/${idUtente}/riattiva`, {}, { responseType: 'text' })
      .pipe(tap(() => this.updateCachedUserActiveState(idUtente, true)));
  }

  creaCampo(data: ManagerCreateFieldRequestDto, immagini: File[]): Observable<string> {
    const formData = new FormData();
    formData.append('data', new Blob([JSON.stringify(data)], { type: 'application/json' }));

    immagini.forEach((immagine) => {
      formData.append('foto', immagine);
    });

    return this.http
      .post(`${this.managerApiUrl}/crea/campi`, formData, { responseType: 'text' })
      .pipe(tap(() => this.clearFieldsCache()));
  }

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

  eliminaImmaginiCampo(idCampo: number, idImmagini: number[]): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.managerApiUrl}/${idCampo}/immagini/elimina`, { idImmagini });
  }

  disattivaCampo(idCampo: number): Observable<string> {
    return this.http
      .patch(`${this.managerApiUrl}/${idCampo}/disattiva`, {}, { responseType: 'text' })
      .pipe(tap(() => this.updateFieldActiveCache(idCampo, false)));
  }

  riattivaCampo(idCampo: number): Observable<string> {
    return this.http
      .patch(`${this.managerApiUrl}/${idCampo}/riattiva`, {}, { responseType: 'text' })
      .pipe(tap(() => this.updateFieldActiveCache(idCampo, true)));
  }

  private clearInstructorsCache(): void {
    this.instructorsCacheVersion += 1;
    this.instructorsRequest$ = undefined;
    this.instructorsCache = undefined;
    sessionStorage.removeItem(this.instructorsStorageKey);
  }

  private clearSecretariesCache(): void {
    this.secretariesCacheVersion += 1;
    this.secretariesRequest$ = undefined;
    this.secretariesCache = undefined;
    sessionStorage.removeItem(this.secretariesStorageKey);
  }

  private clearFieldsCache(): void {
    this.fieldsCacheVersion += 1;
    this.fieldsRequest$ = undefined;
    this.fieldsCache = undefined;
    sessionStorage.removeItem(this.fieldsStorageKey);
  }

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

  private buildSinglePhotoFormData(data: object, foto: File | null): FormData {
    const formData = new FormData();
    formData.append('data', new Blob([JSON.stringify(data)], { type: 'application/json' }));

    if (foto) {
      formData.append('foto', foto);
    }

    return formData;
  }

  private refreshInstructorsCache(): void {
    const cacheVersion = this.instructorsCacheVersion;

    this.http.get<ManagerInstructorResponseDto[]>(`${this.managerApiUrl}/istruttori`).subscribe({
      next: (instructors) => this.setInstructorsCache(instructors, cacheVersion),
      error: () => undefined,
    });
  }

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

  private readStoredInstructors(): ManagerInstructorResponseDto[] | null {
    return this.readStoredList<ManagerInstructorResponseDto>(this.instructorsStorageKey);
  }

  private refreshSecretariesCache(): void {
    const cacheVersion = this.secretariesCacheVersion;

    this.http.get<ManagerSecretaryResponseDto[]>(`${this.managerApiUrl}/segreterie`).subscribe({
      next: (secretaries) => this.setSecretariesCache(secretaries, cacheVersion),
      error: () => undefined,
    });
  }

  private refreshFieldsCache(): void {
    const cacheVersion = this.fieldsCacheVersion;

    this.http.get<ManagerFieldResponseDto[]>(`${this.managerApiUrl}/campi`).subscribe({
      next: (fields) => this.setFieldsCache(fields, cacheVersion),
      error: () => undefined,
    });
  }

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

  private setFieldsCache(fields: ManagerFieldResponseDto[], cacheVersion = this.fieldsCacheVersion): void {
    if (cacheVersion !== this.fieldsCacheVersion) {
      return;
    }

    this.fieldsCache = fields;
    this.storeList(this.fieldsStorageKey, fields);
  }

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

  private updateFieldCache(updatedField: ManagerFieldResponseDto): void {
    if (!this.fieldsCache) {
      return;
    }

    this.fieldsCache = this.fieldsCache.map((field) => (field.id === updatedField.id ? updatedField : field));
    this.storeList(this.fieldsStorageKey, this.fieldsCache);
    this.fieldsRequest$ = of(this.fieldsCache).pipe(shareReplay({ bufferSize: 1, refCount: false }));
  }

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

  private storeList(storageKey: string, items: unknown[]): void {
    sessionStorage.setItem(storageKey, JSON.stringify(items));
  }
}
