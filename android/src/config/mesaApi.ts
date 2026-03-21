import type {
  MobileMesaMensagensResponse,
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

export async function carregarMensagensMesaMobile(
  accessToken: string,
  laudoId: number,
): Promise<MobileMesaMensagensResponse> {
  const response = await fetchComObservabilidade(
    "mesa_mensagens_list",
    buildApiUrl(`/app/api/laudo/${laudoId}/mesa/mensagens`),
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
): Promise<MobileMesaSendResponse> {
  const response = await fetchComObservabilidade(
    "mesa_send_text",
    buildApiUrl(`/app/api/laudo/${laudoId}/mesa/mensagem`),
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

  const response = await fetchComObservabilidade(
    "mesa_send_attachment",
    buildApiUrl(`/app/api/laudo/${laudoId}/mesa/anexo`),
    {
      method: "POST",
      headers: construirHeaders(accessToken),
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
