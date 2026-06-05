export interface PrenotazioneConfermataResponseDto {
  id: number;
  campoId: number;
  nomeCampo?: string | null;
  campoNome?: string | null;
  nomeCampoSportivo?: string | null;
  clienteId: number;
  istruttoreId: number | null;
  inizio: string;
  fine: string;
  numeroPartecipanti: number | null;
  numeroRacchette: number;
  costoTotale: number;
  stato: string;
  feedbackInserito: boolean;
  recensibile: boolean;
}
