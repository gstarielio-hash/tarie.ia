jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  makeDirectoryAsync: jest.fn(),
  downloadAsync: jest.fn(),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock("./attachmentDraftFlows", () => ({
  capturarImagemRascunhoFlow: jest.fn(),
  selecionarDocumentoRascunhoFlow: jest.fn(),
  selecionarImagemRascunhoFlow: jest.fn(),
}));

jest.mock("./network", () => ({
  gateHeavyTransfer: jest.fn().mockResolvedValue({
    allowed: true,
    reason: "",
    snapshot: {
      connected: true,
      isWifi: true,
      typeLabel: "wifi",
    },
  }),
}));

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { capturarImagemRascunhoFlow } from "./attachmentDraftFlows";
import { useAttachmentController } from "./useAttachmentController";

function criarParams(
  overrides: Partial<Parameters<typeof useAttachmentController>[0]> = {},
): Parameters<typeof useAttachmentController>[0] {
  return {
    abaAtiva: "chat",
    arquivosPermitidos: true,
    autoUploadAttachments: true,
    cameraPermitida: true,
    preparandoAnexo: false,
    sessionAccessToken: "token-123",
    statusApi: "online",
    uploadArquivosAtivo: true,
    wifiOnlySync: false,
    imageQuality: 0.7,
    disableAggressiveDownloads: false,
    erroSugereModoOffline: jest.fn().mockReturnValue(false),
    inferirExtensaoAnexo: jest.fn().mockReturnValue(".pdf"),
    montarAnexoDocumentoLocal: jest.fn(),
    montarAnexoDocumentoMesa: jest.fn(),
    montarAnexoImagem: jest.fn(),
    nomeArquivoSeguro: jest.fn().mockReturnValue("arquivo"),
    onBuildAttachmentKey: jest.fn().mockReturnValue("anexo-1"),
    onShowAlert: jest.fn(),
    setAnexosAberto: jest.fn(),
    setAnexoAbrindoChave: jest.fn(),
    setAnexoMesaRascunho: jest.fn(),
    setAnexoRascunho: jest.fn(),
    setErroConversa: jest.fn(),
    setPreparandoAnexo: jest.fn(),
    setPreviewAnexoImagem: jest.fn(),
    setStatusApi: jest.fn(),
    ...overrides,
  };
}

describe("useAttachmentController", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("impede abrir o seletor quando uploads estao desativados", () => {
    const params = criarParams({
      uploadArquivosAtivo: false,
    });

    const controller = useAttachmentController(params);

    controller.handleAbrirSeletorAnexo();

    expect(params.onShowAlert).toHaveBeenCalledWith(
      "Uploads desativados",
      "O envio de arquivos está desligado nas preferências do app. Reative em Configurações > Recursos avançados.",
    );
    expect(params.setAnexosAberto).not.toHaveBeenCalled();
  });

  it("avisa quando a camera esta indisponivel", async () => {
    const params = criarParams({
      cameraPermitida: false,
    });

    const controller = useAttachmentController(params);

    await controller.handleEscolherAnexo("camera");

    expect(params.setAnexosAberto).toHaveBeenCalledWith(false);
    expect(params.onShowAlert).toHaveBeenCalledWith(
      "Câmera indisponível",
      "Ative a câmera em Configurações > Permissões para anexar fotos.",
    );
    expect(capturarImagemRascunhoFlow).not.toHaveBeenCalled();
  });

  it("abre uma imagem em preview sem baixar arquivo", async () => {
    const params = criarParams();

    const controller = useAttachmentController(params);

    await controller.handleAbrirAnexo({
      id: 1,
      nome: "evidencia",
      mime_type: "image/png",
      categoria: "imagem",
      url: "https://tariel.test/evidencia.png",
      eh_imagem: true,
    });

    expect(params.setPreviewAnexoImagem).toHaveBeenCalledWith({
      titulo: "evidencia",
      uri: "https://tariel.test/evidencia.png",
    });
    expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
  });

  it("baixa e compartilha anexos nao visuais", async () => {
    const params = criarParams();
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
      uri: "file:///cache/arquivo.pdf",
    });
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);

    const controller = useAttachmentController(params);

    await controller.handleAbrirAnexo({
      id: 1,
      nome: "relatorio",
      mime_type: "application/pdf",
      categoria: "documento",
      url: "https://tariel.test/relatorio.pdf",
      eh_imagem: false,
    });

    expect(params.setAnexoAbrindoChave).toHaveBeenCalledWith("anexo-1");
    expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
      "https://tariel.test/relatorio.pdf",
      expect.stringContaining("arquivo.pdf"),
      {
        headers: {
          Authorization: "Bearer token-123",
        },
      },
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      "file:///cache/arquivo.pdf",
      {
        mimeType: "application/pdf",
        dialogTitle: "Abrir relatorio",
      },
    );
  });
});
