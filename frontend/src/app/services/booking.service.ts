import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, take, timeout } from 'rxjs';
import {
  BookingFieldResponseDto,
  BookingSport,
  CampiPerSportApiResponseDto,
} from '../dto/response/booking/booking-field-response.dto';

@Injectable({
  providedIn: 'root',
})
export class BookingService {
  private readonly backendBaseUrl = 'http://localhost:8080';
  private readonly campiApiUrl = `${this.backendBaseUrl}/api/campi`;

  constructor(private readonly http: HttpClient) {}

  getCampiDisponibiliPerSport(sport: BookingSport): Observable<BookingFieldResponseDto[]> {
    const encodedSport = encodeURIComponent(sport);

    return this.http
      .get<CampiPerSportApiResponseDto>(
        `${this.campiApiUrl}/get-campi-on-tipo/${encodedSport}`,
      )
      .pipe(
        timeout(10000),
        take(1),
        map((response) =>
          (response.campi ?? []).map((campo) => ({
            id: campo.idCampo,
            nome: campo.nome,
            sport,
            costoOrario: Number(campo.costoOrario),
            attivo: true,
            urlImmaginePrincipale: this.buildImageUrl(campo.urlImmagine),
          })),
        ),
      );
  }

  private buildImageUrl(urlImmagine: string | null): string | null {
    const url = urlImmagine?.trim();

    if (!url || url === 'string' || url === 'null' || url === 'undefined') {
      return null;
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    if (url.startsWith('/images/')) {
      return `${this.backendBaseUrl}${url}`;
    }

    console.warn('URL immagine non valida ricevuta dal backend:', url);
    return null;
  }
}
