/**
 * Servizio responsabile della gestione dell'autenticazione e del profilo utente.
 *
 * Centralizza le chiamate HTTP verso gli endpoint di login, registrazione,
 * cambio/reset password e profilo. Inoltre mantiene nel localStorage il token JWT
 * e le informazioni dell'utente autenticato, così che componenti, guard e
 * interceptor possano recuperarle in modo uniforme.
 */
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Role } from '../enumeration/role.enum';

/**
 * Payload inviato al backend per eseguire il login con email e password.
 */
export interface LoginRequestDto {
  email: string;
  password: string;
}

/**
 * Payload usato nella registrazione di un nuovo cliente.
 */
export interface RegisterClienteRequestDto {
  email: string;
  password: string;
  nome: string;
  cognome: string;
  telefono: string;
}

/**
 * Payload per il cambio password eseguito da un utente autenticato.
 */
export interface ChangePasswordRequestDto {
  email: string;
  passwordCorrente: string;
  passwordNuova: string;
  ripetutaPasswordNuova: string;
}

/**
 * Payload per richiedere la procedura di recupero password tramite email.
 */
export interface ForgotPasswordRequestDto {
  email: string;
}

/**
 * Payload per impostare una nuova password utilizzando il token di reset.
 */
export interface ResetPasswordRequestDto {
  token: string;
  passwordNuova: string;
  ripetutaPasswordNuova: string;
}

/**
 * Risposta generica del backend per operazioni che restituiscono esito e messaggio.
 */
export interface MessageResponseDto {
  success: boolean;
  message: string;
}

/**
 * Risposta di autenticazione contenente token JWT e dati principali dell'utente.
 */
export interface LoginResponseDto {
  token: string;
  type: string;
  id: number;
  email: string;
  nome: string;
  cognome: string;
  ruolo: Role;
  fotoProfiloUrl?: string | null;
}

/**
 * Risposta minimale dell'endpoint /me con i dati dell'utente autenticato.
 */
export interface MeResponseDto {
  id: number;
  email: string;
  nome: string;
  cognome: string;
  ruolo: Role;
}

/**
 * DTO completo del profilo utente mostrato e modificato nella sezione profilo.
 */
export interface ProfileResponseDto {
  id: number;
  email: string;
  nome: string;
  cognome: string;
  telefono: string;
  fotoProfiloUrl: string | null;
  ruolo: Role;
  attivo: boolean;
  costoOrarioTennis?: number | null;
  costoOrarioPadel?: number | null;
}

/**
 * Payload per aggiornare i dati personali modificabili dal profilo.
 */
export interface UpdatePersonalDataRequestDto {
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
}

/**
 * Risposta restituita dopo l'aggiornamento dei dati personali.
 */
export interface UpdatePersonalDataResponseDto {
  message: string;
  cliente: ProfileResponseDto;
}

/**
 * Service Angular singleton che espone funzionalità di autenticazione, sessione e profilo.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiUrl = 'http://localhost:8080/api/auth';
  private readonly profileUrl = 'http://localhost:8080/api/profilo';
  private readonly tokenKey = 'bookcourt_token';
  private readonly userKey = 'bookcourt_user';

  constructor(private readonly http: HttpClient) {}

  /**
   * Esegue il login dell'utente e salva la sessione in caso di risposta positiva.
   * @param payload Credenziali inserite dall'utente.
   * @returns Observable con token JWT e dati principali dell'utente autenticato.
   */
  login(payload: LoginRequestDto): Observable<LoginResponseDto> {
    return this.http
      .post<LoginResponseDto>(`${this.apiUrl}/login`, payload)
      .pipe(tap((response) => this.saveSession(response)));
  }

  /**
   * Registra un nuovo cliente e, al termine, salva automaticamente la sessione ricevuta.
   * @param payload Dati necessari alla registrazione del cliente.
   * @returns Observable con token JWT e dati del cliente registrato.
   */
  registerCliente(payload: RegisterClienteRequestDto): Observable<LoginResponseDto> {
    return this.http
      .post<LoginResponseDto>(`${this.apiUrl}/registrazione/cliente`, payload)
      .pipe(tap((response) => this.saveSession(response)));
  }

  /**
   * Richiede al backend il cambio password dell'utente autenticato.
   * @param payload Password corrente, nuova password e conferma.
   * @returns Observable con messaggio di esito dell'operazione.
   */
  changePassword(payload: ChangePasswordRequestDto): Observable<MessageResponseDto> {
    return this.http.patch<MessageResponseDto>(`${this.apiUrl}/cambia-password`, payload);
  }

  /**
   * Avvia la procedura di recupero password tramite email.
   * @param payload Email dell'utente che ha dimenticato la password.
   * @returns Observable con messaggio di esito.
   */
  forgotPassword(payload: ForgotPasswordRequestDto): Observable<MessageResponseDto> {
    return this.http.post<MessageResponseDto>(`${this.apiUrl}/forgot-password`, payload);
  }

  /**
   * Completa il reset password usando il token ricevuto via email.
   * @param payload Token di reset e nuova password.
   * @returns Observable con messaggio di esito.
   */
  resetPassword(payload: ResetPasswordRequestDto): Observable<MessageResponseDto> {
    return this.http.post<MessageResponseDto>(`${this.apiUrl}/reset-password`, payload);
  }

  /**
   * Verifica se il token JWT salvato localmente è ancora valido per il backend.
   * @returns Observable con esito della validazione.
   */
  validateToken(): Observable<MessageResponseDto> {
    const token = this.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;

    return this.http.post<MessageResponseDto>(`${this.apiUrl}/validate`, {}, { headers });
  }

  /**
   * Recupera i dati essenziali dell'utente autenticato.
   * @returns Observable con id, email, nome, cognome e ruolo.
   */
  me(): Observable<MeResponseDto> {
    return this.http.get<MeResponseDto>(`${this.apiUrl}/me`);
  }

  /**
   * Aggiorna nel localStorage i dati dell'utente partendo dalla risposta dell'endpoint /me.
   * @returns Observable con i dati aggiornati dell'utente autenticato.
   */
  refreshCurrentUserFromAuthMe(): Observable<MeResponseDto> {
    return this.me().pipe(
      tap((response) => {
        this.updateCurrentUserFromMe(response);
        this.notifyCurrentUserUpdated();
      }),
    );
  }

  /**
   * Recupera il profilo completo dell'utente autenticato.
   * @returns Observable con dati personali, ruolo, stato e informazioni aggiuntive.
   */
  getCurrentProfile(): Observable<ProfileResponseDto> {
    return this.http.get<ProfileResponseDto>(`${this.profileUrl}/me`);
  }

  /**
   * Invia al backend i nuovi dati personali dell'utente.
   * @param payload Dati personali aggiornati.
   * @returns Observable con messaggio e profilo aggiornato.
   */
  updatePersonalData(payload: UpdatePersonalDataRequestDto): Observable<UpdatePersonalDataResponseDto> {
    /*
      Questa chiamata modifica prima i dati nel database.
      Non aggiorniamo qui il localStorage: dopo il salvataggio il componente
      richiama /api/auth/me e solo quella risposta aggiorna il nome in alto.
    */
    return this.http.put<UpdatePersonalDataResponseDto>(
      `${this.profileUrl}/me/dati-personali`,
      payload,
    );
  }

  /**
   * Esegue il logout lato frontend rimuovendo token e dati utente dal localStorage.
   */
  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  /**
   * Restituisce il token JWT salvato localmente.
   * @returns Token JWT oppure null se l'utente non è autenticato.
   */
  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  /**
   * Indica se esiste un token JWT salvato nel browser.
   * @returns true se il token è presente, altrimenti false.
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  /**
   * Alias semantico di isAuthenticated, utile per rendere più leggibile il codice dei componenti.
   * @returns true se l'utente risulta autenticato lato frontend.
   */
  isLoggedIn(): boolean {
    return this.isAuthenticated();
  }

  /**
   * Legge dal localStorage i dati dell'utente autenticato.
   * Se il JSON salvato è corrotto, la sessione viene eliminata per evitare stati incoerenti.
   * @returns Dati utente oppure null.
   */
  getCurrentUser(): LoginResponseDto | null {
    const rawUser = localStorage.getItem(this.userKey);

    if (!rawUser) {
      return null;
    }

    try {
      return JSON.parse(rawUser) as LoginResponseDto;
    } catch {
      this.logout();
      return null;
    }
  }

  /**
   * Restituisce il ruolo dell'utente autenticato.
   * @returns Ruolo applicativo oppure null se non esiste un utente in sessione.
   */
  getCurrentUserRole(): Role | null {
    return this.getCurrentUser()?.ruolo ?? null;
  }

  /**
   * Aggiorna localmente l'URL della foto profilo dell'utente corrente.
   * @param fotoProfiloUrl Nuovo URL della foto profilo oppure null.
   */
  updateCurrentUserProfilePhoto(fotoProfiloUrl: string | null): void {
    const currentUser = this.getCurrentUser();

    if (!currentUser) {
      return;
    }

    localStorage.setItem(
      this.userKey,
      JSON.stringify({
        ...currentUser,
        fotoProfiloUrl,
      }),
    );

    this.notifyCurrentUserUpdated();
  }

  /**
   * Sincronizza nel localStorage i dati dell'utente partendo dal profilo completo.
   * @param profile Profilo completo restituito dal backend.
   */
  updateCurrentUserFromProfile(profile: ProfileResponseDto): void {
    const currentUser = this.getCurrentUser();
    const token = this.getToken();

    if (!currentUser && !token) {
      return;
    }

    localStorage.setItem(
      this.userKey,
      JSON.stringify({
        token: currentUser?.token ?? token,
        type: currentUser?.type ?? 'Bearer',
        id: profile.id,
        email: profile.email,
        nome: profile.nome,
        cognome: profile.cognome,
        ruolo: profile.ruolo,
        fotoProfiloUrl: profile.fotoProfiloUrl,
      }),
    );

    this.notifyCurrentUserUpdated();
  }

  /**
   * Aggiorna nel localStorage i dati principali dell'utente mantenendo token e foto già presenti.
   * @param me Dati minimi restituiti dall'endpoint /me.
   */
  private updateCurrentUserFromMe(me: MeResponseDto): void {
    const currentUser = this.getCurrentUser();
    const token = this.getToken();

    if (!currentUser && !token) {
      return;
    }

    localStorage.setItem(
      this.userKey,
      JSON.stringify({
        token: currentUser?.token ?? token,
        type: currentUser?.type ?? 'Bearer',
        id: me.id,
        email: me.email,
        nome: me.nome,
        cognome: me.cognome,
        ruolo: me.ruolo,
        fotoProfiloUrl: currentUser?.fotoProfiloUrl ?? null,
      }),
    );
  }

  /**
   * Notifica l'applicazione che i dati dell'utente corrente sono stati aggiornati.
   */
  private notifyCurrentUserUpdated(): void {
    window.dispatchEvent(new CustomEvent('bookcourt-user-updated'));
  }

  /**
   * Calcola la route di destinazione dopo login o controllo del ruolo.
   * @param role Ruolo applicativo dell'utente.
   * @returns URL frontend verso cui reindirizzare l'utente.
   */
  getRedirectUrlForRole(role: Role | null): string {
    switch (role) {
      case Role.CLIENTE:
        return '/dashboard';

      case Role.SEGRETARIA:
        return '/dashboard';

      case Role.MANAGER:
        return '/dashboard';

      case Role.ISTRUTTORE:
        return '/dashboard';

      default:
        return '/login';
    }
  }

  /**
   * Salva token JWT e dati utente nel localStorage.
   * @param response Risposta di login o registrazione.
   */
  private saveSession(response: LoginResponseDto): void {
    localStorage.setItem(this.tokenKey, response.token);
    localStorage.setItem(this.userKey, JSON.stringify(response));
  }
}
