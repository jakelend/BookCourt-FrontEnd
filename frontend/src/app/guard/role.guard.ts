import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Role } from '../enumeration/role.enum';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    if (!this.authService.isAuthenticated()) {
      return this.router.createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url }
      });
    }

    const allowedRoles = route.data['roles'] as Role[] | undefined;

    if (!allowedRoles?.length) {
      return true;
    }

    const userRole = this.authService.getCurrentUserRole();

    if (userRole && allowedRoles.includes(userRole)) {
      return true;
    }

    return this.router.createUrlTree(['/dashboard']);
  }
}
