export type MaintenanceSport = 'CALCETTO' | 'TENNIS' | 'PADEL';

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
