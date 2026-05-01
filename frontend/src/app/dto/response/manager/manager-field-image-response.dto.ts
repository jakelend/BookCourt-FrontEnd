export interface ManagerFieldImageResponseDto {
  id: number;
  urlImmagine: string;
}

export interface ManagerFieldImagesEnvelopeResponseDto {
  idCampo: number;
  immagini: ManagerFieldImageResponseDto[];
}
