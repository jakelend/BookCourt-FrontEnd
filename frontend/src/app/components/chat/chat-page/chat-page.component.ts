import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
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

  private readonly conversationsSignal = signal<ConversazioneChatResponseDto[]>([]);
  private readonly selectedConversationSignal = signal<ConversazioneChatResponseDto | null>(null);
  private readonly messagesSignal = signal<MessaggioChatResponseDto[]>([]);

  newMessage = '';

  loadingConversations = false;
  loadingMessages = false;
  sending = false;
  initializingChat = false;

  errorMessage = '';
  websocketError = '';

  private connectionErrorsSubscription?: Subscription;
  private conversationListRealtimeSubscription?: Subscription;
  private readonly realtimeSubscriptions = new Map<number, Subscription>();

  constructor(
    private readonly authService: AuthService,
    private readonly chatService: ChatService,
    private readonly chatWebsocketService: ChatWebsocketService,
  ) {}

  ngOnInit(): void {
    this.connectionErrorsSubscription = this.chatWebsocketService.connectionErrors$.subscribe({
      next: (message) => {
        this.websocketError = message;
      },
    });

    if (this.isCliente) {
      this.loadClienteConversation();
      return;
    }

    if (this.isCentroReadRole) {
      this.loadConversations();
      this.subscribeRealtimeConversationList();
      return;
    }

    this.errorMessage = 'Ruolo utente non abilitato alla chat.';
  }

  ngOnDestroy(): void {
    this.closeRealtimeSubscriptions();
    this.conversationListRealtimeSubscription?.unsubscribe();
    this.connectionErrorsSubscription?.unsubscribe();
    this.chatWebsocketService.disconnect();
  }

  get conversations(): ConversazioneChatResponseDto[] {
    return this.conversationsSignal();
  }

  get selectedConversation(): ConversazioneChatResponseDto | null {
    return this.selectedConversationSignal();
  }

  get messages(): MessaggioChatResponseDto[] {
    return this.messagesSignal();
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
    return !!this.selectedConversation?.scrivibile && !this.isManager;
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
    this.websocketError = '';
    this.loadingConversations = true;

    this.chatService
      .getOrCreateMyConversation()
      .pipe(finalize(() => (this.loadingConversations = false)))
      .subscribe({
        next: (conversation) => {
          this.conversationsSignal.set([conversation]);
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
    this.websocketError = '';
    this.loadingConversations = true;

    /*
     * Uso refreshConversazioni() e non getConversazioni().
     *
     * Motivo:
     * getConversazioni() può restituire cache/localStorage.
     * Per la lista in stile WhatsApp vogliamo sempre rispettare il backend:
     * la segretaria deve vedere solo clienti che hanno almeno un messaggio.
     */
    this.chatService
      .refreshConversazioni()
      .pipe(finalize(() => (this.loadingConversations = false)))
      .subscribe({
        next: (conversations) => {
          this.applyConversations(conversations);
        },
        error: (error) => {
          this.errorMessage = this.extractErrorMessage(
            error,
            'Impossibile caricare le conversazioni dei clienti.',
          );
        },
      });
  }

  refreshConversationsSilently(): void {
    if (!this.isCentroReadRole) {
      return;
    }

    this.chatService.refreshConversazioni().subscribe({
      next: (conversations) => {
        this.applyConversations(conversations);
      },
      error: () => undefined,
    });
  }

  openConversation(conversation: ConversazioneChatResponseDto): void {
    this.selectedConversationSignal.set(conversation);
    this.messagesSignal.set([]);
    this.websocketError = '';

    this.subscribeRealtimeForConversation(conversation.id);
    this.loadMessages(conversation.id);
  }

  sendMessage(): void {
    const conversation = this.selectedConversation;
    const contenuto = this.newMessage.trim();

    if (!contenuto || !conversation || !this.canWrite || this.sending) {
      return;
    }

    this.sending = true;
    this.errorMessage = '';

    this.chatService
      .inviaMessaggio(conversation.id, { contenuto })
      .pipe(finalize(() => (this.sending = false)))
      .subscribe({
        next: (message) => {
          this.newMessage = '';
          this.handleRealtimeMessage(message);
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

  isOutgoingMessage(message: MessaggioChatResponseDto): boolean {
    if (this.isCentroReadRole) {
      return message.inviatoDalCentro;
    }

    return this.isMyMessage(message);
  }

  shouldShowAsCenterMessage(message: MessaggioChatResponseDto): boolean {
    return this.isCliente && message.inviatoDalCentro;
  }

  getMessageAuthor(message: MessaggioChatResponseDto): string {
    if (this.shouldShowAsCenterMessage(message)) {
      return 'BookCourt';
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

  private applyConversations(conversations: ConversazioneChatResponseDto[]): void {
    const sortedConversations = this.sortConversations(conversations);

    this.conversationsSignal.set(sortedConversations);
    this.updateSelectedConversation(sortedConversations);
    this.subscribeRealtimeForConversations(sortedConversations);
  }

  private loadMessages(conversationId: number): void {
    this.loadingMessages = true;
    this.errorMessage = '';

    this.chatService
      .refreshMessaggi(conversationId)
      .pipe(finalize(() => (this.loadingMessages = false)))
      .subscribe({
        next: (messages) => {
          this.messagesSignal.set(messages);
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

  private subscribeRealtimeForConversations(conversations: ConversazioneChatResponseDto[]): void {
    conversations.forEach((conversation) => {
      this.subscribeRealtimeForConversation(conversation.id);
    });
  }

  private subscribeRealtimeForConversation(conversationId: number): void {
    if (this.realtimeSubscriptions.has(conversationId)) {
      return;
    }

    const subscription = this.chatWebsocketService.listenToConversation(conversationId).subscribe({
      next: (message) => {
        this.handleRealtimeMessage(message);
      },
      error: (error) => {
        this.websocketError = error?.message ?? 'Connessione realtime non disponibile.';
      },
    });

    this.realtimeSubscriptions.set(conversationId, subscription);
  }

  private subscribeRealtimeConversationList(): void {
    if (!this.isCentroReadRole) {
      return;
    }

    this.conversationListRealtimeSubscription?.unsubscribe();

    this.conversationListRealtimeSubscription = this.chatWebsocketService
      .listenToConversationList()
      .subscribe({
        next: (message) => {
          this.handleRealtimeConversationListEvent(message);
        },
        error: (error) => {
          this.websocketError = error?.message ?? 'Realtime lista conversazioni non disponibile.';
        },
      });
  }

  private handleRealtimeConversationListEvent(message: MessaggioChatResponseDto): void {
    const conversationAlreadyVisible = this.conversations.some(
      (conversation) => conversation.id === message.conversazioneId,
    );

    this.handleRealtimeMessage(message);

    /*
     * Caso WhatsApp:
     * se la conversazione non era in lista, vuol dire che probabilmente
     * è appena arrivato il primo messaggio di un cliente.
     *
     * In quel caso facciamo una singola chiamata HTTP per recuperare
     * il DTO completo della conversazione e mostrarla in lista.
     */
    if (!conversationAlreadyVisible) {
      this.refreshConversationsSilently();
    }
  }

  private handleRealtimeMessage(message: MessaggioChatResponseDto): void {
    this.websocketError = '';
    this.chatService.addMessageToCache(message);
    this.updateConversationPreview(message);

    if (message.conversazioneId !== this.selectedConversation?.id) {
      return;
    }

    this.appendMessageIfMissing(message);
  }

  private appendMessageIfMissing(message: MessaggioChatResponseDto): void {
    this.messagesSignal.update((currentMessages) => {
      const alreadyExists = currentMessages.some(
        (existingMessage) => existingMessage.id === message.id,
      );

      if (alreadyExists) {
        return currentMessages;
      }

      return [...currentMessages, message];
    });

    this.scrollMessagesToBottom();
  }

  private updateConversationPreview(message: MessaggioChatResponseDto): void {
    let conversationFound = false;

    this.conversationsSignal.update((currentConversations) => {
      const updatedConversations = currentConversations.map((conversation) => {
        if (conversation.id !== message.conversazioneId) {
          return conversation;
        }

        conversationFound = true;

        return {
          ...conversation,
          ultimoMessaggioPreview: message.contenuto,
          ultimoMessaggioIl: message.inviatoIl,
        };
      });

      return this.sortConversations(updatedConversations);
    });

    if (!conversationFound && this.isCentroReadRole) {
      return;
    }

    const selected = this.selectedConversation;

    if (selected?.id === message.conversazioneId) {
      this.selectedConversationSignal.set({
        ...selected,
        ultimoMessaggioPreview: message.contenuto,
        ultimoMessaggioIl: message.inviatoIl,
      });
    }
  }

  private updateSelectedConversation(conversations: ConversazioneChatResponseDto[]): void {
    const selected = this.selectedConversation;

    if (!selected) {
      return;
    }

    const updatedSelected = conversations.find((conversation) => conversation.id === selected.id);

    if (updatedSelected) {
      this.selectedConversationSignal.set(updatedSelected);
    }
  }

  private sortConversations(
    conversations: ConversazioneChatResponseDto[],
  ): ConversazioneChatResponseDto[] {
    return [...conversations].sort(
      (left, right) => this.getConversationTimestamp(right) - this.getConversationTimestamp(left),
    );
  }

  private getConversationTimestamp(conversation: ConversazioneChatResponseDto): number {
    const timestamp = conversation.ultimoMessaggioIl || conversation.creataIl;
    const date = new Date(timestamp);

    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
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

  private closeRealtimeSubscriptions(): void {
    this.realtimeSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.realtimeSubscriptions.clear();
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
