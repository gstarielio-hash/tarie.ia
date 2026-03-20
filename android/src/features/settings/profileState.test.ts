import type { MobileSessionState } from "../session/sessionTypes";
import type { ConnectedProvider } from "./useSettingsPresentation";
import {
  applyLocalProfileState,
  applySyncedProfileState,
  invalidarCacheImagemUri,
} from "./profileState";

describe("profileState", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("aplica o perfil local no estado da conta", () => {
    const onSetPerfilNome = jest.fn();
    const onSetPerfilExibicao = jest.fn();
    const onUpdateAccountPhone = jest.fn();

    applyLocalProfileState({
      payload: {
        nomeCompleto: "Inspetor Tariel",
        nomeExibicao: "Inspetor",
        telefone: "(11) 99999-0000",
      },
      onSetPerfilNome,
      onSetPerfilExibicao,
      onUpdateAccountPhone,
    });

    expect(onSetPerfilNome).toHaveBeenCalledWith("Inspetor Tariel");
    expect(onSetPerfilExibicao).toHaveBeenCalledWith("Inspetor");
    expect(onUpdateAccountPhone).toHaveBeenCalledWith("(11) 99999-0000");
  });

  it("aplica o perfil sincronizado atualizando foto, sessao e provedores conectados", () => {
    jest.spyOn(Date, "now").mockReturnValue(123456789);

    const onSetPerfilNome = jest.fn();
    const onSetPerfilExibicao = jest.fn();
    const onSetEmailAtualConta = jest.fn();
    const onUpdateAccountPhone = jest.fn();
    const onSetPerfilFotoUri = jest.fn();
    const onSetPerfilFotoHint = jest.fn();
    const onSetSession = jest.fn();
    const onSetProvedoresConectados = jest.fn();

    applySyncedProfileState({
      perfil: {
        nomeCompleto: "Inspetor Tariel Silva",
        nomeExibicao: "Tariel",
        email: "inspetor@tariel.test",
        telefone: "(11) 99999-0000",
        fotoPerfilUri: "https://tariel.test/avatar.jpg",
      },
      onSetPerfilNome,
      onSetPerfilExibicao,
      onSetEmailAtualConta,
      onUpdateAccountPhone,
      onSetPerfilFotoUri,
      onSetPerfilFotoHint,
      onSetSession,
      onSetProvedoresConectados,
    });

    expect(onSetPerfilNome).toHaveBeenCalledWith("Inspetor Tariel Silva");
    expect(onSetPerfilExibicao).toHaveBeenCalledWith("Tariel");
    expect(onSetEmailAtualConta).toHaveBeenCalledWith("inspetor@tariel.test");
    expect(onUpdateAccountPhone).toHaveBeenCalledWith("(11) 99999-0000");
    expect(onSetPerfilFotoUri).toHaveBeenCalledWith(
      "https://tariel.test/avatar.jpg?v=123456789",
    );
    expect(onSetPerfilFotoHint).toHaveBeenCalledWith(
      "Foto sincronizada com a conta",
    );

    const sessionUpdater = onSetSession.mock.calls[0]?.[0] as (
      current: MobileSessionState | null,
    ) => MobileSessionState | null;
    const nextSession = sessionUpdater({
      accessToken: "token-123",
      bootstrap: {
        ok: true,
        app: {
          nome: "Tariel",
          portal: "inspetor",
          api_base_url: "https://tariel.test/api",
          suporte_whatsapp: "",
        },
        usuario: {
          id: 1,
          nome_completo: "Anterior",
          email: "anterior@tariel.test",
          telefone: "0000-0000",
          foto_perfil_url: "https://tariel.test/old.jpg",
          empresa_nome: "Tariel",
          empresa_id: 1,
          nivel_acesso: 3,
        },
      },
    });

    expect(nextSession?.bootstrap.usuario.nome_completo).toBe(
      "Inspetor Tariel Silva",
    );
    expect(nextSession?.bootstrap.usuario.email).toBe("inspetor@tariel.test");
    expect(nextSession?.bootstrap.usuario.telefone).toBe("(11) 99999-0000");
    expect(nextSession?.bootstrap.usuario.foto_perfil_url).toBe(
      "https://tariel.test/avatar.jpg?v=123456789",
    );

    const providersUpdater = onSetProvedoresConectados.mock.calls[0]?.[0] as (
      current: ConnectedProvider[],
    ) => ConnectedProvider[];
    const nextProviders = providersUpdater([
      {
        id: "google",
        label: "Google",
        email: "velho@tariel.test",
        connected: true,
        requiresReauth: true,
      },
      {
        id: "apple",
        label: "Apple",
        email: "",
        connected: false,
        requiresReauth: true,
      },
    ]);

    expect(nextProviders[0]?.email).toBe("inspetor@tariel.test");
    expect(nextProviders[1]?.email).toBe("");
  });

  it("mantem o nome de exibicao atual quando o backend nao envia um valor novo", () => {
    const onSetPerfilExibicao = jest.fn();

    applySyncedProfileState({
      perfil: {
        nomeCompleto: "Inspetor Tariel",
        nomeExibicao: "",
        email: "inspetor@tariel.test",
        telefone: "(11) 99999-0000",
        fotoPerfilUri: "",
      },
      onSetPerfilNome: jest.fn(),
      onSetPerfilExibicao,
      onSetEmailAtualConta: jest.fn(),
      onUpdateAccountPhone: jest.fn(),
      onSetPerfilFotoUri: jest.fn(),
      onSetPerfilFotoHint: jest.fn(),
      onSetSession: jest.fn(),
      onSetProvedoresConectados: jest.fn(),
    });

    expect(onSetPerfilExibicao).not.toHaveBeenCalled();
  });

  it("adiciona um cache buster na uri da imagem", () => {
    jest.spyOn(Date, "now").mockReturnValue(42);

    expect(invalidarCacheImagemUri("https://tariel.test/avatar.jpg")).toBe(
      "https://tariel.test/avatar.jpg?v=42",
    );
    expect(invalidarCacheImagemUri("https://tariel.test/avatar.jpg?x=1")).toBe(
      "https://tariel.test/avatar.jpg?x=1&v=42",
    );
  });
});
