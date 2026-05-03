export interface SecretaryInstructorResponseDto {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  telefono: string | null;
  fotoProfiloUrl: string | null;
  costoOrarioTennis: number | null;
  costoOrarioPadel: number | null;
}
