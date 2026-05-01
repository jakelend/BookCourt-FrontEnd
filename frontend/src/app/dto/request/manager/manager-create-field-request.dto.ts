import { ManagerFieldSport } from '../../response/manager/manager-field-response.dto';

export interface ManagerCreateFieldRequestDto {
  nome: string;
  sport: ManagerFieldSport;
  costoOrario: number;
  attivo?: boolean;
}

export interface ManagerUpdateFieldRequestDto {
  nome: string;
  sport: ManagerFieldSport;
  costoOrario: number;
  attivo: boolean;
}
