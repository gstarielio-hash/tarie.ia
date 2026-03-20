import type {
  MobileChatMode,
} from "../../types/mobile";

export type ActiveThread = "chat" | "mesa";
export type ActivityNotificationKind =
  | "status"
  | "mesa_nova"
  | "mesa_resolvida"
  | "mesa_reaberta"
  | "system"
  | "alerta_critico";
export type ActivityNotificationCategory = "chat" | "mesa" | "system" | "critical";

export type ComposerAttachment =
  | {
      kind: "image";
      label: string;
      resumo: string;
      dadosImagem: string;
      previewUri: string;
      fileUri: string;
      mimeType: string;
    }
  | {
      kind: "document";
      label: string;
      resumo: string;
      textoDocumento: string;
      nomeDocumento: string;
      chars: number;
      truncado: boolean;
      fileUri: string;
      mimeType: string;
    };

export interface OfflinePendingMessage {
  id: string;
  channel: ActiveThread;
  laudoId: number | null;
  text: string;
  createdAt: string;
  title: string;
  attachment: ComposerAttachment | null;
  referenceMessageId: number | null;
  attempts: number;
  lastAttemptAt: string;
  lastError: string;
  nextRetryAt: string;
  aiMode: MobileChatMode;
  aiSummary: string;
  aiMessagePrefix: string;
}

export interface MobileActivityNotification {
  id: string;
  kind: ActivityNotificationKind;
  laudoId: number | null;
  title: string;
  body: string;
  createdAt: string;
  unread: boolean;
  targetThread: ActiveThread;
}

export function duplicarComposerAttachment(anexo: ComposerAttachment | null): ComposerAttachment | null {
  if (!anexo) {
    return null;
  }
  return anexo.kind === "image" ? { ...anexo } : { ...anexo };
}

export function categoriaNotificacaoPorKind(
  kind: ActivityNotificationKind,
): ActivityNotificationCategory {
  if (kind === "mesa_nova" || kind === "mesa_resolvida" || kind === "mesa_reaberta") {
    return "mesa";
  }
  if (kind === "system") {
    return "system";
  }
  if (kind === "alerta_critico") {
    return "critical";
  }
  return "chat";
}
