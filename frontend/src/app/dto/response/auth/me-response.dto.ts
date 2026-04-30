import { Role } from '../../../enumeration/role.enum';

export interface MeResponseDto {
  id: number;
  email: string;
  nome: string;
  cognome: string;
  ruolo: Role;
}
