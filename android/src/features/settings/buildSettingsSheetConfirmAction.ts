import * as ImagePicker from "expo-image-picker";

import {
  applyLocalProfileState,
  applySyncedProfileState,
} from "./profileState";
import { handleSettingsSheetConfirmFlow } from "./settingsSheetConfirmActions";

type Setter = (...args: any[]) => void;

interface BuildSettingsSheetConfirmActionParams {
  bugAttachmentDraft: any;
  bugDescriptionDraft: string;
  bugEmailDraft: string;
  cartaoAtual: any;
  confirmarSenhaDraft: any;
  contaTelefone: string;
  email: string;
  emailAtualConta: string;
  enviarFotoPerfilNoBackend: (...args: any[]) => Promise<any>;
  enviarRelatoSuporteNoBackend: (...args: any[]) => Promise<any>;
  feedbackDraft: string;
  handleConfirmarSettingsSheetReauth: () => Promise<boolean>;
  compartilharTextoExportado: (...args: any[]) => Promise<boolean>;
  nomeCompletoDraft: string;
  nomeExibicaoDraft: string;
  notificarConfiguracaoConcluida: (message: string) => void;
  novaSenhaDraft: string;
  novoEmailDraft: string;
  onRegistrarEventoSegurancaLocal: (evento: any) => void;
  onSetBugAttachmentDraft: Setter;
  onSetBugDescriptionDraft: Setter;
  onSetBugEmailDraft: Setter;
  onSetCartaoAtual: Setter;
  onSetConfirmarSenhaDraft: Setter;
  onSetEmailAtualConta: Setter;
  onSetFeedbackDraft: Setter;
  onSetFilaSuporteLocal: Setter;
  onSetNomeCompletoDraft: Setter;
  onSetNomeExibicaoDraft: Setter;
  onSetNovaSenhaDraft: Setter;
  onSetPerfilExibicao: Setter;
  onSetPerfilFotoHint: Setter;
  onSetPerfilFotoUri: Setter;
  onSetPerfilNome: Setter;
  onSetPlanoAtual: Setter;
  onSetProvedoresConectados: Setter;
  onSetSenhaAtualDraft: Setter;
  onSetSession: Setter;
  onSetSettingsSheetLoading: Setter;
  onSetSettingsSheetNotice: Setter;
  onSetStatusApi: Setter;
  onSetStatusAtualizacaoApp: Setter;
  onSetTelefoneDraft: Setter;
  onSetUltimaVerificacaoAtualizacao: Setter;
  onUpdateAccountPhone: Setter;
  onAtualizarPerfilContaNoBackend: (...args: any[]) => Promise<any>;
  onAtualizarSenhaContaNoBackend: (...args: any[]) => Promise<any>;
  onPingApi: () => Promise<boolean>;
  perfilExibicao: string;
  perfilFotoHint: string;
  perfilFotoUri: string;
  perfilNome: string;
  planoAtual: any;
  senhaAtualDraft: any;
  session: any;
  sessaoAtual: any;
  settingsSheet: any;
  statusApi: string;
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
  const aplicarPerfilSincronizado = (perfil: any) =>
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
          onAplicarPerfilLocal: (payload: any) =>
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
