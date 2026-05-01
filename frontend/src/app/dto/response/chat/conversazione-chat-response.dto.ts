export interface ConversazioneChatResponseDto {
  id: number;
  clienteId: number;
  clienteNomeCompleto: string;
  clienteEmail: string;
  interlocutoreDisplay: string;
  ultimoMessaggioPreview: string | null;
  creataIl: string;
  ultimoMessaggioIl: string | null;
  scrivibile: boolean;
}
