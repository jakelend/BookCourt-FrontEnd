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

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

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

  private shouldClearSession(error: HttpErrorResponse, url: string): boolean {
    const isUnauthorized = error.status === 401 || error.status === 403;
    const isLoginRequest = url.includes('/api/auth/login');

    return isUnauthorized && !isLoginRequest;
  }
}
