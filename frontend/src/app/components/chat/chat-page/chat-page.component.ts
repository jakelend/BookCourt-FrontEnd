import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ConversazioneChatResponseDto } from '../../../dto/response/chat/conversazione-chat-response.dto';
import { MessaggioChatResponseDto } from '../../../dto/response/chat/messaggio-chat-response.dto';
import { Role } from '../../../enumeration/role.enum';
import { AuthService } from '../../../services/auth.service';
import { ChatService } from '../../../services/chat.service';
import { ChatWebsocketService } from '../../../services/chat-websocket.service';

@Component({
  selector: 'app-chat-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-page.component.html',
  styleUrl: './chat-page.component.css',
})
export class ChatPageComponent implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;

  conversations: ConversazioneChatResponseDto[] = [];
  selectedConversation: ConversazioneChatResponseDto | null = null;
  messages: MessaggioChatResponseDto[] = [];
  newMessage = '';

  loadingConversations = false;
  loadingMessages = false;
  sending = false;
  errorMessage = '';
  websocketError = '';

  private websocketSubscription?: Subscription;

  constructor(
    private readonly authService: AuthService,
    private readonly chatService: ChatService,
    private readonly chatWebsocketService: ChatWebsocketService,
  ) {}

  ngOnInit(): void {
    if (this.isCliente) {
      this.loadClienteConversation();
      return;
    }

    if (this.isCentroReadRole) {
      this.loadConversations();
    }
  }

  ngOnDestroy(): void {
    this.closeWebsocketSubscription();
  }

  get currentRole(): Role | null {
    return this.authService.getCurrentUserRole();
  }

  get currentUserId(): number | null {
    return this.authService.getCurrentUser()?.id ?? null;
  }

  get isCliente(): boolean {
    return this.currentRole === Role.CLIENTE;
  }

  get isSegretaria(): boolean {
    return this.currentRole === Role.SEGRETARIA;
  }

  get isManager(): boolean {
    return this.currentRole === Role.MANAGER;
  }

  get isCentroReadRole(): boolean {
    return this.isSegretaria || this.isManager;
  }

  get canWrite(): boolean {
    return !!this.selectedConversation && !this.isManager;
  }

  get pageTitle(): string {
    if (this.isCliente) {
      return 'Chat con BookCourt';
    }

    if (this.isManager) {
      return 'Conversazioni clienti';
    }

    return 'Chat clienti';
  }

  get pageSubtitle(): string {
    if (this.isCliente) {
      return 'Scrivi al centro sportivo. Le segretarie potranno risponderti appena possibile.';
    }

    if (this.isManager) {
      return 'Puoi visualizzare tutte le conversazioni, ma non puoi inviare messaggi.';
    }

    return 'Seleziona un cliente dalla lista e rispondi come centro sportivo BookCourt.';
  }

  loadClienteConversation(): void {
    this.errorMessage = '';
    this.loadingConversations = true;

    this.chatService
      .getOrCreateMyConversation()
      .pipe(finalize(() => (this.loadingConversations = false)))
      .subscribe({
        next: (conversation) => {
          this.conversations = [conversation];
          this.openConversation(conversation);
        },
        error: (error) => {
          this.errorMessage = this.extractErrorMessage(
            error,
            'Impossibile aprire la tua chat con il centro sportivo.',
          );
        },
      });
  }

  loadConversations(): void {
    this.errorMessage = '';
    this.loadingConversations = true;

    this.chatService
      .getConversazioni()
      .pipe(finalize(() => (this.loadingConversations = false)))
      .subscribe({
        next: (conversations) => {
          this.conversations = conversations;

          if (this.selectedConversation) {
            const updatedSelected = conversations.find(
              (conversation) => conversation.id === this.selectedConversation?.id,
            );

            if (updatedSelected) {
              this.selectedConversation = updatedSelected;
            }
          }
        },
        error: (error) => {
          this.errorMessage = this.extractErrorMessage(
            error,
            'Impossibile caricare le conversazioni dei clienti.',
          );
        },
      });
  }

  openConversation(conversation: ConversazioneChatResponseDto): void {
    this.selectedConversation = conversation;
    this.messages = [];
    this.websocketError = '';
    this.closeWebsocketSubscription();
    this.loadMessages(conversation.id);
    this.listenRealtime(conversation.id);
  }

  sendMessage(): void {
    const contenuto = this.newMessage.trim();

    if (!contenuto || !this.selectedConversation || !this.canWrite || this.sending) {
      return;
    }

    this.sending = true;
    this.errorMessage = '';

    this.chatService
      .inviaMessaggio(this.selectedConversation.id, { contenuto })
      .pipe(finalize(() => (this.sending = false)))
      .subscribe({
        next: (message) => {
          this.newMessage = '';
          this.appendMessageIfMissing(message);
          this.updateConversationPreview(message);
        },
        error: (error) => {
          this.errorMessage = this.extractErrorMessage(error, 'Impossibile inviare il messaggio.');
        },
      });
  }

  onMessageKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  isMyMessage(message: MessaggioChatResponseDto): boolean {
    return message.mittenteId === this.currentUserId;
  }

  shouldShowAsCenterMessage(message: MessaggioChatResponseDto): boolean {
    return this.isCliente && message.inviatoDalCentro;
  }

  getMessageAuthor(message: MessaggioChatResponseDto): string {
    if (this.shouldShowAsCenterMessage(message)) {
      return 'Centro sportivo BookCourt';
    }

    if (this.isCentroReadRole && message.inviatoDalCentro) {
      return message.autoreDisplay || 'Segreteria centro sportivo';
    }

    return message.autoreDisplay || 'Cliente';
  }

  formatDateTime(value: string | null): string {
    if (!value) {
      return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  trackByConversationId(_: number, conversation: ConversazioneChatResponseDto): number {
    return conversation.id;
  }

  trackByMessageId(_: number, message: MessaggioChatResponseDto): number {
    return message.id;
  }

  private loadMessages(conversationId: number): void {
    this.loadingMessages = true;
    this.errorMessage = '';

    this.chatService
      .getMessaggi(conversationId)
      .pipe(finalize(() => (this.loadingMessages = false)))
      .subscribe({
        next: (messages) => {
          this.messages = messages;
          this.scrollMessagesToBottom();
        },
        error: (error) => {
          this.errorMessage = this.extractErrorMessage(
            error,
            'Impossibile caricare i messaggi della conversazione.',
          );
        },
      });
  }

  private listenRealtime(conversationId: number): void {
    this.websocketSubscription = this.chatWebsocketService.listenToConversation(conversationId).subscribe({
      next: (message) => {
        if (message.conversazioneId !== this.selectedConversation?.id) {
          return;
        }

        this.appendMessageIfMissing(message);
        this.updateConversationPreview(message);
      },
      error: (error) => {
        this.websocketError = error?.message ?? 'Connessione realtime non disponibile.';
      },
    });
  }

  private appendMessageIfMissing(message: MessaggioChatResponseDto): void {
    const alreadyExists = this.messages.some((existingMessage) => existingMessage.id === message.id);

    if (alreadyExists) {
      return;
    }

    this.messages = [...this.messages, message];
    this.scrollMessagesToBottom();
  }

  private updateConversationPreview(message: MessaggioChatResponseDto): void {
    this.conversations = this.conversations.map((conversation) => {
      if (conversation.id !== message.conversazioneId) {
        return conversation;
      }

      return {
        ...conversation,
        ultimoMessaggioPreview: message.contenuto,
        ultimoMessaggioIl: message.inviatoIl,
      };
    });

    if (this.selectedConversation?.id === message.conversazioneId) {
      this.selectedConversation = {
        ...this.selectedConversation,
        ultimoMessaggioPreview: message.contenuto,
        ultimoMessaggioIl: message.inviatoIl,
      };
    }
  }

  private scrollMessagesToBottom(): void {
    setTimeout(() => {
      const container = this.messagesContainer?.nativeElement;

      if (!container) {
        return;
      }

      container.scrollTop = container.scrollHeight;
    });
  }

  private closeWebsocketSubscription(): void {
    this.websocketSubscription?.unsubscribe();
    this.websocketSubscription = undefined;
  }

  private extractErrorMessage(error: any, fallbackMessage: string): string {
    if (error?.error?.message) {
      return error.error.message;
    }

    if (error?.message) {
      return error.message;
    }

    if (error?.status === 0) {
      return 'Backend non raggiungibile. Controlla che Spring Boot sia avviato sulla porta 8080.';
    }

    return fallbackMessage;
  }
}
