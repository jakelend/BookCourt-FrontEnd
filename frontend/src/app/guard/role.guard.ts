import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { Role } from '../enumeration/role.enum';
import { AuthService } from '../services/auth.service';

/**
 * Guard utilizzata per controllare che l'utente autenticato abbia uno dei ruoli ammessi.
 *
 * Questa guard viene applicata alle rotte che richiedono un ruolo specifico, come manager,
 * segretaria, istruttore o cliente. I ruoli ammessi vengono letti dal campo `data.roles`
 * configurato nella definizione della rotta Angular.
 *
 * Il controllo lato frontend serve a migliorare la navigazione e l'esperienza utente, ma
 * non sostituisce i controlli di autorizzazione lato backend sugli endpoint REST.
 */
@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {
  /**
   * Costruisce la guard iniettando il servizio di autenticazione e il router Angular.
   *
   * @param authService servizio usato per leggere token, ruolo e profilo dell'utente corrente
   * @param router servizio usato per creare redirect verso login o dashboard
   */
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  /**
   * Decide se una rotta può essere attivata in base allo stato di login e al ruolo utente.
   *
   * Flusso della guard:
   * 1. se l'utente non è autenticato, viene mandato alla login;
   * 2. se la rotta non dichiara ruoli richiesti, l'accesso viene consentito;
   * 3. se il ruolo presente in memoria/localStorage è già valido, l'accesso viene consentito;
   * 4. in caso contrario viene richiesto il profilo aggiornato al backend e viene ricontrollato il ruolo.
   *
   * Il recupero del profilo permette di riallineare il frontend nel caso in cui il ruolo in memoria non
   * sia ancora disponibile o debba essere aggiornato a partire dai dati restituiti dal backend.
   *
   * @param route snapshot della rotta richiesta, da cui vengono letti i ruoli ammessi
   * @param state stato corrente della navigazione, usato per conservare l'URL richiesto in caso di login
   * @returns true se l'accesso è consentito, oppure un UrlTree/Observable di UrlTree per il redirect
   */
  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree | Observable<boolean | UrlTree> {
    if (!this.authService.isAuthenticated()) {
      return this.router.createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url }
      });
    }

    // Ruoli ammessi configurati nella rotta, ad esempio: data: { roles: [Role.MANAGER] }.
    const allowedRoles = route.data['roles'] as Role[] | undefined;

    // Se la rotta non specifica ruoli, basta che l'utente sia autenticato.
    if (!allowedRoles?.length) {
      return true;
    }

    const userRole = this.authService.getCurrentUserRole();

    // Caso più veloce: il ruolo dell'utente è già disponibile e rientra tra quelli ammessi.
    if (userRole && allowedRoles.includes(userRole)) {
      return true;
    }

    // Fallback: recupera il profilo aggiornato dal backend e ricontrolla il ruolo effettivo.
    return this.authService.getCurrentProfile().pipe(
      map((profile) => {
        this.authService.updateCurrentUserFromProfile(profile);
        return allowedRoles.includes(profile.ruolo) ? true : this.router.createUrlTree(['/dashboard']);
      }),
      catchError(() => of(this.router.createUrlTree(['/dashboard']))),
    );
  }
}
