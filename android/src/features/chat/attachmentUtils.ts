import { API_BASE_URL } from "../../config/api";
import type { MobileAttachment } from "../../types/mobile";

export function nomeExibicaoAnexo(
  item:
    | MobileAttachment
    | {
        nome_original?: unknown;
        nome?: unknown;
        nome_arquivo?: unknown;
        label?: unknown;
      },
  fallback = "Anexo",
): string {
  const candidatos = [
    item.nome_original,
    item.nome,
    item.nome_arquivo,
    item.label,
  ];
  for (const valor of candidatos) {
    if (typeof valor === "string" && valor.trim()) {
      return valor.trim();
    }
  }
  return fallback;
}

export function tamanhoHumanoAnexo(bytes: number | undefined): string {
  const valor = Number(bytes || 0);
  if (!Number.isFinite(valor) || valor <= 0) {
    return "";
  }
  if (valor < 1024) {
    return `${valor} B`;
  }
  if (valor < 1024 * 1024) {
    return `${(valor / 1024).toFixed(1)} KB`;
  }
  return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
}

export function urlAnexoAbsoluta(url: string | undefined): string | null {
  const valor = String(url || "").trim();
  if (!valor) {
    return null;
  }
  if (/^https?:\/\//i.test(valor)) {
    return valor;
  }
  return `${API_BASE_URL}${valor.startsWith("/") ? "" : "/"}${valor}`;
}

export function ehImagemAnexo(anexo: MobileAttachment): boolean {
  if (typeof anexo.eh_imagem === "boolean") {
    return anexo.eh_imagem;
  }
  const categoria = String(anexo.categoria || "").toLowerCase();
  const mime = String(anexo.mime_type || "").toLowerCase();
  return (
    categoria === "imagem" || categoria === "image" || mime.startsWith("image/")
  );
}
