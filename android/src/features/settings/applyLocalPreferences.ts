import {
  ACCENT_OPTIONS,
  AI_MODEL_OPTIONS,
  APP_LANGUAGE_OPTIONS,
  BATTERY_OPTIONS,
  CONVERSATION_TONE_OPTIONS,
  DATA_RETENTION_OPTIONS,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  LOCK_TIMEOUT_OPTIONS,
  NOTIFICATION_SOUND_OPTIONS,
  PAYMENT_CARD_OPTIONS,
  PLAN_OPTIONS,
  REGION_OPTIONS,
  RESPONSE_LANGUAGE_OPTIONS,
  RESPONSE_STYLE_OPTIONS,
  THEME_OPTIONS,
  TWO_FACTOR_METHOD_OPTIONS,
} from "../InspectorMobileApp.constants";
import type { AppSettings } from "../../settings/schema/types";
import type { ComposerAttachment } from "../chat/types";
import type {
  ConnectedProvider,
  ExternalIntegration,
  SecurityEventItem,
  SessionDevice,
  SupportQueueItem,
} from "./useSettingsPresentation";
import type { OptionValidator, ValueSetter } from "./settingsBuilderTypes";

type ApplyLocalPreferencesInput = Record<string, unknown>;
interface ApplyLocalPreferencesDeps {
  ehOpcaoValida: OptionValidator;
  formatarStatusReautenticacao: (value: string) => string;
  normalizarEventoSeguranca: (value: unknown) => SecurityEventItem | null;
  normalizarIntegracaoExterna: (value: unknown) => ExternalIntegration | null;
  normalizarItemSuporte: (value: unknown) => SupportQueueItem | null;
  normalizarProviderConectado: (value: unknown) => ConnectedProvider | null;
  normalizarSessaoAtiva: (value: unknown) => SessionDevice | null;
  reautenticacaoAindaValida: (value: string) => boolean;
  reconciliarIntegracoesExternas: (
    items: ExternalIntegration[],
  ) => ExternalIntegration[];
  setAnimacoesAtivas: ValueSetter<
    AppSettings["appearance"]["animationsEnabled"]
  >;
  setAprendizadoIa: ValueSetter<AppSettings["ai"]["learningOptIn"]>;
  setArquivosPermitidos: ValueSetter<
    AppSettings["security"]["filesPermission"]
  >;
  setBackupAutomatico: ValueSetter<
    AppSettings["dataControls"]["deviceBackupEnabled"]
  >;
  setBiometriaPermitida: ValueSetter<
    AppSettings["security"]["biometricsPermission"]
  >;
  setBugAttachmentDraft: ValueSetter<ComposerAttachment | null>;
  setCameraPermitida: ValueSetter<AppSettings["security"]["cameraPermission"]>;
  setCartaoAtual: ValueSetter<(typeof PAYMENT_CARD_OPTIONS)[number]>;
  setCodigosRecuperacao: ValueSetter<string[]>;
  setCompartilharMelhoriaIa: ValueSetter<boolean>;
  setCorDestaque: ValueSetter<AppSettings["appearance"]["accentColor"]>;
  setDensidadeInterface: ValueSetter<AppSettings["appearance"]["density"]>;
  setDeviceBiometricsEnabled: ValueSetter<
    AppSettings["security"]["deviceBiometricsEnabled"]
  >;
  setEconomiaDados: ValueSetter<AppSettings["system"]["dataSaver"]>;
  setEmailAtualConta: ValueSetter<AppSettings["account"]["email"]>;
  setEmailsAtivos: ValueSetter<AppSettings["notifications"]["emailEnabled"]>;
  setEntradaPorVoz: ValueSetter<AppSettings["speech"]["autoTranscribe"]>;
  setEstiloResposta: ValueSetter<AppSettings["ai"]["responseStyle"]>;
  setEventosSeguranca: ValueSetter<SecurityEventItem[]>;
  setFilaSuporteLocal: ValueSetter<SupportQueueItem[]>;
  setFixarConversas: ValueSetter<boolean>;
  setHideInMultitask: ValueSetter<AppSettings["security"]["hideInMultitask"]>;
  setHistoricoOcultoIds: ValueSetter<number[]>;
  setIdiomaApp: ValueSetter<AppSettings["system"]["language"]>;
  setIdiomaResposta: ValueSetter<AppSettings["ai"]["responseLanguage"]>;
  setIntegracoesExternas: ValueSetter<ExternalIntegration[]>;
  setLaudosFixadosIds: ValueSetter<number[]>;
  setLockTimeout: ValueSetter<AppSettings["security"]["lockTimeout"]>;
  setMemoriaIa: ValueSetter<AppSettings["ai"]["memoryEnabled"]>;
  setMicrofonePermitido: ValueSetter<
    AppSettings["security"]["microphonePermission"]
  >;
  setModeloIa: ValueSetter<AppSettings["ai"]["model"]>;
  setMostrarConteudoNotificacao: ValueSetter<
    AppSettings["notifications"]["showMessageContent"]
  >;
  setMostrarSomenteNovaMensagem: ValueSetter<
    AppSettings["notifications"]["onlyShowNewMessage"]
  >;
  setNomeAutomaticoConversas: ValueSetter<boolean>;
  setNotificaPush: ValueSetter<AppSettings["notifications"]["pushEnabled"]>;
  setNotificaRespostas: ValueSetter<
    AppSettings["notifications"]["responseAlertsEnabled"]
  >;
  setNotificacoesPermitidas: ValueSetter<
    AppSettings["security"]["notificationsPermission"]
  >;
  setNovaSenhaDraft: ValueSetter<string>;
  setOcultarConteudoBloqueado: ValueSetter<
    AppSettings["notifications"]["hideContentOnLockScreen"]
  >;
  setPerfilExibicao: ValueSetter<AppSettings["account"]["displayName"]>;
  setPerfilFotoHint: ValueSetter<AppSettings["account"]["photoHint"]>;
  setPerfilFotoUri: ValueSetter<AppSettings["account"]["photoUri"]>;
  setPerfilNome: ValueSetter<AppSettings["account"]["fullName"]>;
  setPlanoAtual: ValueSetter<(typeof PLAN_OPTIONS)[number]>;
  setProvedoresConectados: ValueSetter<ConnectedProvider[]>;
  setReautenticacaoExpiraEm: ValueSetter<string>;
  setReautenticacaoStatus: ValueSetter<string>;
  setRecoveryCodesEnabled: ValueSetter<boolean>;
  setRegiaoApp: ValueSetter<AppSettings["system"]["region"]>;
  setRequireAuthOnOpen: ValueSetter<
    AppSettings["security"]["requireAuthOnOpen"]
  >;
  setRespostaPorVoz: ValueSetter<AppSettings["speech"]["autoReadResponses"]>;
  setRetencaoDados: ValueSetter<AppSettings["dataControls"]["retention"]>;
  setSalvaHistoricoConversas: ValueSetter<
    AppSettings["dataControls"]["chatHistoryEnabled"]
  >;
  setSessoesAtivas: ValueSetter<SessionDevice[]>;
  setSincronizacaoDispositivos: ValueSetter<
    AppSettings["dataControls"]["crossDeviceSyncEnabled"]
  >;
  setSomNotificacao: ValueSetter<AppSettings["notifications"]["soundPreset"]>;
  setStatusAtualizacaoApp: ValueSetter<string>;
  setTamanhoFonte: ValueSetter<AppSettings["appearance"]["fontScale"]>;
  setTemperaturaIa: ValueSetter<AppSettings["ai"]["temperature"]>;
  setTemaApp: ValueSetter<AppSettings["appearance"]["theme"]>;
  setTomConversa: ValueSetter<AppSettings["ai"]["tone"]>;
  setTwoFactorEnabled: ValueSetter<boolean>;
  setTwoFactorMethod: ValueSetter<(typeof TWO_FACTOR_METHOD_OPTIONS)[number]>;
  setUltimaVerificacaoAtualizacao: ValueSetter<string>;
  setUploadArquivosAtivo: ValueSetter<AppSettings["attachments"]["enabled"]>;
  setUsoBateria: ValueSetter<AppSettings["system"]["batteryMode"]>;
  setVibracaoAtiva: ValueSetter<
    AppSettings["notifications"]["vibrationEnabled"]
  >;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

function normalizarBugAttachmentDraft(
  value: unknown,
): ComposerAttachment | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const attachment = value as Partial<ComposerAttachment>;
  if (
    attachment.kind === "image" &&
    typeof attachment.label === "string" &&
    typeof attachment.resumo === "string" &&
    typeof attachment.dadosImagem === "string" &&
    typeof attachment.previewUri === "string" &&
    typeof attachment.fileUri === "string" &&
    typeof attachment.mimeType === "string"
  ) {
    return {
      kind: "image",
      label: attachment.label,
      resumo: attachment.resumo,
      dadosImagem: attachment.dadosImagem,
      previewUri: attachment.previewUri,
      fileUri: attachment.fileUri,
      mimeType: attachment.mimeType,
    };
  }
  if (
    attachment.kind === "document" &&
    typeof attachment.label === "string" &&
    typeof attachment.resumo === "string" &&
    typeof attachment.textoDocumento === "string" &&
    typeof attachment.nomeDocumento === "string" &&
    typeof attachment.chars === "number" &&
    typeof attachment.truncado === "boolean" &&
    typeof attachment.fileUri === "string" &&
    typeof attachment.mimeType === "string"
  ) {
    return {
      kind: "document",
      label: attachment.label,
      resumo: attachment.resumo,
      textoDocumento: attachment.textoDocumento,
      nomeDocumento: attachment.nomeDocumento,
      chars: attachment.chars,
      truncado: attachment.truncado,
      fileUri: attachment.fileUri,
      mimeType: attachment.mimeType,
    };
  }
  return null;
}

export function applyLocalPreferencesFromStorage(
  preferencias: ApplyLocalPreferencesInput,
  deps: ApplyLocalPreferencesDeps,
) {
  const {
    ehOpcaoValida,
    formatarStatusReautenticacao,
    normalizarEventoSeguranca,
    normalizarIntegracaoExterna,
    normalizarItemSuporte,
    normalizarProviderConectado,
    normalizarSessaoAtiva,
    reautenticacaoAindaValida,
    reconciliarIntegracoesExternas,
    setAnimacoesAtivas,
    setAprendizadoIa,
    setArquivosPermitidos,
    setBackupAutomatico,
    setBiometriaPermitida,
    setBugAttachmentDraft,
    setCameraPermitida,
    setCartaoAtual,
    setCodigosRecuperacao,
    setCompartilharMelhoriaIa,
    setCorDestaque,
    setDensidadeInterface,
    setDeviceBiometricsEnabled,
    setEconomiaDados,
    setEmailAtualConta,
    setEmailsAtivos,
    setEntradaPorVoz,
    setEstiloResposta,
    setEventosSeguranca,
    setFilaSuporteLocal,
    setFixarConversas,
    setHideInMultitask,
    setHistoricoOcultoIds,
    setIdiomaApp,
    setIdiomaResposta,
    setIntegracoesExternas,
    setLaudosFixadosIds,
    setLockTimeout,
    setMemoriaIa,
    setMicrofonePermitido,
    setModeloIa,
    setMostrarConteudoNotificacao,
    setMostrarSomenteNovaMensagem,
    setNomeAutomaticoConversas,
    setNotificaPush,
    setNotificaRespostas,
    setNotificacoesPermitidas,
    setNovaSenhaDraft,
    setOcultarConteudoBloqueado,
    setPerfilExibicao,
    setPerfilFotoHint,
    setPerfilFotoUri,
    setPerfilNome,
    setPlanoAtual,
    setProvedoresConectados,
    setReautenticacaoExpiraEm,
    setReautenticacaoStatus,
    setRecoveryCodesEnabled,
    setRegiaoApp,
    setRequireAuthOnOpen,
    setRespostaPorVoz,
    setRetencaoDados,
    setSalvaHistoricoConversas,
    setSessoesAtivas,
    setSincronizacaoDispositivos,
    setSomNotificacao,
    setStatusAtualizacaoApp,
    setTamanhoFonte,
    setTemperaturaIa,
    setTemaApp,
    setTomConversa,
    setTwoFactorEnabled,
    setTwoFactorMethod,
    setUltimaVerificacaoAtualizacao,
    setUploadArquivosAtivo,
    setUsoBateria,
    setVibracaoAtiva,
  } = deps;

  if (typeof preferencias.perfilNome === "string") {
    setPerfilNome(preferencias.perfilNome);
  }
  if (typeof preferencias.perfilExibicao === "string") {
    setPerfilExibicao(preferencias.perfilExibicao);
  }
  if (typeof preferencias.perfilFotoUri === "string") {
    setPerfilFotoUri(preferencias.perfilFotoUri);
  }
  if (typeof preferencias.perfilFotoHint === "string") {
    setPerfilFotoHint(preferencias.perfilFotoHint);
  }
  if (Array.isArray(preferencias.laudosFixadosIds)) {
    setLaudosFixadosIds(
      preferencias.laudosFixadosIds.filter(
        (item): item is number => typeof item === "number",
      ),
    );
  }
  if (Array.isArray(preferencias.historicoOcultoIds)) {
    setHistoricoOcultoIds(
      preferencias.historicoOcultoIds.filter(
        (item): item is number => typeof item === "number",
      ),
    );
  }
  if (ehOpcaoValida(preferencias.planoAtual, PLAN_OPTIONS)) {
    setPlanoAtual(preferencias.planoAtual);
  }
  if (ehOpcaoValida(preferencias.cartaoAtual, PAYMENT_CARD_OPTIONS)) {
    setCartaoAtual(preferencias.cartaoAtual);
  }
  if (ehOpcaoValida(preferencias.modeloIa, AI_MODEL_OPTIONS)) {
    setModeloIa(preferencias.modeloIa);
  }
  if (ehOpcaoValida(preferencias.estiloResposta, RESPONSE_STYLE_OPTIONS)) {
    setEstiloResposta(preferencias.estiloResposta);
  }
  if (ehOpcaoValida(preferencias.idiomaResposta, RESPONSE_LANGUAGE_OPTIONS)) {
    setIdiomaResposta(preferencias.idiomaResposta);
  }
  if (typeof preferencias.memoriaIa === "boolean") {
    setMemoriaIa(preferencias.memoriaIa);
  }
  if (typeof preferencias.aprendizadoIa === "boolean") {
    setAprendizadoIa(preferencias.aprendizadoIa);
  }
  if (ehOpcaoValida(preferencias.tomConversa, CONVERSATION_TONE_OPTIONS)) {
    setTomConversa(preferencias.tomConversa);
  }
  if (
    typeof preferencias.temperaturaIa === "number" &&
    !Number.isNaN(preferencias.temperaturaIa)
  ) {
    setTemperaturaIa(Math.max(0, Math.min(1, preferencias.temperaturaIa)));
  }
  if (ehOpcaoValida(preferencias.temaApp, THEME_OPTIONS)) {
    setTemaApp(preferencias.temaApp);
  }
  if (ehOpcaoValida(preferencias.tamanhoFonte, FONT_SIZE_OPTIONS)) {
    setTamanhoFonte(preferencias.tamanhoFonte);
  }
  if (ehOpcaoValida(preferencias.densidadeInterface, DENSITY_OPTIONS)) {
    setDensidadeInterface(preferencias.densidadeInterface);
  }
  if (ehOpcaoValida(preferencias.corDestaque, ACCENT_OPTIONS)) {
    setCorDestaque(preferencias.corDestaque);
  }
  if (typeof preferencias.animacoesAtivas === "boolean") {
    setAnimacoesAtivas(preferencias.animacoesAtivas);
  }
  if (typeof preferencias.notificaRespostas === "boolean") {
    setNotificaRespostas(preferencias.notificaRespostas);
  }
  if (typeof preferencias.notificaPush === "boolean") {
    setNotificaPush(preferencias.notificaPush);
  }
  if (ehOpcaoValida(preferencias.somNotificacao, NOTIFICATION_SOUND_OPTIONS)) {
    setSomNotificacao(preferencias.somNotificacao);
  }
  if (typeof preferencias.vibracaoAtiva === "boolean") {
    setVibracaoAtiva(preferencias.vibracaoAtiva);
  }
  if (typeof preferencias.emailsAtivos === "boolean") {
    setEmailsAtivos(preferencias.emailsAtivos);
  }
  if (typeof preferencias.salvarHistoricoConversas === "boolean") {
    setSalvaHistoricoConversas(preferencias.salvarHistoricoConversas);
  }
  if (typeof preferencias.compartilharMelhoriaIa === "boolean") {
    setCompartilharMelhoriaIa(preferencias.compartilharMelhoriaIa);
  }
  if (typeof preferencias.backupAutomatico === "boolean") {
    setBackupAutomatico(preferencias.backupAutomatico);
  }
  if (typeof preferencias.sincronizacaoDispositivos === "boolean") {
    setSincronizacaoDispositivos(preferencias.sincronizacaoDispositivos);
  }
  if (typeof preferencias.nomeAutomaticoConversas === "boolean") {
    setNomeAutomaticoConversas(preferencias.nomeAutomaticoConversas);
  }
  if (typeof preferencias.fixarConversas === "boolean") {
    setFixarConversas(preferencias.fixarConversas);
  }
  if (typeof preferencias.entradaPorVoz === "boolean") {
    setEntradaPorVoz(preferencias.entradaPorVoz);
  }
  if (typeof preferencias.respostaPorVoz === "boolean") {
    setRespostaPorVoz(preferencias.respostaPorVoz);
  }
  if (typeof preferencias.uploadArquivosAtivo === "boolean") {
    setUploadArquivosAtivo(preferencias.uploadArquivosAtivo);
  }
  if (typeof preferencias.economiaDados === "boolean") {
    setEconomiaDados(preferencias.economiaDados);
  }
  if (ehOpcaoValida(preferencias.usoBateria, BATTERY_OPTIONS)) {
    setUsoBateria(preferencias.usoBateria);
  }
  if (ehOpcaoValida(preferencias.idiomaApp, APP_LANGUAGE_OPTIONS)) {
    setIdiomaApp(preferencias.idiomaApp);
  }
  if (ehOpcaoValida(preferencias.regiaoApp, REGION_OPTIONS)) {
    setRegiaoApp(preferencias.regiaoApp);
  }
  if (Array.isArray(preferencias.provedoresConectados)) {
    const provedores = preferencias.provedoresConectados
      .map((item) => normalizarProviderConectado(item))
      .filter(isPresent);
    if (provedores.length) {
      setProvedoresConectados(provedores);
    }
  }
  if (Array.isArray(preferencias.integracoesExternas)) {
    const integracoes = preferencias.integracoesExternas
      .map((item) => normalizarIntegracaoExterna(item))
      .filter(isPresent);
    setIntegracoesExternas(reconciliarIntegracoesExternas(integracoes));
  }
  if (Array.isArray(preferencias.sessoesAtivas)) {
    const sessoes = preferencias.sessoesAtivas
      .map((item) => normalizarSessaoAtiva(item))
      .filter(isPresent);
    if (sessoes.length) {
      setSessoesAtivas(sessoes);
    }
  }
  if (typeof preferencias.twoFactorEnabled === "boolean") {
    setTwoFactorEnabled(preferencias.twoFactorEnabled);
  }
  if (ehOpcaoValida(preferencias.twoFactorMethod, TWO_FACTOR_METHOD_OPTIONS)) {
    setTwoFactorMethod(preferencias.twoFactorMethod);
  }
  if (typeof preferencias.recoveryCodesEnabled === "boolean") {
    setRecoveryCodesEnabled(preferencias.recoveryCodesEnabled);
  }
  if (typeof preferencias.deviceBiometricsEnabled === "boolean") {
    setDeviceBiometricsEnabled(preferencias.deviceBiometricsEnabled);
  }
  if (typeof preferencias.requireAuthOnOpen === "boolean") {
    setRequireAuthOnOpen(preferencias.requireAuthOnOpen);
  }
  if (typeof preferencias.hideInMultitask === "boolean") {
    setHideInMultitask(preferencias.hideInMultitask);
  }
  if (ehOpcaoValida(preferencias.lockTimeout, LOCK_TIMEOUT_OPTIONS)) {
    setLockTimeout(preferencias.lockTimeout);
  }
  if (ehOpcaoValida(preferencias.retencaoDados, DATA_RETENTION_OPTIONS)) {
    setRetencaoDados(preferencias.retencaoDados);
  }
  if (Array.isArray(preferencias.codigosRecuperacao)) {
    setCodigosRecuperacao(
      preferencias.codigosRecuperacao.filter(
        (item): item is string =>
          typeof item === "string" && Boolean(item.trim()),
      ),
    );
  }
  if (typeof preferencias.reautenticacaoExpiraEm === "string") {
    if (reautenticacaoAindaValida(preferencias.reautenticacaoExpiraEm)) {
      setReautenticacaoExpiraEm(preferencias.reautenticacaoExpiraEm);
      setReautenticacaoStatus(
        formatarStatusReautenticacao(preferencias.reautenticacaoExpiraEm),
      );
    } else {
      setReautenticacaoExpiraEm("");
      setReautenticacaoStatus("Não confirmada");
    }
  }
  if (typeof preferencias.reautenticacaoStatus === "string") {
    if (
      !reautenticacaoAindaValida(
        typeof preferencias.reautenticacaoExpiraEm === "string"
          ? preferencias.reautenticacaoExpiraEm
          : "",
      )
    ) {
      setReautenticacaoStatus(preferencias.reautenticacaoStatus);
    }
  }
  if (Array.isArray(preferencias.eventosSeguranca)) {
    const eventos = preferencias.eventosSeguranca
      .map((item) => normalizarEventoSeguranca(item))
      .filter(isPresent);
    if (eventos.length) {
      setEventosSeguranca(eventos);
    }
  }
  if (typeof preferencias.mostrarConteudoNotificacao === "boolean") {
    setMostrarConteudoNotificacao(preferencias.mostrarConteudoNotificacao);
  }
  if (typeof preferencias.ocultarConteudoBloqueado === "boolean") {
    setOcultarConteudoBloqueado(preferencias.ocultarConteudoBloqueado);
  }
  if (typeof preferencias.mostrarSomenteNovaMensagem === "boolean") {
    setMostrarSomenteNovaMensagem(preferencias.mostrarSomenteNovaMensagem);
  }
  if (typeof preferencias.microfonePermitido === "boolean") {
    setMicrofonePermitido(preferencias.microfonePermitido);
  }
  if (typeof preferencias.cameraPermitida === "boolean") {
    setCameraPermitida(preferencias.cameraPermitida);
  }
  if (typeof preferencias.arquivosPermitidos === "boolean") {
    setArquivosPermitidos(preferencias.arquivosPermitidos);
  }
  if (typeof preferencias.notificacoesPermitidas === "boolean") {
    setNotificacoesPermitidas(preferencias.notificacoesPermitidas);
  }
  if (typeof preferencias.biometriaPermitida === "boolean") {
    setBiometriaPermitida(preferencias.biometriaPermitida);
  }
  if (Array.isArray(preferencias.filaSuporteLocal)) {
    setFilaSuporteLocal(
      preferencias.filaSuporteLocal
        .map((item) => normalizarItemSuporte(item))
        .filter(isPresent),
    );
  }
  if (typeof preferencias.ultimaVerificacaoAtualizacao === "string") {
    setUltimaVerificacaoAtualizacao(preferencias.ultimaVerificacaoAtualizacao);
  }
  if (typeof preferencias.statusAtualizacaoApp === "string") {
    setStatusAtualizacaoApp(preferencias.statusAtualizacaoApp);
  }
  if (typeof preferencias.emailAtualConta === "string") {
    setEmailAtualConta(preferencias.emailAtualConta);
  }
  if (typeof preferencias.novaSenhaDraft === "string") {
    setNovaSenhaDraft(preferencias.novaSenhaDraft);
  }
  if ("bugAttachmentDraft" in preferencias) {
    setBugAttachmentDraft(
      normalizarBugAttachmentDraft(preferencias.bugAttachmentDraft),
    );
  }
}
