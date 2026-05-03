export type BookingSport = 'CALCETTO' | 'TENNIS' | 'PADEL';

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
