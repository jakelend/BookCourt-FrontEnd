import { Role } from '../../../enumeration/role.enum';

export interface ManagerSecretaryResponseDto {
  id: number;
  email: string;
  nome: string;
  cognome: string;
  telefono: string;
  fotoProfiloUrl: string | null;
  ruolo: Role;
  attivo: boolean;
}
