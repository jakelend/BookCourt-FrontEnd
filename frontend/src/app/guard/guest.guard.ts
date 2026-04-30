import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class GuestGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  canActivate(_route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): boolean | UrlTree {
    if (!this.authService.isAuthenticated()) {
      return true;
    }

    return this.router.createUrlTree([
      this.authService.getRedirectUrlForRole(this.authService.getCurrentUserRole())
    ]);
  }
}
