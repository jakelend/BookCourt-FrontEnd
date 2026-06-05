export interface ResetPasswordRequestDto {
  token: string;
  passwordNuova: string;
  ripetutaPasswordNuova: string;
}
