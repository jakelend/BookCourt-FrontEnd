import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Client, IFrame, IMessage, StompSubscription } from '@stomp/stompjs';
import * as SockJS from 'sockjs-client';
import { Observable, Subject, filter } from 'rxjs';
import { MessaggioChatResponseDto } from '../dto/response/chat/messaggio-chat-response.dto';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class ChatWebsocketService implements OnDestroy {
  private readonly websocketUrl = 'http://localhost:8080/ws-chat';
  private readonly conversationListDestination = '/topic/chat/conversazioni';

  private client: Client | null = null;
  private connected = false;
  private connecting = false;

  private conversationListRequested = false;
  private conversationListSubscription: StompSubscription | null = null;

  private readonly requestedConversationIds = new Set<number>();
  private readonly activeSubscriptions = new Map<number, StompSubscription>();

  private readonly messagesSubject = new Subject<MessaggioChatResponseDto>();
  private readonly conversationListSubject = new Subject<MessaggioChatResponseDto>();
  private readonly connectionErrorsSubject = new Subject<string>();

  readonly connectionErrors$ = this.connectionErrorsSubject.asObservable();

  constructor(
    private readonly authService: AuthService,
    private readonly ngZone: NgZone,
  ) {}

  ngOnDestroy(): void {
    this.disconnect();
  }

  listenToConversation(conversazioneId: number): Observable<MessaggioChatResponseDto> {
    this.requestedConversationIds.add(conversazioneId);
    this.ensureConnected();

    if (this.connected) {
      this.subscribeToConversation(conversazioneId);
    }

    return this.messagesSubject
      .asObservable()
      .pipe(filter((message) => message.conversazioneId === conversazioneId));
  }

  listenToConversationList(): Observable<MessaggioChatResponseDto> {
    this.conversationListRequested = true;
    this.ensureConnected();

    if (this.connected) {
      this.subscribeToConversationList();
    }

    return this.conversationListSubject.asObservable();
  }

  disconnect(): void {
    this.activeSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.activeSubscriptions.clear();
    this.requestedConversationIds.clear();

    this.conversationListSubscription?.unsubscribe();
    this.conversationListSubscription = null;
    this.conversationListRequested = false;

    if (this.client) {
      void this.client.deactivate();
    }

    this.client = null;
    this.connected = false;
    this.connecting = false;
  }

  private ensureConnected(): void {
    if (this.connected || this.connecting || this.client?.active) {
      return;
    }

    const token = this.authService.getToken();

    if (!token) {
      this.emitConnectionError('Token JWT mancante. Effettua nuovamente il login.');
      return;
    }

    this.connecting = true;

    this.client = new Client({
      webSocketFactory: () => this.createSockJsSocket(),
      connectHeaders: {
        Authorization: `Bearer ${token}`,
        authorization: `Bearer ${token}`,
        token,
      },
      reconnectDelay: 3000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      debug: () => undefined,
    });

    this.client.onConnect = () => {
      this.ngZone.run(() => {
        this.connected = true;
        this.connecting = false;
        this.activeSubscriptions.clear();
        this.conversationListSubscription = null;

        if (this.conversationListRequested) {
          this.subscribeToConversationList();
        }

        this.requestedConversationIds.forEach((conversationId) => {
          this.subscribeToConversation(conversationId);
        });
      });
    };

    this.client.onStompError = (frame: IFrame) => {
      this.ngZone.run(() => {
        this.emitConnectionError(frame.headers['message'] ?? 'Errore STOMP nella chat.');
      });
    };

    this.client.onWebSocketError = () => {
      this.ngZone.run(() => {
        this.emitConnectionError('Connessione WebSocket non riuscita.');
      });
    };

    this.client.onWebSocketClose = () => {
      this.ngZone.run(() => {
        this.connected = false;
        this.connecting = false;
        this.activeSubscriptions.clear();
        this.conversationListSubscription = null;
      });
    };

    this.client.activate();
  }

  private subscribeToConversation(conversazioneId: number): void {
    if (!this.client || !this.connected || this.activeSubscriptions.has(conversazioneId)) {
      return;
    }

    const destination = `/topic/chat/${conversazioneId}`;

    const subscription = this.client.subscribe(destination, (message: IMessage) => {
      this.ngZone.run(() => {
        try {
          const parsedMessage = JSON.parse(message.body) as MessaggioChatResponseDto;
          this.messagesSubject.next(parsedMessage);
        } catch {
          this.emitConnectionError('Messaggio WebSocket non leggibile.');
        }
      });
    });

    this.activeSubscriptions.set(conversazioneId, subscription);
  }

  private subscribeToConversationList(): void {
    if (!this.client || !this.connected || this.conversationListSubscription) {
      return;
    }

    this.conversationListSubscription = this.client.subscribe(
      this.conversationListDestination,
      (message: IMessage) => {
        this.ngZone.run(() => {
          try {
            const parsedMessage = JSON.parse(message.body) as MessaggioChatResponseDto;
            this.conversationListSubject.next(parsedMessage);
          } catch {
            this.emitConnectionError('Evento lista conversazioni non leggibile.');
          }
        });
      },
    );
  }

  private createSockJsSocket(): any {
    const SockJsConstructor = (SockJS as any).default ?? SockJS;
    return new SockJsConstructor(this.websocketUrl);
  }

  private emitConnectionError(message: string): void {
    this.connectionErrorsSubject.next(message);
  }
}
