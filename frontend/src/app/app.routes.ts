import { Routes } from '@angular/router';
import { LoginComponent } from './components/auth/login/login.component';
import { RegisterComponent } from './components/auth/register/register.component';
import { ForgotPasswordComponent } from './components/auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/auth/reset-password/reset-password.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { CreateFieldComponent } from './components/fields/create-field/create-field.component';
import { FieldsPageComponent } from './components/fields/fields-page/fields-page.component';
import { ModifyFieldComponent } from './components/fields/modify-field/modify-field.component';
import { CreateInstructorComponent } from './components/instructors/create-instructor/create-instructor.component';
import { InstructorsPageComponent } from './components/instructors/instructors-page/instructors-page.component';
import { ModifyInstructorComponent } from './components/instructors/modify-instructor/modify-instructor.component';
import { CreateSecretaryComponent } from './components/secretaries/create-secretary/create-secretary.component';
import { ModifySecretaryComponent } from './components/secretaries/modify-secretary/modify-secretary.component';
import { SecretariesPageComponent } from './components/secretaries/secretaries-page/secretaries-page.component';
import { SidebarHeaderComponent } from './components/sidebar-header/sidebar-header.component';
import { IntroComponent } from './components/intro/intro.component';
import { AuthGuard } from './guard/auth.guard';
import { GuestGuard } from './guard/guest.guard';

export const routes: Routes = [
  {
    path: '',
    component: IntroComponent,
  },
  {
    path: 'intro',
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
  {
    path: 'dashboard',
    component: SidebarHeaderComponent,
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        component: DashboardComponent,
      },
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
    ],
  },
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
    path: '**',
    redirectTo: '',
  },
];
