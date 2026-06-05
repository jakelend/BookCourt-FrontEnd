export interface BackendErrorResponse {
  error?: string;
  errore?: string;
  message?: string;
  fields?: Record<string, string>;
}

export interface BackendErrorMessageOptions {
  statusMessages?: Partial<Record<number, string>>;
  timeoutMessage?: string;
  useGenericErrorMessage?: boolean;
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

interface HttpErrorLike {
  error?: unknown;
  status?: number;
  name?: string;
  message?: string;
}

export function extractBackendErrorMessage(
  error: unknown,
  fallback: string,
  options: BackendErrorMessageOptions = {},
): string {
  const httpError = toHttpErrorLike(error);

  if (httpError?.name === 'TimeoutError') {
    return options.timeoutMessage ?? 'Richiesta scaduta: il backend non ha risposto. Controlla il terminale Spring Boot.';
  }

  const backendBody = parseBackendErrorBody(httpError?.error);

  if (backendBody?.fields && Object.keys(backendBody.fields).length > 0) {
    return Object.entries(backendBody.fields)
      .map(([field, message]) => `${toReadableFieldName(field)}: ${message}`)
      .join(' - ');
  }

  if (backendBody?.message) {
    return backendBody.message;
  }

  if (backendBody?.errore) {
    return backendBody.errore;
  }

  if (backendBody?.error) {
    return backendBody.error;
  }

  if (typeof httpError?.error === 'string' && httpError.error.trim()) {
    return httpError.error;
  }

  if (httpError?.message && options.useGenericErrorMessage) {
    return httpError.message;
  }

  const customStatusMessage = httpError?.status !== undefined ? options.statusMessages?.[httpError.status] : undefined;

  if (customStatusMessage) {
    return customStatusMessage;
  }

  switch (httpError?.status) {
    case 0:
      return 'Backend non raggiungibile. Controlla che Spring Boot sia avviato sulla porta 8080.';
    case 400:
      return 'Dati non validi. Controlla i campi inseriti.';
    case 401:
      return 'Sessione scaduta. Effettua nuovamente il login.';
    case 403:
      return 'Non hai i permessi per eseguire questa operazione.';
    case 404:
      return 'Elemento non trovato.';
    case 409:
      return 'Operazione non riuscita: esiste già un elemento con questi dati.';
    case 413:
      return 'File troppo grande. Controlla la dimensione delle immagini.';
    case 500:
      return 'Errore interno del server. Controlla il terminale Spring Boot.';
    default:
      return fallback;
  }
}

export function extractBackendFieldErrors<K extends string>(
  error: unknown,
  knownFields: readonly K[],
): FieldErrors<K> {
  const httpError = toHttpErrorLike(error);
  const backendBody = parseBackendErrorBody(httpError?.error);

  if (!backendBody?.fields || typeof backendBody.fields !== 'object') {
    return {};
  }

  const allowedFields = new Set<string>(knownFields);
  const mappedErrors: FieldErrors<K> = {};

  for (const [fieldName, message] of Object.entries(backendBody.fields)) {
    if (allowedFields.has(fieldName)) {
      mappedErrors[fieldName as K] = message;
    }
  }

  return mappedErrors;
}

function toHttpErrorLike(error: unknown): HttpErrorLike | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  return error as HttpErrorLike;
}

function parseBackendErrorBody(rawError: unknown): BackendErrorResponse | null {
  if (!rawError) {
    return null;
  }

  if (typeof rawError === 'object') {
    return rawError as BackendErrorResponse;
  }

  if (typeof rawError !== 'string') {
    return null;
  }

  const trimmed = rawError.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as BackendErrorResponse) : null;
  } catch {
    return null;
  }
}

function toReadableFieldName(field: string): string {
  const labels: Record<string, string> = {
    nome: 'Nome',
    cognome: 'Cognome',
    email: 'Email',
    password: 'Password',
    telefono: 'Telefono',
    fotoProfiloUrl: 'Foto profilo',
    sport: 'Sport',
    costoOrario: 'Tariffa oraria',
    costoOrarioTennis: 'Tariffa tennis',
    costoOrarioPadel: 'Tariffa padel',
    attivo: 'Stato',
    idImmagini: 'Immagini',
  };

  return labels[field] ?? field;
}
