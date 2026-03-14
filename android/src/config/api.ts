import type {
  MobileBootstrapResponse,
  MobileChatMessage,
  MobileChatSendResult,
  MobileLaudoMensagensResponse,
  MobileLaudoStatusResponse,
  MobileLoginResponse,
} from "../types/mobile";

const DEFAULT_API_BASE_URL = "https://tarie-ia.onrender.com";

export const API_BASE_URL = String(
  process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL,
)
  .trim()
  .replace(/\/+$/, "");

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
  return (await response.json()) as T;
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

export async function pingApi(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
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
  const response = await fetch(`${API_BASE_URL}/app/api/mobile/auth/login`, {
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
  const response = await fetch(`${API_BASE_URL}/app/api/mobile/bootstrap`, {
    method: "GET",
    headers: construirHeaders(accessToken),
  });

  const payload = await lerJsonSeguro<MobileBootstrapResponse | { detail?: string }>(response);
  if (!response.ok || !payload || !("app" in payload)) {
    throw new Error(extrairMensagemErro(payload, "Não foi possível carregar o bootstrap do app."));
  }

  return payload;
}

export async function carregarStatusLaudo(accessToken: string): Promise<MobileLaudoStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/app/api/laudo/status`, {
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
  const response = await fetch(`${API_BASE_URL}/app/api/laudo/${laudoId}/mensagens`, {
    method: "GET",
    headers: construirHeaders(accessToken),
  });

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
    laudoId?: number | null;
    historico?: Array<{ papel: "usuario" | "assistente"; texto: string }> | MobileChatMessage[];
  },
): Promise<MobileChatSendResult> {
  const response = await fetch(`${API_BASE_URL}/app/api/chat`, {
    method: "POST",
    headers: construirHeaders(accessToken, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      mensagem: payload.mensagem,
      laudo_id: payload.laudoId ?? undefined,
      modo: "detalhado",
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
    const jsonPayload = (await response.json()) as Record<string, unknown>;
    return {
      laudoId: typeof jsonPayload.laudo_id === "number" ? jsonPayload.laudo_id : payload.laudoId ?? null,
      laudoCard:
        jsonPayload.laudo_card && typeof jsonPayload.laudo_card === "object"
          ? (jsonPayload.laudo_card as MobileChatSendResult["laudoCard"])
          : null,
      assistantText: typeof jsonPayload.texto === "string" ? jsonPayload.texto : "",
      events: [jsonPayload],
    };
  }

  const raw = await response.text();
  const events = extrairEventosSse(raw);

  let laudoId = payload.laudoId ?? null;
  let laudoCard: MobileChatSendResult["laudoCard"] = null;
  let assistantText = "";

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
  }

  return {
    laudoId,
    laudoCard,
    assistantText: assistantText.trim(),
    events,
  };
}

export async function reabrirLaudoMobile(accessToken: string, laudoId: number): Promise<MobileLaudoStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/app/api/laudo/${laudoId}/reabrir`, {
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
  const response = await fetch(`${API_BASE_URL}/app/api/mobile/auth/logout`, {
    method: "POST",
    headers: construirHeaders(accessToken),
  });

  if (!response.ok) {
    const payload = await lerJsonSeguro<{ detail?: string }>(response);
    throw new Error(extrairMensagemErro(payload, "Não foi possível encerrar a sessão mobile."));
  }
}
