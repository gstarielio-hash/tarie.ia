import { handleSettingsSheetConfirmFlow } from "./settingsSheetConfirmActions";

function criarParams(
  overrides: Partial<Parameters<typeof handleSettingsSheetConfirmFlow>[0]> = {},
): Parameters<typeof handleSettingsSheetConfirmFlow>[0] {
  return {
    settingsSheet: {
      kind: "photo",
      title: "Atualizar foto",
      subtitle: "Envie uma nova foto de perfil.",
      actionLabel: "Salvar",
    },
    delayMs: 0,
    photo: {
      perfilFotoUri: "https://tariel.test/foto-atual.jpg",
      perfilFotoHint: "Foto atual",
      session: {
        accessToken: "token-123",
        bootstrap: {
          usuario: {
            nome_completo: "Inspetor Tariel",
            email: "inspetor@tariel.test",
            telefone: "(11) 99999-0000",
          },
        },
      },
      onEnviarFotoPerfilNoBackend: jest.fn().mockResolvedValue({
        nomeCompleto: "Inspetor Tariel",
        nomeExibicao: "Inspetor",
        email: "inspetor@tariel.test",
        telefone: "(11) 99999-0000",
        fotoPerfilUri: "https://tariel.test/foto-nova.jpg",
      }),
      onAplicarPerfilSincronizado: jest.fn(),
      onSetPerfilFotoUri: jest.fn(),
      onSetPerfilFotoHint: jest.fn(),
    },
    delegated: {
      profile: {
        nomeCompletoDraft: "Inspetor Tariel",
        nomeExibicaoDraft: "Inspetor",
        telefoneDraft: "(11) 99999-0000",
        currentNomeCompleto: "Inspetor Tariel",
        currentNomeExibicao: "Inspetor",
        currentTelefone: "(11) 99999-0000",
        session: {
          accessToken: "token-123",
          bootstrap: {
            usuario: {
              nome_completo: "Inspetor Tariel",
              email: "inspetor@tariel.test",
              telefone: "(11) 99999-0000",
            },
          },
        },
        onSetNomeCompletoDraft: jest.fn(),
        onSetNomeExibicaoDraft: jest.fn(),
        onSetTelefoneDraft: jest.fn(),
        onAplicarPerfilLocal: jest.fn(),
        onAtualizarPerfilContaNoBackend: jest.fn(),
        onAplicarPerfilSincronizado: jest.fn(),
      },
      plan: {
        current: "Pro",
        onChange: jest.fn(),
      },
      billing: {
        current: "Visa final 4242",
        onChange: jest.fn(),
      },
      email: {
        draft: "inspetor@tariel.test",
        perfilNome: "Inspetor Tariel",
        telefone: "(11) 99999-0000",
        emailAtualConta: "inspetor@tariel.test",
        emailLogin: "inspetor@tariel.test",
        session: {
          accessToken: "token-123",
          bootstrap: {
            usuario: {
              nome_completo: "Inspetor Tariel",
              email: "inspetor@tariel.test",
              telefone: "(11) 99999-0000",
            },
          },
        },
        onSetEmailAtualConta: jest.fn(),
        onAtualizarPerfilContaNoBackend: jest.fn(),
        onAplicarPerfilSincronizado: jest.fn(),
      },
      password: {
        senhaAtualDraft: "Senha123",
        novaSenhaDraft: "SenhaNova123",
        confirmarSenhaDraft: "SenhaNova123",
        session: {
          accessToken: "token-123",
          bootstrap: {
            usuario: {
              nome_completo: "Inspetor Tariel",
              email: "inspetor@tariel.test",
              telefone: "(11) 99999-0000",
            },
          },
        },
        onAtualizarSenhaContaNoBackend: jest.fn(),
        onSetSenhaAtualDraft: jest.fn(),
        onSetNovaSenhaDraft: jest.fn(),
        onSetConfirmarSenhaDraft: jest.fn(),
      },
      support: {
        session: {
          accessToken: "token-123",
          bootstrap: {
            usuario: {
              nome_completo: "Inspetor Tariel",
              email: "inspetor@tariel.test",
              telefone: "(11) 99999-0000",
            },
          },
        },
        profileName: "Inspetor Tariel",
        workspaceName: "Tariel",
        accessLevelLabel: "Conta autenticada",
        currentDeviceLabel: "Pixel",
        emailAtualConta: "inspetor@tariel.test",
        emailLogin: "inspetor@tariel.test",
        statusApi: "online",
        bugDescriptionDraft: "",
        bugEmailDraft: "inspetor@tariel.test",
        bugAttachmentDraft: null,
        feedbackDraft: "",
        onSetFilaSuporteLocal: jest.fn(),
        onSetBugDescriptionDraft: jest.fn(),
        onSetBugEmailDraft: jest.fn(),
        onSetBugAttachmentDraft: jest.fn(),
        onSetFeedbackDraft: jest.fn(),
        onEnviarRelatoSuporteNoBackend: jest.fn(),
      },
      updates: {
        onPingApi: jest.fn(),
        onSetStatusApi: jest.fn(),
        onSetUltimaVerificacaoAtualizacao: jest.fn(),
        onSetStatusAtualizacaoApp: jest.fn(),
      },
      exports: {
        onCompartilharTextoExportado: jest.fn(),
      },
      ui: {
        onSetSettingsSheetLoading: jest.fn(),
        onSetSettingsSheetNotice: jest.fn(),
        onNotificarConfiguracaoConcluida: jest.fn(),
        onRegistrarEventoSegurancaLocal: jest.fn(),
      },
    },
    onRequestMediaLibraryPermissions: jest.fn().mockResolvedValue({
      granted: true,
      accessPrivileges: "limited",
    }),
    onLaunchImageLibrary: jest.fn().mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///foto.jpg",
          fileName: "foto.jpg",
          fileSize: 512_000,
          mimeType: "image/jpeg",
        },
      ],
    }),
    ...overrides,
  };
}

describe("handleSettingsSheetConfirmFlow", () => {
  it("interrompe o fluxo de foto quando falta permissao da galeria", async () => {
    const params = criarParams({
      onRequestMediaLibraryPermissions: jest.fn().mockResolvedValue({
        granted: false,
        accessPrivileges: "none",
      }),
    });

    await handleSettingsSheetConfirmFlow(params);

    expect(
      params.delegated.ui.onSetSettingsSheetLoading,
    ).toHaveBeenNthCalledWith(1, true);
    expect(
      params.delegated.ui.onSetSettingsSheetLoading,
    ).toHaveBeenNthCalledWith(2, false);
    expect(params.delegated.ui.onSetSettingsSheetNotice).toHaveBeenCalledWith(
      "Permita acesso às imagens para atualizar a foto de perfil.",
    );
    expect(params.onLaunchImageLibrary).not.toHaveBeenCalled();
  });

  it("envia a foto e sincroniza o perfil quando a selecao eh valida", async () => {
    const params = criarParams();

    await handleSettingsSheetConfirmFlow(params);

    expect(params.photo.onEnviarFotoPerfilNoBackend).toHaveBeenCalledWith(
      "token-123",
      {
        uri: "file:///foto.jpg",
        nome: "foto.jpg",
        mimeType: "image/jpeg",
      },
    );
    expect(params.photo.onAplicarPerfilSincronizado).toHaveBeenCalledWith(
      expect.objectContaining({
        fotoPerfilUri: "https://tariel.test/foto-nova.jpg",
      }),
    );
    expect(
      params.delegated.ui.onNotificarConfiguracaoConcluida,
    ).toHaveBeenCalledWith("Foto atualizada e sincronizada com a conta.");
    expect(
      params.delegated.ui.onSetSettingsSheetLoading,
    ).toHaveBeenNthCalledWith(1, true);
    expect(
      params.delegated.ui.onSetSettingsSheetLoading,
    ).toHaveBeenNthCalledWith(2, false);
  });

  it("encaminha sheets comuns para a delegacao existente e fecha o loading", async () => {
    const params = criarParams({
      settingsSheet: {
        kind: "plan",
        title: "Plano",
        subtitle: "Gerencie o plano atual.",
        actionLabel: "Salvar",
      },
    });

    await handleSettingsSheetConfirmFlow(params);

    expect(params.delegated.plan.onChange).toHaveBeenCalledTimes(1);
    expect(
      params.delegated.ui.onNotificarConfiguracaoConcluida,
    ).toHaveBeenCalled();
    expect(
      params.delegated.ui.onSetSettingsSheetLoading,
    ).toHaveBeenNthCalledWith(1, true);
    expect(
      params.delegated.ui.onSetSettingsSheetLoading,
    ).toHaveBeenNthCalledWith(2, false);
  });
});
