import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

/**
 * Avvia l'applicazione Angular in modalità standalone.
 *
 * Componente `App` e usa `appConfig` per caricare
 * rotte, interceptor HTTP, provider globali e configurazioni condivise
 */
bootstrapApplication(App, appConfig)

  // Stampa in console eventuali errori avvenuti durante il bootstrap iniziale.
  .catch((err) => console.error(err));
