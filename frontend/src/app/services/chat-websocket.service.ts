import { Injectable } from '@angular/core';
import { Client, IFrame, IMessage, StompSubscription } from '@stomp/stompjs';
import * as SockJS from 'sockjs-client';
import { Observable } from 'rxjs';
import { MessaggioChatResponseDto } from '../dto/response/chat/messaggio-chat-response.dto';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class ChatWebsocketService {
  private readonly websocketUrl = 'http://localhost:8080/ws-chat';

  constructor(private readonly authService: AuthService) {}

  listenToConversation(
    conversazioneId: number,
  ): Observable<MessaggioChatResponseDto> {
    return new Observable<MessaggioChatResponseDto>((observer) => {
      const token = this.authService.getToken();

      if (!token) {
        observer.error(
          new Error('Token JWT mancante. Effettua nuovamente il login.'),
        );
        return undefined;
      }

      let stompSubscription: StompSubscription | null = null;

      const client = new Client({
        webSocketFactory: () => this.createSockJsSocket(),
        connectHeaders: {
          Authorization: `Bearer ${token}`,
        },
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
        debug: () => undefined,
      });

      client.onConnect = () => {
        stompSubscription = client.subscribe(
          `/topic/chat/${conversazioneId}`,
          (message: IMessage) => {
            try {
              observer.next(
                JSON.parse(message.body) as MessaggioChatResponseDto,
              );
            } catch {
              observer.error(new Error('Messaggio WebSocket non leggibile.'));
            }
          },
        );
      };

      client.onStompError = (frame: IFrame) => {
        observer.error(
          new Error(frame.headers['message'] ?? 'Errore STOMP nella chat.'),
        );
      };

      client.onWebSocketError = () => {
        observer.error(new Error('Connessione WebSocket non riuscita.'));
      };

      client.activate();

      return () => {
        stompSubscription?.unsubscribe();
        void client.deactivate();
      };
    });
  }

  private createSockJsSocket(): WebSocket {
    const SockJsConstructor = (SockJS as any).default ?? SockJS;
    return new SockJsConstructor(this.websocketUrl) as WebSocket;
  }
}
