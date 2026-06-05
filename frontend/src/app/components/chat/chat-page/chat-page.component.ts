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
import { extractBackendErrorMessage } from '../../../util/error-message.util';

@Component({
  selector: 'app-chat-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-page.component.html',
  styleUrl: './chat-page.component.css',
})
/**
 * Pagina principale della chat BookCourt.
 * Gestisce due modalità di utilizzo: il cliente apre la propria conversazione con il centro,
 * mentre segretaria e manager visualizzano la lista delle conversazioni dei clienti.
 * La segretaria può rispondere, il manager può solo consultare.
 */
export class ChatPageComponent implements OnInit, OnDestroy {
  /**
   * Riferimento al contenitore dei messaggi usato per portare automaticamente lo scroll in fondo
   * quando arrivano nuovi messaggi o viene aperta una conversazione.
   */
  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;

  /**
   * Stato reattivo delle conversazioni mostrate nella colonna laterale.
   * L'uso dei signal permette al template di aggiornarsi in tempo reale senza ricaricare la pagina.
   */
  private readonly conversationsSignal = signal<ConversazioneChatResponseDto[]>([]);
  private readonly selectedConversationSignal = signal<ConversazioneChatResponseDto | null>(null);
  private readonly messagesSignal = signal<MessaggioChatResponseDto[]>([]);

  /**
   * Testo scritto nella textarea/input prima dell'invio del messaggio.
   */
  newMessage = '';

  /**
   * Flag di caricamento e invio usati dal template per mostrare spinner e disabilitare azioni duplicate.
   */
  loadingConversations = false;
  loadingMessages = false;
  sending = false;
  initializingChat = false;

  /**
   * Messaggi di errore applicativi o WebSocket mostrati nella UI della chat.
   */
  errorMessage = '';
  websocketError = '';

  /**
   * Subscription attive della pagina.
   * Vengono salvate per poterle chiudere correttamente in ngOnDestroy ed evitare memory leak.
   */
  private connectionErrorsSubscription?: Subscription;
  private conversationListRealtimeSubscription?: Subscription;
  private readonly realtimeSubscriptions = new Map<number, Subscription>();

  /**
   * Inietta servizi di autenticazione, API REST della chat e canale WebSocket/STOMP.
   */
  constructor(
    private readonly authService: AuthService,
    private readonly chatService: ChatService,
    private readonly chatWebsocketService: ChatWebsocketService,
  ) {}

  /**
   * Inizializza la pagina in base al ruolo dell'utente autenticato.
   * Il cliente apre direttamente la propria conversazione, mentre centro/manager caricano la lista clienti.
   */
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

  /**
   * Chiude subscription e connessione WebSocket quando il componente viene distrutto.
   */
  ngOnDestroy(): void {
    this.closeRealtimeSubscriptions();
    this.conversationListRealtimeSubscription?.unsubscribe();
    this.connectionErrorsSubscription?.unsubscribe();
    this.chatWebsocketService.disconnect();
  }

  /**
   * Restituisce al template la lista corrente delle conversazioni.
   */
  get conversations(): ConversazioneChatResponseDto[] {
    return this.conversationsSignal();
  }

  /**
   * Restituisce la conversazione attualmente aperta.
   */
  get selectedConversation(): ConversazioneChatResponseDto | null {
    return this.selectedConversationSignal();
  }

  /**
   * Restituisce i messaggi della conversazione selezionata.
   */
  get messages(): MessaggioChatResponseDto[] {
    return this.messagesSignal();
  }

  /**
   * Ruolo dell'utente corrente letto dal servizio di autenticazione.
   */
  get currentRole(): Role | null {
    return this.authService.getCurrentUserRole();
  }

  /**
   * Id dell'utente corrente, usato per capire se un messaggio è stato inviato da lui.
   */
  get currentUserId(): number | null {
    return this.authService.getCurrentUser()?.id ?? null;
  }

  /**
   * Indica se l'utente corrente è un cliente.
   */
  get isCliente(): boolean {
    return this.currentRole === Role.CLIENTE;
  }

  /**
   * Indica se l'utente corrente è una segretaria.
   */
  get isSegretaria(): boolean {
    return this.currentRole === Role.SEGRETARIA;
  }

  /**
   * Indica se l'utente corrente è un manager.
   */
  get isManager(): boolean {
    return this.currentRole === Role.MANAGER;
  }

  /**
   * Indica se il ruolo può consultare le conversazioni lato centro sportivo.
   */
  get isCentroReadRole(): boolean {
    return this.isSegretaria || this.isManager;
  }

  /**
   * Determina se l'utente può inviare messaggi nella conversazione selezionata.
   */
  get canWrite(): boolean {
    return !!this.selectedConversation?.scrivibile && !this.isManager;
  }

  /**
   * Titolo dinamico della pagina in base al ruolo dell'utente.
   */
  get pageTitle(): string {
    if (this.isCliente) {
      return 'Chat con BookCourt';
    }

    if (this.isManager) {
      return 'Conversazioni clienti';
    }

    return 'Chat clienti';
  }

  /**
   * Sottotitolo descrittivo mostrato sotto al titolo della pagina.
   */
  get pageSubtitle(): string {
    if (this.isCliente) {
      return 'Scrivi al centro sportivo. Le segretarie potranno risponderti appena possibile.';
    }

    if (this.isManager) {
      return 'Puoi visualizzare tutte le conversazioni, ma non puoi inviare messaggi.';
    }

    return 'Seleziona un cliente dalla lista e rispondi come centro sportivo BookCourt.';
  }

  /**
   * Carica o crea la conversazione personale del cliente.
   * Dopo il caricamento apre subito la conversazione e si iscrive ai relativi aggiornamenti realtime.
   */
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
          this.errorMessage = extractBackendErrorMessage(
            error,
            'Impossibile aprire la tua chat con il centro sportivo.',
            { useGenericErrorMessage: true },
          );
        },
      });
  }

  /**
   * Carica dal backend la lista delle conversazioni visibili al centro sportivo.
   * Viene usato un refresh reale per rispettare la regola stile WhatsApp: la conversazione appare
   * alla segretaria solo dopo il primo messaggio del cliente.
   */
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
          this.errorMessage = extractBackendErrorMessage(
            error,
            'Impossibile caricare le conversazioni dei clienti.',
            { useGenericErrorMessage: true },
          );
        },
      });
  }

  /**
   * Aggiorna silenziosamente la lista conversazioni senza mostrare loader o errori all'utente.
   */
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

  /**
   * Apre una conversazione, svuota temporaneamente i messaggi locali e carica i messaggi dal backend.
   * In parallelo abilita anche la subscription WebSocket per ricevere nuovi messaggi realtime.
   */
  openConversation(conversation: ConversazioneChatResponseDto): void {
    this.selectedConversationSignal.set(conversation);
    this.messagesSignal.set([]);
    this.websocketError = '';

    this.subscribeRealtimeForConversation(conversation.id);
    this.loadMessages(conversation.id);
  }

  /**
   * Invia un messaggio nella conversazione selezionata.
   * Il metodo blocca invii vuoti, invii duplicati e utenti che non hanno permesso di scrittura.
   */
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
          this.errorMessage = extractBackendErrorMessage(
            error,
            'Impossibile inviare il messaggio.',
            { useGenericErrorMessage: true },
          );
        },
      });
  }

  /**
   * Permette l'invio rapido con Enter, lasciando Shift+Enter per andare a capo.
   */
  onMessageKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  /**
   * Verifica se il messaggio è stato scritto dall'utente autenticato.
   */
  isMyMessage(message: MessaggioChatResponseDto): boolean {
    return message.mittenteId === this.currentUserId;
  }

  /**
   * Stabilisce se il messaggio deve essere visualizzato come messaggio in uscita.
   */
  isOutgoingMessage(message: MessaggioChatResponseDto): boolean {
    if (this.isCentroReadRole) {
      return message.inviatoDalCentro;
    }

    return this.isMyMessage(message);
  }

  /**
   * Indica se il messaggio deve essere presentato graficamente come risposta del centro sportivo.
   */
  shouldShowAsCenterMessage(message: MessaggioChatResponseDto): boolean {
    return this.isCliente && message.inviatoDalCentro;
  }

  /**
   * Restituisce il nome leggibile dell'autore da mostrare sopra o accanto al messaggio.
   */
  getMessageAuthor(message: MessaggioChatResponseDto): string {
    if (this.shouldShowAsCenterMessage(message)) {
      return 'BookCourt';
    }

    if (this.isCentroReadRole && message.inviatoDalCentro) {
      return message.autoreDisplay || 'Segreteria centro sportivo';
    }

    return message.autoreDisplay || 'Cliente';
  }

  /**
   * Formatta data e ora del messaggio in formato italiano leggibile.
   */
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

  /**
   * Funzione trackBy per ottimizzare il rendering della lista conversazioni.
   */
  trackByConversationId(_: number, conversation: ConversazioneChatResponseDto): number {
    return conversation.id;
  }

  /**
   * Funzione trackBy per ottimizzare il rendering della lista messaggi.
   */
  trackByMessageId(_: number, message: MessaggioChatResponseDto): number {
    return message.id;
  }

  /**
   * Applica la lista conversazioni ordinandola e mantenendo coerente la conversazione selezionata.
   */
  private applyConversations(conversations: ConversazioneChatResponseDto[]): void {
    const sortedConversations = this.sortConversations(conversations);

    this.conversationsSignal.set(sortedConversations);
    this.updateSelectedConversation(sortedConversations);
    this.subscribeRealtimeForConversations(sortedConversations);
  }

  /**
   * Carica lo storico messaggi di una conversazione tramite API REST.
   */
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
          this.errorMessage = extractBackendErrorMessage(
            error,
            'Impossibile caricare i messaggi della conversazione.',
            { useGenericErrorMessage: true },
          );
        },
      });
  }

  /**
   * Apre le subscription realtime per tutte le conversazioni attualmente visibili al centro.
   */
  private subscribeRealtimeForConversations(conversations: ConversazioneChatResponseDto[]): void {
    conversations.forEach((conversation) => {
      this.subscribeRealtimeForConversation(conversation.id);
    });
  }

  /**
   * Sottoscrive il topic WebSocket di una specifica conversazione, evitando duplicazioni di subscription.
   */
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

  /**
   * Sottoscrive il topic realtime della lista conversazioni, utile quando nasce una nuova chat cliente-centro.
   */
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

  /**
   * Gestisce l'evento realtime che segnala un nuovo messaggio in una conversazione della lista centro.
   */
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

  /**
   * Gestisce un messaggio arrivato in tempo reale sulla conversazione aperta o osservata.
   */
  private handleRealtimeMessage(message: MessaggioChatResponseDto): void {
    this.websocketError = '';
    this.chatService.addMessageToCache(message);
    this.updateConversationPreview(message);

    if (message.conversazioneId !== this.selectedConversation?.id) {
      return;
    }

    this.appendMessageIfMissing(message);
  }

  /**
   * Aggiunge un messaggio allo stato locale solo se non è già presente, evitando duplicati tra REST e WebSocket.
   */
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

  /**
   * Aggiorna anteprima, data ultimo messaggio e ordinamento della conversazione nella lista laterale.
   */
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

  /**
   * Mantiene sincronizzato il riferimento alla conversazione selezionata dopo un refresh della lista.
   */
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

  /**
   * Ordina le conversazioni mettendo in alto quelle con attività più recente.
   */
  private sortConversations(
    conversations: ConversazioneChatResponseDto[],
  ): ConversazioneChatResponseDto[] {
    return [...conversations].sort(
      (left, right) => this.getConversationTimestamp(right) - this.getConversationTimestamp(left),
    );
  }

  /**
   * Calcola il timestamp usato per ordinare le conversazioni.
   */
  private getConversationTimestamp(conversation: ConversazioneChatResponseDto): number {
    const timestamp = conversation.ultimoMessaggioIl || conversation.creataIl;
    const date = new Date(timestamp);

    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  /**
   * Sposta lo scroll del contenitore messaggi in fondo dopo l'aggiornamento della UI.
   */
  private scrollMessagesToBottom(): void {
    setTimeout(() => {
      const container = this.messagesContainer?.nativeElement;

      if (!container) {
        return;
      }

      container.scrollTop = container.scrollHeight;
    });
  }

  /**
   * Chiude tutte le subscription realtime aperte per le singole conversazioni.
   */
  private closeRealtimeSubscriptions(): void {
    this.realtimeSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.realtimeSubscriptions.clear();
  }

}
