export interface BookingAvailableInstructorResponseDto {
  istruttoreId: number;
  nome: string;
  cognome: string;
  costoOrario: number | null;
  fotoProfiloUrl?: string | null;
}
