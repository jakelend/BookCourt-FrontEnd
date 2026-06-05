export interface FeedbackPrenotazioneResponseDto {
  id: number;
  prenotazioneId: number;
  clienteId: number;
  campoId?: number | null;
  nomeCampo?: string | null;
  inizio?: string | null;
  fine?: string | null;
  istruttoreId?: number | null;
  nomeIstruttore?: string | null;
  cognomeIstruttore?: string | null;
  valutazione: number;
  commento: string | null;
  creatoIl: string;
}
