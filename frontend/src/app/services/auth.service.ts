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
import type { ChangePasswordRequestDto } from '../dto/request/auth/change-password-request.dto';
import type { ForgotPasswordRequestDto } from '../dto/request/auth/forgot-password-request.dto';
import type { LoginRequestDto } from '../dto/request/auth/login-request.dto';
import type { RegisterClienteRequestDto } from '../dto/request/auth/register-cliente-request.dto';
import type { ResetPasswordRequestDto } from '../dto/request/auth/reset-password-request.dto';
import type { UpdatePersonalDataRequestDto } from '../dto/request/profile/update-personal-data-request.dto';
import type { JwtResponseDto } from '../dto/response/auth/jwt-response.dto';
import type { MeResponseDto } from '../dto/response/auth/me-response.dto';
import type { MessageResponseDto } from '../dto/response/auth/message-response.dto';
import type { ProfileResponseDto } from '../dto/response/profile/profile-response.dto';
import type { UpdatePersonalDataResponseDto } from '../dto/response/profile/update-personal-data-response.dto';
import { environment } from '../../environments/environment';
import { Role } from '../enumeration/role.enum';
import { StorageKeys, StorageUtil } from '../util/storage.util';

type LoginResponseDto = JwtResponseDto;

/**
 * Service Angular singleton che espone funzionalità di autenticazione, sessione e profilo.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiUrl = `${environment.backendBaseUrl}/api/auth`;
  private readonly profileUrl = `${environment.backendBaseUrl}/api/profilo`;

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
    StorageUtil.removeItem(StorageKeys.token);
    StorageUtil.removeItem(StorageKeys.user);
  }

  /**
   * Restituisce il token JWT salvato localmente.
   * @returns Token JWT oppure null se l'utente non è autenticato.
   */
  getToken(): string | null {
    return StorageUtil.getItem(StorageKeys.token);
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
  getCurrentUser(): JwtResponseDto | null {
    const rawUser = StorageUtil.getItem(StorageKeys.user);

    if (!rawUser) {
      return null;
    }

    try {
      return JSON.parse(rawUser) as JwtResponseDto;
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

    StorageUtil.setItem(
      StorageKeys.user,
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

    StorageUtil.setItem(
      StorageKeys.user,
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

    StorageUtil.setItem(
      StorageKeys.user,
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
  private saveSession(response: JwtResponseDto): void {
    StorageUtil.setItem(StorageKeys.token, response.token);
    StorageUtil.setItem(StorageKeys.user, JSON.stringify(response));
  }
}
