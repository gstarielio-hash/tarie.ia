import {
  obterUrlLoginSocialMobile,
  obterUrlRecuperacaoSenhaMobile,
} from "../../config/api";

interface AlertButtonLike {
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
  text: string;
}

interface UseExternalAccessActionsParams {
  email: string;
  onCanOpenUrl: (url: string) => Promise<boolean>;
  onOpenUrl: (url: string) => Promise<void>;
  onShowAlert: (
    title: string,
    message?: string,
    buttons?: AlertButtonLike[],
  ) => void;
}

export function useExternalAccessActions({
  email,
  onCanOpenUrl,
  onOpenUrl,
  onShowAlert,
}: UseExternalAccessActionsParams) {
  async function tentarAbrirUrlExterna(url: string): Promise<boolean> {
    const target = String(url || "").trim();
    if (!target) {
      return false;
    }
    try {
      const supported = await onCanOpenUrl(target);
      if (!supported) {
        return false;
      }
      await onOpenUrl(target);
      return true;
    } catch {
      return false;
    }
  }

  function handleEsqueciSenha() {
    const url = obterUrlRecuperacaoSenhaMobile(email);
    void (async () => {
      const abriu = await tentarAbrirUrlExterna(url);
      if (!abriu) {
        onShowAlert(
          "Recuperação de senha",
          "Não foi possível abrir o fluxo agora. Tente novamente em instantes ou contate o administrador da sua empresa.",
        );
      }
    })();
  }

  function handleLoginSocial(provider: "Google" | "Microsoft") {
    const url = obterUrlLoginSocialMobile(provider);
    void (async () => {
      const abriu = await tentarAbrirUrlExterna(url);
      if (!abriu) {
        onShowAlert(
          `${provider} indisponível`,
          `Não foi possível abrir o login com ${provider} agora. Use email e senha enquanto o acesso externo é normalizado.`,
        );
      }
    })();
  }

  return {
    handleEsqueciSenha,
    handleLoginSocial,
    tentarAbrirUrlExterna,
  };
}
