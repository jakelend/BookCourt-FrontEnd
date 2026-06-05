import type { Sport } from '../../../enumeration/sport.enum';

export type BookingSport = Sport;

export interface CampoCardApiResponseDto {
  idCampo: number;
  nome: string;
  costoOrario: number | string;
  idImmagine: number | null;
  urlImmagine: string | null;
}

export interface CampiPerSportApiResponseDto {
  campi: CampoCardApiResponseDto[];
}

export interface BookingFieldResponseDto {
  id: number;
  nome: string;
  sport: BookingSport;
  costoOrario: number;
  attivo: boolean;
  urlImmaginePrincipale: string | null;
}
