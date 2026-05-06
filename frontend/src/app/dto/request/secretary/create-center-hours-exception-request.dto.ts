export interface CreateCenterHoursExceptionRequestDto {
  data: string;
  chiuso: boolean;
  oraApertura: string | null;
  oraChiusura: string | null;
  motivo: string | null;
}
