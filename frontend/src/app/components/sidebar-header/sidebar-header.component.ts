import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import type { ProfileResponseDto } from '../../dto/response/profile/profile-response.dto';
import { Role } from '../../enumeration/role.enum';
import { AuthService } from '../../services/auth.service';
import { BookingService } from '../../services/booking.service';
import { ChatService } from '../../services/chat.service';
import { ManagerService } from '../../services/manager.service';
import { ImageUrlUtil } from '../../util/image-url.util';

/**
 * Singola voce mostrata nella sidebar.
 * Ogni elemento contiene il testo visibile, l'icona e la route da aprire.
 */
interface SidebarItem {
  label: string;
  icon: string;
  key: string;
  route?: string;
}

@Component({
  selector: 'sidebar-header',
  imports: [CommonModule, RouterOutlet],
  templateUrl: './sidebar-header.component.html',
  styleUrl: './sidebar-header.component.css',
})
/**
 * Componente che gestisce la parte fissa della dashboard:
 * intestazione profilo, menu laterale e timer del lock prenotazione.
 *
 * La logica qui è abbastanza centrale perché dipende sia dal ruolo utente
 * sia dalla route corrente, quindi conviene averla tutta nello stesso punto.
 */
export class SidebarHeaderComponent implements OnInit, OnDestroy {
  /**
   * Profilo completo recuperato dal backend.
   * Se non è ancora arrivato, il componente usa temporaneamente i dati locali dell'AuthService.
   */
  profile: ProfileResponseDto | null = null;

  /** URL della foto profilo già normalizzato per il template. */
  profileImageUrl = '';

  /**
   * Tiene traccia della voce selezionata manualmente nella sidebar.
   * Serve soprattutto nella parte manager, dove esistono sottosezioni interne.
   */
  selectedItemKey = '';

  /** Intervallo di refresh del countdown del lock prenotazione. */
  private readonly lockTimerRefreshMs = 1000;

  /** Subscription del timer periodico e flag per non eliminare due volte lo stesso lock. */
  private lockTimerSubscription?: Subscription;
  private lockExpirationInProgress = false;

  /** Secondi rimanenti del lock prenotazione corrente. */
  readonly bookingLockRemainingSeconds = signal(0);

  /** Booleano comodo usato dal template per capire se mostrare il countdown. */
  readonly hasActiveBookingLock = computed(() => this.bookingLockRemainingSeconds() > 0);

  /** Countdown formattato come mm:ss per l'utente. */
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
   * Configurazione statica del menu per ruolo.
   * In questo modo il template non contiene tanti if sparsi e la navigazione resta centralizzata.
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
   * All'avvio inizializza i dati visivi subito da sessione
   * e poi aggiorna tutto con i dati reali presi dal backend.
   */
  ngOnInit(): void {
    this.initializeProfileImageFromSession();
    this.preloadRoleData();
    this.loadCurrentProfile();
    this.startBookingLockTimer();
    window.addEventListener('bookcourt-user-updated', this.handleUserUpdated);
  }

  /** Pulisce timer e listener globali quando il componente viene distrutto. */
  ngOnDestroy(): void {
    this.lockTimerSubscription?.unsubscribe();
    window.removeEventListener('booking-lock-updated', this.handleBookingLockUpdated);
    window.removeEventListener('bookcourt-user-updated', this.handleUserUpdated);
  }

  /** Restituisce solo le voci di menu compatibili con il ruolo corrente. */
  get sidebarItems(): SidebarItem[] {
    const role = this.currentRole;
    return role ? (this.menuByRole[role] ?? []) : [];
  }

  /** Titolo principale mostrato nell'header della dashboard. */
  get dashboardTitle(): string {
    switch (this.currentRole) {
      case Role.SEGRETARIA:
        return 'Segretary Management';
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

  /** Serve al template per mostrare la barra secondaria manager solo quando ha senso. */
  get canViewStaffHeaderNav(): boolean {
    return this.currentRole === Role.MANAGER && this.isStaffManagementActive;
  }

  /** Nome completo dell'utente, con fallback ai dati locali se il profilo backend non è ancora arrivato. */
  get fullName(): string {
    if (!this.profile) {
      const user = this.authService.getCurrentUser();
      return user ? `${user.nome} ${user.cognome}` : 'Utente';
    }

    return `${this.profile.nome} ${this.profile.cognome}`;
  }

  /** Iniziali mostrate come fallback grafico al posto della foto profilo. */
  get userInitials(): string {
    const name = this.profile?.nome ?? this.authService.getCurrentUser()?.nome ?? '';
    const surname = this.profile?.cognome ?? this.authService.getCurrentUser()?.cognome ?? '';

    return `${name.charAt(0).toUpperCase()}${surname.charAt(0).toUpperCase()}` || 'U';
  }

  /** Ruolo corrente dell'utente, prima dal profilo aggiornato e poi come fallback da AuthService. */
  private get currentRole(): Role | null {
    return this.profile?.ruolo ?? this.authService.getCurrentUserRole();
  }

  /**
   * Capisce se il manager si trova nell'area di gestione staff/campi.
   * Serve per mantenere evidenziata correttamente la voce "center-management".
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

  /** Gestisce il click su una voce di menu e reindirizza alla sezione corretta. */
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

  /** Stabilisce se una voce della sidebar deve risultare attiva nel template. */
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
   * Cerca la voce menu che corrisponde meglio alla route corrente.
   * Se più route fanno match, sceglie quella più specifica.
   */
  private getActiveRouteItemKey(): string | null {
    const currentUrl = this.normalizeRouteUrl(this.router.url);

    const matchingItems = this.sidebarItems
      .filter((item) => item.route)
      .filter((item) => this.routeMatches(currentUrl, item.route as string))
      .sort((a, b) => (b.route?.length ?? 0) - (a.route?.length ?? 0));

    return matchingItems[0]?.key ?? null;
  }

  /** Confronta la route attuale con una route di menu, includendo eventuali sottopagine. */
  private routeMatches(currentUrl: string, route: string): boolean {
    const normalizedRoute = this.normalizeRouteUrl(route);

    return (
      currentUrl === normalizedRoute ||
      currentUrl.startsWith(`${normalizedRoute}/`)
    );
  }

  /** Normalizza una URL togliendo query string, hash e slash finale. */
  private normalizeRouteUrl(url: string): string {
    const cleanUrl = url.split('?')[0].split('#')[0];

    if (cleanUrl.length > 1 && cleanUrl.endsWith('/')) {
      return cleanUrl.slice(0, -1);
    }

    return cleanUrl;
  }

  /** Apre la lista istruttori nell'area manager. */
  openInstructors(): void {
    this.selectedItemKey = 'center-management';
    void this.router.navigate(['/dashboard/instructors']);
  }

  /** Controlla se la route attuale appartiene alla sezione istruttori. */
  isInstructorsActive(): boolean {
    return this.router.url.startsWith('/dashboard/instructors');
  }

  /** Apre la lista segretarie nell'area manager. */
  openSecretaries(): void {
    this.selectedItemKey = 'center-management';
    void this.router.navigate(['/dashboard/secretaries']);
  }

  /** Controlla se la route attuale appartiene alla sezione segretarie. */
  isSecretariesActive(): boolean {
    return this.router.url.startsWith('/dashboard/secretaries');
  }

  /** Apre la sezione campi nell'area manager. */
  openFields(): void {
    this.selectedItemKey = 'center-management';
    void this.router.navigate(['/dashboard/fields']);
  }

  /** Controlla se la route attuale appartiene alla sezione campi. */
  isFieldsActive(): boolean {
    return this.router.url.startsWith('/dashboard/fields');
  }

  /** Effettua il logout e riporta l'utente alla pagina di login. */
  logout(): void {
    this.authService.logout();
    void this.router.navigate(['/login']);
  }

  /** Se l'immagine non si carica, svuota l'URL così il template mostra il fallback. */
  onProfileImageError(): void {
    this.profileImageUrl = '';
  }

  /** TrackBy della lista menu per evitare render inutili. */
  trackByKey(_: number, item: SidebarItem): string {
    return item.key;
  }

  /** Listener collegato all'evento custom emesso quando cambia il lock prenotazione. */
  private readonly handleBookingLockUpdated = (): void => {
    this.updateBookingLockTimer();
  };

  /** Listener collegato all'evento custom emesso quando i dati dell'utente vengono aggiornati. */
  private readonly handleUserUpdated = (): void => {
    const user = this.authService.getCurrentUser();
    if (user && this.profile) {
      this.profile = { ...this.profile, nome: user.nome, cognome: user.cognome, email: user.email };
    }
  };

  /** Avvia il timer periodico e registra anche il listener custom sul browser. */
  private startBookingLockTimer(): void {
    this.updateBookingLockTimer();

    window.addEventListener('booking-lock-updated', this.handleBookingLockUpdated);

    this.lockTimerSubscription = interval(this.lockTimerRefreshMs).subscribe(() => {
      this.updateBookingLockTimer();
    });
  }

  /**
   * Legge la scadenza del lock dalla sessione e aggiorna il countdown visibile.
   * Se il lock è scaduto prova anche a chiuderlo lato backend.
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

    if (remainingSeconds === 0 && lockId) {
      this.deleteExpiredLockAndReturnToDateTime(lockId);
    }
  }

  /** Quando il lock scade, prova a cancellarlo una sola volta dal backend. */
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
   * Chiude la gestione del lock scaduto, pulisce la sessione
   * e riporta l'utente allo step orario se si trova ancora nel flusso prenotazione.
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

  /** Rimuove dalla sessione tutti i dati temporanei associati al lock prenotazione. */
  private clearBookingLockStorage(): void {
    sessionStorage.removeItem('booking.lockId');
    sessionStorage.removeItem('booking.lockSignature');
    sessionStorage.removeItem('booking.lockExpiresAt');
    this.bookingLockRemainingSeconds.set(0);
  }

  /** Legge e valida l'id del lock salvato in sessionStorage. */
  private getStoredLockId(): number | null {
    const lockId = Number(sessionStorage.getItem('booking.lockId'));

    if (!Number.isFinite(lockId) || lockId <= 0) {
      return null;
    }

    return lockId;
  }

  /**
   * Recupera il profilo aggiornato dal backend e riallinea anche i dati locali dell'AuthService.
   * Questo è utile perché nome, cognome e foto potrebbero essere cambiati.
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

  /** Precarica dati utili al ruolo, ad esempio la chat del centro per segretaria e manager. */
  private preloadRoleData(): void {
    if (this.currentRole === Role.SEGRETARIA || this.currentRole === Role.MANAGER) {
      this.chatService.preloadCentroChat();
    }
  }

  /**
   * Inizializza subito la foto usando i dati già presenti localmente,
   * così l'interfaccia non resta vuota mentre aspettiamo la risposta del backend.
   */
  private initializeProfileImageFromSession(): void {
    const user = this.authService.getCurrentUser();
    this.profileImageUrl = this.buildProfileImageUrl(user?.fotoProfiloUrl ?? null, user?.ruolo ?? null);
  }

  /**
   * Costruisce l'URL della foto profilo solo per i ruoli che usano davvero la foto in dashboard.
   * Per manager e cliente viene restituita stringa vuota.
   */
  private buildProfileImageUrl(path: string | null | undefined, role: Role | null): string {
    if (role === Role.MANAGER || role === Role.CLIENTE) {
      return '';
    }

    return ImageUrlUtil.normalizeProfileImageUrl(path, { assumeImagesDirectory: true }) ?? '';
  }
}
