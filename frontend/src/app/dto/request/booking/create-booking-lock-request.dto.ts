export interface CreateBookingLockRequestDto {
  campoId: number;
  inizio: string;
  durataMinuti: number;
  conIstruttore: boolean;
  istruttoreId?: number | null;
}
