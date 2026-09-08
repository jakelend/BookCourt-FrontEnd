/**
 * Servizio REST della chat applicativa.
 *
 * Gestisce il recupero delle conversazioni, il caricamento dei messaggi,
 * l'invio dei nuovi messaggi e una cache lato frontend basata su memoria e
 * sessionStorage, utile per rendere la navigazione più fluida.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, of, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { InviaMessaggioChatRequestDto } from '../dto/request/chat/invia-messaggio-chat-request.dto';
import { ConversazioneChatResponseDto } from '../dto/response/chat/conversazione-chat-response.dto';
import { MessaggioChatResponseDto } from '../dto/response/chat/messaggio-chat-response.dto';
import { AuthService } from './auth.service';

/**
 * Service Angular singleton che gestisce le API REST della chat e la cache dei messaggi.
 */
@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private readonly apiUrl = `${environment.backendBaseUrl}/api/chat`;
  private readonly conversationsStorageKeyPrefix = 'bookcourt_chat_conversations';
  private readonly messagesStorageKeyPrefix = 'bookcourt_chat_messages';
  private conversationsCache?: ConversazioneChatResponseDto[];
  private conversationsRequest$?: Observable<ConversazioneChatResponseDto[]>;
  private readonly messagesCache = new Map<number, MessaggioChatResponseDto[]>();
  private readonly messagesRequests = new Map<number, Observable<MessaggioChatResponseDto[]>>();
  private selectedConversationId: number | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService,
  ) {}

  /**
   * Recupera la conversazione del cliente autenticato oppure la crea se non esiste.
   * @returns Observable con la conversazione personale del cliente.
   */
  getOrCreateMyConversation(): Observable<ConversazioneChatResponseDto> {
    return this.http.post<ConversazioneChatResponseDto>(`${this.apiUrl}/conversazioni/mia`, {});
  }

  /**
   * Restituisce la lista conversazioni usando prima cache in memoria, poi sessionStorage, poi backend.
   * @returns Observable con le conversazioni visibili all'utente.
   */
  getConversazioni(): Observable<ConversazioneChatResponseDto[]> {
    if (this.conversationsCache) {
      return of(this.conversationsCache);
    }

    const storedConversations = this.readStoredConversations();

    if (storedConversations) {
      this.conversationsCache = storedConversations;
      this.refreshConversazioni().subscribe({ error: () => undefined });
      return of(storedConversations);
    }

    this.conversationsRequest$ ??= this.http.get<ConversazioneChatResponseDto[]>(`${this.apiUrl}/conversazioni`).pipe(
      tap((conversations) => this.setConversationsCache(conversations)),
      catchError((error) => {
        this.conversationsRequest$ = undefined;
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.conversationsRequest$;
  }

  /**
   * Forza il ricaricamento della lista conversazioni dal backend.
   * @returns Observable con la lista aggiornata.
   */
  refreshConversazioni(): Observable<ConversazioneChatResponseDto[]> {
    this.conversationsRequest$ = this.http.get<ConversazioneChatResponseDto[]>(`${this.apiUrl}/conversazioni`).pipe(
      tap((conversations) => this.setConversationsCache(conversations)),
      catchError((error) => {
        this.conversationsRequest$ = undefined;
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.conversationsRequest$;
  }

  /**
   * Recupera i messaggi di una conversazione usando cache, sessionStorage o richiesta HTTP.
   * @param conversazioneId Identificativo della conversazione.
   * @returns Observable con i messaggi della conversazione.
   */
  getMessaggi(conversazioneId: number): Observable<MessaggioChatResponseDto[]> {
    const cachedMessages = this.messagesCache.get(conversazioneId);

    if (cachedMessages) {
      return of(cachedMessages);
    }

    const storedMessages = this.readStoredMessages(conversazioneId);

    if (storedMessages) {
      this.messagesCache.set(conversazioneId, storedMessages);
      return of(storedMessages);
    }

    const pendingRequest = this.messagesRequests.get(conversazioneId);

    if (pendingRequest) {
      return pendingRequest;
    }

    const request$ = this.http
      .get<MessaggioChatResponseDto[]>(`${this.apiUrl}/conversazioni/${conversazioneId}/messaggi`)
      .pipe(
        tap((messages) => this.setMessagesCache(conversazioneId, messages)),
        catchError((error) => {
          this.messagesRequests.delete(conversazioneId);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    this.messagesRequests.set(conversazioneId, request$);
    return request$;33
  }

  /**
   * Forza il ricaricamento dei messaggi di una conversazione dal backend.
   * @param conversazioneId Identificativo della conversazione.
   * @returns Observable con i messaggi aggiornati.
   */
  refreshMessaggi(conversazioneId: number): Observable<MessaggioChatResponseDto[]> {
    this.messagesRequests.delete(conversazioneId);

    const request$ = this.http
      .get<MessaggioChatResponseDto[]>(`${this.apiUrl}/conversazioni/${conversazioneId}/messaggi`)
      .pipe(
        tap((messages) => this.setMessagesCache(conversazioneId, messages)),
        catchError((error) => {
          this.messagesRequests.delete(conversazioneId);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    this.messagesRequests.set(conversazioneId, request$);
    return request$;
  }

  /**
   * Invia un messaggio REST al backend e aggiorna la cache locale al salvataggio.
   * @param conversazioneId Conversazione in cui inviare il messaggio.
   * @param payload Contenuto del messaggio.
   * @returns Observable con il messaggio salvato dal backend.
   */
  inviaMessaggio(
    conversazioneId: number,
    payload: InviaMessaggioChatRequestDto,
  ): Observable<MessaggioChatResponseDto> {
    return this.http
      .post<MessaggioChatResponseDto>(`${this.apiUrl}/conversazioni/${conversazioneId}/messaggi`, payload)
      .pipe(tap((message) => this.addMessageToCache(message)));
  }

  /**
   * Precarica conversazioni e messaggi per rendere più veloce l'apertura della chat lato centro.
   */
  preloadCentroChat(): void {
    this.getConversazioni().subscribe({
      next: (conversations) => this.preloadMessagesForConversations(conversations),
      error: () => undefined,
    });
  }

  /**
   * Precarica i messaggi delle conversazioni ricevute.
   * @param conversations Conversazioni per cui caricare i messaggi.
   */
  preloadMessagesForConversations(conversations: ConversazioneChatResponseDto[]): void {
    conversations.forEach((conversation) => {
      this.getMessaggi(conversation.id).subscribe({ error: () => undefined });
    });
  }

  /**
   * Restituisce i messaggi già presenti in memoria o in sessionStorage senza chiamare il backend.
   * @param conversazioneId Identificativo della conversazione.
   * @returns Messaggi cache oppure null.
   */
  getCachedMessages(conversazioneId: number): MessaggioChatResponseDto[] | null {
    const cachedMessages = this.messagesCache.get(conversazioneId);

    if (cachedMessages) {
      return cachedMessages;
    }

    const storedMessages = this.readStoredMessages(conversazioneId);

    if (!storedMessages) {
      return null;
    }

    this.messagesCache.set(conversazioneId, storedMessages);
    return storedMessages;
  }

  /**
   * Restituisce la conversazione attualmente selezionata nella UI.
   * @returns Id conversazione oppure null.
   */
  getSelectedConversationId(): number | null {
    return this.selectedConversationId;
  }

  /**
   * Memorizza la conversazione selezionata dall'utente nella UI.
   * @param conversationId Identificativo della conversazione selezionata.
   */
  setSelectedConversationId(conversationId: number): void {
    this.selectedConversationId = conversationId;
  }

  /**
   * Aggiunge un messaggio alla cache evitando duplicati e aggiorna la preview della conversazione.
   * @param message Messaggio ricevuto o inviato.
   */
  addMessageToCache(message: MessaggioChatResponseDto): void {
    const cachedMessages = this.messagesCache.get(message.conversazioneId) ?? [];

    if (!cachedMessages.some((cachedMessage) => cachedMessage.id === message.id)) {
      this.setMessagesCache(message.conversazioneId, [...cachedMessages, message]);
    }

    if (this.conversationsCache) {
      this.conversationsCache = this.conversationsCache.map((conversation) =>
        conversation.id === message.conversazioneId
          ? {
              ...conversation,
              ultimoMessaggioPreview: message.contenuto,
              ultimoMessaggioIl: message.inviatoIl,
            }
          : conversation,
      );
      this.storeConversations(this.conversationsCache);
    }
  }

  /**
   * Sostituisce un messaggio temporaneo con quello definitivo restituito dal backend.
   * @param conversazioneId Conversazione interessata.
   * @param temporaryMessageId Id temporaneo generato dal frontend.
   * @param savedMessage Messaggio definitivo salvato dal backend.
   */
  replaceMessageInCache(
    conversazioneId: number,
    temporaryMessageId: number,
    savedMessage: MessaggioChatResponseDto,
  ): void {
    const cachedMessages = this.messagesCache.get(conversazioneId);

    if (!cachedMessages) {
      this.addMessageToCache(savedMessage);
      return;
    }

    const withoutSavedDuplicate = cachedMessages.filter((message) => message.id !== savedMessage.id);
    const hasTemporaryMessage = withoutSavedDuplicate.some((message) => message.id === temporaryMessageId);
    const nextMessages = hasTemporaryMessage
      ? withoutSavedDuplicate.map((message) => (message.id === temporaryMessageId ? savedMessage : message))
      : [...withoutSavedDuplicate, savedMessage];

    this.setMessagesCache(conversazioneId, nextMessages);
    this.updateConversationPreviewCache(savedMessage);
  }

  /**
   * Rimuove un messaggio dalla cache e ricalcola la preview della conversazione.
   * @param conversazioneId Conversazione interessata.
   * @param messageId Messaggio da rimuovere.
   */
  removeMessageFromCache(conversazioneId: number, messageId: number): void {
    const cachedMessages = this.messagesCache.get(conversazioneId);

    if (!cachedMessages) {
      return;
    }

    const nextMessages = cachedMessages.filter((message) => message.id !== messageId);
    this.setMessagesCache(conversazioneId, nextMessages);
    this.updateConversationPreviewCacheFromMessages(conversazioneId, nextMessages);
  }

  /**
   * Aggiorna cache in memoria e sessionStorage della lista conversazioni.
   * @param conversations Lista conversazioni da salvare.
   */
  private setConversationsCache(conversations: ConversazioneChatResponseDto[]): void {
    this.conversationsCache = conversations;
    this.storeConversations(conversations);
  }

  /**
   * Aggiorna la preview dell'ultimo messaggio nella lista conversazioni.
   * @param message Messaggio da usare come ultimo messaggio visibile.
   */
  private updateConversationPreviewCache(message: MessaggioChatResponseDto): void {
    if (!this.conversationsCache) {
      return;
    }

    this.conversationsCache = this.conversationsCache.map((conversation) =>
      conversation.id === message.conversazioneId
        ? {
            ...conversation,
            ultimoMessaggioPreview: message.contenuto,
            ultimoMessaggioIl: message.inviatoIl,
          }
        : conversation,
    );
    this.storeConversations(this.conversationsCache);
  }

  /**
   * Ricalcola la preview della conversazione partendo dall'elenco messaggi aggiornato.
   * @param conversazioneId Conversazione da aggiornare.
   * @param messages Messaggi attuali della conversazione.
   */
  private updateConversationPreviewCacheFromMessages(
    conversazioneId: number,
    messages: MessaggioChatResponseDto[],
  ): void {
    if (!this.conversationsCache) {
      return;
    }

    const lastMessage = messages.at(-1);

    this.conversationsCache = this.conversationsCache.map((conversation) =>
      conversation.id === conversazioneId
        ? {
            ...conversation,
            ultimoMessaggioPreview: lastMessage?.contenuto ?? null,
            ultimoMessaggioIl: lastMessage?.inviatoIl ?? null,
          }
        : conversation,
    );
    this.storeConversations(this.conversationsCache);
  }

  /**
   * Aggiorna cache in memoria e sessionStorage dei messaggi di una conversazione.
   * @param conversazioneId Conversazione interessata.
   * @param messages Messaggi da salvare.
   */
  private setMessagesCache(conversazioneId: number, messages: MessaggioChatResponseDto[]): void {
    this.messagesCache.set(conversazioneId, messages);
    this.storeMessages(conversazioneId, messages);
  }

  /**
   * Legge da sessionStorage la lista conversazioni salvata per l'utente corrente.
   * @returns Lista conversazioni valida oppure null.
   */
  private readStoredConversations(): ConversazioneChatResponseDto[] | null {
    const rawConversations = sessionStorage.getItem(this.conversationsStorageKey);

    if (!rawConversations) {
      return null;
    }

    try {
      const parsedConversations = JSON.parse(rawConversations);
      return Array.isArray(parsedConversations) ? (parsedConversations as ConversazioneChatResponseDto[]) : null;
    } catch {
      sessionStorage.removeItem(this.conversationsStorageKey);
      return null;
    }
  }

  /**
   * Salva in sessionStorage la lista conversazioni dell'utente corrente.
   * @param conversations Conversazioni da persistere nel browser.
   */
  private storeConversations(conversations: ConversazioneChatResponseDto[]): void {
    sessionStorage.setItem(this.conversationsStorageKey, JSON.stringify(conversations));
  }

  /**
   * Legge da sessionStorage i messaggi di una conversazione.
   * @param conversazioneId Conversazione interessata.
   * @returns Messaggi validi oppure null.
   */
  private readStoredMessages(conversazioneId: number): MessaggioChatResponseDto[] | null {
    const rawMessages = sessionStorage.getItem(this.getMessagesStorageKey(conversazioneId));

    if (!rawMessages) {
      return null;
    }

    try {
      const parsedMessages = JSON.parse(rawMessages);
      return Array.isArray(parsedMessages) ? (parsedMessages as MessaggioChatResponseDto[]) : null;
    } catch {
      sessionStorage.removeItem(this.getMessagesStorageKey(conversazioneId));
      return null;
    }
  }

  /**
   * Salva in sessionStorage i messaggi di una conversazione.
   * @param conversazioneId Conversazione interessata.
   * @param messages Messaggi da salvare.
   */
  private storeMessages(conversazioneId: number, messages: MessaggioChatResponseDto[]): void {
    sessionStorage.setItem(this.getMessagesStorageKey(conversazioneId), JSON.stringify(messages));
  }

  /**
   * Costruisce la chiave sessionStorage delle conversazioni separandola per utente.
   * @returns Chiave sessionStorage della lista conversazioni.
   */
  private get conversationsStorageKey(): string {
    const currentUserId = this.authService.getCurrentUser()?.id;
    return currentUserId
      ? `${this.conversationsStorageKeyPrefix}_${currentUserId}`
      : this.conversationsStorageKeyPrefix;
  }

  /**
   * Costruisce la chiave sessionStorage dei messaggi separandola per utente e conversazione.
   * @param conversazioneId Conversazione interessata.
   * @returns Chiave sessionStorage.
   */
  private getMessagesStorageKey(conversazioneId: number): string {
    const currentUserId = this.authService.getCurrentUser()?.id;
    const userKey = currentUserId ? String(currentUserId) : 'anonymous';
    return `${this.messagesStorageKeyPrefix}_${userKey}_${conversazioneId}`;
  }
}
