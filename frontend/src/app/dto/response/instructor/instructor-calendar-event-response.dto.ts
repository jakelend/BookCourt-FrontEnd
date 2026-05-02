export type InstructorCalendarEventType = 'LEZIONE' | 'ECCEZIONE_ISTRUTTORE' | 'ECCEZIONE_CENTRO' | string;

export interface InstructorCalendarEventResponseDto {
  tipo: InstructorCalendarEventType;
  titolo: string;
  motivo: string | null;

  inizio: string;
  fine: string;

  prenotazioneId: number | null;
  campoId: number | null;
  nomeCampo: string | null;

  clienteId: number | null;
  nomeCliente: string | null;
  cognomeCliente: string | null;

  eccezioneIstruttoreId: number | null;
  eccezioneCentroId: number | null;
}
