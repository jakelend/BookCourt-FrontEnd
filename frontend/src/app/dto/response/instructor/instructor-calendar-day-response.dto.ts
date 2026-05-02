import { InstructorCalendarEventResponseDto } from './instructor-calendar-event-response.dto';

export interface InstructorCalendarDayResponseDto {
  istruttoreId: number;
  nomeIstruttore: string;
  cognomeIstruttore: string;
  data: string;

  aperturaCentro: string;
  chiusuraCentro: string;
  centroChiuso: boolean;

  eventi: InstructorCalendarEventResponseDto[];
}
