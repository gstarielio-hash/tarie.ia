import {
  alterarSenhaContaMobile,
  atualizarPerfilContaMobile,
  carregarConfiguracoesCriticasContaMobile,
  enviarRelatoSuporteMobile,
  resolverUrlArquivoApi,
  salvarConfiguracoesCriticasContaMobile,
  uploadFotoPerfilContaMobile,
} from "../../config/api";
import type {
  MobileSupportReportResponse,
  MobileUser,
} from "../../types/mobile";
import {
  type CriticalSettingsSnapshot,
  payloadRemotoParaSnapshotCritico,
  snapshotCriticoParaPayloadRemoto,
} from "./criticalSettings";

export interface PerfilContaSincronizado {
  nomeCompleto: string;
  nomeExibicao: string;
  email: string;
  telefone: string;
  fotoPerfilUri: string;
}

export interface AtualizarPerfilContaPayload {
  nomeCompleto: string;
  email: string;
  telefone?: string;
}

export interface AtualizarSenhaContaPayload {
  senhaAtual: string;
  novaSenha: string;
  confirmarSenha: string;
}

export interface UploadFotoPerfilPayload {
  uri: string;
  nome: string;
  mimeType?: string;
}

export interface RelatoSuportePayload {
  tipo: "bug" | "feedback";
  titulo?: string;
  mensagem: string;
  emailRetorno?: string;
  contexto?: string;
  anexoNome?: string;
}

function obterNomeExibicaoPadrao(nomeCompleto: string): string {
  const nome = String(nomeCompleto || "").trim();
  if (!nome) {
    return "";
  }
  const partes = nome.split(/\s+/).filter(Boolean);
  if (!partes.length) {
    return "";
  }
  return partes[0];
}

export function mapearUsuarioParaPerfilConta(
  usuario: MobileUser,
): PerfilContaSincronizado {
  const nomeCompleto = String(usuario.nome_completo || "").trim();
  const email = String(usuario.email || "").trim();
  const telefone = String(usuario.telefone || "").trim();
  return {
    nomeCompleto,
    nomeExibicao: obterNomeExibicaoPadrao(nomeCompleto),
    email,
    telefone,
    fotoPerfilUri: resolverUrlArquivoApi(usuario.foto_perfil_url),
  };
}

export async function atualizarPerfilContaNoBackend(
  accessToken: string,
  payload: AtualizarPerfilContaPayload,
): Promise<PerfilContaSincronizado> {
  const response = await atualizarPerfilContaMobile(accessToken, payload);
  return mapearUsuarioParaPerfilConta(response.usuario);
}

export async function atualizarSenhaContaNoBackend(
  accessToken: string,
  payload: AtualizarSenhaContaPayload,
): Promise<string> {
  const response = await alterarSenhaContaMobile(accessToken, payload);
  return response.message;
}

export async function enviarFotoPerfilNoBackend(
  accessToken: string,
  payload: UploadFotoPerfilPayload,
): Promise<PerfilContaSincronizado> {
  const response = await uploadFotoPerfilContaMobile(accessToken, payload);
  return mapearUsuarioParaPerfilConta(response.usuario);
}

export async function enviarRelatoSuporteNoBackend(
  accessToken: string,
  payload: RelatoSuportePayload,
): Promise<MobileSupportReportResponse> {
  return enviarRelatoSuporteMobile(accessToken, payload);
}

export async function carregarConfiguracoesCriticasNoBackend(
  accessToken: string,
): Promise<CriticalSettingsSnapshot> {
  const response = await carregarConfiguracoesCriticasContaMobile(accessToken);
  return payloadRemotoParaSnapshotCritico(response);
}

export async function salvarConfiguracoesCriticasNoBackend(
  accessToken: string,
  snapshot: CriticalSettingsSnapshot,
): Promise<CriticalSettingsSnapshot> {
  const payload = snapshotCriticoParaPayloadRemoto(snapshot);
  const response = await salvarConfiguracoesCriticasContaMobile(
    accessToken,
    payload,
  );
  return payloadRemotoParaSnapshotCritico(response);
}
