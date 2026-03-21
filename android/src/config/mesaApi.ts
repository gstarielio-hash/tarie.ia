import type {
  MobileMesaFeedResponse,
  MobileMesaMensagensResponse,
  MobileMesaResumoResponse,
  MobileMesaSendResponse,
} from "../types/mobile";
import {
  buildApiUrl,
  construirHeaders,
  extrairMensagemErro,
  fetchComObservabilidade,
  inferirMimeType,
  lerJsonSeguro,
} from "./apiCore";

function montarUrlMesa(
  path: string,
  query?: Record<string, string | number | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(query || {})) {
    if (valor === null || valor === undefined || valueIsEmpty(valor)) {
      continue;
    }
    params.set(chave, String(valor));
  }
  const queryString = params.toString();
  const url = buildApiUrl(path);
  return queryString ? `${url}?${queryString}` : url;
}

function valueIsEmpty(valor: string | number): boolean {
  return typeof valor === "string" && !valor.trim();
}

function construirHeadersMesa(
  accessToken: string,
  requestId?: string | null,
  extra?: HeadersInit,
): Headers {
  const headers = construirHeaders(accessToken, extra);
  if (requestId) {
    headers.set("X-Client-Request-Id", requestId);
  }
  return headers;
}

export async function carregarMensagensMesaMobile(
  accessToken: string,
  laudoId: number,
  options?: {
    aposId?: number | null;
  },
): Promise<MobileMesaMensagensResponse> {
  const response = await fetchComObservabilidade(
    "mesa_mensagens_list",
    montarUrlMesa(`/app/api/laudo/${laudoId}/mesa/mensagens`, {
      apos_id: options?.aposId ?? null,
    }),
    {
      method: "GET",
      headers: construirHeaders(accessToken),
    },
  );

  const payload = await lerJsonSeguro<
    MobileMesaMensagensResponse | { detail?: string }
  >(response);
  if (!response.ok || !payload || !("itens" in payload)) {
    throw new Error(
      extrairMensagemErro(
        payload,
        "Não foi possível carregar a conversa da mesa.",
      ),
    );
  }

  return payload;
}

export async function enviarMensagemMesaMobile(
  accessToken: string,
  laudoId: number,
  texto: string,
  referenciaMensagemId?: number | null,
  clientMessageId?: string | null,
): Promise<MobileMesaSendResponse> {
  const response = await fetchComObservabilidade(
    "mesa_send_text",
    buildApiUrl(`/app/api/laudo/${laudoId}/mesa/mensagem`),
    {
      method: "POST",
      headers: construirHeadersMesa(accessToken, clientMessageId, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        texto,
        referencia_mensagem_id: referenciaMensagemId ?? null,
        client_message_id: clientMessageId ?? null,
      }),
    },
  );

  const payload = await lerJsonSeguro<
    MobileMesaSendResponse | { detail?: string }
  >(response);
  if (!response.ok || !payload || !("mensagem" in payload)) {
    throw new Error(
      extrairMensagemErro(
        payload,
        "Não foi possível responder à mesa pelo app.",
      ),
    );
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
    clientMessageId?: string | null;
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
    formData.append(
      "referencia_mensagem_id",
      String(payload.referenciaMensagemId),
    );
  }
  if (payload.clientMessageId) {
    formData.append("client_message_id", payload.clientMessageId);
  }

  const response = await fetchComObservabilidade(
    "mesa_send_attachment",
    buildApiUrl(`/app/api/laudo/${laudoId}/mesa/anexo`),
    {
      method: "POST",
      headers: construirHeadersMesa(accessToken, payload.clientMessageId),
      body: formData,
    },
  );

  const corpo = await lerJsonSeguro<
    MobileMesaSendResponse | { detail?: string }
  >(response);
  if (!response.ok || !corpo || !("mensagem" in corpo)) {
    throw new Error(
      extrairMensagemErro(
        corpo,
        "Não foi possível enviar o anexo para a mesa.",
      ),
    );
  }

  return corpo;
}

export async function carregarResumoMesaMobile(
  accessToken: string,
  laudoId: number,
): Promise<MobileMesaResumoResponse> {
  const response = await fetchComObservabilidade(
    "mesa_resumo_get",
    buildApiUrl(`/app/api/laudo/${laudoId}/mesa/resumo`),
    {
      method: "GET",
      headers: construirHeaders(accessToken),
    },
  );

  const payload = await lerJsonSeguro<
    MobileMesaResumoResponse | { detail?: string }
  >(response);
  if (!response.ok || !payload || !("resumo" in payload)) {
    throw new Error(
      extrairMensagemErro(
        payload,
        "Não foi possível carregar o resumo da mesa.",
      ),
    );
  }

  return payload;
}

export async function carregarFeedMesaMobile(
  accessToken: string,
  payload: {
    laudoIds: number[];
    cursorAtualizadoEm?: string | null;
  },
): Promise<MobileMesaFeedResponse> {
  const response = await fetchComObservabilidade(
    "mesa_feed_list",
    montarUrlMesa("/app/api/mobile/mesa/feed", {
      laudo_ids: payload.laudoIds.join(","),
      cursor_atualizado_em: payload.cursorAtualizadoEm ?? null,
    }),
    {
      method: "GET",
      headers: construirHeaders(accessToken),
    },
  );

  const corpo = await lerJsonSeguro<
    MobileMesaFeedResponse | { detail?: string }
  >(response);
  if (!response.ok || !corpo || !("itens" in corpo)) {
    throw new Error(
      extrairMensagemErro(corpo, "Não foi possível carregar o feed da mesa."),
    );
  }

  return corpo;
}
