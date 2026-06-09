import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Interceptor HTTP responsabile della gestione automatica del token JWT.
 *
 * L'interceptor intercetta tutte le richieste HTTP in uscita dal frontend. Se nel servizio
 * di autenticazione è presente un token, la richiesta viene clonata aggiungendo l'header
 * `Authorization: Bearer <token>`, così il backend può riconoscere l'utente autenticato.
 *
 * Inoltre gestisce le risposte 401 non autorizzate: quando il backend segnala che la sessione
 * non è più valida, il frontend esegue il logout locale e reindirizza l'utente alla pagina di login.
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  /**
   * Costruisce l'interceptor iniettando autenticazione e router.
   *
   * @param authService servizio usato per leggere il token e pulire la sessione utente
   * @param router servizio usato per reindirizzare l'utente alla login in caso di 401
   */
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  /**
   * Intercetta ogni richiesta HTTP prima che venga inviata al backend.
   *
   * Se esiste un token JWT, la richiesta viene clonata e arricchita con l'header
   * `Authorization`. La richiesta clonata viene poi passata al prossimo handler della catena.
   *
   * In caso di errore HTTP 401, eccetto la chiamata di login, la sessione locale viene eliminata
   * e l'utente viene riportato alla pagina di login.
   *
   * @param request richiesta HTTP originale generata dal frontend
   * @param next prossimo handler della catena degli interceptor Angular
   * @returns Observable con gli eventi HTTP prodotti dalla richiesta
   */
  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const token = this.authService.getToken();
    const authRequest = token
      ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : request;

    return next.handle(authRequest).pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && this.shouldClearSession(error, request.url)) {
          this.authService.logout();
          void this.router.navigate(['/login']);
        }

        return throwError(() => error);
      })
    );
  }

  /**
   * Stabilisce se un errore HTTP deve causare la pulizia della sessione locale.
   *
   * La sessione viene pulita solo davanti a un 401 Unauthorized e solo se la richiesta fallita
   * non è la login. In questo modo un normale errore di credenziali durante il login non provoca
   * comportamenti indesiderati sulla sessione già gestita dal servizio di autenticazione.
   *
   * @param error errore HTTP restituito dal backend
   * @param url URL della richiesta che ha generato l'errore
   * @returns true se bisogna fare logout locale e redirect alla login
   */
  private shouldClearSession(error: HttpErrorResponse, url: string): boolean {
    const isUnauthorized = error.status === 401;
    const isLoginRequest = url.includes('/api/auth/login');

    // Un 401 su cambia-password significa "password corrente sbagliata", non "JWT scaduto":
    // non va trattato come sessione invalida
    const isChangePasswordRequest = url.includes('/api/auth/cambia-password');

    return isUnauthorized && !isLoginRequest && !isChangePasswordRequest;
  }
}
