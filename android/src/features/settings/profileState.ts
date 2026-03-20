import type { Dispatch, SetStateAction } from "react";

import type { MobileSessionState } from "../session/sessionTypes";
import type { PerfilContaSincronizado } from "./settingsBackend";
import type { ConnectedProvider } from "./useSettingsPresentation";

interface ApplyLocalProfileStateParams {
  payload: {
    nomeCompleto: string;
    nomeExibicao: string;
    telefone: string;
  };
  onSetPerfilNome: (value: string) => void;
  onSetPerfilExibicao: (value: string) => void;
  onUpdateAccountPhone: (value: string) => void;
}

interface ApplySyncedProfileStateParams {
  perfil: PerfilContaSincronizado;
  onSetPerfilNome: (value: string) => void;
  onSetPerfilExibicao: (value: string) => void;
  onSetEmailAtualConta: (value: string) => void;
  onUpdateAccountPhone: (value: string) => void;
  onSetPerfilFotoUri: (value: string) => void;
  onSetPerfilFotoHint: (value: string) => void;
  onSetSession: Dispatch<SetStateAction<MobileSessionState | null>>;
  onSetProvedoresConectados: Dispatch<SetStateAction<ConnectedProvider[]>>;
}

export function invalidarCacheImagemUri(uri: string): string {
  const value = String(uri || "").trim();
  if (!value) {
    return "";
  }
  const separador = value.includes("?") ? "&" : "?";
  return `${value}${separador}v=${Date.now()}`;
}

export function applyLocalProfileState({
  payload,
  onSetPerfilNome,
  onSetPerfilExibicao,
  onUpdateAccountPhone,
}: ApplyLocalProfileStateParams): void {
  onSetPerfilNome(payload.nomeCompleto);
  onSetPerfilExibicao(payload.nomeExibicao);
  onUpdateAccountPhone(payload.telefone);
}

export function applySyncedProfileState({
  perfil,
  onSetPerfilNome,
  onSetPerfilExibicao,
  onSetEmailAtualConta,
  onUpdateAccountPhone,
  onSetPerfilFotoUri,
  onSetPerfilFotoHint,
  onSetSession,
  onSetProvedoresConectados,
}: ApplySyncedProfileStateParams): void {
  const fotoComCacheInvalido = perfil.fotoPerfilUri
    ? invalidarCacheImagemUri(perfil.fotoPerfilUri)
    : "";

  onSetPerfilNome(perfil.nomeCompleto);
  if (perfil.nomeExibicao) {
    onSetPerfilExibicao(perfil.nomeExibicao);
  }
  onSetEmailAtualConta(perfil.email);
  onUpdateAccountPhone(perfil.telefone);
  if (fotoComCacheInvalido) {
    onSetPerfilFotoUri(fotoComCacheInvalido);
    onSetPerfilFotoHint("Foto sincronizada com a conta");
  }

  onSetSession((estadoAtual) => {
    if (!estadoAtual) {
      return estadoAtual;
    }
    return {
      ...estadoAtual,
      bootstrap: {
        ...estadoAtual.bootstrap,
        usuario: {
          ...estadoAtual.bootstrap.usuario,
          nome_completo: perfil.nomeCompleto,
          email: perfil.email,
          telefone: perfil.telefone,
          foto_perfil_url: fotoComCacheInvalido || perfil.fotoPerfilUri,
        },
      },
    };
  });

  onSetProvedoresConectados((estadoAtual) =>
    estadoAtual.map((provider) =>
      provider.connected
        ? {
            ...provider,
            email: perfil.email || provider.email,
          }
        : provider,
    ),
  );
}
