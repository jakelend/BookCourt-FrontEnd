export interface ManagerInstructorResponseDto {
  id: number;
  email: string;
  nome: string;
  cognome: string;
  telefono: string;
  fotoProfiloUrl: string | null;
  attivo: boolean;
  costoOrarioTennis: number | null;
  costoOrarioPadel: number | null;
}
