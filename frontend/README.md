# BookCourt Frontend

BookCourt Frontend e la single page application che fa da interfaccia alla web
app BookCourt per la gestione di un centro sportivo. Permette di prenotare campi
da tennis, padel e calcetto, gestire istruttori, segretarie, manutenzioni,
disponibilita a calendario, chat operativa e funziona con ruoli diversi per
clienti e staff.

E sviluppata in Angular e dialoga con il backend Spring Boot tramite chiamate
REST e WebSocket per la chat.

## Prerequisiti

Prima di avviare il progetto servono:

- Node.js 20 o superiore installato e disponibile nel `PATH`.
- npm (incluso con Node.js) per la gestione delle dipendenze.
- Il backend BookCourt in esecuzione, tipicamente su `http://localhost:8080`.

Angular CLI non e obbligatorio installarlo globalmente: viene usato tramite gli
script npm del progetto (`npm start`, `npm run build`, `npm test`).

## Installazione delle dipendenze

Dalla cartella del frontend:

```bash
cd frontend
npm install
```

## Configurazione del backend

L'URL del backend si trova in:

```text
frontend/src/environments/environment.ts
```

Valore predefinito:

```ts
export const environment = {
  backendBaseUrl: 'http://localhost:8080',
} as const;
```

Se il backend gira su un host o una porta diversi, modifica
`backendBaseUrl` in questo file. Ricorda che il backend abilita le chiamate
(CORS) per `http://localhost:4200` e `http://localhost:3000`: avvia il frontend
su una di queste porte oppure aggiorna la configurazione CORS lato backend.

## Avvio in sviluppo

Dalla cartella del frontend:

```bash
cd frontend
npm start
```

In alternativa, con Angular CLI:

```bash
ng serve
```

L'applicazione e disponibile a:

```text
http://localhost:4200
```

Il server di sviluppo ricarica automaticamente la pagina a ogni modifica dei
file sorgente.

## Build di produzione

Per generare la build ottimizzata:

```bash
npm run build
```

Gli artefatti vengono salvati nella cartella `dist/`. Per ricompilare in modo
continuo durante lo sviluppo:

```bash
npm run watch
```

## Ruoli e accesso

L'applicazione gestisce quattro ruoli, ognuno con funzioni e rotte dedicate:

| Ruolo       | Funzioni principali                                                        |
|-------------|---------------------------------------------------------------------------|
| Manager     | Gestione di istruttori, segretarie e campi sportivi; chat.                |
| Segretaria  | Manutenzioni campi, eccezioni orarie del centro e dei calendari; chat.    |
| Istruttore  | Consultazione del proprio calendario.                                     |
| Cliente     | Flusso di prenotazione, annullamento, feedback, gestione account; chat.   |

Le rotte private sono protette da `AuthGuard` (autenticazione) e da `RoleGuard`
(autorizzazione in base al ruolo). Gli utenti gia autenticati non possono
accedere alle pagine pubbliche di login e registrazione grazie a `GuestGuard`.

L'autenticazione si basa su token JWT: dopo il login il token viene allegato
automaticamente alle richieste HTTP protette tramite `AuthInterceptor`.

## Flusso consigliato per l'avvio

1. Avvia il backend BookCourt (vedi il README del backend) su
   `http://localhost:8080`.
2. Installa le dipendenze del frontend, se non gia fatto:

```bash
cd frontend
npm install
```

3. Avvia il server di sviluppo:

```bash
npm start
```

4. Apri il browser su `http://localhost:4200` ed effettua il login.

Per provare l'applicazione con dati dimostrativi, applica il seed del backend
e accedi con uno degli account inclusi (vedi il README del backend per
credenziali e password).

## Struttura del progetto

Il codice sorgente principale si trova in `frontend/src/app`:

- `components/` — componenti delle pagine, organizzati per area funzionale
  (auth, booking, chat, dashboard, fields, instructors, secretaries, ecc.).
- `services/` — servizi che incapsulano le chiamate REST e la logica condivisa,
  inclusa la gestione della chat via WebSocket.
- `guard/` — guardie di rotta per autenticazione, ruoli e accesso ospite.
- `interceptor/` — interceptor HTTP per l'aggiunta del token JWT.
- `dto/` — definizioni dei dati scambiati con il backend.
- `enumeration/` — enumerazioni condivise (ruoli, sport).
- `util/` — funzioni e helper di utilita.

Le rotte dell'applicazione sono definite in `frontend/src/app/app.routes.ts`,
mentre i provider globali (routing, HttpClient, Angular Material, localizzazione
italiana delle date) sono configurati in `frontend/src/app/app.config.ts`.

## Note

- L'interfaccia usa Angular Material e Tailwind CSS per lo stile.
- La localizzazione di date e calendari e impostata su italiano (`it-IT`).
- La chat operativa usa STOMP su WebSocket (SockJS) verso il backend.
