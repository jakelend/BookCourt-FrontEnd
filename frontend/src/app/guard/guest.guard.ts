import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard utilizzata per proteggere le rotte dedicate agli utenti non autenticati.
 *
 * Viene usata, ad esempio, sulle pagine di login e registrazione. Se un utente è già
 * autenticato, non ha senso permettergli di tornare alla login: viene quindi reindirizzato
 * alla pagina principale prevista per il suo ruolo applicativo.
 */
@Injectable({
  providedIn: 'root'
})
export class GuestGuard implements CanActivate {
  /**
   * Costruisce la guard iniettando il servizio di autenticazione e il router Angular.
   *
   * @param authService servizio usato per verificare login e ruolo dell'utente corrente
   * @param router servizio usato per creare il redirect verso la dashboard corretta
   */
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  /**
   * Decide se una rotta per ospiti può essere attivata.
   *
   * Se l'utente non è autenticato, la navigazione viene consentita. Se invece è già
   * autenticato, viene reindirizzato alla pagina corretta in base al ruolo, evitando che
   * possa accedere nuovamente a login, registrazione o pagine simili.
   *
   * @param _route snapshot della rotta richiesta; non viene usato in questa guard
   * @param _state stato corrente della navigazione; non viene usato in questa guard
   * @returns true se l'utente è ospite, altrimenti un UrlTree verso la pagina del suo ruolo
   */
  canActivate(_route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): boolean | UrlTree {
    if (!this.authService.isAuthenticated()) {
      return true;
    }

    return this.router.createUrlTree([
      this.authService.getRedirectUrlForRole(this.authService.getCurrentUserRole())
    ]);
  }
}
