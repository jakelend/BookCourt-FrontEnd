export interface CreateMaintenanceRequestDto {
  campoId: number;
  inizio: string;
  fine: string;
  motivo: string | null;
}
