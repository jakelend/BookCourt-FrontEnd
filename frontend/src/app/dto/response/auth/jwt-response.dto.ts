import { Role } from '../../../enumeration/role.enum';

export interface JwtResponseDto {
  token: string;
  type: string;
  id: number;
  email: string;
  nome: string;
  cognome: string;
  ruolo: Role;
}
