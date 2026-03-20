jest.mock("../system/permissions", () => ({
  requestDevicePermission: jest.fn(),
}));

import { requestDevicePermission } from "../system/permissions";

import { useVoiceInputController } from "./useVoiceInputController";

function criarParams(
  overrides: Partial<Parameters<typeof useVoiceInputController>[0]> = {},
): Parameters<typeof useVoiceInputController>[0] {
  return {
    entradaPorVoz: true,
    microfonePermitido: true,
    preferredVoiceId: "voz-1",
    speechEnabled: true,
    voiceInputUnavailableMessage: "Use o teclado por voz do sistema.",
    voiceRuntimeSupported: true,
    voices: [{ identifier: "voz-1" }, { identifier: "voz-2" }],
    onOpenSystemSettings: jest.fn(),
    onSetMicrofonePermitido: jest.fn(),
    onSetPreferredVoiceId: jest.fn(),
    onShowAlert: jest.fn(),
    ...overrides,
  };
}

describe("useVoiceInputController", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("abre ajuda de ditado com atalho para ajustes", () => {
    const params = criarParams();

    const controller = useVoiceInputController(params);

    controller.handleAbrirAjudaDitado();

    expect(params.onShowAlert).toHaveBeenCalledWith(
      "Ditado no composer",
      "Use o teclado por voz do sistema.",
      expect.arrayContaining([
        expect.objectContaining({
          text: "Abrir ajustes",
        }),
      ]),
    );
  });

  it("cicla a voz preferida", () => {
    const params = criarParams();

    const controller = useVoiceInputController(params);

    controller.onCyclePreferredVoice();

    expect(params.onSetPreferredVoiceId).toHaveBeenCalledWith("voz-2");
  });

  it("avisa quando a entrada por voz esta desativada", async () => {
    const params = criarParams({
      speechEnabled: false,
    });

    const controller = useVoiceInputController(params);

    await controller.handleVoiceInputPress();

    expect(params.onShowAlert).toHaveBeenCalledWith(
      "Entrada por voz desativada",
      "Ative a fala e a transcrição automática nas configurações.",
    );
  });

  it("solicita microfone e abre ajuda se o runtime de voz nao suportar STT", async () => {
    const params = criarParams({
      microfonePermitido: false,
      voiceRuntimeSupported: false,
    });
    (requestDevicePermission as jest.Mock).mockResolvedValue(true);

    const controller = useVoiceInputController(params);

    await controller.handleVoiceInputPress();

    expect(requestDevicePermission).toHaveBeenCalledWith("microphone");
    expect(params.onSetMicrofonePermitido).toHaveBeenCalledWith(true);
    expect(params.onShowAlert).toHaveBeenCalledWith(
      "Ditado no composer",
      "Use o teclado por voz do sistema.",
      expect.any(Array),
    );
  });
});
