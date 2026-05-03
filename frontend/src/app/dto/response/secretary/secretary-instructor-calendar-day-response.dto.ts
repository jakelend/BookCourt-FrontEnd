import { SecretaryInstructorCalendarEventResponseDto } from './secretary-instructor-calendar-event-response.dto';

export interface SecretaryInstructorCalendarDayResponseDto {
  istruttoreId: number;
  nomeIstruttore: string;
  cognomeIstruttore: string;
  data: string;

  aperturaCentro: string;
  chiusuraCentro: string;
  centroChiuso: boolean;

  eventi: SecretaryInstructorCalendarEventResponseDto[];
}
