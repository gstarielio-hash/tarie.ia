export type ApiHealthStatus = "checking" | "online" | "offline";
export type MobileChatMode = "curto" | "detalhado" | "deep_research";
export type MobileEstadoLaudo =
  | "sem_relatorio"
  | "relatorio_ativo"
  | "aguardando"
  | "ajustes"
  | "aprovado";

export interface MobileUser {
  id: number;
  nome_completo: string;
  email: string;
  telefone: string;
  foto_perfil_url: string;
  empresa_nome: string;
  empresa_id: number;
  nivel_acesso: number;
}

export interface MobileLoginResponse {
  ok: boolean;
  auth_mode: "bearer";
  access_token: string;
  token_type: "bearer";
  usuario: MobileUser;
}

export interface MobileBootstrapResponse {
  ok: boolean;
  app: {
    nome: string;
    portal: string;
    api_base_url: string;
    suporte_whatsapp: string;
  };
  usuario: MobileUser;
}

export interface MobileLaudoListResponse {
  ok: boolean;
  itens: MobileLaudoCard[];
}

export interface MobileLaudoCard {
  id: number;
  titulo: string;
  preview: string;
  pinado: boolean;
  data_iso: string;
  data_br: string;
  hora_br: string;
  tipo_template: string;
  status_revisao: string;
  status_card: string;
  status_card_label: string;
  permite_edicao: boolean;
  permite_reabrir: boolean;
  possui_historico: boolean;
}

export interface MobileAttachment {
  id?: number;
  nome?: string;
  nome_original?: string;
  nome_arquivo?: string;
  label?: string;
  mime_type?: string;
  categoria?: string;
  tamanho_bytes?: number;
  eh_imagem?: boolean;
  url?: string;
}

export interface MobileChatMessage {
  id: number | null;
  papel: "usuario" | "assistente" | "engenheiro";
  texto: string;
  tipo: string;
  modo?: MobileChatMode | string;
  is_whisper?: boolean;
  remetente_id?: number | null;
  referencia_mensagem_id?: number | null;
  anexos?: MobileAttachment[];
  citacoes?: Array<Record<string, unknown>>;
  confianca_ia?: Record<string, unknown>;
}

export interface MobileLaudoStatusResponse {
  estado: MobileEstadoLaudo | string;
  laudo_id: number | null;
  status_card: string;
  permite_edicao: boolean;
  permite_reabrir: boolean;
  laudo_card: MobileLaudoCard | null;
  modo?: MobileChatMode | string;
}

export interface MobileLaudoMensagensResponse extends MobileLaudoStatusResponse {
  itens: MobileChatMessage[];
  cursor_proximo: number | null;
  tem_mais: boolean;
  limite: number;
}

export interface MobileMesaMessage {
  id: number;
  laudo_id: number;
  tipo: string;
  texto: string;
  remetente_id: number | null;
  data: string;
  lida: boolean;
  resolvida_em: string;
  resolvida_em_label: string;
  resolvida_por_nome: string;
  referencia_mensagem_id?: number | null;
  anexos?: MobileAttachment[];
}

export interface MobileMesaMensagensResponse extends MobileLaudoStatusResponse {
  itens: MobileMesaMessage[];
  cursor_proximo: number | null;
  tem_mais: boolean;
}

export interface MobileMesaSendResponse extends MobileLaudoStatusResponse {
  laudo_id: number;
  mensagem: MobileMesaMessage;
}

export interface MobileChatSendResult {
  laudoId: number | null;
  laudoCard: MobileLaudoCard | null;
  assistantText: string;
  modo: MobileChatMode | string;
  citacoes: Array<Record<string, unknown>>;
  confiancaIa: Record<string, unknown> | null;
  events: Record<string, unknown>[];
}

export interface MobileDocumentUploadResponse {
  texto: string;
  chars: number;
  nome: string;
  truncado: boolean;
}
