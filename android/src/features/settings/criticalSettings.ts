import type {
  MobileCriticalSettings,
  MobileCriticalSettingsResponse,
} from "../../types/mobile";
import {
  AI_MODEL_OPTIONS,
  DATA_RETENTION_OPTIONS,
  NOTIFICATION_SOUND_OPTIONS,
} from "../InspectorMobileApp.constants";

type ModeloIa = (typeof AI_MODEL_OPTIONS)[number];

export interface CriticalSettingsSnapshot {
  notificacoes: {
    notificaRespostas: boolean;
    notificaPush: boolean;
    somNotificacao: string;
    vibracaoAtiva: boolean;
    emailsAtivos: boolean;
  };
  privacidade: {
    mostrarConteudoNotificacao: boolean;
    ocultarConteudoBloqueado: boolean;
    mostrarSomenteNovaMensagem: boolean;
    salvarHistoricoConversas: boolean;
    compartilharMelhoriaIa: boolean;
    retencaoDados: string;
  };
  permissoes: {
    microfonePermitido: boolean;
    cameraPermitida: boolean;
    arquivosPermitidos: boolean;
    notificacoesPermitidas: boolean;
    biometriaPermitida: boolean;
  };
  experienciaIa: {
    modeloIa: ModeloIa;
  };
}

function ehRegistro(payload: unknown): payload is Record<string, unknown> {
  return (
    Boolean(payload) && typeof payload === "object" && !Array.isArray(payload)
  );
}

function ehOpcaoValida<T extends readonly string[]>(
  valor: unknown,
  opcoes: T,
): valor is T[number] {
  return (
    typeof valor === "string" && (opcoes as readonly string[]).includes(valor)
  );
}

function normalizarBool(valor: unknown, padrao: boolean): boolean {
  return typeof valor === "boolean" ? valor : padrao;
}

export function criarSnapshotCriticoPadrao(): CriticalSettingsSnapshot {
  return {
    notificacoes: {
      notificaRespostas: true,
      notificaPush: true,
      somNotificacao: "Ping",
      vibracaoAtiva: true,
      emailsAtivos: false,
    },
    privacidade: {
      mostrarConteudoNotificacao: false,
      ocultarConteudoBloqueado: true,
      mostrarSomenteNovaMensagem: true,
      salvarHistoricoConversas: true,
      compartilharMelhoriaIa: false,
      retencaoDados: "90 dias",
    },
    permissoes: {
      microfonePermitido: true,
      cameraPermitida: true,
      arquivosPermitidos: true,
      notificacoesPermitidas: true,
      biometriaPermitida: true,
    },
    experienciaIa: {
      modeloIa: "equilibrado",
    },
  };
}

export function snapshotCriticoParaPayloadRemoto(
  snapshot: CriticalSettingsSnapshot,
): MobileCriticalSettings {
  return {
    notificacoes: {
      notifica_respostas: snapshot.notificacoes.notificaRespostas,
      notifica_push: snapshot.notificacoes.notificaPush,
      som_notificacao: snapshot.notificacoes.somNotificacao,
      vibracao_ativa: snapshot.notificacoes.vibracaoAtiva,
      emails_ativos: snapshot.notificacoes.emailsAtivos,
    },
    privacidade: {
      mostrar_conteudo_notificacao:
        snapshot.privacidade.mostrarConteudoNotificacao,
      ocultar_conteudo_bloqueado: snapshot.privacidade.ocultarConteudoBloqueado,
      mostrar_somente_nova_mensagem:
        snapshot.privacidade.mostrarSomenteNovaMensagem,
      salvar_historico_conversas: snapshot.privacidade.salvarHistoricoConversas,
      compartilhar_melhoria_ia: snapshot.privacidade.compartilharMelhoriaIa,
      retencao_dados: snapshot.privacidade.retencaoDados,
    },
    permissoes: {
      microfone_permitido: snapshot.permissoes.microfonePermitido,
      camera_permitida: snapshot.permissoes.cameraPermitida,
      arquivos_permitidos: snapshot.permissoes.arquivosPermitidos,
      notificacoes_permitidas: snapshot.permissoes.notificacoesPermitidas,
      biometria_permitida: snapshot.permissoes.biometriaPermitida,
    },
    experiencia_ia: {
      modelo_ia: snapshot.experienciaIa.modeloIa,
    },
  };
}

export function payloadRemotoParaSnapshotCritico(
  payload: MobileCriticalSettingsResponse | MobileCriticalSettings | unknown,
): CriticalSettingsSnapshot {
  const padrao = criarSnapshotCriticoPadrao();
  const raw =
    ehRegistro(payload) && ehRegistro(payload.settings)
      ? payload.settings
      : payload;
  if (!ehRegistro(raw)) {
    return padrao;
  }

  const notificacoes = ehRegistro(raw.notificacoes) ? raw.notificacoes : {};
  const privacidade = ehRegistro(raw.privacidade) ? raw.privacidade : {};
  const permissoes = ehRegistro(raw.permissoes) ? raw.permissoes : {};
  const experienciaIa = ehRegistro(raw.experiencia_ia)
    ? raw.experiencia_ia
    : {};

  return {
    notificacoes: {
      notificaRespostas: normalizarBool(
        notificacoes.notifica_respostas,
        padrao.notificacoes.notificaRespostas,
      ),
      notificaPush: normalizarBool(
        notificacoes.notifica_push,
        padrao.notificacoes.notificaPush,
      ),
      somNotificacao: ehOpcaoValida(
        notificacoes.som_notificacao,
        NOTIFICATION_SOUND_OPTIONS,
      )
        ? notificacoes.som_notificacao
        : padrao.notificacoes.somNotificacao,
      vibracaoAtiva: normalizarBool(
        notificacoes.vibracao_ativa,
        padrao.notificacoes.vibracaoAtiva,
      ),
      emailsAtivos: normalizarBool(
        notificacoes.emails_ativos,
        padrao.notificacoes.emailsAtivos,
      ),
    },
    privacidade: {
      mostrarConteudoNotificacao: normalizarBool(
        privacidade.mostrar_conteudo_notificacao,
        padrao.privacidade.mostrarConteudoNotificacao,
      ),
      ocultarConteudoBloqueado: normalizarBool(
        privacidade.ocultar_conteudo_bloqueado,
        padrao.privacidade.ocultarConteudoBloqueado,
      ),
      mostrarSomenteNovaMensagem: normalizarBool(
        privacidade.mostrar_somente_nova_mensagem,
        padrao.privacidade.mostrarSomenteNovaMensagem,
      ),
      salvarHistoricoConversas: normalizarBool(
        privacidade.salvar_historico_conversas,
        padrao.privacidade.salvarHistoricoConversas,
      ),
      compartilharMelhoriaIa: normalizarBool(
        privacidade.compartilhar_melhoria_ia,
        padrao.privacidade.compartilharMelhoriaIa,
      ),
      retencaoDados: ehOpcaoValida(
        privacidade.retencao_dados,
        DATA_RETENTION_OPTIONS,
      )
        ? privacidade.retencao_dados
        : padrao.privacidade.retencaoDados,
    },
    permissoes: {
      microfonePermitido: normalizarBool(
        permissoes.microfone_permitido,
        padrao.permissoes.microfonePermitido,
      ),
      cameraPermitida: normalizarBool(
        permissoes.camera_permitida,
        padrao.permissoes.cameraPermitida,
      ),
      arquivosPermitidos: normalizarBool(
        permissoes.arquivos_permitidos,
        padrao.permissoes.arquivosPermitidos,
      ),
      notificacoesPermitidas: normalizarBool(
        permissoes.notificacoes_permitidas,
        padrao.permissoes.notificacoesPermitidas,
      ),
      biometriaPermitida: normalizarBool(
        permissoes.biometria_permitida,
        padrao.permissoes.biometriaPermitida,
      ),
    },
    experienciaIa: {
      modeloIa: ehOpcaoValida(experienciaIa.modelo_ia, AI_MODEL_OPTIONS)
        ? experienciaIa.modelo_ia
        : padrao.experienciaIa.modeloIa,
    },
  };
}

export function hashSnapshotCritico(
  snapshot: CriticalSettingsSnapshot,
): string {
  return JSON.stringify(snapshotCriticoParaPayloadRemoto(snapshot));
}
