import { Routes } from '@angular/router';
import { LoginComponent } from './components/auth/login/login.component';
import { RegisterComponent } from './components/auth/register/register.component';
import { ForgotPasswordComponent } from './components/auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/auth/reset-password/reset-password.component';
import { ChangePasswordComponent } from './components/change-password/change-password.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { CreateFieldComponent } from './components/fields/create-field/create-field.component';
import { FieldsPageComponent } from './components/fields/fields-page/fields-page.component';
import { ModifyFieldComponent } from './components/fields/modify-field/modify-field.component';
import { CreateInstructorComponent } from './components/instructors/create-instructor/create-instructor.component';
import { InstructorCalendarComponent } from './components/instructors/instructor-calendar/instructor-calendar.component';
import { InstructorsPageComponent } from './components/instructors/instructors-page/instructors-page.component';
import { ModifyInstructorComponent } from './components/instructors/modify-instructor/modify-instructor.component';
import { CreateSecretaryComponent } from './components/secretaries/create-secretary/create-secretary.component';
import { FieldMaintenanceComponent } from './components/secretaries/field-maintenance/field-maintenance.component';
import { InstructorCalendarExceptionsComponent } from './components/secretaries/instructor-calendar-exceptions/instructor-calendar-exceptions.component';
import { CenterHoursExceptionsComponent } from './components/secretaries/center-hours-exceptions/center-hours-exceptions.component';
import { ModifySecretaryComponent } from './components/secretaries/modify-secretary/modify-secretary.component';
import { SecretariesPageComponent } from './components/secretaries/secretaries-page/secretaries-page.component';
import { SidebarHeaderComponent } from './components/sidebar-header/sidebar-header.component';
import { IntroComponent } from './components/intro/intro.component';
import { ChatPageComponent } from './components/chat/chat-page/chat-page.component';
import { AuthGuard } from './guard/auth.guard';
import { GuestGuard } from './guard/guest.guard';
import { RoleGuard } from './guard/role.guard';
import { Role } from './enumeration/role.enum';
import { BookingSportSelectionComponent } from './components/booking/sport-selection/booking-sport-selection.component';
import { BookingFieldSelectionComponent } from './components/booking/field-selection/booking-field-selection.component';
import { BookingDateTimeSelectionComponent } from './components/booking/date-time-selection/booking-date-time-selection.component';
import { BookingExtraSelectionComponent } from './components/booking/extra-selection/booking-extra-selection.component';
import { BookingPreviewComponent } from './components/booking/preview/booking-preview.component';
import { BookingConfirmationComponent } from './components/booking/confirmation/booking-confirmation.component';
import { EditAccountComponent } from './components/profile/edit-account/edit-account.component';
import { PendingFeedbackBookingsComponent } from './components/feedback/pending-feedback-bookings/pending-feedback-bookings.component';
import { CompletedFeedbackBookingsComponent } from './components/feedback/completed-feedback-bookings/completed-feedback-bookings.component';
import { CancelBookingsComponent } from './components/booking/cancel-bookings/cancel-bookings.component';

/**
 * Configurazione delle rotte principali dell'applicazione BookCourt.
 *
 * Le rotte sono organizzate in tre macro-aree:
 * - pagine pubbliche, accessibili prima dell'autenticazione;
 * - area dashboard, protetta da AuthGuard e ulteriormente filtrata da RoleGuard;
 * - redirect di compatibilità, utili per mantenere URL brevi o vecchi collegamenti.
 */
export const routes: Routes = [
  /*
   * Pagine pubbliche iniziali.
   * Non richiedono autenticazione, oppure usano GuestGuard per impedire
   * l'accesso agli utenti già autenticati.
   */
  {
    path: '',
    component: IntroComponent,
  },
  {
    path: 'intro',
    component: IntroComponent,
  },
  {
    path: 'preview',
    component: IntroComponent,
  },
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [GuestGuard],
  },
  {
    path: 'register',
    component: RegisterComponent,
    canActivate: [GuestGuard],
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordComponent,
    canActivate: [GuestGuard],
  },
  {
    path: 'reset-password',
    component: ResetPasswordComponent,
    canActivate: [GuestGuard],
  },
  {
    path: 'reset-password/:token',
    component: ResetPasswordComponent,
    canActivate: [GuestGuard],
  },

  /*
   * Area privata dell'applicazione.
   * SidebarHeaderComponent funge da layout contenitore e mostra i componenti figli
   * tramite il router-outlet interno della dashboard.
   */
  {
    path: 'dashboard',
    component: SidebarHeaderComponent,
    canActivate: [AuthGuard],
    children: [
      /**
       * Home interna della dashboard dopo il login.
       */
      {
        path: '',
        component: DashboardComponent,
      },

      /* Gestione istruttori, accessibile principalmente al manager. */
      {
        path: 'instructors',
        component: InstructorsPageComponent,
      },
      {
        path: 'instructors/create',
        component: CreateInstructorComponent,
      },
      {
        path: 'instructors/modify/:id',
        component: ModifyInstructorComponent,
      },

      /* Gestione segretarie, accessibile principalmente al manager. */
      {
        path: 'secretaries',
        component: SecretariesPageComponent,
      },
      {
        path: 'secretaries/create',
        component: CreateSecretaryComponent,
      },
      {
        path: 'secretaries/modify/:id',
        component: ModifySecretaryComponent,
      },

      /* Gestione campi sportivi e relative modifiche. */
      {
        path: 'fields',
        component: FieldsPageComponent,
      },
      {
        path: 'fields/create',
        component: CreateFieldComponent,
      },
      {
        path: 'fields/modify/:id',
        component: ModifyFieldComponent,
      },

      /* Funzioni comuni dell'utente autenticato. */
      {
        path: 'change-password',
        component: ChangePasswordComponent,
      },

      /* Funzioni operative della segretaria: manutenzioni ed eccezioni. */
      {
        path: 'maintenance',
        component: FieldMaintenanceComponent,
        canActivate: [RoleGuard],
        data: { roles: [Role.SEGRETARIA] },
      },

      /* Calendari: vista istruttore e gestione indisponibilità lato segreteria. */
      {
        path: 'instructor-calendar',
        component: InstructorCalendarComponent,
        canActivate: [RoleGuard],
        data: { roles: [Role.ISTRUTTORE] },
      },
      {
        path: 'secretary-instructor-calendar',
        component: InstructorCalendarExceptionsComponent,
        canActivate: [RoleGuard],
        data: { roles: [Role.SEGRETARIA] },
      },
      {
        path: 'center-hours',
        component: CenterHoursExceptionsComponent,
        canActivate: [RoleGuard],
        data: { roles: [Role.SEGRETARIA] },
      },

      /* Chat condivisa tra cliente, segreteria e manager. */
      {
        path: 'chat',
        component: ChatPageComponent,
        canActivate: [RoleGuard],
        data: { roles: [Role.CLIENTE, Role.SEGRETARIA, Role.MANAGER] },
      },

      /* Flusso cliente per la prenotazione: sport, campo, orario, extra, riepilogo e conferma. */
      {
        path: 'prenotazioni',
        component: BookingSportSelectionComponent,
        canActivate: [RoleGuard],
        data: { roles: [Role.CLIENTE] },
      },
      {
        path: 'prenotazioni/campi',
        component: BookingFieldSelectionComponent,
        canActivate: [RoleGuard],
        data: { roles: [Role.CLIENTE] },
      },
      {
        path: 'prenotazioni/orario',
        component: BookingDateTimeSelectionComponent,
        canActivate: [RoleGuard],
        data: { roles: [Role.CLIENTE] },
      },
      {
        path: 'prenotazioni/extra',
        component: BookingExtraSelectionComponent,
        canActivate: [RoleGuard],
        data: { roles: [Role.CLIENTE] },
      },
      {
        path: 'prenotazioni/riepilogo',
        component: BookingPreviewComponent,
        canActivate: [RoleGuard],
        data: { roles: [Role.CLIENTE] },
      },
      {
        path: 'prenotazioni/conferma',
        component: BookingConfirmationComponent,
        canActivate: [RoleGuard],
        data: { roles: [Role.CLIENTE] },
      },
      {
        path: 'prenotazioni/annulla',
        component: CancelBookingsComponent,
        canActivate: [RoleGuard],
        data: { roles: [Role.CLIENTE] },
      },

      /* Feedback sulle prenotazioni concluse. */
      {
        path: 'feedback/da-recensire',
        component: PendingFeedbackBookingsComponent,
        canActivate: [RoleGuard],
        data: { roles: [Role.CLIENTE] },
      },
      {
        path: 'feedback/concluse',
        component: CompletedFeedbackBookingsComponent,
        canActivate: [RoleGuard],
        data: { roles: [Role.CLIENTE] },
      },

      /* Gestione dati account del cliente. */
      {
        path: 'account-management',
        component: EditAccountComponent,
        canActivate: [RoleGuard],
        data: { roles: [Role.CLIENTE] },
      },
    ],
  },

  /*
   * Redirect verso le rotte interne della dashboard.
   * Servono a mantenere coerente la navigazione anche se l'utente usa URL brevi
   * senza il prefisso /dashboard.
   */
  {
    path: 'instructors',
    redirectTo: 'dashboard/instructors',
  },
  {
    path: 'instructors/create',
    redirectTo: 'dashboard/instructors/create',
  },
  {
    path: 'instructors/modify/:id',
    redirectTo: 'dashboard/instructors/modify/:id',
  },
  {
    path: 'secretaries',
    redirectTo: 'dashboard/secretaries',
  },
  {
    path: 'secretaries/create',
    redirectTo: 'dashboard/secretaries/create',
  },
  {
    path: 'secretaries/modify/:id',
    redirectTo: 'dashboard/secretaries/modify/:id',
  },
  {
    path: 'fields',
    redirectTo: 'dashboard/fields',
  },
  {
    path: 'fields/create',
    redirectTo: 'dashboard/fields/create',
  },
  {
    path: 'fields/modify/:id',
    redirectTo: 'dashboard/fields/modify/:id',
  },
  {
    path: 'change-password',
    redirectTo: 'dashboard/change-password',
  },
  {
    path: 'chat',
    redirectTo: 'dashboard/chat',
  },
  {
    path: 'maintenance',
    redirectTo: 'dashboard/maintenance',
  },
  {
    path: 'instructor-calendar',
    redirectTo: 'dashboard/instructor-calendar',
  },
  {
    path: 'secretary-instructor-calendar',
    redirectTo: 'dashboard/secretary-instructor-calendar',
  },
  {
    path: 'center-hours',
    redirectTo: 'dashboard/center-hours',
  },
  {
    path: 'prenotazioni',
    redirectTo: 'dashboard/prenotazioni',
  },
  {
    path: 'prenotazioni/campi',
    redirectTo: 'dashboard/prenotazioni/campi',
  },
  {
    path: 'prenotazioni/orario',
    redirectTo: 'dashboard/prenotazioni/orario',
  },
  {
    path: 'prenotazioni/extra',
    redirectTo: 'dashboard/prenotazioni/extra',
  },
  {
    path: 'prenotazioni/riepilogo',
    redirectTo: 'dashboard/prenotazioni/riepilogo',
  },
  {
    path: 'prenotazioni/conferma',
    redirectTo: 'dashboard/prenotazioni/conferma',
  },
  {
    path: 'prenotazioni/annulla',
    redirectTo: 'dashboard/prenotazioni/annulla',
  },
  {
    path: 'feedback/da-recensire',
    redirectTo: 'dashboard/feedback/da-recensire',
  },
  {
    path: 'feedback/concluse',
    redirectTo: 'dashboard/feedback/concluse',
  },
  {
    path: 'account-management',
    redirectTo: 'dashboard/account-management',
  },

  /**
   * Rotta di fallback: qualunque URL non riconosciuto riporta alla pagina iniziale.
   */
  {
    path: '**',
    redirectTo: '',
  },
];
