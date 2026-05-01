import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { InviaMessaggioChatRequestDto } from '../dto/request/chat/invia-messaggio-chat-request.dto';
import { ConversazioneChatResponseDto } from '../dto/response/chat/conversazione-chat-response.dto';
import { MessaggioChatResponseDto } from '../dto/response/chat/messaggio-chat-response.dto';

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private readonly apiUrl = 'http://localhost:8080/api/chat';

  constructor(private readonly http: HttpClient) {}

  getOrCreateMyConversation(): Observable<ConversazioneChatResponseDto> {
    return this.http.post<ConversazioneChatResponseDto>(`${this.apiUrl}/conversazioni/mia`, {});
  }

  getConversazioni(): Observable<ConversazioneChatResponseDto[]> {
    return this.http.get<ConversazioneChatResponseDto[]>(`${this.apiUrl}/conversazioni`);
  }

  getMessaggi(conversazioneId: number): Observable<MessaggioChatResponseDto[]> {
    return this.http.get<MessaggioChatResponseDto[]>(
      `${this.apiUrl}/conversazioni/${conversazioneId}/messaggi`,
    );
  }

  inviaMessaggio(
    conversazioneId: number,
    payload: InviaMessaggioChatRequestDto,
  ): Observable<MessaggioChatResponseDto> {
    return this.http.post<MessaggioChatResponseDto>(
      `${this.apiUrl}/conversazioni/${conversazioneId}/messaggi`,
      payload,
    );
  }
}
