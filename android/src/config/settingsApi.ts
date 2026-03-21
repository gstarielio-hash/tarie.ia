import type {
  MobileAccountPasswordResponse,
  MobileAccountProfileResponse,
  MobileCriticalSettings,
  MobileCriticalSettingsResponse,
  MobileSupportReportResponse,
  MobileUser,
} from "../types/mobile";
import {
  buildApiUrl,
  construirHeaders,
  extrairMensagemErro,
  fetchComObservabilidade,
  lerJsonSeguro,
} from "./apiCore";

function extrairUsuarioMobile(payload: unknown): MobileUser | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const usuario = (payload as { usuario?: unknown }).usuario;
  if (!usuario || typeof usuario !== "object" || Array.isArray(usuario)) {
    return null;
  }
  return usuario as MobileUser;
}

export async function atualizarPerfilContaMobile(
  accessToken: string,
  payload: {
    nomeCompleto: string;
    email: string;
    telefone?: string;
  },
): Promise<MobileAccountProfileResponse> {
  const response = await fetchComObservabilidade(
    "mobile_account_profile_update",
    buildApiUrl("/app/api/mobile/account/profile"),
    {
      method: "PUT",
      headers: construirHeaders(accessToken, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        nome_completo: payload.nomeCompleto,
        email: payload.email,
        telefone: payload.telefone || "",
      }),
    },
  );

  const body = await lerJsonSeguro<
    MobileAccountProfileResponse | { detail?: string }
  >(response);
  const usuario = extrairUsuarioMobile(body);
  if (!response.ok || !body || !usuario) {
    throw new Error(
      extrairMensagemErro(
        body,
        "Nao foi possivel atualizar o perfil da conta.",
      ),
    );
  }

  return {
    ok: true,
    usuario,
  };
}

export async function alterarSenhaContaMobile(
  accessToken: string,
  payload: {
    senhaAtual: string;
    novaSenha: string;
    confirmarSenha: string;
  },
): Promise<MobileAccountPasswordResponse> {
  const response = await fetchComObservabilidade(
    "mobile_account_password_update",
    buildApiUrl("/app/api/mobile/account/password"),
    {
      method: "POST",
      headers: construirHeaders(accessToken, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        senha_atual: payload.senhaAtual,
        nova_senha: payload.novaSenha,
        confirmar_senha: payload.confirmarSenha,
      }),
    },
  );

  const body = await lerJsonSeguro<
    MobileAccountPasswordResponse | { detail?: string }
  >(response);
  if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
    throw new Error(
      extrairMensagemErro(body, "Nao foi possivel atualizar a senha da conta."),
    );
  }

  return {
    ok: true,
    message:
      typeof body.message === "string" && body.message.trim()
        ? body.message.trim()
        : "Senha atualizada com sucesso.",
  };
}

export async function uploadFotoPerfilContaMobile(
  accessToken: string,
  payload: {
    uri: string;
    nome: string;
    mimeType?: string;
  },
): Promise<MobileAccountProfileResponse> {
  const formData = new FormData();
  formData.append("foto", {
    uri: payload.uri,
    name: payload.nome,
    type: payload.mimeType || "image/jpeg",
  } as unknown as Blob);

  const response = await fetchComObservabilidade(
    "mobile_account_photo_upload",
    buildApiUrl("/app/api/mobile/account/photo"),
    {
      method: "POST",
      headers: construirHeaders(accessToken),
      body: formData,
    },
  );

  const body = await lerJsonSeguro<
    MobileAccountProfileResponse | { detail?: string }
  >(response);
  const usuario = extrairUsuarioMobile(body);
  if (!response.ok || !body || !usuario) {
    throw new Error(
      extrairMensagemErro(body, "Nao foi possivel atualizar a foto de perfil."),
    );
  }

  return {
    ok: true,
    usuario,
  };
}

export async function enviarRelatoSuporteMobile(
  accessToken: string,
  payload: {
    tipo: "bug" | "feedback";
    titulo?: string;
    mensagem: string;
    emailRetorno?: string;
    contexto?: string;
    anexoNome?: string;
  },
): Promise<MobileSupportReportResponse> {
  const response = await fetchComObservabilidade(
    "mobile_support_report",
    buildApiUrl("/app/api/mobile/support/report"),
    {
      method: "POST",
      headers: construirHeaders(accessToken, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        tipo: payload.tipo,
        titulo: payload.titulo || "",
        mensagem: payload.mensagem,
        email_retorno: payload.emailRetorno || "",
        contexto: payload.contexto || "",
        anexo_nome: payload.anexoNome || "",
      }),
    },
  );

  const body = await lerJsonSeguro<
    MobileSupportReportResponse | { detail?: string }
  >(response);
  if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
    throw new Error(
      extrairMensagemErro(body, "Nao foi possivel enviar o relato de suporte."),
    );
  }

  const protocolo =
    typeof body.protocolo === "string" ? body.protocolo.trim() : "";
  const status =
    typeof body.status === "string" ? body.status.trim() : "Recebido";

  return {
    ok: true,
    protocolo,
    status,
  };
}

export async function carregarConfiguracoesCriticasContaMobile(
  accessToken: string,
): Promise<MobileCriticalSettingsResponse> {
  const response = await fetchComObservabilidade(
    "mobile_account_settings_get",
    buildApiUrl("/app/api/mobile/account/settings"),
    {
      method: "GET",
      headers: construirHeaders(accessToken),
    },
  );

  const body = await lerJsonSeguro<
    MobileCriticalSettingsResponse | { detail?: string }
  >(response);
  if (!response.ok || !body || !("settings" in body)) {
    throw new Error(
      extrairMensagemErro(
        body,
        "Nao foi possivel carregar as configuracoes criticas da conta.",
      ),
    );
  }

  return body;
}

export async function salvarConfiguracoesCriticasContaMobile(
  accessToken: string,
  settings: MobileCriticalSettings,
): Promise<MobileCriticalSettingsResponse> {
  const response = await fetchComObservabilidade(
    "mobile_account_settings_put",
    buildApiUrl("/app/api/mobile/account/settings"),
    {
      method: "PUT",
      headers: construirHeaders(accessToken, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(settings),
    },
  );

  const body = await lerJsonSeguro<
    MobileCriticalSettingsResponse | { detail?: string }
  >(response);
  if (!response.ok || !body || !("settings" in body)) {
    throw new Error(
      extrairMensagemErro(
        body,
        "Nao foi possivel salvar as configuracoes criticas da conta.",
      ),
    );
  }

  return body;
}
