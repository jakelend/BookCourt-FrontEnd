export interface BookingLockResponseDto {
  lockId: number;
  campoId: number;
  istruttoreId: number | null;
  inizio: string;
  fine: string;
  stato: string;
  scadeIl: string;
}
