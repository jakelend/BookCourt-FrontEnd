import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
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

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree | Observable<boolean | UrlTree> {
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

    return this.authService.getCurrentProfile().pipe(
      map((profile) => {
        this.authService.updateCurrentUserFromProfile(profile);
        return allowedRoles.includes(profile.ruolo) ? true : this.router.createUrlTree(['/dashboard']);
      }),
      catchError(() => of(this.router.createUrlTree(['/dashboard']))),
    );
  }
}
