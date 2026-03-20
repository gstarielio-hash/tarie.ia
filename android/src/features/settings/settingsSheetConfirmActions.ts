import { Platform } from "react-native";

import {
  APP_BUILD_CHANNEL,
  APP_VERSION_LABEL,
  LICENSES_CATALOG,
  PAYMENT_CARD_OPTIONS,
  PLAN_OPTIONS,
  TERMS_OF_USE_SECTIONS,
} from "../InspectorMobileApp.constants";
import type {
  SettingsSheetKind,
  SettingsSheetState,
} from "./settingsSheetTypes";

type SecurityEventType = "login" | "provider" | "2fa" | "data" | "session";

type ComposerAttachment =
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
      nomeDocumento: string;
      resumo: string;
      textoDocumento: string;
      chars: number;
      truncado: boolean;
      fileUri: string;
      mimeType: string;
    };

interface SupportQueueItem {
  id: string;
  kind: "bug" | "feedback";
  title: string;
  body: string;
  email: string;
  createdAt: string;
  status: string;
  attachmentLabel?: string;
  attachmentUri?: string;
  attachmentKind?: "image" | "document";
}

interface SessionSnapshot {
  accessToken: string;
  bootstrap: {
    usuario: {
      id?: number;
      nome_completo: string;
      email?: string;
      telefone: string;
      empresa_nome?: string;
      empresa_id?: number;
      nivel_acesso?: number;
    };
  };
}

interface SupportBackendResponse {
  status: string;
  protocolo: string;
}

interface SettingsSecurityEventPayload {
  title: string;
  meta: string;
  status: string;
  type: SecurityEventType;
  critical?: boolean;
}

interface PerfilContaSincronizado {
  nomeCompleto: string;
  nomeExibicao: string;
  email: string;
  telefone: string;
  fotoPerfilUri: string;
}

export interface HandleSettingsSheetDelegatedParams {
  kind: SettingsSheetKind;
  profile: {
    nomeCompletoDraft: string;
    nomeExibicaoDraft: string;
    telefoneDraft: string;
    currentNomeCompleto: string;
    currentNomeExibicao: string;
    currentTelefone: string;
    session: SessionSnapshot | null;
    onSetNomeCompletoDraft: (value: string) => void;
    onSetNomeExibicaoDraft: (value: string) => void;
    onSetTelefoneDraft: (value: string) => void;
    onAplicarPerfilLocal: (payload: {
      nomeCompleto: string;
      nomeExibicao: string;
      telefone: string;
    }) => void;
    onAtualizarPerfilContaNoBackend: (
      accessToken: string,
      payload: { nomeCompleto: string; email: string; telefone: string },
    ) => Promise<PerfilContaSincronizado>;
    onAplicarPerfilSincronizado: (perfil: PerfilContaSincronizado) => void;
  };
  plan: {
    current: (typeof PLAN_OPTIONS)[number];
    onChange: (value: (typeof PLAN_OPTIONS)[number]) => void;
  };
  billing: {
    current: (typeof PAYMENT_CARD_OPTIONS)[number];
    onChange: (value: (typeof PAYMENT_CARD_OPTIONS)[number]) => void;
  };
  email: {
    draft: string;
    perfilNome: string;
    telefone: string;
    emailAtualConta: string;
    emailLogin: string;
    session: SessionSnapshot | null;
    onSetEmailAtualConta: (value: string) => void;
    onAtualizarPerfilContaNoBackend: (
      accessToken: string,
      payload: { nomeCompleto: string; email: string; telefone: string },
    ) => Promise<PerfilContaSincronizado>;
    onAplicarPerfilSincronizado: (perfil: PerfilContaSincronizado) => void;
  };
  password: {
    senhaAtualDraft: string;
    novaSenhaDraft: string;
    confirmarSenhaDraft: string;
    session: SessionSnapshot | null;
    onAtualizarSenhaContaNoBackend: (
      accessToken: string,
      payload: {
        senhaAtual: string;
        novaSenha: string;
        confirmarSenha: string;
      },
    ) => Promise<string>;
    onSetSenhaAtualDraft: (value: string) => void;
    onSetNovaSenhaDraft: (value: string) => void;
    onSetConfirmarSenhaDraft: (value: string) => void;
  };
  support: {
    session: SessionSnapshot | null;
    profileName: string;
    workspaceName: string;
    accessLevelLabel: string;
    currentDeviceLabel: string;
    emailAtualConta: string;
    emailLogin: string;
    statusApi: string;
    bugDescriptionDraft: string;
    bugEmailDraft: string;
    bugAttachmentDraft: ComposerAttachment | null;
    feedbackDraft: string;
    onSetFilaSuporteLocal: (
      updater: (current: SupportQueueItem[]) => SupportQueueItem[],
    ) => void;
    onSetBugDescriptionDraft: (value: string) => void;
    onSetBugEmailDraft: (value: string) => void;
    onSetBugAttachmentDraft: (value: ComposerAttachment | null) => void;
    onSetFeedbackDraft: (value: string) => void;
    onEnviarRelatoSuporteNoBackend: (
      accessToken: string,
      payload: {
        tipo: "bug" | "feedback";
        titulo: string;
        mensagem: string;
        emailRetorno: string;
        contexto: string;
        anexoNome?: string;
      },
    ) => Promise<SupportBackendResponse>;
  };
  updates: {
    onPingApi: () => Promise<boolean>;
    onSetStatusApi: (value: "online" | "offline") => void;
    onSetUltimaVerificacaoAtualizacao: (value: string) => void;
    onSetStatusAtualizacaoApp: (value: string) => void;
  };
  exports: {
    onCompartilharTextoExportado: (payload: {
      extension: "txt";
      content: string;
      prefixo: string;
    }) => Promise<boolean>;
  };
  ui: {
    onSetSettingsSheetLoading: (value: boolean) => void;
    onSetSettingsSheetNotice: (value: string) => void;
    onNotificarConfiguracaoConcluida: (mensagem: string) => void;
    onRegistrarEventoSegurancaLocal: (
      payload: SettingsSecurityEventPayload,
    ) => void;
  };
}

interface ImageLibraryPermissionResult {
  granted: boolean;
  accessPrivileges?: string | null;
}

interface ImageLibraryAsset {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

interface ImageLibraryLaunchResult {
  canceled: boolean;
  assets?: ImageLibraryAsset[] | null;
}

interface HandleSettingsSheetConfirmFlowParams {
  settingsSheet: SettingsSheetState | null;
  delayMs?: number;
  photo: {
    perfilFotoUri: string;
    perfilFotoHint: string;
    session: SessionSnapshot | null;
    onEnviarFotoPerfilNoBackend: (
      accessToken: string,
      payload: { uri: string; nome: string; mimeType?: string },
    ) => Promise<PerfilContaSincronizado>;
    onAplicarPerfilSincronizado: (perfil: PerfilContaSincronizado) => void;
    onSetPerfilFotoUri: (value: string) => void;
    onSetPerfilFotoHint: (value: string) => void;
  };
  delegated: Omit<HandleSettingsSheetDelegatedParams, "kind">;
  onRequestMediaLibraryPermissions: () => Promise<ImageLibraryPermissionResult>;
  onLaunchImageLibrary: () => Promise<ImageLibraryLaunchResult>;
}

export type SettingsSheetConfirmResult = "continue" | "return";

function nextOptionValue<T extends string>(
  current: T,
  options: readonly T[],
): T {
  const currentIndex = options.indexOf(current);
  if (currentIndex === -1) {
    return options[0];
  }
  return options[(currentIndex + 1) % options.length];
}

function emailEhValido(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizarTelefone(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function telefoneEhValido(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function validarSenhaForte(
  senhaAtual: string,
  novaSenha: string,
  confirmarSenha: string,
): string {
  if (!senhaAtual || !novaSenha || !confirmarSenha) {
    return "Preencha senha atual, nova senha e confirmação.";
  }
  if (novaSenha !== confirmarSenha) {
    return "A nova senha e a confirmação precisam ser iguais.";
  }
  if (novaSenha.trim().length < 8) {
    return "A nova senha precisa ter pelo menos 8 caracteres.";
  }
  if (!/[A-Za-z]/.test(novaSenha) || !/\d/.test(novaSenha)) {
    return "Use ao menos uma letra e um número na nova senha.";
  }
  if (senhaAtual === novaSenha) {
    return "A nova senha precisa ser diferente da senha atual.";
  }
  return "";
}

function buildSupportContext({
  support,
  attachmentLabel,
}: {
  support: HandleSettingsSheetDelegatedParams["support"];
  attachmentLabel?: string;
}): string {
  return [
    `App ${APP_VERSION_LABEL} • ${APP_BUILD_CHANNEL}`,
    `Plataforma ${Platform.OS} ${String(Platform.Version || "").trim() || "n/d"}`,
    `API ${support.statusApi}`,
    `Workspace ${support.workspaceName || "Sem empresa"}`,
    `Acesso ${support.accessLevelLabel || "Conta autenticada"}`,
    `Usuário ${support.profileName || "Inspetor"}`,
    `Dispositivo ${support.currentDeviceLabel || "Dispositivo atual"}`,
    attachmentLabel ? `Anexo ${attachmentLabel}` : "",
  ]
    .filter(Boolean)
    .join(" • ");
}

export async function handleSettingsSheetConfirmFlow({
  settingsSheet,
  delayMs = 420,
  photo,
  delegated,
  onRequestMediaLibraryPermissions,
  onLaunchImageLibrary,
}: HandleSettingsSheetConfirmFlowParams): Promise<void> {
  if (!settingsSheet) {
    return;
  }

  delegated.ui.onSetSettingsSheetLoading(true);

  await new Promise((resolve) => setTimeout(resolve, delayMs));

  if (settingsSheet.kind === "photo") {
    try {
      const permissao = await onRequestMediaLibraryPermissions();
      if (!permissao.granted && permissao.accessPrivileges !== "limited") {
        delegated.ui.onSetSettingsSheetLoading(false);
        delegated.ui.onSetSettingsSheetNotice(
          "Permita acesso às imagens para atualizar a foto de perfil.",
        );
        return;
      }

      const resultado = await onLaunchImageLibrary();
      if (resultado.canceled || !resultado.assets?.length) {
        delegated.ui.onSetSettingsSheetLoading(false);
        delegated.ui.onSetSettingsSheetNotice(
          "Seleção cancelada. Escolha uma imagem para atualizar o perfil.",
        );
        return;
      }

      const asset = resultado.assets[0];
      const mimeType =
        typeof asset?.mimeType === "string" && asset.mimeType.trim()
          ? asset.mimeType.trim()
          : "image/jpeg";
      if (!mimeType.startsWith("image/")) {
        delegated.ui.onSetSettingsSheetLoading(false);
        delegated.ui.onSetSettingsSheetNotice(
          "Escolha um arquivo de imagem válido para a foto de perfil.",
        );
        return;
      }
      if (
        typeof asset?.fileSize === "number" &&
        asset.fileSize > 5 * 1024 * 1024
      ) {
        delegated.ui.onSetSettingsSheetLoading(false);
        delegated.ui.onSetSettingsSheetNotice(
          "A foto de perfil precisa ter no máximo 5 MB.",
        );
        return;
      }
      if (!photo.session) {
        delegated.ui.onSetSettingsSheetLoading(false);
        delegated.ui.onSetSettingsSheetNotice(
          "A sessão atual não permite enviar a foto de perfil agora.",
        );
        return;
      }

      const nomeArquivo =
        typeof asset?.fileName === "string" && asset.fileName.trim()
          ? asset.fileName.trim()
          : `perfil-${Date.now()}.jpg`;
      const fotoAnterior = photo.perfilFotoUri;
      const hintAnterior = photo.perfilFotoHint;

      try {
        const perfilSincronizado = await photo.onEnviarFotoPerfilNoBackend(
          photo.session.accessToken,
          {
            uri: asset.uri,
            nome: nomeArquivo,
            mimeType,
          },
        );
        photo.onAplicarPerfilSincronizado(perfilSincronizado);
        delegated.ui.onNotificarConfiguracaoConcluida(
          "Foto atualizada e sincronizada com a conta.",
        );
      } catch (error) {
        photo.onSetPerfilFotoUri(fotoAnterior);
        photo.onSetPerfilFotoHint(hintAnterior);
        delegated.ui.onSetSettingsSheetLoading(false);
        delegated.ui.onSetSettingsSheetNotice(
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar a foto agora.",
        );
        return;
      }

      delegated.ui.onSetSettingsSheetLoading(false);
      return;
    } catch (error) {
      delegated.ui.onSetSettingsSheetLoading(false);
      delegated.ui.onSetSettingsSheetNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a foto agora.",
      );
      return;
    }
  }

  const delegatedResult = await handleSettingsSheetConfirmDelegated({
    ...delegated,
    kind: settingsSheet.kind,
  });
  if (delegatedResult === "return") {
    return;
  }

  delegated.ui.onSetSettingsSheetLoading(false);
}

export async function handleSettingsSheetConfirmDelegated({
  kind,
  profile,
  plan,
  billing,
  email,
  password,
  support,
  updates,
  exports,
  ui,
}: HandleSettingsSheetDelegatedParams): Promise<SettingsSheetConfirmResult> {
  switch (kind) {
    case "profile": {
      const nomeCompleto = profile.nomeCompletoDraft.trim();
      const nomeExibicao = profile.nomeExibicaoDraft.trim();
      const telefone = normalizarTelefone(profile.telefoneDraft);

      if (!nomeCompleto) {
        ui.onSetSettingsSheetLoading(false);
        ui.onSetSettingsSheetNotice(
          "Informe o nome completo antes de salvar o perfil.",
        );
        return "return";
      }
      if (!nomeExibicao) {
        ui.onSetSettingsSheetLoading(false);
        ui.onSetSettingsSheetNotice(
          "Informe o nome de exibição antes de salvar o perfil.",
        );
        return "return";
      }
      if (telefone && !telefoneEhValido(telefone)) {
        ui.onSetSettingsSheetLoading(false);
        ui.onSetSettingsSheetNotice(
          "Informe um telefone válido com DDD para salvar o perfil.",
        );
        return "return";
      }
      if (
        nomeCompleto === profile.currentNomeCompleto.trim() &&
        nomeExibicao === profile.currentNomeExibicao.trim() &&
        telefone === normalizarTelefone(profile.currentTelefone)
      ) {
        ui.onSetSettingsSheetLoading(false);
        ui.onSetSettingsSheetNotice(
          "Nenhuma alteração nova foi encontrada no perfil.",
        );
        return "return";
      }

      if (profile.session) {
        try {
          const perfilSincronizado =
            await profile.onAtualizarPerfilContaNoBackend(
              profile.session.accessToken,
              {
                nomeCompleto,
                email: profile.session.bootstrap.usuario.email || "",
                telefone,
              },
            );
          profile.onAplicarPerfilSincronizado(perfilSincronizado);
          profile.onAplicarPerfilLocal({
            nomeCompleto: perfilSincronizado.nomeCompleto,
            nomeExibicao,
            telefone: perfilSincronizado.telefone,
          });
          ui.onNotificarConfiguracaoConcluida(
            "Perfil atualizado e sincronizado com a conta.",
          );
        } catch (error) {
          ui.onSetSettingsSheetLoading(false);
          ui.onSetSettingsSheetNotice(
            error instanceof Error
              ? error.message
              : "Não foi possível atualizar o perfil agora.",
          );
          return "return";
        }
      } else {
        profile.onAplicarPerfilLocal({
          nomeCompleto,
          nomeExibicao,
          telefone,
        });
        ui.onNotificarConfiguracaoConcluida(
          "Perfil atualizado neste dispositivo.",
        );
      }

      ui.onRegistrarEventoSegurancaLocal({
        title: "Perfil atualizado",
        meta: `${nomeExibicao} • ${telefone || "Sem telefone"}`,
        status: "Agora",
        type: "data",
      });
      return "continue";
    }
    case "plan": {
      const proximoPlano = nextOptionValue(plan.current, PLAN_OPTIONS);
      plan.onChange(proximoPlano);
      ui.onRegistrarEventoSegurancaLocal({
        title: "Plano ajustado no app",
        meta: `Plano selecionado: ${proximoPlano}`,
        status: "Agora",
        type: "data",
      });
      ui.onNotificarConfiguracaoConcluida(
        `Plano atualizado para ${proximoPlano}. O resumo da assinatura já reflete essa mudança neste dispositivo.`,
      );
      return "continue";
    }
    case "billing": {
      const proximoCartao = nextOptionValue(
        billing.current,
        PAYMENT_CARD_OPTIONS,
      );
      billing.onChange(proximoCartao);
      ui.onRegistrarEventoSegurancaLocal({
        title: "Método de pagamento atualizado",
        meta: `Cartão configurado: ${proximoCartao}`,
        status: "Agora",
        type: "data",
      });
      ui.onNotificarConfiguracaoConcluida(
        `Método de pagamento atualizado para ${proximoCartao}.`,
      );
      return "continue";
    }
    case "email": {
      if (!emailEhValido(email.draft)) {
        ui.onSetSettingsSheetLoading(false);
        ui.onSetSettingsSheetNotice(
          "Digite um e-mail válido para salvar a conta.",
        );
        return "return";
      }
      const emailAtualizado = email.draft.trim().toLowerCase();
      if (
        emailAtualizado ===
        (email.emailAtualConta || email.emailLogin || "").trim().toLowerCase()
      ) {
        ui.onSetSettingsSheetLoading(false);
        ui.onSetSettingsSheetNotice(
          "Esse e-mail já está configurado como principal.",
        );
        return "return";
      }
      if (email.session) {
        try {
          const perfilSincronizado =
            await email.onAtualizarPerfilContaNoBackend(
              email.session.accessToken,
              {
                nomeCompleto:
                  email.perfilNome.trim() ||
                  email.session.bootstrap.usuario.nome_completo ||
                  "Inspetor Tariel",
                email: emailAtualizado,
                telefone:
                  email.telefone.trim() ||
                  email.session.bootstrap.usuario.telefone ||
                  "",
              },
            );
          email.onAplicarPerfilSincronizado(perfilSincronizado);
          ui.onNotificarConfiguracaoConcluida(
            "E-mail atualizado e sincronizado com a conta.",
          );
        } catch (error) {
          ui.onSetSettingsSheetLoading(false);
          ui.onSetSettingsSheetNotice(
            error instanceof Error
              ? error.message
              : "Não foi possível atualizar o e-mail agora.",
          );
          return "return";
        }
      } else {
        email.onSetEmailAtualConta(emailAtualizado);
        ui.onNotificarConfiguracaoConcluida(
          "E-mail atualizado neste dispositivo.",
        );
      }
      ui.onRegistrarEventoSegurancaLocal({
        title: "E-mail atualizado",
        meta: emailAtualizado,
        status: "Agora",
        type: "data",
      });
      return "continue";
    }
    case "password": {
      const erroSenha = validarSenhaForte(
        password.senhaAtualDraft,
        password.novaSenhaDraft,
        password.confirmarSenhaDraft,
      );
      if (erroSenha) {
        ui.onSetSettingsSheetLoading(false);
        ui.onSetSettingsSheetNotice(erroSenha);
        return "return";
      }
      ui.onRegistrarEventoSegurancaLocal({
        title: "Troca de senha iniciada",
        meta: "Reautenticação local concluída",
        status: "Agora",
        type: "session",
        critical: true,
      });
      if (password.session) {
        try {
          const mensagem = await password.onAtualizarSenhaContaNoBackend(
            password.session.accessToken,
            {
              senhaAtual: password.senhaAtualDraft,
              novaSenha: password.novaSenhaDraft,
              confirmarSenha: password.confirmarSenhaDraft,
            },
          );
          ui.onNotificarConfiguracaoConcluida(mensagem);
        } catch (error) {
          ui.onSetSettingsSheetLoading(false);
          ui.onSetSettingsSheetNotice(
            error instanceof Error
              ? error.message
              : "Não foi possível atualizar a senha agora.",
          );
          return "return";
        }
      } else {
        ui.onNotificarConfiguracaoConcluida(
          "Nova senha validada no app. A confirmação completa seguirá a política de segurança da conta vinculada.",
        );
      }
      password.onSetSenhaAtualDraft("");
      password.onSetNovaSenhaDraft("");
      password.onSetConfirmarSenhaDraft("");
      return "continue";
    }
    case "bug": {
      if (!support.bugDescriptionDraft.trim()) {
        ui.onSetSettingsSheetLoading(false);
        ui.onSetSettingsSheetNotice("Descreva o problema antes de enviar.");
        return "return";
      }
      if (
        support.bugEmailDraft.trim() &&
        !emailEhValido(support.bugEmailDraft)
      ) {
        ui.onSetSettingsSheetLoading(false);
        ui.onSetSettingsSheetNotice(
          "Informe um e-mail válido para retorno ou deixe o campo em branco.",
        );
        return "return";
      }
      const attachmentLabel = support.bugAttachmentDraft
        ? support.bugAttachmentDraft.kind === "image"
          ? support.bugAttachmentDraft.label
          : support.bugAttachmentDraft.nomeDocumento
        : "";
      const attachmentUri = support.bugAttachmentDraft
        ? support.bugAttachmentDraft.kind === "image"
          ? support.bugAttachmentDraft.previewUri
          : support.bugAttachmentDraft.fileUri
        : "";
      const item: SupportQueueItem = {
        id: `support-${Date.now()}`,
        kind: "bug",
        title: "Relato de bug do inspetor",
        body: support.bugDescriptionDraft.trim(),
        email:
          support.bugEmailDraft.trim() ||
          support.emailAtualConta ||
          support.emailLogin ||
          "",
        createdAt: new Date().toISOString(),
        status: "Na fila local",
        attachmentKind: support.bugAttachmentDraft?.kind,
        attachmentLabel: attachmentLabel || undefined,
        attachmentUri: attachmentUri || undefined,
      };
      support.onSetFilaSuporteLocal((current) =>
        [item, ...current].slice(0, 12),
      );
      ui.onRegistrarEventoSegurancaLocal({
        title: "Relato de bug registrado",
        meta: `${item.status} • ${item.email || "Sem email de retorno"}${item.attachmentLabel ? ` • anexo: ${item.attachmentLabel}` : ""}`,
        status: "Agora",
        type: "data",
      });
      let mensagemSucesso = `Bug salvo na fila local da Tariel.ia com protocolo ${item.id.slice(-6).toUpperCase()}.`;
      if (support.session) {
        try {
          const resposta = await support.onEnviarRelatoSuporteNoBackend(
            support.session.accessToken,
            {
              tipo: "bug",
              titulo: item.title,
              mensagem: item.body,
              emailRetorno: item.email,
              contexto: buildSupportContext({
                support,
                attachmentLabel: item.attachmentLabel,
              }),
              anexoNome: item.attachmentLabel || "",
            },
          );
          support.onSetFilaSuporteLocal((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: `${resposta.status} • ${resposta.protocolo}`,
                  }
                : entry,
            ),
          );
          mensagemSucesso = `Bug enviado ao backend (${resposta.protocolo}) e salvo localmente para rastreio.`;
        } catch (error) {
          mensagemSucesso = `Bug salvo na fila local. Falha no envio ao backend: ${error instanceof Error ? error.message : "indisponível agora."}`;
        }
      }
      ui.onNotificarConfiguracaoConcluida(mensagemSucesso);
      support.onSetBugDescriptionDraft("");
      support.onSetBugEmailDraft("");
      support.onSetBugAttachmentDraft(null);
      return "continue";
    }
    case "feedback": {
      if (!support.feedbackDraft.trim()) {
        ui.onSetSettingsSheetLoading(false);
        ui.onSetSettingsSheetNotice("Escreva uma sugestão antes de enviar.");
        return "return";
      }
      const item: SupportQueueItem = {
        id: `support-${Date.now()}`,
        kind: "feedback",
        title: "Sugestão do inspetor",
        body: support.feedbackDraft.trim(),
        email: support.emailAtualConta || support.emailLogin || "",
        createdAt: new Date().toISOString(),
        status: "Aguardando triagem",
      };
      support.onSetFilaSuporteLocal((current) =>
        [item, ...current].slice(0, 12),
      );
      ui.onRegistrarEventoSegurancaLocal({
        title: "Feedback registrado",
        meta: `${item.status} • canal interno`,
        status: "Agora",
        type: "data",
      });
      let mensagemSucesso =
        "Sugestão salva na fila local. Obrigado por ajudar a evoluir o app.";
      if (support.session) {
        try {
          const resposta = await support.onEnviarRelatoSuporteNoBackend(
            support.session.accessToken,
            {
              tipo: "feedback",
              titulo: item.title,
              mensagem: item.body,
              emailRetorno: item.email,
              contexto: buildSupportContext({ support }),
            },
          );
          support.onSetFilaSuporteLocal((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: `${resposta.status} • ${resposta.protocolo}`,
                  }
                : entry,
            ),
          );
          mensagemSucesso = `Feedback enviado ao backend (${resposta.protocolo}) e salvo localmente.`;
        } catch (error) {
          mensagemSucesso = `Feedback salvo localmente. Falha no envio ao backend: ${error instanceof Error ? error.message : "indisponível agora."}`;
        }
      }
      ui.onNotificarConfiguracaoConcluida(mensagemSucesso);
      support.onSetFeedbackDraft("");
      return "continue";
    }
    case "updates": {
      const agora = new Date().toISOString();
      const online = await updates.onPingApi();
      updates.onSetStatusApi(online ? "online" : "offline");
      const statusAtual = online
        ? "Verificação concluída com sucesso. Nenhuma atualização obrigatória foi encontrada agora."
        : "Sem conexão no momento. Mantendo o último status local conhecido.";
      updates.onSetUltimaVerificacaoAtualizacao(agora);
      updates.onSetStatusAtualizacaoApp(statusAtual);
      ui.onRegistrarEventoSegurancaLocal({
        title: "Atualizações verificadas",
        meta: statusAtual,
        status: "Agora",
        type: "session",
      });
      ui.onNotificarConfiguracaoConcluida(statusAtual);
      return "continue";
    }
    case "terms": {
      const conteudo = [
        "Tariel Inspetor - Termos de uso (resumo)",
        `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
        "",
        ...TERMS_OF_USE_SECTIONS.flatMap((item) => [
          `${item.title}`,
          item.body,
          "",
        ]),
      ].join("\n");
      const exportado = await exports.onCompartilharTextoExportado({
        extension: "txt",
        content: conteudo,
        prefixo: "tariel-termos-uso",
      });
      if (exportado) {
        ui.onNotificarConfiguracaoConcluida(
          "Resumo dos termos exportado em TXT.",
        );
      } else {
        ui.onSetSettingsSheetNotice(
          "Não foi possível exportar os termos agora.",
        );
      }
      return "continue";
    }
    case "licenses": {
      const conteudo = [
        "Tariel Inspetor - Licenças",
        `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
        "",
        ...LICENSES_CATALOG.flatMap((item) => [
          `${item.name} • ${item.license}`,
          item.source,
          "",
        ]),
      ].join("\n");
      const exportado = await exports.onCompartilharTextoExportado({
        extension: "txt",
        content: conteudo,
        prefixo: "tariel-licencas",
      });
      if (exportado) {
        ui.onNotificarConfiguracaoConcluida(
          "Catálogo de licenças exportado em TXT.",
        );
      } else {
        ui.onSetSettingsSheetNotice(
          "Não foi possível exportar as licenças agora.",
        );
      }
      return "continue";
    }
    default:
      ui.onNotificarConfiguracaoConcluida(
        "Ajuste salvo no app. Você pode continuar com a próxima revisão quando quiser.",
      );
      return "continue";
  }
}
