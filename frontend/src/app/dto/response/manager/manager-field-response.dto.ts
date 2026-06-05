import type { Sport } from '../../../enumeration/sport.enum';

export type ManagerFieldSport = Sport;

export interface ManagerFieldResponseDto {
  id: number;
  nome: string;
  sport: ManagerFieldSport;
  costoOrario: number;
  attivo: boolean;
  urlImmaginePrincipale: string | null;
}
