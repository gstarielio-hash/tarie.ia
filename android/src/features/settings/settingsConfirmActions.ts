import type { ConfirmSheetState } from "./settingsSheetTypes";

type SecurityEventType = "login" | "provider" | "2fa" | "data" | "session";

export interface SettingsSecurityEventPayload {
  title: string;
  meta: string;
  status: string;
  type: SecurityEventType;
  critical?: boolean;
}

interface HandleConfirmSheetActionParams {
  confirmSheet: ConfirmSheetState | null;
  confirmTextDraft: string;
  onRegistrarEventoSegurancaLocal: (
    payload: SettingsSecurityEventPayload,
  ) => void;
  onClearHistory: () => void;
  onClearConversations: () => void;
  onDeleteAccount: () => void;
  onCloseConfirmacao: () => void;
}

export function handleConfirmSheetAction({
  confirmSheet,
  confirmTextDraft,
  onRegistrarEventoSegurancaLocal,
  onClearHistory,
  onClearConversations,
  onDeleteAccount,
  onCloseConfirmacao,
}: HandleConfirmSheetActionParams): void {
  if (!confirmSheet) {
    return;
  }

  if (
    confirmSheet.confirmPhrase &&
    confirmTextDraft.trim().toUpperCase() !==
      confirmSheet.confirmPhrase.toUpperCase()
  ) {
    return;
  }

  const customOnConfirm = confirmSheet.onConfirm;

  switch (confirmSheet.kind) {
    case "clearHistory":
      onRegistrarEventoSegurancaLocal({
        title: "Histórico apagado",
        meta: "Limpeza local acionada pelo usuário",
        status: "Agora",
        type: "data",
        critical: true,
      });
      onClearHistory();
      break;
    case "clearConversations":
      onRegistrarEventoSegurancaLocal({
        title: "Conversas removidas",
        meta: "Todas as conversas locais foram limpas",
        status: "Agora",
        type: "data",
        critical: true,
      });
      onClearConversations();
      break;
    case "deleteAccount":
      onRegistrarEventoSegurancaLocal({
        title: "Exclusão de conta iniciada",
        meta: "Fluxo local de exclusão iniciado no dispositivo",
        status: "Agora",
        type: "data",
        critical: true,
      });
      onDeleteAccount();
      break;
    case "provider":
    case "security":
    case "session":
    case "sessionCurrent":
    case "sessionOthers":
      customOnConfirm?.();
      break;
  }

  onCloseConfirmacao();
}
