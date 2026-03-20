import { useRef, type Dispatch, type SetStateAction } from "react";

import { formatarStatusReautenticacao } from "./reauth";
import type {
  ConfirmSheetState,
  SettingsSheetState,
} from "./settingsSheetTypes";
import type { SecurityEventItem } from "./useSettingsPresentation";

interface UseSettingsReauthActionsParams {
  abrirConfirmacaoConfiguracao: (config: ConfirmSheetState) => void;
  abrirSheetConfiguracao: (config: SettingsSheetState) => void;
  fecharSheetConfiguracao: () => void;
  notificarConfiguracaoConcluida: (mensagem: string) => void;
  registrarEventoSegurancaLocal: (
    evento: Omit<SecurityEventItem, "id">,
  ) => void;
  reautenticacaoExpiraEm: string;
  settingsSheet: SettingsSheetState | null;
  reautenticacaoAindaValida: (expiresAt: string) => boolean;
  setReauthReason: Dispatch<SetStateAction<string>>;
  setReautenticacaoExpiraEm: Dispatch<SetStateAction<string>>;
  setReautenticacaoStatus: Dispatch<SetStateAction<string>>;
  setSettingsSheetLoading: Dispatch<SetStateAction<boolean>>;
  setSettingsSheetNotice: Dispatch<SetStateAction<string>>;
}

export function useSettingsReauthActions({
  abrirConfirmacaoConfiguracao,
  abrirSheetConfiguracao,
  fecharSheetConfiguracao,
  notificarConfiguracaoConcluida,
  registrarEventoSegurancaLocal,
  reautenticacaoExpiraEm,
  settingsSheet,
  reautenticacaoAindaValida,
  setReauthReason,
  setReautenticacaoExpiraEm,
  setReautenticacaoStatus,
  setSettingsSheetLoading,
  setSettingsSheetNotice,
}: UseSettingsReauthActionsParams) {
  const pendingSensitiveActionRef = useRef<(() => void) | null>(null);

  function abrirFluxoReautenticacao(motivo: string, onSuccess?: () => void) {
    pendingSensitiveActionRef.current = onSuccess || null;
    setReauthReason(motivo);
    abrirSheetConfiguracao({
      kind: "reauth",
      title: "Confirmar identidade",
      subtitle:
        "Antes de continuar, valide a identidade do inspetor para proteger ações sensíveis.",
      actionLabel: "Confirmar agora",
    });
  }

  function executarComReautenticacao(motivo: string, onSuccess: () => void) {
    if (reautenticacaoAindaValida(reautenticacaoExpiraEm)) {
      onSuccess();
      return;
    }
    abrirFluxoReautenticacao(motivo, onSuccess);
  }

  async function handleConfirmarSettingsSheetReauth(): Promise<boolean> {
    if (settingsSheet?.kind !== "reauth") {
      return false;
    }

    setSettingsSheetLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 420));

    const expiracao = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const status = formatarStatusReautenticacao(expiracao);
    setReautenticacaoExpiraEm(expiracao);
    setReautenticacaoStatus(status);
    registrarEventoSegurancaLocal({
      title: "Reautenticação concluída",
      meta: "Janela temporária liberada para ações sensíveis",
      status: "Agora",
      type: "login",
    });
    const pendingAction = pendingSensitiveActionRef.current;
    pendingSensitiveActionRef.current = null;
    if (pendingAction) {
      setSettingsSheetLoading(false);
      setSettingsSheetNotice(
        "Identidade confirmada. O fluxo protegido será liberado agora.",
      );
      setTimeout(() => {
        fecharSheetConfiguracao();
        pendingAction();
      }, 180);
      return true;
    }

    notificarConfiguracaoConcluida(
      "Identidade confirmada. Ações sensíveis ficam liberadas por 15 minutos.",
    );
    setSettingsSheetLoading(false);
    return true;
  }

  function handleExcluirConta() {
    executarComReautenticacao(
      "Confirme sua identidade para excluir a conta e invalidar todas as sessões do app.",
      () => {
        abrirConfirmacaoConfiguracao({
          kind: "deleteAccount",
          title: "Excluir conta",
          description:
            "Essa ação é permanente, invalida sessões e remove os dados conforme a política do sistema. Digite EXCLUIR para continuar.",
          confirmLabel: "Excluir permanentemente",
          confirmPhrase: "EXCLUIR",
        });
      },
    );
  }

  function clearPendingSensitiveAction() {
    pendingSensitiveActionRef.current = null;
  }

  return {
    abrirFluxoReautenticacao,
    executarComReautenticacao,
    handleConfirmarSettingsSheetReauth,
    handleExcluirConta,
    clearPendingSensitiveAction,
  };
}
