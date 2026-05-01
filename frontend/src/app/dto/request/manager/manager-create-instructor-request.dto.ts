export interface ManagerCreateInstructorRequestDto {
  email: string;
  password: string;
  nome: string;
  cognome: string;
  telefono: string;
  costoOrarioTennis: number | null;
  costoOrarioPadel: number | null;
}

export interface ManagerUpdateInstructorRequestDto {
  email: string;
  nome: string;
  cognome: string;
  telefono: string;
  costoOrarioTennis: number | null;
  costoOrarioPadel: number | null;
}
