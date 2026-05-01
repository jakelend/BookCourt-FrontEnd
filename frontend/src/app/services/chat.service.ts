import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, of, shareReplay, tap, throwError } from 'rxjs';
import { InviaMessaggioChatRequestDto } from '../dto/request/chat/invia-messaggio-chat-request.dto';
import { ConversazioneChatResponseDto } from '../dto/response/chat/conversazione-chat-response.dto';
import { MessaggioChatResponseDto } from '../dto/response/chat/messaggio-chat-response.dto';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private readonly apiUrl = 'http://localhost:8080/api/chat';
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

  getOrCreateMyConversation(): Observable<ConversazioneChatResponseDto> {
    return this.http.post<ConversazioneChatResponseDto>(`${this.apiUrl}/conversazioni/mia`, {});
  }

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
    return request$;
  }

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

  inviaMessaggio(
    conversazioneId: number,
    payload: InviaMessaggioChatRequestDto,
  ): Observable<MessaggioChatResponseDto> {
    return this.http
      .post<MessaggioChatResponseDto>(`${this.apiUrl}/conversazioni/${conversazioneId}/messaggi`, payload)
      .pipe(tap((message) => this.addMessageToCache(message)));
  }

  preloadCentroChat(): void {
    this.getConversazioni().subscribe({
      next: (conversations) => this.preloadMessagesForConversations(conversations),
      error: () => undefined,
    });
  }

  preloadMessagesForConversations(conversations: ConversazioneChatResponseDto[]): void {
    conversations.forEach((conversation) => {
      this.getMessaggi(conversation.id).subscribe({ error: () => undefined });
    });
  }

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

  getSelectedConversationId(): number | null {
    return this.selectedConversationId;
  }

  setSelectedConversationId(conversationId: number): void {
    this.selectedConversationId = conversationId;
  }

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

  removeMessageFromCache(conversazioneId: number, messageId: number): void {
    const cachedMessages = this.messagesCache.get(conversazioneId);

    if (!cachedMessages) {
      return;
    }

    const nextMessages = cachedMessages.filter((message) => message.id !== messageId);
    this.setMessagesCache(conversazioneId, nextMessages);
    this.updateConversationPreviewCacheFromMessages(conversazioneId, nextMessages);
  }

  private setConversationsCache(conversations: ConversazioneChatResponseDto[]): void {
    this.conversationsCache = conversations;
    this.storeConversations(conversations);
  }

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

  private setMessagesCache(conversazioneId: number, messages: MessaggioChatResponseDto[]): void {
    this.messagesCache.set(conversazioneId, messages);
    this.storeMessages(conversazioneId, messages);
  }

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

  private storeConversations(conversations: ConversazioneChatResponseDto[]): void {
    sessionStorage.setItem(this.conversationsStorageKey, JSON.stringify(conversations));
  }

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

  private storeMessages(conversazioneId: number, messages: MessaggioChatResponseDto[]): void {
    sessionStorage.setItem(this.getMessagesStorageKey(conversazioneId), JSON.stringify(messages));
  }

  private get conversationsStorageKey(): string {
    const currentUserId = this.authService.getCurrentUser()?.id;
    return currentUserId
      ? `${this.conversationsStorageKeyPrefix}_${currentUserId}`
      : this.conversationsStorageKeyPrefix;
  }

  private getMessagesStorageKey(conversazioneId: number): string {
    const currentUserId = this.authService.getCurrentUser()?.id;
    const userKey = currentUserId ? String(currentUserId) : 'anonymous';
    return `${this.messagesStorageKeyPrefix}_${userKey}_${conversazioneId}`;
  }
}
