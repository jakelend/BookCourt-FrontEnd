import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Role } from '../../enumeration/role.enum';
import { AuthService, ProfileResponseDto } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import { ManagerService } from '../../services/manager.service';
import { BookingService } from '../../services/booking.service';
import { Subscription, interval } from 'rxjs';

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
export class SidebarHeaderComponent implements OnInit, OnDestroy {
  profile: ProfileResponseDto | null = null;
  profileImageUrl = '';
  selectedItemKey = '';

  private readonly backendBaseUrl = 'http://localhost:8080';
  private readonly lockTimerRefreshMs = 1000;

  private lockTimerSubscription?: Subscription;
  private lockExpirationInProgress = false;

  readonly bookingLockRemainingSeconds = signal(0);

  readonly hasActiveBookingLock = computed(() => this.bookingLockRemainingSeconds() > 0);

  readonly bookingLockRemainingLabel = computed(() => {
    const seconds = this.bookingLockRemainingSeconds();

    if (seconds <= 0) {
      return '';
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  });

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

  ngOnInit(): void {
    this.initializeProfileImageFromSession();
    this.preloadRoleData();
    this.loadCurrentProfile();
    this.startBookingLockTimer();
    window.addEventListener('bookcourt-user-updated', this.handleCurrentUserUpdated);
  }

  ngOnDestroy(): void {
    this.lockTimerSubscription?.unsubscribe();
    window.removeEventListener('booking-lock-updated', this.handleBookingLockUpdated);
    window.removeEventListener('bookcourt-user-updated', this.handleCurrentUserUpdated);
  }

  get sidebarItems(): SidebarItem[] {
    const role = this.currentRole;
    return role ? (this.menuByRole[role] ?? []) : [];
  }

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

  get canViewStaffHeaderNav(): boolean {
    return this.currentRole === Role.MANAGER && this.isStaffManagementActive;
  }

  get fullName(): string {
    if (!this.profile) {
      const user = this.authService.getCurrentUser();
      return user ? `${user.nome} ${user.cognome}` : 'Utente';
    }

    return `${this.profile.nome} ${this.profile.cognome}`;
  }

  get userInitials(): string {
    const name = this.profile?.nome ?? this.authService.getCurrentUser()?.nome ?? '';
    const surname = this.profile?.cognome ?? this.authService.getCurrentUser()?.cognome ?? '';

    return `${name.charAt(0).toUpperCase()}${surname.charAt(0).toUpperCase()}` || 'U';
  }

  private get currentRole(): Role | null {
    return this.profile?.ruolo ?? this.authService.getCurrentUserRole();
  }

  private get isStaffManagementActive(): boolean {
    return (
      this.selectedItemKey === 'center-management' ||
      (!this.selectedItemKey &&
        (this.router.url.startsWith('/dashboard/instructors') ||
          this.router.url.startsWith('/dashboard/secretaries') ||
          this.router.url.startsWith('/dashboard/fields')))
    );
  }

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

  private getActiveRouteItemKey(): string | null {
    const currentUrl = this.normalizeRouteUrl(this.router.url);

    const matchingItems = this.sidebarItems
      .filter((item) => item.route)
      .filter((item) => this.routeMatches(currentUrl, item.route as string))
      .sort((a, b) => (b.route?.length ?? 0) - (a.route?.length ?? 0));

    return matchingItems[0]?.key ?? null;
  }

  private routeMatches(currentUrl: string, route: string): boolean {
    const normalizedRoute = this.normalizeRouteUrl(route);

    return (
      currentUrl === normalizedRoute ||
      currentUrl.startsWith(`${normalizedRoute}/`)
    );
  }

  private normalizeRouteUrl(url: string): string {
    const cleanUrl = url.split('?')[0].split('#')[0];

    if (cleanUrl.length > 1 && cleanUrl.endsWith('/')) {
      return cleanUrl.slice(0, -1);
    }

    return cleanUrl;
  }

  openInstructors(): void {
    this.selectedItemKey = 'center-management';
    void this.router.navigate(['/dashboard/instructors']);
  }

  isInstructorsActive(): boolean {
    return this.router.url.startsWith('/dashboard/instructors');
  }

  openSecretaries(): void {
    this.selectedItemKey = 'center-management';
    void this.router.navigate(['/dashboard/secretaries']);
  }

  isSecretariesActive(): boolean {
    return this.router.url.startsWith('/dashboard/secretaries');
  }

  openFields(): void {
    this.selectedItemKey = 'center-management';
    void this.router.navigate(['/dashboard/fields']);
  }

  isFieldsActive(): boolean {
    return this.router.url.startsWith('/dashboard/fields');
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigate(['/login']);
  }

  onProfileImageError(): void {
    this.profileImageUrl = '';
  }

  trackByKey(_: number, item: SidebarItem): string {
    return item.key;
  }

  private readonly handleBookingLockUpdated = (): void => {
    this.updateBookingLockTimer();
  };

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

  private startBookingLockTimer(): void {
    this.updateBookingLockTimer();

    window.addEventListener('booking-lock-updated', this.handleBookingLockUpdated);

    this.lockTimerSubscription = interval(this.lockTimerRefreshMs).subscribe(() => {
      this.updateBookingLockTimer();
    });
  }

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

  private clearBookingLockStorage(): void {
    sessionStorage.removeItem('booking.lockId');
    sessionStorage.removeItem('booking.lockSignature');
    sessionStorage.removeItem('booking.lockExpiresAt');
    this.bookingLockRemainingSeconds.set(0);
  }

  private getStoredLockId(): number | null {
    const lockId = Number(sessionStorage.getItem('booking.lockId'));

    if (!Number.isFinite(lockId) || lockId <= 0) {
      return null;
    }

    return lockId;
  }

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

  private preloadRoleData(): void {
    if (this.currentRole === Role.SEGRETARIA || this.currentRole === Role.MANAGER) {
      this.chatService.preloadCentroChat();
    }
  }

  private initializeProfileImageFromSession(): void {
    const user = this.authService.getCurrentUser();
    this.profileImageUrl = this.buildProfileImageUrl(user?.fotoProfiloUrl ?? null, user?.ruolo ?? null);
  }

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

  private readonly defaultProfileImagePath = 'images/default/default-image-profile.png';

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
