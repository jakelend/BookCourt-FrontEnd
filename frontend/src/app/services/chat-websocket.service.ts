/**
 * Servizio responsabile della comunicazione real-time della chat tramite WebSocket/STOMP.
 *
 * Mantiene una singola connessione verso il backend, gestisce le sottoscrizioni
 * ai topic delle conversazioni e al topic della lista conversazioni, e pubblica
 * gli eventi ricevuti tramite Observable utilizzabili dai componenti Angular.
 */
import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Client, IFrame, IMessage, StompSubscription } from '@stomp/stompjs';
import * as SockJS from 'sockjs-client';
import { Observable, Subject, filter } from 'rxjs';
import { environment } from '../../environments/environment';
import { MessaggioChatResponseDto } from '../dto/response/chat/messaggio-chat-response.dto';
import { AuthService } from './auth.service';

/**
 * Service Angular singleton che gestisce la connessione WebSocket/STOMP della chat.
 */
@Injectable({
  providedIn: 'root',
})
export class ChatWebsocketService implements OnDestroy {
  private readonly websocketUrl = `${environment.backendBaseUrl}/ws-chat`;
  private readonly conversationListDestination = '/topic/chat/conversazioni';

  // Client STOMP mantenuto come istanza unica per evitare connessioni duplicate.
  private client: Client | null = null;
  private connected = false;
  private connecting = false;

  private conversationListRequested = false;
  private conversationListSubscription: StompSubscription | null = null;

  // Conversazioni richieste dai componenti: dopo una riconnessione vengono sottoscritte di nuovo.
  private readonly requestedConversationIds = new Set<number>();
  private readonly activeSubscriptions = new Map<number, StompSubscription>();

  // Subject interni usati per trasformare gli eventi STOMP in Observable Angular.
  private readonly messagesSubject = new Subject<MessaggioChatResponseDto>();
  private readonly conversationListSubject = new Subject<MessaggioChatResponseDto>();
  private readonly connectionErrorsSubject = new Subject<string>();

  readonly connectionErrors$ = this.connectionErrorsSubject.asObservable();

  constructor(
    private readonly authService: AuthService,
    private readonly ngZone: NgZone,
  ) {}

  /**
   * Rilascia le risorse WebSocket quando il servizio viene distrutto.
   */
  ngOnDestroy(): void {
    this.disconnect();
  }

  /**
   * Sottoscrive il frontend al topic real-time di una singola conversazione.
   * @param conversazioneId Identificativo della conversazione da ascoltare.
   * @returns Observable filtrato sui messaggi della conversazione richiesta.
   */
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

  /**
   * Sottoscrive il frontend al topic globale della lista conversazioni.
   * @returns Observable con gli eventi che aggiornano la lista conversazioni.
   */
  listenToConversationList(): Observable<MessaggioChatResponseDto> {
    this.conversationListRequested = true;
    this.ensureConnected();

    if (this.connected) {
      this.subscribeToConversationList();
    }

    return this.conversationListSubject.asObservable();
  }

  /**
   * Chiude la connessione WebSocket e rimuove tutte le sottoscrizioni attive.
   */
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

  /**
   * Apre la connessione STOMP se non è già attiva o in fase di connessione.
   */
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

  /**
   * Registra la sottoscrizione STOMP al topic di una conversazione specifica.
   * @param conversazioneId Identificativo della conversazione.
   */
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

  /**
   * Registra la sottoscrizione STOMP al topic che notifica nuove conversazioni o aggiornamenti lista.
   */
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

  /**
   * Crea l'istanza SockJS usata dal client STOMP.
   * @returns Socket SockJS compatibile con STOMP.
   */
  private createSockJsSocket(): any {
    const SockJsConstructor = (SockJS as any).default ?? SockJS;
    return new SockJsConstructor(this.websocketUrl);
  }

  /**
   * Pubblica un errore di connessione verso i componenti interessati.
   * @param message Messaggio di errore da mostrare o gestire.
   */
  private emitConnectionError(message: string): void {
    this.connectionErrorsSubject.next(message);
  }
}
