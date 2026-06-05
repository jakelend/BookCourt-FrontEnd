export interface ChangePasswordRequestDto {
  email: string;
  passwordCorrente: string;
  passwordNuova: string;
  ripetutaPasswordNuova: string;
}
