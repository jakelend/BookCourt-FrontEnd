import { Routes } from '@angular/router';
import { LoginComponent } from './components/auth/login/login.component';
import { RegisterComponent } from './components/auth/register/register.component';
import { ForgotPasswordComponent } from './components/auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/auth/reset-password/reset-password.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { PreviewComponent } from './components/preview/preview.component';
import { AuthGuard } from './guard/auth.guard';
import { GuestGuard } from './guard/guest.guard';

export const routes: Routes = [
  {
    path: '',
    component: PreviewComponent,
  },
  {
    path: 'preview',
    component: PreviewComponent,
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
    component: DashboardComponent,
    canActivate: [AuthGuard],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
