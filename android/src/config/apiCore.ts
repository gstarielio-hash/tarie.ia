import { Platform } from "react-native";

import { registrarEventoObservabilidade } from "./observability";

export const DEFAULT_API_BASE_URL = "https://tarie-ia.onrender.com";

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

export function normalizarApiBaseUrl(rawValue: string): string {
  const value = String(rawValue || DEFAULT_API_BASE_URL)
    .trim()
    .replace(/\/+$/, "");

  if (Platform.OS !== "android" || !androidPareceEmulador()) {
    return value;
  }

  // In Android emulators, localhost/127.0.0.1 points to the emulator itself.
  return value.replace(
    /:\/\/(127\.0\.0\.1|localhost)(?=[:/]|$)/i,
    "://10.0.2.2",
  );
}

export const API_BASE_URL = normalizarApiBaseUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL,
);

export function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function resolverUrlArquivoApi(rawValue?: string): string {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (value.startsWith("//")) {
    return `https:${value}`;
  }
  if (value.startsWith("/")) {
    return `${API_BASE_URL}${value}`;
  }
  return `${API_BASE_URL}/${value.replace(/^\/+/, "")}`;
}

export function inferirMimeType(nomeArquivo: string): string {
  const nome = String(nomeArquivo || "")
    .trim()
    .toLowerCase();
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

export function construirHeaders(
  accessToken?: string,
  extra?: HeadersInit,
): Headers {
  const headers = new Headers(extra || {});
  headers.set("Accept", "application/json");
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return headers;
}

export function extrairMensagemErro(
  payload: unknown,
  fallback: string,
): string {
  if (payload && typeof payload === "object") {
    const detalhe = Reflect.get(payload, "detail");
    if (typeof detalhe === "string" && detalhe.trim()) {
      return detalhe.trim();
    }
  }
  return fallback;
}

export async function lerJsonSeguro<T>(response: Response): Promise<T | null> {
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

function normalizarPathObservabilidade(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return String(url || "").replace(/^https?:\/\/[^/]+/i, "");
  }
}

export async function fetchComObservabilidade(
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
      buildApiUrl("/health"),
    );
    return response.ok;
  } catch {
    return false;
  }
}
