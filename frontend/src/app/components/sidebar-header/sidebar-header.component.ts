import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Role } from '../../enumeration/role.enum';
import { AuthService, ProfileResponseDto } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import { ManagerService } from '../../services/manager.service';

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
export class SidebarHeaderComponent implements OnInit {
  profile: ProfileResponseDto | null = null;
  profileImageUrl = '';
  selectedItemKey = '';

  private readonly backendBaseUrl = 'http://localhost:8080';

  readonly menuByRole: Record<Role, SidebarItem[]> = {
    [Role.SEGRETARIA]: [
      { label: 'Chat', icon: 'chat', key: 'chat', route: '/dashboard/chat' },
      { label: 'Manutenzione', icon: 'engineering', key: 'maintenance' },
      { label: 'Calendario Istruttori', icon: 'calendar_today', key: 'instructor-calendar' },
      { label: 'Orari centro', icon: 'schedule', key: 'center-hours' },
    ],

    [Role.ISTRUTTORE]: [
      { label: 'Calendario Istruttore', icon: 'calendar_month', key: 'instructor-calendar', route: '/dashboard/instructor-calendar' },
    ],

    [Role.CLIENTE]: [
      { label: 'Prenotazioni', icon: 'event_note', key: 'bookings' },
      { label: 'Chat', icon: 'chat', key: 'chat', route: '/dashboard/chat' },
      { label: 'Gestione Credenziali', icon: 'key', key: 'credentials' },
      { label: 'Gestione account', icon: 'manage_accounts', key: 'account-management' },
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
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.initializeProfileImageFromSession();
    this.preloadRoleData();
    this.loadCurrentProfile();
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
    if (item.route && this.router.url.startsWith(item.route)) {
      return true;
    }

    if (this.selectedItemKey) {
      return this.selectedItemKey === item.key;
    }

    return item.key === 'center-management' && this.isStaffManagementActive;
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

  private loadCurrentProfile(): void {
    this.authService.getCurrentProfile().subscribe({
      next: (profile) => {
        this.profile = profile;
        this.profileImageUrl = this.buildProfileImageUrl(profile.fotoProfiloUrl);
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
    this.profileImageUrl = this.buildProfileImageUrl(user?.fotoProfiloUrl ?? null);
  }

  private buildProfileImageUrl(path: string | null): string {
    if (!path || !path.trim()) {
      return `${this.backendBaseUrl}/images/default/default-image-profile.png`;
    }

    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    if (path.startsWith('/')) {
      return `${this.backendBaseUrl}${path}`;
    }

    return `${this.backendBaseUrl}/${path}`;
  }
}
