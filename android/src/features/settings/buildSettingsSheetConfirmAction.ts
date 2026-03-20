import * as ImagePicker from "expo-image-picker";
import type { Dispatch, SetStateAction } from "react";

import type { ApiHealthStatus } from "../../types/mobile";
import {
  PAYMENT_CARD_OPTIONS,
  PLAN_OPTIONS,
} from "../InspectorMobileApp.constants";
import type { ComposerAttachment } from "../chat/types";
import {
  applyLocalProfileState,
  applySyncedProfileState,
} from "./profileState";
import type { MobileSessionState } from "../session/sessionTypes";
import type {
  AtualizarPerfilContaPayload,
  AtualizarSenhaContaPayload,
  PerfilContaSincronizado,
  RelatoSuportePayload,
  UploadFotoPerfilPayload,
} from "./settingsBackend";
import { handleSettingsSheetConfirmFlow } from "./settingsSheetConfirmActions";
import type { SettingsSecurityEventPayload } from "./settingsConfirmActions";
import type { SettingsSheetState } from "./settingsSheetTypes";
import type {
  ConnectedProvider,
  SessionDevice,
  SupportQueueItem,
} from "./useSettingsPresentation";

interface BuildSettingsSheetConfirmActionParams {
  bugAttachmentDraft: ComposerAttachment | null;
  bugDescriptionDraft: string;
  bugEmailDraft: string;
  cartaoAtual: (typeof PAYMENT_CARD_OPTIONS)[number];
  confirmarSenhaDraft: string;
  contaTelefone: string;
  email: string;
  emailAtualConta: string;
  enviarFotoPerfilNoBackend: (
    accessToken: string,
    payload: UploadFotoPerfilPayload,
  ) => Promise<PerfilContaSincronizado>;
  enviarRelatoSuporteNoBackend: (
    accessToken: string,
    payload: RelatoSuportePayload,
  ) => Promise<{ status: string; protocolo: string }>;
  feedbackDraft: string;
  handleConfirmarSettingsSheetReauth: () => Promise<boolean>;
  compartilharTextoExportado: (payload: {
    extension: "txt";
    content: string;
    prefixo: string;
  }) => Promise<boolean>;
  nomeCompletoDraft: string;
  nomeExibicaoDraft: string;
  notificarConfiguracaoConcluida: (message: string) => void;
  novaSenhaDraft: string;
  novoEmailDraft: string;
  onRegistrarEventoSegurancaLocal: (
    evento: SettingsSecurityEventPayload,
  ) => void;
  onSetBugAttachmentDraft: Dispatch<SetStateAction<ComposerAttachment | null>>;
  onSetBugDescriptionDraft: Dispatch<SetStateAction<string>>;
  onSetBugEmailDraft: Dispatch<SetStateAction<string>>;
  onSetCartaoAtual: Dispatch<
    SetStateAction<(typeof PAYMENT_CARD_OPTIONS)[number]>
  >;
  onSetConfirmarSenhaDraft: Dispatch<SetStateAction<string>>;
  onSetEmailAtualConta: (value: string) => void;
  onSetFeedbackDraft: Dispatch<SetStateAction<string>>;
  onSetFilaSuporteLocal: Dispatch<SetStateAction<SupportQueueItem[]>>;
  onSetNomeCompletoDraft: Dispatch<SetStateAction<string>>;
  onSetNomeExibicaoDraft: Dispatch<SetStateAction<string>>;
  onSetNovaSenhaDraft: Dispatch<SetStateAction<string>>;
  onSetPerfilExibicao: (value: string) => void;
  onSetPerfilFotoHint: (value: string) => void;
  onSetPerfilFotoUri: (value: string) => void;
  onSetPerfilNome: (value: string) => void;
  onSetPlanoAtual: Dispatch<SetStateAction<(typeof PLAN_OPTIONS)[number]>>;
  onSetProvedoresConectados: Dispatch<SetStateAction<ConnectedProvider[]>>;
  onSetSenhaAtualDraft: Dispatch<SetStateAction<string>>;
  onSetSession: Dispatch<SetStateAction<MobileSessionState | null>>;
  onSetSettingsSheetLoading: Dispatch<SetStateAction<boolean>>;
  onSetSettingsSheetNotice: Dispatch<SetStateAction<string>>;
  onSetStatusApi: (value: ApiHealthStatus) => void;
  onSetStatusAtualizacaoApp: Dispatch<SetStateAction<string>>;
  onSetTelefoneDraft: Dispatch<SetStateAction<string>>;
  onSetUltimaVerificacaoAtualizacao: Dispatch<SetStateAction<string>>;
  onUpdateAccountPhone: (value: string) => void;
  onAtualizarPerfilContaNoBackend: (
    accessToken: string,
    payload: AtualizarPerfilContaPayload,
  ) => Promise<PerfilContaSincronizado>;
  onAtualizarSenhaContaNoBackend: (
    accessToken: string,
    payload: AtualizarSenhaContaPayload,
  ) => Promise<string>;
  onPingApi: () => Promise<boolean>;
  perfilExibicao: string;
  perfilFotoHint: string;
  perfilFotoUri: string;
  perfilNome: string;
  planoAtual: (typeof PLAN_OPTIONS)[number];
  senhaAtualDraft: string;
  session: MobileSessionState | null;
  sessaoAtual: SessionDevice | null;
  settingsSheet: SettingsSheetState | null;
  statusApi: ApiHealthStatus;
  telefoneDraft: string;
  workspaceResumoConfiguracao: string;
}

export function buildSettingsSheetConfirmAction({
  bugAttachmentDraft,
  bugDescriptionDraft,
  bugEmailDraft,
  cartaoAtual,
  confirmarSenhaDraft,
  contaTelefone,
  email,
  emailAtualConta,
  enviarFotoPerfilNoBackend,
  enviarRelatoSuporteNoBackend,
  feedbackDraft,
  handleConfirmarSettingsSheetReauth,
  compartilharTextoExportado,
  nomeCompletoDraft,
  nomeExibicaoDraft,
  notificarConfiguracaoConcluida,
  novaSenhaDraft,
  novoEmailDraft,
  onRegistrarEventoSegurancaLocal,
  onSetBugAttachmentDraft,
  onSetBugDescriptionDraft,
  onSetBugEmailDraft,
  onSetCartaoAtual,
  onSetConfirmarSenhaDraft,
  onSetEmailAtualConta,
  onSetFeedbackDraft,
  onSetFilaSuporteLocal,
  onSetNomeCompletoDraft,
  onSetNomeExibicaoDraft,
  onSetNovaSenhaDraft,
  onSetPerfilExibicao,
  onSetPerfilFotoHint,
  onSetPerfilFotoUri,
  onSetPerfilNome,
  onSetPlanoAtual,
  onSetProvedoresConectados,
  onSetSenhaAtualDraft,
  onSetSession,
  onSetSettingsSheetLoading,
  onSetSettingsSheetNotice,
  onSetStatusApi,
  onSetStatusAtualizacaoApp,
  onSetTelefoneDraft,
  onSetUltimaVerificacaoAtualizacao,
  onUpdateAccountPhone,
  onAtualizarPerfilContaNoBackend,
  onAtualizarSenhaContaNoBackend,
  onPingApi,
  perfilExibicao,
  perfilFotoHint,
  perfilFotoUri,
  perfilNome,
  planoAtual,
  senhaAtualDraft,
  session,
  sessaoAtual,
  settingsSheet,
  statusApi,
  telefoneDraft,
  workspaceResumoConfiguracao,
}: BuildSettingsSheetConfirmActionParams) {
  const aplicarPerfilSincronizado = (perfil: PerfilContaSincronizado) =>
    applySyncedProfileState({
      perfil,
      onSetPerfilNome,
      onSetPerfilExibicao,
      onSetEmailAtualConta,
      onUpdateAccountPhone,
      onSetPerfilFotoUri,
      onSetPerfilFotoHint,
      onSetSession,
      onSetProvedoresConectados,
    });

  return async function handleConfirmarSettingsSheet() {
    if (await handleConfirmarSettingsSheetReauth()) {
      return;
    }

    await handleSettingsSheetConfirmFlow({
      settingsSheet,
      photo: {
        perfilFotoUri,
        perfilFotoHint,
        session,
        onAplicarPerfilSincronizado: aplicarPerfilSincronizado,
        onEnviarFotoPerfilNoBackend: enviarFotoPerfilNoBackend,
        onSetPerfilFotoHint,
        onSetPerfilFotoUri,
      },
      delegated: {
        profile: {
          currentNomeCompleto: perfilNome,
          currentNomeExibicao: perfilExibicao,
          currentTelefone: contaTelefone,
          nomeCompletoDraft,
          nomeExibicaoDraft,
          onAplicarPerfilLocal: (payload) =>
            applyLocalProfileState({
              payload,
              onSetPerfilNome,
              onSetPerfilExibicao,
              onUpdateAccountPhone,
            }),
          onAplicarPerfilSincronizado: aplicarPerfilSincronizado,
          onAtualizarPerfilContaNoBackend,
          onSetNomeCompletoDraft,
          onSetNomeExibicaoDraft,
          onSetTelefoneDraft,
          session,
          telefoneDraft,
        },
        billing: {
          current: cartaoAtual,
          onChange: onSetCartaoAtual,
        },
        email: {
          draft: novoEmailDraft,
          emailAtualConta,
          emailLogin: email,
          onAplicarPerfilSincronizado: aplicarPerfilSincronizado,
          onAtualizarPerfilContaNoBackend,
          onSetEmailAtualConta,
          perfilNome,
          telefone: contaTelefone,
          session,
        },
        exports: {
          onCompartilharTextoExportado: compartilharTextoExportado,
        },
        password: {
          confirmarSenhaDraft,
          novaSenhaDraft,
          onAtualizarSenhaContaNoBackend,
          onSetConfirmarSenhaDraft,
          onSetNovaSenhaDraft,
          onSetSenhaAtualDraft,
          senhaAtualDraft,
          session,
        },
        plan: {
          current: planoAtual,
          onChange: onSetPlanoAtual,
        },
        support: {
          bugAttachmentDraft,
          bugDescriptionDraft,
          bugEmailDraft,
          currentDeviceLabel: sessaoAtual?.title || "Dispositivo atual",
          emailAtualConta,
          emailLogin: email,
          feedbackDraft,
          accessLevelLabel:
            typeof session?.bootstrap?.usuario?.nivel_acesso === "number"
              ? `Nível ${session.bootstrap.usuario.nivel_acesso}`
              : "Conta autenticada",
          onEnviarRelatoSuporteNoBackend: enviarRelatoSuporteNoBackend,
          onSetBugAttachmentDraft,
          onSetBugDescriptionDraft,
          onSetBugEmailDraft,
          onSetFeedbackDraft,
          onSetFilaSuporteLocal,
          profileName: perfilExibicao || perfilNome || "Inspetor Tariel",
          session,
          statusApi,
          workspaceName: workspaceResumoConfiguracao,
        },
        ui: {
          onNotificarConfiguracaoConcluida: notificarConfiguracaoConcluida,
          onRegistrarEventoSegurancaLocal,
          onSetSettingsSheetLoading,
          onSetSettingsSheetNotice,
        },
        updates: {
          onPingApi,
          onSetStatusApi,
          onSetStatusAtualizacaoApp,
          onSetUltimaVerificacaoAtualizacao,
        },
      },
      onRequestMediaLibraryPermissions:
        ImagePicker.requestMediaLibraryPermissionsAsync,
      onLaunchImageLibrary: () =>
        ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        }),
    });
  };
}
