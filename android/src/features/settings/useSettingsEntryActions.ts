import { HELP_CENTER_ARTICLES } from "../InspectorMobileApp.constants";
import type { ComposerAttachment } from "../chat/types";
import type { SettingsSheetState } from "./settingsSheetTypes";
import type {
  SettingsDrawerPage,
  SettingsSectionKey,
} from "./settingsNavigationMeta";

interface UseSettingsEntryActionsParams {
  perfilNome: string;
  perfilExibicao: string;
  contaTelefone: string;
  emailAtualConta: string;
  fallbackEmail: string;
  abrirSheetConfiguracao: (config: SettingsSheetState) => void;
  handleAbrirPaginaConfiguracoes: (
    page: SettingsDrawerPage,
    section?: SettingsSectionKey | "all",
  ) => void;
  setNomeCompletoDraft: (value: string) => void;
  setNomeExibicaoDraft: (value: string) => void;
  setTelefoneDraft: (value: string) => void;
  setNovoEmailDraft: (value: string) => void;
  setSenhaAtualDraft: (value: string) => void;
  setNovaSenhaDraft: (value: string) => void;
  setConfirmarSenhaDraft: (value: string) => void;
  setBuscaAjuda: (value: string) => void;
  setArtigoAjudaExpandidoId: (
    value: string | ((current: string) => string),
  ) => void;
  setBugDescriptionDraft: (value: string) => void;
  setBugEmailDraft: (value: string) => void;
  setBugAttachmentDraft: (value: ComposerAttachment | null) => void;
  setFeedbackDraft: (value: string) => void;
}

export function useSettingsEntryActions({
  perfilNome,
  perfilExibicao,
  contaTelefone,
  emailAtualConta,
  fallbackEmail,
  abrirSheetConfiguracao,
  handleAbrirPaginaConfiguracoes,
  setNomeCompletoDraft,
  setNomeExibicaoDraft,
  setTelefoneDraft,
  setNovoEmailDraft,
  setSenhaAtualDraft,
  setNovaSenhaDraft,
  setConfirmarSenhaDraft,
  setBuscaAjuda,
  setArtigoAjudaExpandidoId,
  setBugDescriptionDraft,
  setBugEmailDraft,
  setBugAttachmentDraft,
  setFeedbackDraft,
}: UseSettingsEntryActionsParams) {
  function handleUploadFotoPerfil() {
    abrirSheetConfiguracao({
      kind: "photo",
      title: "Foto de perfil",
      subtitle: "Atualize a imagem usada na conta e no chat do inspetor.",
      actionLabel: "Escolher foto",
    });
  }

  function handleEditarPerfil() {
    setNomeCompletoDraft(perfilNome);
    setNomeExibicaoDraft(
      perfilExibicao || perfilNome.trim().split(/\s+/).filter(Boolean)[0] || "",
    );
    setTelefoneDraft(contaTelefone);
    abrirSheetConfiguracao({
      kind: "profile",
      title: "Editar perfil",
      subtitle:
        "Atualize nome, nome de exibição e telefone usados nesta conta.",
      actionLabel: "Salvar perfil",
    });
  }

  function handleAlterarEmail() {
    setNovoEmailDraft(emailAtualConta || fallbackEmail);
    abrirSheetConfiguracao({
      kind: "email",
      title: "Alterar e-mail",
      subtitle: "Atualize o e-mail principal usado no acesso e no suporte.",
      actionLabel: "Salvar e-mail",
    });
  }

  function handleAlterarSenha() {
    setSenhaAtualDraft("");
    setNovaSenhaDraft("");
    setConfirmarSenhaDraft("");
    abrirSheetConfiguracao({
      kind: "password",
      title: "Alterar senha",
      subtitle:
        "Confirme sua senha atual e defina uma nova credencial para o aplicativo.",
      actionLabel: "Salvar nova senha",
    });
  }

  function handleGerenciarPlano() {
    abrirSheetConfiguracao({
      kind: "plan",
      title: "Plano e assinatura",
      subtitle:
        "Revise benefícios do plano atual e prepare a próxima mudança de assinatura do inspetor.",
      actionLabel: "Trocar plano",
    });
  }

  function handleHistoricoPagamentos() {
    abrirSheetConfiguracao({
      kind: "payments",
      title: "Histórico de pagamentos",
      subtitle:
        "Resumo financeiro da assinatura do inspetor e das últimas cobranças.",
    });
  }

  function handleGerenciarPagamento() {
    abrirSheetConfiguracao({
      kind: "billing",
      title: "Gerenciar pagamento",
      subtitle:
        "Atualize o cartão cadastrado e deixe o método de cobrança pronto para a próxima renovação.",
      actionLabel: "Atualizar cartão",
    });
  }

  function handleAbrirModeloIa() {
    abrirSheetConfiguracao({
      kind: "aiModel",
      title: "Modelo de IA",
      subtitle:
        "Escolha o perfil padrão para equilibrar velocidade, custo e profundidade das respostas.",
    });
  }

  function handleIntegracoesExternas() {
    abrirSheetConfiguracao({
      kind: "integrations",
      title: "Integrações",
      subtitle:
        "Conecte serviços externos ao fluxo do inspetor sem sair do app.",
    });
  }

  function handlePluginsIa() {
    abrirSheetConfiguracao({
      kind: "plugins",
      title: "Plugins da IA",
      subtitle:
        "Ative ferramentas extras para tornar a assistência do inspetor mais operacional.",
    });
  }

  function handlePermissoes() {
    handleAbrirPaginaConfiguracoes("seguranca", "permissoes");
  }

  function handlePoliticaPrivacidade() {
    abrirSheetConfiguracao({
      kind: "privacy",
      title: "Política de privacidade",
      subtitle:
        "Veja como a Tariel.ia trata dados, histórico e retenção das conversas.",
    });
  }

  function handleCentralAjuda() {
    setBuscaAjuda("");
    setArtigoAjudaExpandidoId(HELP_CENTER_ARTICLES[0]?.id ?? "");
    abrirSheetConfiguracao({
      kind: "help",
      title: "Central de ajuda",
      subtitle:
        "Acesse artigos, respostas rápidas e atalhos para suporte do inspetor.",
    });
  }

  function handleReportarProblema() {
    setBugDescriptionDraft("");
    setBugEmailDraft(emailAtualConta || fallbackEmail);
    setBugAttachmentDraft(null);
    abrirSheetConfiguracao({
      kind: "bug",
      title: "Reportar problema",
      subtitle:
        "Descreva o bug encontrado e envie o contexto para a equipe da Tariel.ia.",
      actionLabel: "Enviar relato",
    });
  }

  function handleEnviarFeedback() {
    setFeedbackDraft("");
    abrirSheetConfiguracao({
      kind: "feedback",
      title: "Enviar feedback",
      subtitle:
        "Compartilhe ideias, melhorias e sugestões para a próxima evolução do app.",
      actionLabel: "Enviar feedback",
    });
  }

  function handleAbrirSobreApp() {
    abrirSheetConfiguracao({
      kind: "about",
      title: "Sobre o app",
      subtitle:
        "Versão, build, ambiente e documentos disponíveis nesta instalação do inspetor.",
    });
  }

  function handleAlternarArtigoAjuda(articleId: string) {
    setArtigoAjudaExpandidoId((estadoAtual) =>
      estadoAtual === articleId ? "" : articleId,
    );
  }

  function handleTermosUso() {
    abrirSheetConfiguracao({
      kind: "terms",
      title: "Termos de uso",
      subtitle:
        "Resumo das condições de uso do app do inspetor e das responsabilidades do usuário.",
      actionLabel: "Exportar TXT",
    });
  }

  function handleLicencas() {
    abrirSheetConfiguracao({
      kind: "licenses",
      title: "Licenças",
      subtitle:
        "Bibliotecas, dependências e componentes utilizados nesta build do aplicativo.",
      actionLabel: "Exportar TXT",
    });
  }

  return {
    handleUploadFotoPerfil,
    handleEditarPerfil,
    handleAlterarEmail,
    handleAlterarSenha,
    handleGerenciarPlano,
    handleHistoricoPagamentos,
    handleGerenciarPagamento,
    handleAbrirModeloIa,
    handleIntegracoesExternas,
    handlePluginsIa,
    handlePermissoes,
    handlePoliticaPrivacidade,
    handleCentralAjuda,
    handleReportarProblema,
    handleEnviarFeedback,
    handleAbrirSobreApp,
    handleAlternarArtigoAjuda,
    handleTermosUso,
    handleLicencas,
  };
}
