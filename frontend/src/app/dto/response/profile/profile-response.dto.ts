import { Role } from '../../../enumeration/role.enum';

export interface ProfileResponseDto {
  id: number;
  email: string;
  nome: string;
  cognome: string;
  ruolo: Role;
  telefono?: string;
  dataNascita?: string;
}
