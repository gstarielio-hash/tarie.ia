import type {
  MobileChatMode,
  MobileChatMessage,
  MobileChatSendResult,
  MobileDocumentUploadResponse,
  MobileLaudoListResponse,
  MobileLaudoMensagensResponse,
  MobileLaudoStatusResponse,
} from "../types/mobile";
import {
  buildApiUrl,
  construirHeaders,
  extrairMensagemErro,
  fetchComObservabilidade,
  inferirMimeType,
  lerJsonSeguro,
} from "./apiCore";

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
        return payload && typeof payload === "object"
          ? [payload as Record<string, unknown>]
          : [];
      } catch {
        return [];
      }
    });
}

function normalizarModoChat(modo: unknown): MobileChatMode {
  const value = String(modo || "")
    .trim()
    .toLowerCase();
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
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function extrairConfiancaIa(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

export async function carregarLaudosMobile(
  accessToken: string,
): Promise<MobileLaudoListResponse> {
  const response = await fetchComObservabilidade(
    "mobile_laudos_list",
    buildApiUrl("/app/api/mobile/laudos"),
    {
      method: "GET",
      headers: construirHeaders(accessToken),
    },
  );

  const payload = await lerJsonSeguro<
    MobileLaudoListResponse | { detail?: string }
  >(response);
  if (!response.ok || !payload || !("itens" in payload)) {
    throw new Error(
      extrairMensagemErro(
        payload,
        "Não foi possível carregar os laudos do inspetor.",
      ),
    );
  }

  return payload;
}

export async function carregarStatusLaudo(
  accessToken: string,
): Promise<MobileLaudoStatusResponse> {
  const response = await fetchComObservabilidade(
    "laudo_status",
    buildApiUrl("/app/api/laudo/status"),
    {
      method: "GET",
      headers: construirHeaders(accessToken),
    },
  );

  const payload = await lerJsonSeguro<
    MobileLaudoStatusResponse | { detail?: string }
  >(response);
  if (!response.ok || !payload || !("estado" in payload)) {
    throw new Error(
      extrairMensagemErro(
        payload,
        "Não foi possível carregar o status do laudo.",
      ),
    );
  }

  return payload;
}

export async function carregarMensagensLaudo(
  accessToken: string,
  laudoId: number,
): Promise<MobileLaudoMensagensResponse> {
  const response = await fetchComObservabilidade(
    "laudo_mensagens_list",
    buildApiUrl(`/app/api/laudo/${laudoId}/mensagens`),
    {
      method: "GET",
      headers: construirHeaders(accessToken),
    },
  );

  const payload = await lerJsonSeguro<
    MobileLaudoMensagensResponse | { detail?: string }
  >(response);
  if (!response.ok || !payload || !("itens" in payload)) {
    throw new Error(
      extrairMensagemErro(
        payload,
        "Não foi possível carregar o histórico do laudo.",
      ),
    );
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
    historico?:
      | Array<{ papel: "usuario" | "assistente"; texto: string }>
      | MobileChatMessage[];
  },
): Promise<MobileChatSendResult> {
  const modo = normalizarModoChat(payload.modo);
  const response = await fetchComObservabilidade(
    "chat_send",
    buildApiUrl("/app/api/chat"),
    {
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
    },
  );

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const erroJson = await lerJsonSeguro<{ detail?: string }>(response);
    throw new Error(
      extrairMensagemErro(
        erroJson,
        "Não foi possível enviar a mensagem do chat.",
      ),
    );
  }

  if (contentType.includes("application/json")) {
    const jsonPayload =
      (await lerJsonSeguro<Record<string, unknown>>(response)) || {};
    return {
      laudoId:
        typeof jsonPayload.laudo_id === "number"
          ? jsonPayload.laudo_id
          : (payload.laudoId ?? null),
      laudoCard:
        jsonPayload.laudo_card && typeof jsonPayload.laudo_card === "object"
          ? (jsonPayload.laudo_card as MobileChatSendResult["laudoCard"])
          : null,
      assistantText:
        typeof jsonPayload.texto === "string" ? jsonPayload.texto : "",
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

  const response = await fetchComObservabilidade(
    "chat_upload_doc",
    buildApiUrl("/app/api/upload_doc"),
    {
      method: "POST",
      headers: construirHeaders(accessToken),
      body: formData,
    },
  );

  const corpo = await lerJsonSeguro<
    MobileDocumentUploadResponse | { detail?: string }
  >(response);
  if (!response.ok || !corpo || !("texto" in corpo)) {
    throw new Error(
      extrairMensagemErro(
        corpo,
        "Não foi possível preparar o documento para o chat.",
      ),
    );
  }

  return corpo;
}

export async function reabrirLaudoMobile(
  accessToken: string,
  laudoId: number,
): Promise<MobileLaudoStatusResponse> {
  const response = await fetchComObservabilidade(
    "laudo_reabrir",
    buildApiUrl(`/app/api/laudo/${laudoId}/reabrir`),
    {
      method: "POST",
      headers: construirHeaders(accessToken),
    },
  );

  const payload = await lerJsonSeguro<
    MobileLaudoStatusResponse | { detail?: string }
  >(response);
  if (!response.ok || !payload || !("estado" in payload)) {
    throw new Error(
      extrairMensagemErro(payload, "Não foi possível reabrir o laudo."),
    );
  }

  return payload;
}
