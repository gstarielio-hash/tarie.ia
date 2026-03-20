import type {
  ApiHealthStatus,
  MobileBootstrapResponse,
} from "../../types/mobile";

export interface MobileSessionState {
  accessToken: string;
  bootstrap: MobileBootstrapResponse;
}

export interface InspectorSessionState {
  email: string;
  senha: string;
  lembrar: boolean;
  mostrarSenha: boolean;
  statusApi: ApiHealthStatus;
  erro: string;
  carregando: boolean;
  entrando: boolean;
  session: MobileSessionState | null;
}
