import type { Sport } from '../../../enumeration/sport.enum';

export type MaintenanceSport = Sport;

export interface MaintenanceResponseDto {
  id: number;
  campoId: number;
  nomeCampo: string;
  inizio: string;
  fine: string;
  motivo: string | null;
  creatoDaId: number;
  creatoIl: string | null;
}

export interface MaintenanceFieldOptionDto {
  idCampo: number;
  nome: string;
  costoOrario: number;
  idImmagine: number | null;
  urlImmagine: string | null;
}

export interface MaintenanceFieldsBySportResponseDto {
  campi: MaintenanceFieldOptionDto[];
}
