import { Platform } from "react-native";

import type {
  MobileBootstrapResponse,
  MobileChatMode,
  MobileChatMessage,
  MobileChatSendResult,
  MobileDocumentUploadResponse,
  MobileLaudoListResponse,
  MobileLaudoMensagensResponse,
  MobileLaudoStatusResponse,
  MobileLoginResponse,
  MobileMesaMensagensResponse,
  MobileMesaSendResponse,
} from "../types/mobile";
import { registrarEventoObservabilidade } from "./observability";

const DEFAULT_API_BASE_URL = "https://tarie-ia.onrender.com";

function androidPareceEmulador(): boolean {
  if (Platform.OS !== "android") {
    return false;
  }

  const constants = (Platform.constants || {}) as Record<string, unknown>;
  const fingerprint = String(constants.Fingerprint || "");
  const model = String(constants.Model || "");
  const brand = String(constants.Brand || "");
  const manufacturer = String(constants.Manufacturer || "");
  const product = String(constants.Product || "");
  const hardware = String(constants.Hardware || "");
  const device = String(constants.Device || "");
  const joined = [
    fingerprint,
    model,
    brand,
    manufacturer,
    product,
    hardware,
    device,
  ].join(" ");

  return /generic|sdk|emulator|simulator|goldfish|ranchu/i.test(joined);
}

function normalizarApiBaseUrl(rawValue: string): string {
  const value = String(rawValue || DEFAULT_API_BASE_URL)
    .trim()
    .replace(/\/+$/, "");

  if (Platform.OS !== "android" || !androidPareceEmulador()) {
    return value;
  }

  // In Android emulators, localhost/127.0.0.1 points to the emulator itself.
  return value.replace(/:\/\/(127\.0\.0\.1|localhost)(?=[:/]|$)/i, "://10.0.2.2");
}

export const API_BASE_URL = normalizarApiBaseUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL,
);

function basePublicaAuth(): string {
  const rawBase =
    process.env.EXPO_PUBLIC_AUTH_WEB_BASE_URL ||
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    DEFAULT_API_BASE_URL;
  return normalizarApiBaseUrl(String(rawBase || "").trim().replace(/\/+$/, ""));
}

function montarUrlAuth(rawValue: string | undefined, fallbackPath: string): string {
  const configured = String(rawValue || "").trim();
  if (configured) {
    return configured;
  }
  return `${basePublicaAuth()}${fallbackPath}`;
}

export function obterUrlRecuperacaoSenhaMobile(email?: string): string {
  const base = montarUrlAuth(process.env.EXPO_PUBLIC_AUTH_FORGOT_PASSWORD_URL, "/app/login");
  const emailLimpo = String(email || "").trim();
  if (!emailLimpo) {
    return base;
  }
  const separador = base.includes("?") ? "&" : "?";
  return `${base}${separador}email=${encodeURIComponent(emailLimpo)}`;
}

export function obterUrlLoginSocialMobile(provider: "Google" | "Microsoft"): string {
  if (provider === "Google") {
    return montarUrlAuth(process.env.EXPO_PUBLIC_AUTH_GOOGLE_URL, "/app/login?provider=google");
  }
  return montarUrlAuth(process.env.EXPO_PUBLIC_AUTH_MICROSOFT_URL, "/app/login?provider=microsoft");
}

function inferirMimeType(nomeArquivo: string): string {
  const nome = String(nomeArquivo || "").trim().toLowerCase();
  if (nome.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (nome.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (nome.endsWith(".doc")) {
    return "application/msword";
  }
  return "application/octet-stream";
}

function construirHeaders(accessToken?: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra || {});
  headers.set("Accept", "application/json");
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return headers;
}

function extrairMensagemErro(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const detalhe = Reflect.get(payload, "detail");
    if (typeof detalhe === "string" && detalhe.trim()) {
      return detalhe.trim();
    }
  }
  return fallback;
}

async function lerJsonSeguro<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  const raw = await response.text();
  if (!raw.trim()) {
    return null;
  }
  return JSON.parse(raw) as T;
}

function extrairEventosSse(raw: string): Record<string, unknown>[] {
  return raw
    .split(/\r?\n\r?\n/g)
    .flatMap((bloco) =>
      bloco
        .split(/\r?\n/g)
        .map((linha) => linha.trim())
        .filter((linha) => linha.startsWith("data:"))
        .map((linha) => linha.slice(5).trim()),
    )
    .filter((linha) => linha && linha !== "[FIM]")
    .flatMap((linha) => {
      try {
        const payload = JSON.parse(linha);
        return payload && typeof payload === "object" ? [payload as Record<string, unknown>] : [];
      } catch {
        return [];
      }
    });
}

function normalizarModoChat(modo: unknown): MobileChatMode {
  const value = String(modo || "").trim().toLowerCase();
  if (value === "curto") {
    return "curto";
  }
  if (value === "deep_research" || value === "deepresearch") {
    return "deep_research";
  }
  return "detalhado";
}

function extrairCitacoes(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function extrairConfiancaIa(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function normalizarPathObservabilidade(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return String(url || "").replace(/^https?:\/\/[^/]+/i, "");
  }
}

async function fetchComObservabilidade(
  metricName: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const startedAt = Date.now();
  const method = String(init?.method || "GET").toUpperCase();
  const path = normalizarPathObservabilidade(url);

  try {
    const response = await fetch(url, init);
    void registrarEventoObservabilidade({
      kind: "api",
      name: metricName,
      ok: response.ok,
      method,
      path,
      httpStatus: response.status,
      durationMs: Date.now() - startedAt,
      detail: response.ok ? "ok" : `http_${response.status}`,
    });
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "fetch_error";
    void registrarEventoObservabilidade({
      kind: "api",
      name: metricName,
      ok: false,
      method,
      path,
      durationMs: Date.now() - startedAt,
      detail,
    });
    throw error;
  }
}

export async function pingApi(): Promise<boolean> {
  try {
    const response = await fetchComObservabilidade(
      "health_check",
      `${API_BASE_URL}/health`,
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function loginInspectorMobile(
  email: string,
  senha: string,
  lembrar: boolean,
): Promise<MobileLoginResponse> {
  const response = await fetchComObservabilidade("mobile_auth_login", `${API_BASE_URL}/app/api/mobile/auth/login`, {
    method: "POST",
    headers: construirHeaders(undefined, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ email, senha, lembrar }),
  });

  const payload = await lerJsonSeguro<MobileLoginResponse | { detail?: string }>(response);
  if (!response.ok || !payload || !("access_token" in payload)) {
    throw new Error(extrairMensagemErro(payload, "Não foi possível autenticar no app mobile."));
  }

  return payload;
}

export async function carregarBootstrapMobile(accessToken: string): Promise<MobileBootstrapResponse> {
  const response = await fetchComObservabilidade("mobile_bootstrap", `${API_BASE_URL}/app/api/mobile/bootstrap`, {
    method: "GET",
    headers: construirHeaders(accessToken),
  });

  const payload = await lerJsonSeguro<MobileBootstrapResponse | { detail?: string }>(response);
  if (!response.ok || !payload || !("app" in payload)) {
    throw new Error(extrairMensagemErro(payload, "Não foi possível carregar o bootstrap do app."));
  }

  return payload;
}

export async function carregarLaudosMobile(accessToken: string): Promise<MobileLaudoListResponse> {
  const response = await fetchComObservabilidade("mobile_laudos_list", `${API_BASE_URL}/app/api/mobile/laudos`, {
    method: "GET",
    headers: construirHeaders(accessToken),
  });

  const payload = await lerJsonSeguro<MobileLaudoListResponse | { detail?: string }>(response);
  if (!response.ok || !payload || !("itens" in payload)) {
    throw new Error(extrairMensagemErro(payload, "Não foi possível carregar os laudos do inspetor."));
  }

  return payload;
}

export async function carregarStatusLaudo(accessToken: string): Promise<MobileLaudoStatusResponse> {
  const response = await fetchComObservabilidade("laudo_status", `${API_BASE_URL}/app/api/laudo/status`, {
    method: "GET",
    headers: construirHeaders(accessToken),
  });

  const payload = await lerJsonSeguro<MobileLaudoStatusResponse | { detail?: string }>(response);
  if (!response.ok || !payload || !("estado" in payload)) {
    throw new Error(extrairMensagemErro(payload, "Não foi possível carregar o status do laudo."));
  }

  return payload;
}

export async function carregarMensagensLaudo(
  accessToken: string,
  laudoId: number,
): Promise<MobileLaudoMensagensResponse> {
  const response = await fetchComObservabilidade(
    "laudo_mensagens_list",
    `${API_BASE_URL}/app/api/laudo/${laudoId}/mensagens`,
    {
    method: "GET",
    headers: construirHeaders(accessToken),
    },
  );

  const payload = await lerJsonSeguro<MobileLaudoMensagensResponse | { detail?: string }>(response);
  if (!response.ok || !payload || !("itens" in payload)) {
    throw new Error(extrairMensagemErro(payload, "Não foi possível carregar o histórico do laudo."));
  }

  return payload;
}

export async function enviarMensagemChatMobile(
  accessToken: string,
  payload: {
    mensagem: string;
    dadosImagem?: string;
    setor?: string;
    textoDocumento?: string;
    nomeDocumento?: string;
    laudoId?: number | null;
    modo?: MobileChatMode | string;
    historico?: Array<{ papel: "usuario" | "assistente"; texto: string }> | MobileChatMessage[];
  },
): Promise<MobileChatSendResult> {
  const modo = normalizarModoChat(payload.modo);
  const response = await fetchComObservabilidade("chat_send", `${API_BASE_URL}/app/api/chat`, {
    method: "POST",
    headers: construirHeaders(accessToken, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      mensagem: payload.mensagem,
      dados_imagem: payload.dadosImagem || "",
      setor: (payload.setor || "geral").trim() || "geral",
      texto_documento: payload.textoDocumento || "",
      nome_documento: payload.nomeDocumento || "",
      laudo_id: payload.laudoId ?? undefined,
      modo,
      historico: (payload.historico || []).map((item) => ({
        papel: item.papel,
        texto: item.texto,
      })),
    }),
  });

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const erroJson = await lerJsonSeguro<{ detail?: string }>(response);
    throw new Error(extrairMensagemErro(erroJson, "Não foi possível enviar a mensagem do chat."));
  }

  if (contentType.includes("application/json")) {
    const jsonPayload = (await lerJsonSeguro<Record<string, unknown>>(response)) || {};
    return {
      laudoId: typeof jsonPayload.laudo_id === "number" ? jsonPayload.laudo_id : payload.laudoId ?? null,
      laudoCard:
        jsonPayload.laudo_card && typeof jsonPayload.laudo_card === "object"
          ? (jsonPayload.laudo_card as MobileChatSendResult["laudoCard"])
          : null,
      assistantText: typeof jsonPayload.texto === "string" ? jsonPayload.texto : "",
      modo: normalizarModoChat(jsonPayload.modo ?? modo),
      citacoes: extrairCitacoes(jsonPayload.citacoes),
      confiancaIa: extrairConfiancaIa(jsonPayload.confianca_ia),
      events: [jsonPayload],
    };
  }

  const raw = await response.text();
  const events = extrairEventosSse(raw);

  let laudoId = payload.laudoId ?? null;
  let laudoCard: MobileChatSendResult["laudoCard"] = null;
  let assistantText = "";
  let citacoes: Array<Record<string, unknown>> = [];
  let confiancaIa: Record<string, unknown> | null = null;

  for (const event of events) {
    if (typeof event.laudo_id === "number") {
      laudoId = event.laudo_id;
    }
    if (event.laudo_card && typeof event.laudo_card === "object") {
      laudoCard = event.laudo_card as MobileChatSendResult["laudoCard"];
    }
    if (typeof event.texto === "string") {
      assistantText += event.texto;
    }
    if (event.citacoes !== undefined) {
      citacoes = extrairCitacoes(event.citacoes);
    }
    if (event.confianca_ia !== undefined) {
      confiancaIa = extrairConfiancaIa(event.confianca_ia);
    }
  }

  return {
    laudoId,
    laudoCard,
    assistantText: assistantText.trim(),
    modo,
    citacoes,
    confiancaIa,
    events,
  };
}

export async function uploadDocumentoChatMobile(
  accessToken: string,
  payload: {
    uri: string;
    nome: string;
    mimeType?: string;
  },
): Promise<MobileDocumentUploadResponse> {
  const formData = new FormData();
  formData.append("arquivo", {
    uri: payload.uri,
    name: payload.nome,
    type: payload.mimeType || inferirMimeType(payload.nome),
  } as unknown as Blob);

  const response = await fetchComObservabilidade("chat_upload_doc", `${API_BASE_URL}/app/api/upload_doc`, {
    method: "POST",
    headers: construirHeaders(accessToken),
    body: formData,
  });

  const corpo = await lerJsonSeguro<MobileDocumentUploadResponse | { detail?: string }>(response);
  if (!response.ok || !corpo || !("texto" in corpo)) {
    throw new Error(extrairMensagemErro(corpo, "Não foi possível preparar o documento para o chat."));
  }

  return corpo;
}

export async function carregarMensagensMesaMobile(
  accessToken: string,
  laudoId: number,
): Promise<MobileMesaMensagensResponse> {
  const response = await fetchComObservabilidade(
    "mesa_mensagens_list",
    `${API_BASE_URL}/app/api/laudo/${laudoId}/mesa/mensagens`,
    {
    method: "GET",
    headers: construirHeaders(accessToken),
    },
  );

  const payload = await lerJsonSeguro<MobileMesaMensagensResponse | { detail?: string }>(response);
  if (!response.ok || !payload || !("itens" in payload)) {
    throw new Error(extrairMensagemErro(payload, "Não foi possível carregar a conversa da mesa."));
  }

  return payload;
}

export async function enviarMensagemMesaMobile(
  accessToken: string,
  laudoId: number,
  texto: string,
  referenciaMensagemId?: number | null,
): Promise<MobileMesaSendResponse> {
  const response = await fetchComObservabilidade(
    "mesa_send_text",
    `${API_BASE_URL}/app/api/laudo/${laudoId}/mesa/mensagem`,
    {
    method: "POST",
    headers: construirHeaders(accessToken, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      texto,
      referencia_mensagem_id: referenciaMensagemId ?? null,
    }),
    },
  );

  const payload = await lerJsonSeguro<MobileMesaSendResponse | { detail?: string }>(response);
  if (!response.ok || !payload || !("mensagem" in payload)) {
    throw new Error(extrairMensagemErro(payload, "Não foi possível responder à mesa pelo app."));
  }

  return payload;
}

export async function enviarAnexoMesaMobile(
  accessToken: string,
  laudoId: number,
  payload: {
    uri: string;
    nome: string;
    mimeType?: string;
    texto?: string;
    referenciaMensagemId?: number | null;
  },
): Promise<MobileMesaSendResponse> {
  const formData = new FormData();
  formData.append("arquivo", {
    uri: payload.uri,
    name: payload.nome,
    type: payload.mimeType || inferirMimeType(payload.nome),
  } as unknown as Blob);
  formData.append("texto", payload.texto || "");
  if (payload.referenciaMensagemId) {
    formData.append("referencia_mensagem_id", String(payload.referenciaMensagemId));
  }

  const response = await fetchComObservabilidade(
    "mesa_send_attachment",
    `${API_BASE_URL}/app/api/laudo/${laudoId}/mesa/anexo`,
    {
    method: "POST",
    headers: construirHeaders(accessToken),
    body: formData,
    },
  );

  const corpo = await lerJsonSeguro<MobileMesaSendResponse | { detail?: string }>(response);
  if (!response.ok || !corpo || !("mensagem" in corpo)) {
    throw new Error(extrairMensagemErro(corpo, "Não foi possível enviar o anexo para a mesa."));
  }

  return corpo;
}

export async function reabrirLaudoMobile(accessToken: string, laudoId: number): Promise<MobileLaudoStatusResponse> {
  const response = await fetchComObservabilidade("laudo_reabrir", `${API_BASE_URL}/app/api/laudo/${laudoId}/reabrir`, {
    method: "POST",
    headers: construirHeaders(accessToken),
  });

  const payload = await lerJsonSeguro<MobileLaudoStatusResponse | { detail?: string }>(response);
  if (!response.ok || !payload || !("estado" in payload)) {
    throw new Error(extrairMensagemErro(payload, "Não foi possível reabrir o laudo."));
  }

  return payload;
}

export async function logoutInspectorMobile(accessToken: string): Promise<void> {
  const response = await fetchComObservabilidade("mobile_auth_logout", `${API_BASE_URL}/app/api/mobile/auth/logout`, {
    method: "POST",
    headers: construirHeaders(accessToken),
  });

  if (!response.ok) {
    const payload = await lerJsonSeguro<{ detail?: string }>(response);
    throw new Error(extrairMensagemErro(payload, "Não foi possível encerrar a sessão mobile."));
  }
}
