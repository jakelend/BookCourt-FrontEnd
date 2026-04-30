import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, ProfileResponseDto } from '../../services/auth.service';
import { Role } from '../../enumeration/role.enum';

interface SidebarItem {
  label: string;
  icon: string;
  key: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  profile: ProfileResponseDto | null = null;
  profileImageUrl = '';
  selectedItemKey = '';
  isLoadingProfile = false;
  profileError = '';

  private readonly backendBaseUrl = 'http://localhost:8080';

  readonly menuByRole: Record<Role, SidebarItem[]> = {
    [Role.SEGRETARIA]: [
      {
        label: 'Chat',
        icon: 'chat',
        key: 'chat',
      },
      {
        label: 'Manutenzione',
        icon: 'engineering',
        key: 'maintenance',
      },
      {
        label: 'Calendario Istruttori',
        icon: 'calendar_today',
        key: 'instructor-calendar',
      },
      {
        label: 'Orari centro',
        icon: 'schedule',
        key: 'center-hours',
      },
    ],

    [Role.ISTRUTTORE]: [
      {
        label: 'Calendario Istruttore',
        icon: 'calendar_month',
        key: 'instructor-calendar',
      },
    ],

    [Role.CLIENTE]: [
      {
        label: 'Prenotazioni',
        icon: 'event_note',
        key: 'bookings',
      },
      {
        label: 'Chat',
        icon: 'chat',
        key: 'chat',
      },
      {
        label: 'Gestione Credenziali',
        icon: 'key',
        key: 'credentials',
      },
      {
        label: 'Gestione account',
        icon: 'manage_accounts',
        key: 'account-management',
      },
    ],

    [Role.MANAGER]: [
      {
        label: 'Center Management',
        icon: 'settings',
        key: 'center-management',
      },
      {
        label: 'Chat',
        icon: 'chat',
        key: 'chat',
      },
    ],
  };

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.initializeProfileImageFromSession();

    // Appena entro nella dashboard recupero il profilo completo dal backend.
    // Mi serve perché contiene anche la foto profilo dell'utente.
    this.loadCurrentProfile();
  }

  get sidebarItems(): SidebarItem[] {
    const role = this.currentRole;

    if (!role) {
      return [];
    }

    return this.menuByRole[role] ?? [];
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

      case Role.CLIENTE:
        return '';

      default:
        return '';
    }
  }

  get welcomeTitle(): string {
    // Nel messaggio centrale mostro sempre il nome reale dell'utente loggato.
    // Il ruolo rimane già indicato nella sidebar, quindi qui è più carino usare nome e cognome.
    return `Ciao ${this.fullName}`;
  }

  get welcomeMessage(): string {
    switch (this.currentRole) {
      case Role.ISTRUTTORE:
        return 'Seleziona una funzione dal menu laterale per iniziare a gestire il tuo calendario e le tue attività.';

      case Role.MANAGER:
        return 'Seleziona una funzione dal menu laterale per iniziare a gestire il centro.';

      case Role.CLIENTE:
        return 'Seleziona una funzione dal menu laterale';

      case Role.SEGRETARIA:
        return 'Seleziona una funzione dal menu laterale per iniziare a gestire il centro e le attività.';

      default:
        return 'Seleziona una funzione dal menu laterale.';
    }
  }

  get welcomeIcon(): string {
    switch (this.currentRole) {
      case Role.MANAGER:
        return 'dashboard_customize';

      case Role.CLIENTE:
        return 'touch_app';

      default:
        return 'ads_click';
    }
  }

  get canViewStaffHeaderNav(): boolean {
    return this.currentRole === Role.MANAGER;
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

    const firstInitial = name.charAt(0).toUpperCase();
    const secondInitial = surname.charAt(0).toUpperCase();

    return `${firstInitial}${secondInitial}` || 'U';
  }

  private get currentRole(): Role | null {
    return this.profile?.ruolo ?? this.authService.getCurrentUserRole();
  }

  selectMenuItem(item: SidebarItem): void {
    // Per ora il click aggiorna solo la voce selezionata nella sidebar.
    // Quando implementiamo le funzionalità vere, qui collegheremo le varie sezioni.
    this.selectedItemKey = item.key;
  }

  logout(): void {
    // Con JWT il logout lato frontend consiste nel cancellare il token salvato.
    // Dopo la rimozione torno alla pagina di login.
    this.authService.logout();
    void this.router.navigate(['/login']);
  }

  onProfileImageError(): void {
    // Se l'immagine non viene caricata correttamente, mostro le iniziali dell'utente.
    this.profileImageUrl = '';
  }

  trackByKey(_: number, item: SidebarItem): string {
    return item.key;
  }

  private loadCurrentProfile(): void {
    this.isLoadingProfile = true;
    this.profileError = '';

    this.authService.getCurrentProfile().subscribe({
      next: (profile) => {
        this.profile = profile;
        this.profileImageUrl = this.buildProfileImageUrl(profile.fotoProfiloUrl);
        this.authService.updateCurrentUserProfilePhoto(profile.fotoProfiloUrl);

        if (!this.selectedItemKey && this.sidebarItems.length > 0) {
          this.selectedItemKey = this.sidebarItems[0].key;
        }

        this.isLoadingProfile = false;
      },
      error: () => {
        // Se il profilo completo non arriva, mostro comunque la dashboard usando i dati salvati al login.
        this.profileError = 'Non è stato possibile recuperare il profilo completo.';
        this.isLoadingProfile = false;

        if (!this.selectedItemKey && this.sidebarItems.length > 0) {
          this.selectedItemKey = this.sidebarItems[0].key;
        }
      },
    });
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
