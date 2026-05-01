export type ManagerFieldSport = 'CALCETTO' | 'TENNIS' | 'PADEL';

export interface ManagerFieldResponseDto {
  id: number;
  nome: string;
  sport: ManagerFieldSport;
  costoOrario: number;
  attivo: boolean;
  urlImmaginePrincipale: string | null;
}
