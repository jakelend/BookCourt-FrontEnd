import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Role } from '../../enumeration/role.enum';
import { AuthService, ProfileResponseDto } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import { ManagerService } from '../../services/manager.service';
import { BookingService } from '../../services/booking.service';
import { Subscription, interval } from 'rxjs';

/**
 * Voce del menu laterale mostrata nella dashboard.
 */
interface SidebarItem {
  /** Testo visibile nel menu. */
  label: string;

  /** Nome dell'icona Material associata alla voce. */
  icon: string;

  /** Chiave logica usata per gestire selezione e stato attivo. */
  key: string;

  /** Rotta Angular da aprire al click, se la voce è collegata a una pagina specifica. */
  route?: string;
}

/**
 * Componente contenitore della dashboard autenticata.
 *
 * Gestisce header, sidebar, outlet delle pagine figlie, dati profilo,
 * menu differenziato per ruolo e timer del lock temporaneo di prenotazione.
 */
@Component({
  selector: 'sidebar-header',
  imports: [CommonModule, RouterOutlet],
  templateUrl: './sidebar-header.component.html',
  styleUrl: './sidebar-header.component.css',
})
export class SidebarHeaderComponent implements OnInit, OnDestroy {
  /** Profilo completo dell'utente autenticato caricato dal backend. */
  profile: ProfileResponseDto | null = null;

  /** URL finale dell'immagine profilo da mostrare nell'header. */
  profileImageUrl = '';

  /** Chiave della voce di menu selezionata manualmente dall'utente. */
  selectedItemKey = '';

  /** URL base del backend usato per costruire i percorsi delle immagini relative. */
  private readonly backendBaseUrl = 'http://localhost:8080';

  /** Frequenza di aggiornamento del timer del lock prenotazione. */
  private readonly lockTimerRefreshMs = 1000;

  /** Subscription dell'intervallo RxJS che aggiorna il timer del lock. */
  private lockTimerSubscription?: Subscription;

  /** Evita chiamate duplicate al backend quando il lock scade. */
  private lockExpirationInProgress = false;

  /** Secondi rimanenti prima della scadenza del lock di prenotazione. */
  readonly bookingLockRemainingSeconds = signal(0);

  /** Indica se nel sessionStorage esiste un lock prenotazione ancora attivo. */
  readonly hasActiveBookingLock = computed(() => this.bookingLockRemainingSeconds() > 0);

  /**
   * Etichetta del timer in formato mm:ss.
   *
   * Viene ricalcolata automaticamente quando cambia bookingLockRemainingSeconds.
   */
  readonly bookingLockRemainingLabel = computed(() => {
    const seconds = this.bookingLockRemainingSeconds();

    if (seconds <= 0) {
      return '';
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  });

  /**
   * Configurazione delle voci di menu per ciascun ruolo applicativo.
   *
   * Ogni ruolo vede solo le funzioni previste dalla propria area riservata.
   */
  readonly menuByRole: Record<Role, SidebarItem[]> = {
    [Role.SEGRETARIA]: [
      { label: 'Chat', icon: 'chat', key: 'chat', route: '/dashboard/chat' },
      { label: 'Manutenzione', icon: 'engineering', key: 'maintenance', route: '/dashboard/maintenance' },
      { label: 'Calendario Istruttori', icon: 'calendar_today', key: 'instructor-calendar', route: '/dashboard/secretary-instructor-calendar' },
      { label: 'Orari centro', icon: 'schedule', key: 'center-hours', route: '/dashboard/center-hours' },
    ],

    [Role.ISTRUTTORE]: [
      { label: 'Calendario Istruttore', icon: 'calendar_month', key: 'instructor-calendar', route: '/dashboard/instructor-calendar' },
    ],

    [Role.CLIENTE]: [
      { label: 'Chat', icon: 'chat', key: 'chat', route: '/dashboard/chat' },
      {
        label: 'Prenotazione',
        icon: 'calendar_month',
        key: 'bookings',
        route: '/dashboard/prenotazioni',
      },
      {
        label: 'Annulla Prenotazione',
        icon: 'event_busy',
        key: 'cancel-bookings',
        route: '/dashboard/prenotazioni/annulla',
      },
      {
        label: 'Prenotazioni effettuate',
        icon: 'rate_review',
        key: 'feedback-pending',
        route: '/dashboard/feedback/da-recensire',
      },
      {
        label: 'Prenotazioni concluse',
        icon: 'task_alt',
        key: 'feedback-completed',
        route: '/dashboard/feedback/concluse',
      },
      { label: 'Gestione credenziali', icon: 'key', key: 'credentials', route: '/dashboard/change-password' },
      { label: 'Gestione account', icon: 'manage_accounts', key: 'account-management', route: '/dashboard/account-management' },
    ],

    [Role.MANAGER]: [
      { label: 'Staff Management', icon: 'settings', key: 'center-management' },
      { label: 'Chat', icon: 'chat', key: 'chat', route: '/dashboard/chat' },
    ],
  };

  constructor(
    private readonly authService: AuthService,
    private readonly chatService: ChatService,
    private readonly managerService: ManagerService,
    private readonly bookingService: BookingService,
    private readonly router: Router,
  ) {}

  /**
   * Inizializza dati profilo, cache di ruolo e timer del lock prenotazione.
   *
   * Aggiunge anche un listener custom usato quando un'altra pagina aggiorna
   * i dati dell'utente corrente.
   */
  ngOnInit(): void {
    this.initializeProfileImageFromSession();
    this.preloadRoleData();
    this.loadCurrentProfile();
    this.startBookingLockTimer();
    window.addEventListener('bookcourt-user-updated', this.handleCurrentUserUpdated);
  }

  /** Pulisce subscription e listener globali quando il componente viene distrutto. */
  ngOnDestroy(): void {
    this.lockTimerSubscription?.unsubscribe();
    window.removeEventListener('booking-lock-updated', this.handleBookingLockUpdated);
    window.removeEventListener('bookcourt-user-updated', this.handleCurrentUserUpdated);
  }

  /** Voci di menu da mostrare in base al ruolo corrente. */
  get sidebarItems(): SidebarItem[] {
    const role = this.currentRole;
    return role ? (this.menuByRole[role] ?? []) : [];
  }

  /** Titolo principale mostrato nell'header della dashboard. */
  get dashboardTitle(): string {
    switch (this.currentRole) {
      case Role.SEGRETARIA:
        return 'Center Management';
      case Role.ISTRUTTORE:
        return 'Instructor Management';
      case Role.CLIENTE:
        return 'User View Dashboard';
      case Role.MANAGER:
        return 'Manager Control';
      default:
        return 'Dashboard';
    }
  }

  /** Etichetta testuale del ruolo mostrata vicino al profilo. */
  get roleLabel(): string {
    switch (this.currentRole) {
      case Role.SEGRETARIA:
        return 'Segretaria centro';
      case Role.ISTRUTTORE:
        return 'Istruttore';
      case Role.MANAGER:
        return 'Amministratore';
      default:
        return '';
    }
  }

  /** Indica se mostrare la barra superiore di navigazione dello staff manager. */
  get canViewStaffHeaderNav(): boolean {
    return this.currentRole === Role.MANAGER && this.isStaffManagementActive;
  }

  /** Nome completo dell'utente mostrato nell'header. */
  get fullName(): string {
    if (!this.profile) {
      const user = this.authService.getCurrentUser();
      return user ? `${user.nome} ${user.cognome}` : 'Utente';
    }

    return `${this.profile.nome} ${this.profile.cognome}`;
  }

  /** Iniziali usate quando non bisogna mostrare o non esiste una foto profilo valida. */
  get userInitials(): string {
    const name = this.profile?.nome ?? this.authService.getCurrentUser()?.nome ?? '';
    const surname = this.profile?.cognome ?? this.authService.getCurrentUser()?.cognome ?? '';

    return `${name.charAt(0).toUpperCase()}${surname.charAt(0).toUpperCase()}` || 'U';
  }

  /** Ruolo corrente letto prima dal profilo completo e poi dalla sessione locale. */
  private get currentRole(): Role | null {
    return this.profile?.ruolo ?? this.authService.getCurrentUserRole();
  }

  /**
   * Indica se la sezione Staff Management del manager deve risultare attiva.
   *
   * Considera sia la selezione manuale sia le rotte figlie di istruttori,
   * segretarie e campi.
   */
  private get isStaffManagementActive(): boolean {
    return (
      this.selectedItemKey === 'center-management' ||
      (!this.selectedItemKey &&
        (this.router.url.startsWith('/dashboard/instructors') ||
          this.router.url.startsWith('/dashboard/secretaries') ||
          this.router.url.startsWith('/dashboard/fields')))
    );
  }

  /**
   * Gestisce il click su una voce della sidebar.
   *
   * Alcune voci hanno logiche particolari, ad esempio Staff Management
   * deve precaricare liste condivise e aprire la dashboard base.
   *
   * @param item Voce di menu selezionata dall'utente.
   */
  selectMenuItem(item: SidebarItem): void {
    this.selectedItemKey = item.key;

    if (item.key === 'center-management') {
      this.managerService.preloadStaffManagementLists();
      void this.router.navigate(['/dashboard']);
      return;
    }

    if (item.key === 'credentials') {
      void this.router.navigate(['/dashboard/change-password']);
      return;
    }

    if (item.route) {
      void this.router.navigateByUrl(item.route);
      return;
    }

    void this.router.navigate(['/dashboard']);
  }

  /**
   * Stabilisce se una voce della sidebar deve essere evidenziata come attiva.
   *
   * @param item Voce da confrontare con la rotta corrente.
   * @returns true se la voce rappresenta la pagina attualmente aperta.
   */
  isSidebarItemActive(item: SidebarItem): boolean {
    const activeRouteKey = this.getActiveRouteItemKey();

    if (activeRouteKey) {
      return item.key === activeRouteKey;
    }

    if (item.route) {
      return false;
    }

    if (this.selectedItemKey) {
      return this.selectedItemKey === item.key;
    }

    return item.key === 'center-management' && this.isStaffManagementActive;
  }

  /**
   * Cerca la voce di menu che corrisponde meglio alla rotta corrente.
   *
   * In caso di rotte annidate, viene scelta la rotta più specifica.
   */
  private getActiveRouteItemKey(): string | null {
    const currentUrl = this.normalizeRouteUrl(this.router.url);

    const matchingItems = this.sidebarItems
      .filter((item) => item.route)
      .filter((item) => this.routeMatches(currentUrl, item.route as string))
      .sort((a, b) => (b.route?.length ?? 0) - (a.route?.length ?? 0));

    return matchingItems[0]?.key ?? null;
  }

  /**
   * Controlla se una rotta configurata nel menu corrisponde all'URL corrente.
   *
   * @param currentUrl URL corrente normalizzato.
   * @param route Rotta configurata nella voce di menu.
   */
  private routeMatches(currentUrl: string, route: string): boolean {
    const normalizedRoute = this.normalizeRouteUrl(route);

    return (
      currentUrl === normalizedRoute ||
      currentUrl.startsWith(`${normalizedRoute}/`)
    );
  }

  /**
   * Normalizza una rotta rimuovendo query string, fragment e slash finale.
   *
   * @param url URL da normalizzare.
   * @returns URL pulito usato per confrontare le rotte.
   */
  private normalizeRouteUrl(url: string): string {
    const cleanUrl = url.split('?')[0].split('#')[0];

    if (cleanUrl.length > 1 && cleanUrl.endsWith('/')) {
      return cleanUrl.slice(0, -1);
    }

    return cleanUrl;
  }

  /** Apre la pagina manager di gestione istruttori. */
  openInstructors(): void {
    this.selectedItemKey = 'center-management';
    void this.router.navigate(['/dashboard/instructors']);
  }

  /** Indica se la pagina istruttori è attualmente attiva. */
  isInstructorsActive(): boolean {
    return this.router.url.startsWith('/dashboard/instructors');
  }

  /** Apre la pagina manager di gestione segretarie. */
  openSecretaries(): void {
    this.selectedItemKey = 'center-management';
    void this.router.navigate(['/dashboard/secretaries']);
  }

  /** Indica se la pagina segretarie è attualmente attiva. */
  isSecretariesActive(): boolean {
    return this.router.url.startsWith('/dashboard/secretaries');
  }

  /** Apre la pagina manager di gestione campi sportivi. */
  openFields(): void {
    this.selectedItemKey = 'center-management';
    void this.router.navigate(['/dashboard/fields']);
  }

  /** Indica se la pagina campi è attualmente attiva. */
  isFieldsActive(): boolean {
    return this.router.url.startsWith('/dashboard/fields');
  }

  /** Effettua il logout e riporta l'utente alla pagina di login. */
  logout(): void {
    this.authService.logout();
    void this.router.navigate(['/login']);
  }

  /** Nasconde la foto profilo se il caricamento dell'immagine fallisce. */
  onProfileImageError(): void {
    this.profileImageUrl = '';
  }

  /**
   * Funzione trackBy per le voci della sidebar.
   *
   * @param _ Indice dell'elemento, non usato.
   * @param item Voce della sidebar.
   * @returns Chiave stabile della voce.
   */
  trackByKey(_: number, item: SidebarItem): string {
    return item.key;
  }

  /** Listener custom richiamato quando una pagina aggiorna il lock prenotazione. */
  private readonly handleBookingLockUpdated = (): void => {
    this.updateBookingLockTimer();
  };

  /**
   * Listener custom richiamato dopo l'aggiornamento dei dati utente.
   *
   * Rilegge i dati dal localStorage tramite AuthService e aggiorna subito
   * nome, cognome e foto profilo nell'header senza ricaricare la pagina.
   */
  private readonly handleCurrentUserUpdated = (): void => {
    const currentUser = this.authService.getCurrentUser();

    if (!currentUser) {
      return;
    }

    /*
      Quando Gestione account salva i dati, AuthService richiama /api/auth/me
      e aggiorna il localStorage. Qui leggiamo subito il nuovo utente dal
      localStorage, così nome e cognome in alto cambiano senza refresh pagina.
    */
    this.profile = {
      ...(this.profile ?? {
        telefono: '',
        fotoProfiloUrl: null,
        attivo: true,
      } as ProfileResponseDto),
      id: currentUser.id,
      email: currentUser.email,
      nome: currentUser.nome,
      cognome: currentUser.cognome,
      ruolo: currentUser.ruolo,
      fotoProfiloUrl: currentUser.fotoProfiloUrl ?? this.profile?.fotoProfiloUrl ?? null,
    };

    this.profileImageUrl = this.buildProfileImageUrl(
      currentUser.fotoProfiloUrl ?? this.profile.fotoProfiloUrl ?? null,
      currentUser.ruolo,
    );
  };

  /**
   * Avvia il timer del lock prenotazione.
   *
   * Il timer viene aggiornato ogni secondo e può essere forzato anche
   * da eventi custom lanciati dalle pagine del flow di prenotazione.
   */
  private startBookingLockTimer(): void {
    this.updateBookingLockTimer();

    window.addEventListener('booking-lock-updated', this.handleBookingLockUpdated);

    this.lockTimerSubscription = interval(this.lockTimerRefreshMs).subscribe(() => {
      this.updateBookingLockTimer();
    });
  }

  /**
   * Aggiorna i secondi rimanenti del lock prenotazione.
   *
   * Se il lock è scaduto, tenta di eliminarlo dal backend e poi riporta
   * l'utente alla selezione data/ora quando si trova nel flow di prenotazione.
   */
  private updateBookingLockTimer(): void {
    const expiresAt = sessionStorage.getItem('booking.lockExpiresAt');
    const lockId = this.getStoredLockId();

    if (!expiresAt) {
      this.bookingLockRemainingSeconds.set(0);
      return;
    }

    const expirationDate = new Date(expiresAt);

    if (Number.isNaN(expirationDate.getTime())) {
      this.bookingLockRemainingSeconds.set(0);
      this.clearBookingLockStorage();
      return;
    }

    const remainingMilliseconds = expirationDate.getTime() - Date.now();
    const remainingSeconds = Math.max(0, Math.ceil(remainingMilliseconds / 1000));

    this.bookingLockRemainingSeconds.set(remainingSeconds);

    if (remainingSeconds !== 0) {
      return;
    }

    if (lockId) {
      this.deleteExpiredLockAndReturnToDateTime(lockId);
      return;
    }

    this.finishExpiredLockHandling();
  }

  /**
   * Elimina dal backend un lock scaduto e conclude la gestione della scadenza.
   *
   * @param lockId Identificativo del lock prenotazione salvato in sessionStorage.
   */
  private deleteExpiredLockAndReturnToDateTime(lockId: number): void {
    if (this.lockExpirationInProgress) {
      return;
    }

    this.lockExpirationInProgress = true;

    this.bookingService.eliminaLockPrenotazione(lockId).subscribe({
      next: () => {
        this.finishExpiredLockHandling();
      },
      error: (error) => {
        console.warn('Lock scaduto già eliminato o non raggiungibile:', error);
        this.finishExpiredLockHandling();
      },
    });
  }

  /**
   * Pulisce lo stato locale del lock scaduto e gestisce il redirect nel flow booking.
   */
  private finishExpiredLockHandling(): void {
    this.clearBookingLockStorage();
    this.lockExpirationInProgress = false;

    const currentUrl = this.normalizeRouteUrl(this.router.url);

    if (
      currentUrl.startsWith('/dashboard/prenotazioni') &&
      currentUrl !== '/dashboard/prenotazioni/orario' &&
      currentUrl !== '/dashboard/prenotazioni/conferma'
    ) {
      void this.router.navigate(['/dashboard/prenotazioni/orario']);
    }
  }

  /** Pulisce dal sessionStorage tutti i dati relativi al lock prenotazione. */
  private clearBookingLockStorage(): void {
    sessionStorage.removeItem('booking.lockId');
    sessionStorage.removeItem('booking.lockSignature');
    sessionStorage.removeItem('booking.lockExpiresAt');
    this.bookingLockRemainingSeconds.set(0);
  }

  /**
   * Legge l'identificativo del lock dal sessionStorage.
   *
   * @returns id numerico valido oppure null se il valore salvato non è utilizzabile.
   */
  private getStoredLockId(): number | null {
    const lockId = Number(sessionStorage.getItem('booking.lockId'));

    if (!Number.isFinite(lockId) || lockId <= 0) {
      return null;
    }

    return lockId;
  }

  /**
   * Carica dal backend il profilo completo dell'utente autenticato.
   *
   * Dopo il caricamento aggiorna l'immagine profilo, sincronizza AuthService
   * e precarica eventuali dati necessari al ruolo corrente.
   */
  private loadCurrentProfile(): void {
    this.authService.getCurrentProfile().subscribe({
      next: (profile) => {
        this.profile = profile;
        this.profileImageUrl = this.buildProfileImageUrl(profile.fotoProfiloUrl, profile.ruolo);
        this.authService.updateCurrentUserFromProfile(profile);
        this.preloadRoleData();
      },
    });
  }

  /** Precarica dati condivisi per ruoli che usano la chat del centro. */
  private preloadRoleData(): void {
    if (this.currentRole === Role.SEGRETARIA || this.currentRole === Role.MANAGER) {
      this.chatService.preloadCentroChat();
    }
  }

  /**
   * Inizializza l'immagine profilo usando i dati già presenti nella sessione locale.
   *
   * Serve per mostrare subito qualcosa nell'header prima che arrivi la risposta
   * della chiamata HTTP al profilo completo.
   */
  private initializeProfileImageFromSession(): void {
    const user = this.authService.getCurrentUser();
    this.profileImageUrl = this.buildProfileImageUrl(user?.fotoProfiloUrl ?? null, user?.ruolo ?? null);
  }

  /**
   * Costruisce l'URL completo dell'immagine profilo da mostrare nell'header.
   *
   * Manager e cliente non visualizzano foto profilo in questa logica, quindi
   * per quei ruoli viene restituita stringa vuota e il template userà le iniziali.
   *
   * @param path Percorso dell'immagine restituito dal backend o salvato in sessione.
   * @param role Ruolo dell'utente proprietario dell'immagine.
   * @returns URL completo dell'immagine oppure stringa vuota se non utilizzabile.
   */
  private buildProfileImageUrl(path: string | null | undefined, role: Role | null): string {
    if (role === Role.MANAGER || role === Role.CLIENTE) {
      return '';
    }

    const url = path?.trim();

    if (!url || this.isInvalidImagePath(url)) {
      return '';
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    if (url.startsWith('/images/')) {
      return `${this.backendBaseUrl}${url}`;
    }

    if (!url.startsWith('images/')) {
       return `${this.backendBaseUrl}/images/${url.replace(/^\/+/, '')}`;
    }

    return `${this.backendBaseUrl}/${url.replace(/^\/+/, '')}`;
  }

  /** Percorso dell'immagine profilo di default da ignorare nell'header. */
  private readonly defaultProfileImagePath = 'images/default/default-image-profile.png';

  /**
   * Verifica se il percorso immagine è un placeholder o un valore non valido.
   *
   * @param path Percorso immagine da controllare.
   * @returns true se il path non deve essere usato come immagine profilo reale.
   */
  private isInvalidImagePath(path: string): boolean {
    const normalizedPath = path.trim().toLowerCase();

    return (
      normalizedPath === 'string' ||
      normalizedPath === 'null' ||
      normalizedPath === 'undefined' ||
      normalizedPath === this.defaultProfileImagePath ||
      normalizedPath === `/${this.defaultProfileImagePath}` ||
      normalizedPath.endsWith(`/${this.defaultProfileImagePath}`)
    );
  }
}
