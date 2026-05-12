import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard utilizzata per proteggere le rotte accessibili solo agli utenti autenticati.
 *
 * Questa guard viene applicata alle pagine interne dell'applicazione, cioè alle pagine
 * che non devono essere raggiungibili da utenti non loggati. Il controllo reale di
 * sicurezza resta comunque lato backend: qui viene gestita la navigazione lato frontend.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  /**
   * Costruisce la guard iniettando il servizio di autenticazione e il router Angular.
   *
   * @param authService servizio che espone lo stato di autenticazione dell'utente
   * @param router servizio usato per creare eventuali redirect verso la pagina di login
   */
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  /**
   * Decide se una rotta protetta può essere attivata.
   *
   * Se l'utente risulta autenticato, la navigazione viene consentita. In caso contrario,
   * l'utente viene reindirizzato alla pagina di login e viene salvato nella query string
   * l'URL che stava provando a raggiungere, così da poterlo recuperare dopo il login.
   *
   * @param _route snapshot della rotta richiesta; non viene usato in questa guard
   * @param state stato corrente della navigazione, usato per recuperare l'URL richiesto
   * @returns true se l'accesso è consentito, altrimenti un UrlTree verso /login
   */
  canActivate(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    if (this.authService.isAuthenticated()) {
      return true;
    }

    return this.router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url }
    });
  }
}
