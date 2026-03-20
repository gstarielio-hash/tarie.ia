import type { Dispatch, SetStateAction } from "react";
import type { AlertButton } from "react-native";

import { TWO_FACTOR_METHOD_OPTIONS } from "../InspectorMobileApp.constants";
import type {
  ConfirmSheetState,
  SettingsSheetState,
} from "./settingsSheetTypes";
import type {
  ConnectedProvider,
  SecurityEventItem,
  SessionDevice,
} from "./useSettingsPresentation";

type TwoFactorMethod = (typeof TWO_FACTOR_METHOD_OPTIONS)[number];

interface ExportTextParams {
  extension: "txt";
  content: string;
  prefixo: string;
}

interface SecurityEventDraft extends Omit<SecurityEventItem, "id"> {}

interface UseSettingsSecurityActionsParams {
  biometriaLocalSuportada: boolean;
  biometriaPermitida: boolean;
  codigosRecuperacao: string[];
  codigo2FA: string;
  emailAtualConta: string;
  fallbackEmail: string;
  fecharConfiguracoes: () => void;
  handleLogout: () => Promise<void> | void;
  provedoresConectados: ConnectedProvider[];
  reautenticacaoExpiraEm: string;
  requireAuthOnOpen: boolean;
  sessoesAtivas: SessionDevice[];
  twoFactorEnabled: boolean;
  twoFactorMethod: TwoFactorMethod;
  abrirConfirmacaoConfiguracao: (config: ConfirmSheetState) => void;
  abrirFluxoReautenticacao: (motivo: string, onSuccess?: () => void) => void;
  abrirSheetConfiguracao: (config: SettingsSheetState) => void;
  compartilharTextoExportado: (params: ExportTextParams) => Promise<boolean>;
  executarComReautenticacao: (motivo: string, onSuccess: () => void) => void;
  openSystemSettings: () => void;
  registrarEventoSegurancaLocal: (evento: SecurityEventDraft) => void;
  reautenticacaoAindaValida: (expiresAt: string) => boolean;
  setCodigo2FA: Dispatch<SetStateAction<string>>;
  setCodigosRecuperacao: Dispatch<SetStateAction<string[]>>;
  setDeviceBiometricsEnabled: (value: boolean) => void;
  setProvedoresConectados: Dispatch<SetStateAction<ConnectedProvider[]>>;
  setRequireAuthOnOpen: (value: boolean) => void;
  setSessoesAtivas: Dispatch<SetStateAction<SessionDevice[]>>;
  setSettingsSheetNotice: (value: string) => void;
  setTwoFactorEnabled: Dispatch<SetStateAction<boolean>>;
  setTwoFactorMethod: Dispatch<SetStateAction<TwoFactorMethod>>;
  showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
}

export function useSettingsSecurityActions({
  biometriaLocalSuportada,
  biometriaPermitida,
  codigosRecuperacao,
  codigo2FA,
  emailAtualConta,
  fallbackEmail,
  fecharConfiguracoes,
  handleLogout,
  provedoresConectados,
  reautenticacaoExpiraEm,
  requireAuthOnOpen,
  sessoesAtivas,
  twoFactorEnabled,
  twoFactorMethod,
  abrirConfirmacaoConfiguracao,
  abrirFluxoReautenticacao,
  abrirSheetConfiguracao,
  compartilharTextoExportado,
  executarComReautenticacao,
  openSystemSettings,
  registrarEventoSegurancaLocal,
  reautenticacaoAindaValida,
  setCodigo2FA,
  setCodigosRecuperacao,
  setDeviceBiometricsEnabled,
  setProvedoresConectados,
  setRequireAuthOnOpen,
  setSessoesAtivas,
  setSettingsSheetNotice,
  setTwoFactorEnabled,
  setTwoFactorMethod,
  showAlert,
}: UseSettingsSecurityActionsParams) {
  function handleToggleProviderConnection(provider: ConnectedProvider) {
    const conectados = provedoresConectados.filter(
      (item) => item.connected,
    ).length;
    if (provider.connected) {
      if (conectados <= 1) {
        abrirConfirmacaoConfiguracao({
          kind: "provider",
          title: "Último método de acesso",
          description:
            "Cadastre outro provedor ou mantenha um método adicional válido antes de desconectar este acesso.",
          confirmLabel: "Entendi",
        });
        return;
      }

      executarComReautenticacao(
        `Confirme sua identidade para desconectar ${provider.label} desta conta.`,
        () => {
          abrirConfirmacaoConfiguracao({
            kind: "provider",
            title: `Desconectar ${provider.label}`,
            description: provider.requiresReauth
              ? `Confirme a desconexão do provedor ${provider.label}. Para ações sensíveis, a reautenticação será exigida.`
              : `Confirme a desconexão do provedor ${provider.label}.`,
            confirmLabel: "Desconectar",
            onConfirm: () => {
              setProvedoresConectados((estadoAtual) =>
                estadoAtual.map((item) =>
                  item.id === provider.id
                    ? { ...item, connected: false, email: "" }
                    : item,
                ),
              );
              registrarEventoSegurancaLocal({
                title: `${provider.label} desconectado`,
                meta: "Evento de segurança registrado na conta do inspetor",
                status: "Agora",
                type: "provider",
                critical: true,
              });
            },
          });
        },
      );
      return;
    }

    executarComReautenticacao(
      `Confirme sua identidade para vincular ${provider.label} à conta do inspetor.`,
      () => {
        setProvedoresConectados((estadoAtual) =>
          estadoAtual.map((item) =>
            item.id === provider.id
              ? {
                  ...item,
                  connected: true,
                  email: emailAtualConta || fallbackEmail,
                }
              : item,
          ),
        );
        registrarEventoSegurancaLocal({
          title: `${provider.label} conectado`,
          meta:
            emailAtualConta || fallbackEmail || "Conta corporativa vinculada",
          status: "Agora",
          type: "provider",
        });
      },
    );
  }

  function handleEncerrarSessao(item: SessionDevice) {
    abrirConfirmacaoConfiguracao({
      kind: "session",
      title: "Encerrar sessão",
      description: `Deseja encerrar a sessão em ${item.title}?`,
      confirmLabel: "Encerrar",
      onConfirm: () => {
        setSessoesAtivas((estadoAtual) =>
          estadoAtual.filter((sessao) => sessao.id !== item.id),
        );
        registrarEventoSegurancaLocal({
          title: "Sessão encerrada",
          meta: `${item.title} • ${item.location}`,
          status: "Agora",
          type: "session",
        });
      },
    });
  }

  function handleRevisarSessao(item: SessionDevice) {
    const vaiMarcarComoSuspeita = !item.suspicious;
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: vaiMarcarComoSuspeita
        ? "Sinalizar atividade incomum"
        : "Marcar sessão como segura",
      description: vaiMarcarComoSuspeita
        ? `Deseja sinalizar ${item.title} como atividade incomum para revisão posterior?`
        : `Deseja remover o alerta de risco da sessão em ${item.title}?`,
      confirmLabel: vaiMarcarComoSuspeita ? "Sinalizar" : "Marcar segura",
      onConfirm: () => {
        setSessoesAtivas((estadoAtual) =>
          estadoAtual.map((sessao) =>
            sessao.id === item.id
              ? { ...sessao, suspicious: vaiMarcarComoSuspeita }
              : sessao,
          ),
        );
        registrarEventoSegurancaLocal({
          title: vaiMarcarComoSuspeita
            ? "Sessão sinalizada como incomum"
            : "Sessão marcada como segura",
          meta: `${item.title} • ${item.location}`,
          status: "Agora",
          type: "session",
          critical: vaiMarcarComoSuspeita,
        });
      },
    });
  }

  function handleEncerrarOutrasSessoes() {
    abrirConfirmacaoConfiguracao({
      kind: "sessionOthers",
      title: "Encerrar todas as outras",
      description:
        "Deseja encerrar todas as outras sessões ativas do inspetor?",
      confirmLabel: "Encerrar",
      onConfirm: () => {
        setSessoesAtivas((estadoAtual) =>
          estadoAtual.filter((sessao) => sessao.current),
        );
        registrarEventoSegurancaLocal({
          title: "Outras sessões encerradas",
          meta: "Sessões antigas invalidadas no dispositivo atual",
          status: "Agora",
          type: "session",
          critical: true,
        });
      },
    });
  }

  function handleEncerrarSessaoAtual() {
    abrirConfirmacaoConfiguracao({
      kind: "sessionCurrent",
      title: "Encerrar esta sessão",
      description:
        "Deseja sair deste dispositivo agora? O token atual será invalidado e você precisará entrar novamente.",
      confirmLabel: "Encerrar",
      onConfirm: () => {
        registrarEventoSegurancaLocal({
          title: "Sessão atual encerrada",
          meta: "Logout acionado a partir do dispositivo em uso",
          status: "Agora",
          type: "session",
          critical: true,
        });
        fecharConfiguracoes();
        void handleLogout();
      },
    });
  }

  function handleEncerrarSessoesSuspeitas() {
    const sessoesSuspeitas = sessoesAtivas.filter((item) => item.suspicious);
    if (!sessoesSuspeitas.length) {
      abrirConfirmacaoConfiguracao({
        kind: "security",
        title: "Nenhuma sessão suspeita",
        description:
          "No momento não existe nenhuma sessão marcada como suspeita para encerrar.",
        confirmLabel: "Entendi",
      });
      return;
    }

    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: "Encerrar sessões suspeitas",
      description: `Vamos encerrar ${sessoesSuspeitas.length} sessão(ões) marcadas como suspeitas e manter somente as confiáveis.`,
      confirmLabel: "Encerrar suspeitas",
      onConfirm: () => {
        setSessoesAtivas((estadoAtual) =>
          estadoAtual.filter((sessao) => !sessao.suspicious),
        );
        registrarEventoSegurancaLocal({
          title: "Sessões suspeitas encerradas",
          meta: `${sessoesSuspeitas.length} sessão(ões) removidas após revisão`,
          status: "Agora",
          type: "session",
          critical: true,
        });
      },
    });
  }

  function handleConectarProximoProvedorDisponivel() {
    const proximoProvider =
      provedoresConectados.find((item) => !item.connected) || null;
    if (!proximoProvider) {
      abrirConfirmacaoConfiguracao({
        kind: "provider",
        title: "Todos os provedores já estão vinculados",
        description:
          "Google, Apple e Microsoft já estão conectados nesta conta do inspetor.",
        confirmLabel: "Entendi",
      });
      return;
    }

    handleToggleProviderConnection(proximoProvider);
  }

  async function handleCompartilharCodigosRecuperacao() {
    if (!codigosRecuperacao.length) {
      setSettingsSheetNotice(
        "Gere os códigos primeiro para compartilhar ou salvar com segurança.",
      );
      return;
    }

    if (!reautenticacaoAindaValida(reautenticacaoExpiraEm)) {
      abrirFluxoReautenticacao(
        "Confirme sua identidade para exportar os códigos de recuperação da verificação em duas etapas.",
        () => {
          void handleCompartilharCodigosRecuperacao();
        },
      );
      return;
    }

    const conteudo = [
      "Tariel Inspetor • Códigos de recuperação",
      `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
      "",
      ...codigosRecuperacao,
      "",
      "Guarde estes códigos em local seguro. Cada código deve ser usado apenas uma vez.",
    ].join("\n");

    const compartilhado = await compartilharTextoExportado({
      extension: "txt",
      content: conteudo,
      prefixo: "tariel-recovery-codes",
    });

    if (compartilhado) {
      registrarEventoSegurancaLocal({
        title: "Códigos de recuperação exportados",
        meta: "Exportação local concluída com reautenticação válida",
        status: "Agora",
        type: "2fa",
        critical: true,
      });
      setSettingsSheetNotice(
        "Códigos compartilhados. Salve-os em um local seguro.",
      );
      return;
    }

    setSettingsSheetNotice(
      "Não foi possível exportar os códigos agora. Tente novamente em alguns segundos.",
    );
  }

  function handleReautenticacaoSensivel() {
    abrirFluxoReautenticacao(
      "Confirme a identidade do inspetor para liberar exportação, exclusão de dados, 2FA e mudanças sensíveis na conta.",
    );
  }

  function handleMudarMetodo2FA(value: TwoFactorMethod) {
    if (value === twoFactorMethod) {
      return;
    }
    setTwoFactorMethod(value);
    registrarEventoSegurancaLocal({
      title: "Método preferido de 2FA atualizado",
      meta: `Novo método preferido: ${value}`,
      status: "Agora",
      type: "2fa",
      critical: twoFactorEnabled,
    });
  }

  function handleToggle2FA() {
    const proximoEstado = !twoFactorEnabled;
    executarComReautenticacao(
      proximoEstado
        ? "Confirme sua identidade para ativar a verificação em duas etapas."
        : "Confirme sua identidade para desativar a verificação em duas etapas.",
      () => {
        abrirConfirmacaoConfiguracao({
          kind: "security",
          title: proximoEstado
            ? "Ativar verificação em duas etapas"
            : "Desativar verificação em duas etapas",
          description: proximoEstado
            ? "A ativação será registrada no histórico de segurança e passa a proteger ações críticas."
            : "A desativação da 2FA exige confirmação forte e ficará registrada no histórico de segurança.",
          confirmLabel: proximoEstado ? "Ativar" : "Desativar",
          onConfirm: () => {
            setTwoFactorEnabled(proximoEstado);
            registrarEventoSegurancaLocal({
              title: proximoEstado ? "2FA ativada" : "2FA desativada",
              meta: `Método preferido: ${twoFactorMethod}`,
              status: "Agora",
              type: "2fa",
              critical: !proximoEstado,
            });
          },
        });
      },
    );
  }

  function handleGerarCodigosRecuperacao() {
    executarComReautenticacao(
      "Confirme sua identidade para gerar novos códigos de recuperação.",
      () => {
        const novosCodigos = Array.from(
          { length: 6 },
          (_, index) =>
            `TG-${index + 1}${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        );
        setCodigosRecuperacao(novosCodigos);
        registrarEventoSegurancaLocal({
          title: "Códigos de recuperação gerados",
          meta: "Exibidos uma única vez ao usuário",
          status: "Agora",
          type: "2fa",
        });
        abrirSheetConfiguracao({
          kind: "reauth",
          title: "Códigos de recuperação",
          subtitle:
            "Os novos códigos já foram gerados e aparecem na seção de 2FA. Salve-os em local seguro antes de sair.",
        });
      },
    );
  }

  function handleConfirmarCodigo2FA() {
    if (codigo2FA.trim().length < 6) {
      showAlert(
        "Código inválido",
        "Digite um código válido para concluir a configuração da verificação em duas etapas.",
      );
      return;
    }

    registrarEventoSegurancaLocal({
      title: "Código 2FA confirmado",
      meta: `Método validado: ${twoFactorMethod}`,
      status: "Agora",
      type: "2fa",
    });
    showAlert(
      "Código confirmado",
      "A verificação em duas etapas foi confirmada no app.",
    );
    setCodigo2FA("");
  }

  function handleAbrirAjustesDoSistema(contexto: string) {
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: "Abrir ajustes do sistema",
      description: `Vamos abrir as configurações do Android para revisar ${contexto}.`,
      confirmLabel: "Abrir ajustes",
      onConfirm: () => {
        registrarEventoSegurancaLocal({
          title: "Ajustes do sistema abertos",
          meta: `Fluxo acionado a partir de ${contexto}`,
          status: "Agora",
          type: "session",
        });
        openSystemSettings();
      },
    });
  }

  function handleToggleBiometriaNoDispositivo(value: boolean) {
    if (!biometriaLocalSuportada) {
      setDeviceBiometricsEnabled(false);
      showAlert(
        "Biometria indisponível",
        "Esta build ainda não possui autenticação biométrica nativa integrada. Use o bloqueio ao abrir e o bloqueio por inatividade.",
      );
      return;
    }

    if (!value) {
      setDeviceBiometricsEnabled(false);
      registrarEventoSegurancaLocal({
        title: "Biometria de desbloqueio desativada",
        meta: "O desbloqueio local por biometria foi desativado neste dispositivo.",
        status: "Agora",
        type: "session",
      });
      return;
    }

    if (!biometriaPermitida) {
      setDeviceBiometricsEnabled(false);
      showAlert(
        "Permissão necessária",
        "Libere biometria nas permissões do Android para usar desbloqueio biométrico no app.",
        [
          { text: "Agora não", style: "cancel" },
          {
            text: "Abrir ajustes",
            onPress: openSystemSettings,
          },
        ],
      );
      return;
    }

    if (!requireAuthOnOpen) {
      setRequireAuthOnOpen(true);
    }
    setDeviceBiometricsEnabled(true);
    registrarEventoSegurancaLocal({
      title: "Biometria de desbloqueio ativada",
      meta: "O app poderá usar biometria ao abrir e em desbloqueios locais.",
      status: "Agora",
      type: "session",
    });
  }

  return {
    handleToggleProviderConnection,
    handleEncerrarSessao,
    handleRevisarSessao,
    handleEncerrarOutrasSessoes,
    handleEncerrarSessaoAtual,
    handleEncerrarSessoesSuspeitas,
    handleConectarProximoProvedorDisponivel,
    handleCompartilharCodigosRecuperacao,
    handleReautenticacaoSensivel,
    handleMudarMetodo2FA,
    handleToggle2FA,
    handleGerarCodigosRecuperacao,
    handleConfirmarCodigo2FA,
    handleAbrirAjustesDoSistema,
    handleToggleBiometriaNoDispositivo,
  };
}
