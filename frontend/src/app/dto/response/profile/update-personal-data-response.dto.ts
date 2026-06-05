import type { ProfileResponseDto } from './profile-response.dto';

export interface UpdatePersonalDataResponseDto {
  message: string;
  cliente: ProfileResponseDto;
}
