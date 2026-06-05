export interface PrenotazioneDaRecensireResponseDto {
  prenotazioneId: number;
  campoId: number;
  nomeCampo?: string | null;
  inizio: string;
  fine: string;
  istruttoreId?: number | null;
  nomeIstruttore?: string | null;
  cognomeIstruttore?: string | null;
  feedbackGiaInserito: boolean;
  recensibile: boolean;
}
