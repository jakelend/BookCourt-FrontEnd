export interface ManagerCreateSecretaryRequestDto {
  email: string;
  password: string;
  nome: string;
  cognome: string;
  telefono: string;
}

export interface ManagerUpdateSecretaryRequestDto {
  email: string;
  nome: string;
  cognome: string;
  telefono: string;
}
