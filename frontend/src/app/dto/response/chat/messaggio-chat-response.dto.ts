export interface MessaggioChatResponseDto {
  id: number;
  conversazioneId: number;
  mittenteId: number;
  mittenteRuolo: string;
  mittenteNome: string;
  mittenteCognome: string;
  mittenteNomeCompleto: string;
  autoreDisplay: string;
  inviatoDalCentro: boolean;
  contenuto: string;
  inviatoIl: string;
}
