export interface CenterHoursExceptionResponseDto {
  id: number;
  utenteId: number;
  data: string;
  chiuso: boolean;
  oraApertura: string | null;
  oraChiusura: string | null;
  motivo: string | null;
}
