import type { BookingSport } from './booking-field-response.dto';

export type BookingCalendarEventType =
  | 'PRENOTAZIONE'
  | 'MANUTENZIONE'
  | 'LOCK'
  | 'FESTIVITA'
  | 'ECCEZIONE_ORARIO_CENTRO'
  | 'ECCEZIONE_ORARI_CENTRO'
  | string;

export interface BookingCalendarEventResponseDto {
  tipo: BookingCalendarEventType;
  titolo: string;
  inizio: string;
  fine: string;
  selezionabile: boolean;
  prenotazioneId: number | null;
  lockId: number | null;
  istruttoreId: number | null;
}

export interface BookingFieldCalendarResponseDto {
  apertura: string;
  campoId: number;
  chiuso: boolean;
  chiusura: string;
  data: string;
  eventi: BookingCalendarEventResponseDto[];
  nomeCampo: string;
  sport: BookingSport;
}
