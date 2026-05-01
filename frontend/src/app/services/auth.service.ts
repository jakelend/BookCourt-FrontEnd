import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Role } from '../enumeration/role.enum';

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface RegisterClienteRequestDto {
  email: string;
  password: string;
  nome: string;
  cognome: string;
  telefono: string;
  fotoProfiloUrl?: string | null;
}

export interface ChangePasswordRequestDto {
  email: string;
  passwordCorrente: string;
  passwordNuova: string;
  ripetutaPasswordNuova: string;
}

export interface ForgotPasswordRequestDto {
  email: string;
}

export interface ResetPasswordRequestDto {
  token: string;
  passwordNuova: string;
  ripetutaPasswordNuova: string;
}

export interface MessageResponseDto {
  success: boolean;
  message: string;
}

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

export interface MeResponseDto {
  id: number;
  email: string;
  nome: string;
  cognome: string;
  ruolo: Role;
}

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

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiUrl = 'http://localhost:8080/api/auth';
  private readonly profileUrl = 'http://localhost:8080/api/profilo';
  private readonly tokenKey = 'bookcourt_token';
  private readonly userKey = 'bookcourt_user';

  constructor(private readonly http: HttpClient) {}

  login(payload: LoginRequestDto): Observable<LoginResponseDto> {
    return this.http
      .post<LoginResponseDto>(`${this.apiUrl}/login`, payload)
      .pipe(tap((response) => this.saveSession(response)));
  }

  registerCliente(payload: RegisterClienteRequestDto): Observable<LoginResponseDto> {
    return this.http
      .post<LoginResponseDto>(`${this.apiUrl}/registrazione/cliente`, payload)
      .pipe(tap((response) => this.saveSession(response)));
  }

  changePassword(payload: ChangePasswordRequestDto): Observable<MessageResponseDto> {
    return this.http.patch<MessageResponseDto>(`${this.apiUrl}/cambia-password`, payload);
  }

  forgotPassword(payload: ForgotPasswordRequestDto): Observable<MessageResponseDto> {
    return this.http.post<MessageResponseDto>(`${this.apiUrl}/forgot-password`, payload);
  }

  resetPassword(payload: ResetPasswordRequestDto): Observable<MessageResponseDto> {
    return this.http.post<MessageResponseDto>(`${this.apiUrl}/reset-password`, payload);
  }

  validateToken(): Observable<MessageResponseDto> {
    const token = this.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;

    return this.http.post<MessageResponseDto>(`${this.apiUrl}/validate`, {}, { headers });
  }

  me(): Observable<MeResponseDto> {
    return this.http.get<MeResponseDto>(`${this.apiUrl}/me`);
  }

  getCurrentProfile(): Observable<ProfileResponseDto> {
    return this.http.get<ProfileResponseDto>(`${this.profileUrl}/me`);
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  isLoggedIn(): boolean {
    return this.isAuthenticated();
  }

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

  getCurrentUserRole(): Role | null {
    return this.getCurrentUser()?.ruolo ?? null;
  }

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
  }

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
  }

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

  private saveSession(response: LoginResponseDto): void {
    localStorage.setItem(this.tokenKey, response.token);
    localStorage.setItem(this.userKey, JSON.stringify(response));
  }
}
