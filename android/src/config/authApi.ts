import type {
  MobileBootstrapResponse,
  MobileLoginResponse,
} from "../types/mobile";
import {
  DEFAULT_API_BASE_URL,
  buildApiUrl,
  construirHeaders,
  extrairMensagemErro,
  fetchComObservabilidade,
  lerJsonSeguro,
  normalizarApiBaseUrl,
} from "./apiCore";

function basePublicaAuth(): string {
  const rawBase =
    process.env.EXPO_PUBLIC_AUTH_WEB_BASE_URL ||
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    DEFAULT_API_BASE_URL;
  return normalizarApiBaseUrl(
    String(rawBase || "")
      .trim()
      .replace(/\/+$/, ""),
  );
}

function montarUrlAuth(
  rawValue: string | undefined,
  fallbackPath: string,
): string {
  const configured = String(rawValue || "").trim();
  if (configured) {
    return configured;
  }
  return `${basePublicaAuth()}${fallbackPath}`;
}

export function obterUrlRecuperacaoSenhaMobile(email?: string): string {
  const base = montarUrlAuth(
    process.env.EXPO_PUBLIC_AUTH_FORGOT_PASSWORD_URL,
    "/app/login",
  );
  const emailLimpo = String(email || "").trim();
  if (!emailLimpo) {
    return base;
  }
  const separador = base.includes("?") ? "&" : "?";
  return `${base}${separador}email=${encodeURIComponent(emailLimpo)}`;
}

export function obterUrlLoginSocialMobile(
  provider: "Google" | "Microsoft",
): string {
  if (provider === "Google") {
    return montarUrlAuth(
      process.env.EXPO_PUBLIC_AUTH_GOOGLE_URL,
      "/app/login?provider=google",
    );
  }
  return montarUrlAuth(
    process.env.EXPO_PUBLIC_AUTH_MICROSOFT_URL,
    "/app/login?provider=microsoft",
  );
}

export async function loginInspectorMobile(
  email: string,
  senha: string,
  lembrar: boolean,
): Promise<MobileLoginResponse> {
  const response = await fetchComObservabilidade(
    "mobile_auth_login",
    buildApiUrl("/app/api/mobile/auth/login"),
    {
      method: "POST",
      headers: construirHeaders(undefined, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ email, senha, lembrar }),
    },
  );

  const payload = await lerJsonSeguro<
    MobileLoginResponse | { detail?: string }
  >(response);
  if (!response.ok || !payload || !("access_token" in payload)) {
    throw new Error(
      extrairMensagemErro(
        payload,
        "Não foi possível autenticar no app mobile.",
      ),
    );
  }

  return payload;
}

export async function carregarBootstrapMobile(
  accessToken: string,
): Promise<MobileBootstrapResponse> {
  const response = await fetchComObservabilidade(
    "mobile_bootstrap",
    buildApiUrl("/app/api/mobile/bootstrap"),
    {
      method: "GET",
      headers: construirHeaders(accessToken),
    },
  );

  const payload = await lerJsonSeguro<
    MobileBootstrapResponse | { detail?: string }
  >(response);
  if (!response.ok || !payload || !("app" in payload)) {
    throw new Error(
      extrairMensagemErro(
        payload,
        "Não foi possível carregar o bootstrap do app.",
      ),
    );
  }

  return payload;
}

export async function logoutInspectorMobile(
  accessToken: string,
): Promise<void> {
  const response = await fetchComObservabilidade(
    "mobile_auth_logout",
    buildApiUrl("/app/api/mobile/auth/logout"),
    {
      method: "POST",
      headers: construirHeaders(accessToken),
    },
  );

  if (!response.ok) {
    const payload = await lerJsonSeguro<{ detail?: string }>(response);
    throw new Error(
      extrairMensagemErro(
        payload,
        "Não foi possível encerrar a sessão mobile.",
      ),
    );
  }
}
