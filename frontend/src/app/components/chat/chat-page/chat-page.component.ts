import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { interval, Subscription } from 'rxjs';
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
  initializingChat = false;

  private profileRole: Role | null = null;
  private websocketSubscription?: Subscription;
  private conversationsRefreshSubscription?: Subscription;
  private readonly conversationRealtimeSubscriptions = new Map<number, Subscription>();
  private initializedChat = false;
  private nextTemporaryMessageId = -1;

  constructor(
    private readonly authService: AuthService,
    private readonly chatService: ChatService,
    private readonly chatWebsocketService: ChatWebsocketService,
  ) {}

  ngOnInit(): void {
    if (this.currentRole) {
      this.initializeChatForRole();
      return;
    }

    this.initializingChat = true;
    this.loadingConversations = true;
    this.authService.getCurrentProfile().subscribe({
      next: (profile) => {
        this.profileRole = profile.ruolo;
        this.authService.updateCurrentUserFromProfile(profile);
        this.initializingChat = false;
        this.initializeChatForRole();
      },
      error: (error) => {
        this.initializingChat = false;
        this.loadingConversations = false;
        this.errorMessage = this.extractErrorMessage(error, 'Impossibile inizializzare la chat.');
      },
    });
  }

  private initializeChatForRole(): void {
    if (this.initializedChat) {
      return;
    }

    this.initializedChat = true;
    this.loadingConversations = false;

    if (this.isCliente) {
      this.loadClienteConversation();
      return;
    }

    if (this.isCentroReadRole) {
      this.loadConversations();
      this.startConversationsAutoRefresh();
    }
  }

  ngOnDestroy(): void {
    this.closeWebsocketSubscription();
    this.closeConversationRealtimeSubscriptions();
    this.conversationsRefreshSubscription?.unsubscribe();
  }

  get currentRole(): Role | null {
    return this.authService.getCurrentUserRole() ?? this.profileRole;
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
          this.updateSelectedConversation(conversations);
          this.preloadConversationMessages(conversations);
          this.syncConversationRealtimeSubscriptions(conversations);
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
        this.conversations = conversations;
        this.preloadConversationMessages(conversations);
        this.syncConversationRealtimeSubscriptions(conversations);

        if (!this.selectedConversation) {
          return;
        }

        this.updateSelectedConversation(conversations);
      },
      error: () => undefined,
    });
  }

  openConversation(conversation: ConversazioneChatResponseDto): void {
    if (this.selectedConversation?.id === conversation.id && this.websocketSubscription) {
      this.chatService.setSelectedConversationId(conversation.id);
      return;
    }

    this.chatService.setSelectedConversationId(conversation.id);
    this.selectedConversation = conversation;
    const cachedMessages = this.chatService.getCachedMessages(conversation.id);
    this.messages = cachedMessages ?? [];
    this.websocketError = '';
    this.closeWebsocketSubscription();
    this.loadMessages(conversation.id, !!cachedMessages);

    if (!this.isCentroReadRole) {
      this.listenRealtime(conversation.id);
    }
  }

  sendMessage(): void {
    const contenuto = this.newMessage.trim();

    if (!contenuto || !this.selectedConversation || !this.canWrite) {
      return;
    }

    const conversationId = this.selectedConversation.id;
    const temporaryMessage = this.createTemporaryMessage(conversationId, contenuto);

    this.sending = true;
    this.errorMessage = '';
    this.newMessage = '';
    this.appendMessageIfMissing(temporaryMessage);
    this.chatService.addMessageToCache(temporaryMessage);
    this.updateConversationPreview(temporaryMessage);

    this.chatService
      .inviaMessaggio(conversationId, { contenuto })
      .pipe(finalize(() => (this.sending = false)))
      .subscribe({
        next: (message) => {
          this.replaceTemporaryMessage(temporaryMessage.id, message);
          this.chatService.replaceMessageInCache(conversationId, temporaryMessage.id, message);
          this.updateConversationPreview(message);

          if (this.isCentroReadRole) {
            this.refreshConversationsSilently();
          }
        },
        error: (error) => {
          this.removeMessageById(temporaryMessage.id);
          this.chatService.removeMessageFromCache(conversationId, temporaryMessage.id);
          this.rebuildConversationPreviewFromMessages(conversationId);
          this.newMessage = this.newMessage || contenuto;
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

  private loadMessages(conversationId: number, refreshSilently = false): void {
    this.loadingMessages = !refreshSilently;
    this.errorMessage = '';

    const messagesRequest = refreshSilently
      ? this.chatService.refreshMessaggi(conversationId)
      : this.chatService.getMessaggi(conversationId);

    messagesRequest
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

  private refreshCurrentChatAfterSend(): void {
    const conversationId = this.selectedConversation?.id;

    if (!conversationId) {
      return;
    }

    this.chatService.refreshMessaggi(conversationId).subscribe({
      next: (messages) => {
        this.messages = messages;
        this.scrollMessagesToBottom();
      },
      error: () => undefined,
    });

    if (this.isCentroReadRole) {
      this.refreshConversationsSilently();
    }
  }

  private listenRealtime(conversationId: number): void {
    this.websocketSubscription = this.chatWebsocketService.listenToConversation(conversationId).subscribe({
      next: (message) => this.handleRealtimeMessage(message),
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

  private replaceTemporaryMessage(
    temporaryMessageId: number,
    savedMessage: MessaggioChatResponseDto,
  ): void {
    const withoutSavedDuplicate = this.messages.filter((message) => message.id !== savedMessage.id);
    const hasTemporaryMessage = withoutSavedDuplicate.some((message) => message.id === temporaryMessageId);

    this.messages = hasTemporaryMessage
      ? withoutSavedDuplicate.map((message) => (message.id === temporaryMessageId ? savedMessage : message))
      : [...withoutSavedDuplicate, savedMessage];
    this.scrollMessagesToBottom();
  }

  private removeMessageById(messageId: number): void {
    this.messages = this.messages.filter((message) => message.id !== messageId);
  }

  private createTemporaryMessage(
    conversazioneId: number,
    contenuto: string,
  ): MessaggioChatResponseDto {
    const currentUser = this.authService.getCurrentUser();
    const nome = currentUser?.nome ?? '';
    const cognome = currentUser?.cognome ?? '';
    const nomeCompleto = `${nome} ${cognome}`.trim();

    return {
      id: this.nextTemporaryMessageId--,
      conversazioneId,
      mittenteId: currentUser?.id ?? 0,
      mittenteRuolo: this.currentRole ?? '',
      mittenteNome: nome,
      mittenteCognome: cognome,
      mittenteNomeCompleto: nomeCompleto,
      autoreDisplay: nomeCompleto || (this.isCentroReadRole ? 'Segreteria centro sportivo' : 'Cliente'),
      inviatoDalCentro: this.isCentroReadRole,
      contenuto,
      inviatoIl: new Date().toISOString(),
    };
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
    }).sort((left, right) => this.getConversationTimestamp(right) - this.getConversationTimestamp(left));

    if (this.selectedConversation?.id === message.conversazioneId) {
      this.selectedConversation = {
        ...this.selectedConversation,
        ultimoMessaggioPreview: message.contenuto,
        ultimoMessaggioIl: message.inviatoIl,
      };
    }
  }

  private rebuildConversationPreviewFromMessages(conversationId: number): void {
    const lastMessage = this.messages.at(-1);

    this.conversations = this.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            ultimoMessaggioPreview: lastMessage?.contenuto ?? null,
            ultimoMessaggioIl: lastMessage?.inviatoIl ?? null,
          }
        : conversation,
    );

    if (this.selectedConversation?.id === conversationId) {
      this.selectedConversation = {
        ...this.selectedConversation,
        ultimoMessaggioPreview: lastMessage?.contenuto ?? null,
        ultimoMessaggioIl: lastMessage?.inviatoIl ?? null,
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

  private syncConversationRealtimeSubscriptions(conversations: ConversazioneChatResponseDto[]): void {
    if (!this.isCentroReadRole) {
      return;
    }

    const visibleConversationIds = new Set(conversations.map((conversation) => conversation.id));

    for (const [conversationId, subscription] of this.conversationRealtimeSubscriptions) {
      if (!visibleConversationIds.has(conversationId)) {
        subscription.unsubscribe();
        this.conversationRealtimeSubscriptions.delete(conversationId);
      }
    }

    conversations.forEach((conversation) => {
      if (this.conversationRealtimeSubscriptions.has(conversation.id)) {
        return;
      }

      const subscription = this.chatWebsocketService.listenToConversation(conversation.id).subscribe({
        next: (message) => this.handleRealtimeMessage(message),
        error: (error) => {
          this.websocketError = error?.message ?? 'Connessione realtime non disponibile.';
        },
      });

      this.conversationRealtimeSubscriptions.set(conversation.id, subscription);
    });
  }

  private closeConversationRealtimeSubscriptions(): void {
    this.conversationRealtimeSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.conversationRealtimeSubscriptions.clear();
  }

  private handleRealtimeMessage(message: MessaggioChatResponseDto): void {
    this.chatService.addMessageToCache(message);
    this.updateConversationPreview(message);

    if (message.conversazioneId !== this.selectedConversation?.id) {
      return;
    }

    const temporaryMessage = this.findMatchingTemporaryMessage(message);

    if (temporaryMessage) {
      this.replaceTemporaryMessage(temporaryMessage.id, message);
      this.chatService.replaceMessageInCache(message.conversazioneId, temporaryMessage.id, message);
      return;
    }

    this.appendMessageIfMissing(message);
  }

  private findMatchingTemporaryMessage(message: MessaggioChatResponseDto): MessaggioChatResponseDto | null {
    return (
      this.messages.find(
        (candidate) =>
          candidate.id < 0 &&
          candidate.mittenteId === message.mittenteId &&
          candidate.contenuto === message.contenuto,
      ) ?? null
    );
  }

  private startConversationsAutoRefresh(): void {
    this.conversationsRefreshSubscription?.unsubscribe();
    this.conversationsRefreshSubscription = interval(5000).subscribe(() => this.refreshConversationsSilently());
  }

  private preloadConversationMessages(conversations: ConversazioneChatResponseDto[]): void {
    this.chatService.preloadMessagesForConversations(conversations);
  }

  private updateSelectedConversation(conversations: ConversazioneChatResponseDto[]): void {
    if (!this.selectedConversation) {
      return;
    }

    const updatedSelected = conversations.find(
      (conversation) => conversation.id === this.selectedConversation?.id,
    );

    if (updatedSelected) {
      this.selectedConversation = updatedSelected;
    }
  }

  private getConversationTimestamp(conversation: ConversazioneChatResponseDto): number {
    const timestamp = conversation.ultimoMessaggioIl || conversation.creataIl;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
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
