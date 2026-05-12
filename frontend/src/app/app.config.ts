import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { routes } from './app.routes';
import { AuthInterceptor } from './interceptor/auth.interceptor';

/**
 * Configurazione globale dell'applicazione Angular.
 *
 * In questo oggetto vengono registrati i provider usati da tutta l'applicazione:
 * routing, animazioni Angular Material, gestione date in italiano, client HTTP
 * e interceptor per l'autenticazione tramite JWT.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    // Abilita la gestione globale degli errori del browser.
    provideBrowserGlobalErrorListeners(),

    // Registra le rotte principali definite in app.routes.ts.
    provideRouter(routes),

    // Abilita le animazioni necessarie ai componenti Angular Material.
    provideAnimationsAsync(),

    // Configura l'adapter nativo per la gestione delle date.
    provideNativeDateAdapter(),

    // Imposta la localizzazione italiana per date e calendari.
    { provide: MAT_DATE_LOCALE, useValue: 'it-IT' },

    // Abilita HttpClient e permette l'utilizzo degli interceptor registrati via dependency injection.
    provideHttpClient(withInterceptorsFromDi()),

    // Registra AuthInterceptor per allegare il token JWT alle richieste HTTP protette.
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    },
  ],
};
