import { JwtResponseDto } from '../dto/response/auth/jwt-response.dto';
import { MeResponseDto } from '../dto/response/auth/me-response.dto';
import { Role } from '../enumeration/role.enum';
import { StorageKeys, StorageUtil } from './storage.util';

export type AuthUser = Pick<JwtResponseDto, 'id' | 'email' | 'nome' | 'cognome' | 'ruolo'>;

export class AuthUtil {
  static saveToken(token: string): void {
    StorageUtil.setItem(StorageKeys.token, token);
  }

  static getToken(): string | null {
    return StorageUtil.getItem(StorageKeys.token);
  }

  static saveUser(user: AuthUser | MeResponseDto): void {
    StorageUtil.setItem(StorageKeys.user, JSON.stringify(user));
  }

  static getUser(): AuthUser | null {
    const rawUser = StorageUtil.getItem(StorageKeys.user);

    if (!rawUser) {
      return null;
    }

    try {
      return JSON.parse(rawUser) as AuthUser;
    } catch {
      this.clearSession();
      return null;
    }
  }

  static getUserRole(): Role | null {
    return this.getUser()?.ruolo ?? null;
  }

  static clearSession(): void {
    StorageUtil.removeItem(StorageKeys.token);
    StorageUtil.removeItem(StorageKeys.user);
  }
}
