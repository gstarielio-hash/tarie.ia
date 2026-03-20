import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { Dispatch, SetStateAction } from "react";

import type { MobileAttachment } from "../../types/mobile";
import { gateHeavyTransfer } from "./network";
import {
  capturarImagemRascunhoFlow,
  selecionarDocumentoRascunhoFlow,
  selecionarImagemRascunhoFlow,
} from "./attachmentDraftFlows";
import {
  ehImagemAnexo,
  nomeExibicaoAnexo,
  urlAnexoAbsoluta,
} from "./attachmentUtils";
import type { ActiveThread, ComposerAttachment } from "./types";

interface AttachmentPreviewState {
  titulo: string;
  uri: string;
}

interface UseAttachmentControllerParams {
  abaAtiva: ActiveThread;
  arquivosPermitidos: boolean;
  autoUploadAttachments: boolean;
  cameraPermitida: boolean;
  preparandoAnexo: boolean;
  sessionAccessToken: string | null;
  statusApi: string;
  uploadArquivosAtivo: boolean;
  wifiOnlySync: boolean;
  imageQuality: number;
  disableAggressiveDownloads: boolean;
  erroSugereModoOffline: (erro: unknown) => boolean;
  inferirExtensaoAnexo: (anexo: MobileAttachment) => string;
  montarAnexoDocumentoLocal: (
    asset: import("expo-document-picker").DocumentPickerAsset,
    resumo: string,
  ) => ComposerAttachment;
  montarAnexoDocumentoMesa: (
    asset: import("expo-document-picker").DocumentPickerAsset,
  ) => ComposerAttachment;
  montarAnexoImagem: (
    asset: import("expo-image-picker").ImagePickerAsset,
    resumo: string,
  ) => ComposerAttachment;
  nomeArquivoSeguro: (nome: string, fallback: string) => string;
  onBuildAttachmentKey: (anexo: MobileAttachment, fallback: string) => string;
  onShowAlert: (
    title: string,
    message?: string,
    buttons?: Array<{
      text: string;
      style?: "default" | "cancel" | "destructive";
      onPress?: () => void;
    }>,
  ) => void;
  setAnexosAberto: (value: boolean) => void;
  setAnexoAbrindoChave: Dispatch<SetStateAction<string>>;
  setAnexoMesaRascunho: Dispatch<SetStateAction<ComposerAttachment | null>>;
  setAnexoRascunho: Dispatch<SetStateAction<ComposerAttachment | null>>;
  setErroConversa: (value: string) => void;
  setPreparandoAnexo: (value: boolean) => void;
  setPreviewAnexoImagem: Dispatch<
    SetStateAction<AttachmentPreviewState | null>
  >;
  setStatusApi: (value: "online" | "offline") => void;
}

export function useAttachmentController({
  abaAtiva,
  arquivosPermitidos,
  autoUploadAttachments,
  cameraPermitida,
  preparandoAnexo,
  sessionAccessToken,
  statusApi,
  uploadArquivosAtivo,
  wifiOnlySync,
  imageQuality,
  disableAggressiveDownloads,
  erroSugereModoOffline,
  inferirExtensaoAnexo,
  montarAnexoDocumentoLocal,
  montarAnexoDocumentoMesa,
  montarAnexoImagem,
  nomeArquivoSeguro,
  onBuildAttachmentKey,
  onShowAlert,
  setAnexosAberto,
  setAnexoAbrindoChave,
  setAnexoMesaRascunho,
  setAnexoRascunho,
  setErroConversa,
  setPreparandoAnexo,
  setPreviewAnexoImagem,
  setStatusApi,
}: UseAttachmentControllerParams) {
  function handleAbrirSeletorAnexo() {
    if (!uploadArquivosAtivo) {
      onShowAlert(
        "Uploads desativados",
        "O envio de arquivos está desligado nas preferências do app. Reative em Configurações > Recursos avançados.",
      );
      return;
    }
    if (!arquivosPermitidos) {
      onShowAlert(
        "Arquivos bloqueados",
        "O acesso a arquivos foi desativado neste dispositivo. Ajuste isso em Configurações > Permissões.",
      );
      return;
    }
    setAnexosAberto(true);
  }

  async function handleSelecionarImagem() {
    if (!sessionAccessToken) {
      return;
    }

    await selecionarImagemRascunhoFlow({
      abaAtiva,
      preparandoAnexo,
      uploadArquivosAtivo,
      imageQuality,
      arquivosPermitidos,
      montarAnexoImagem,
      onSetAnexoMesaRascunho: setAnexoMesaRascunho,
      onSetAnexoRascunho: setAnexoRascunho,
      onSetErroConversa: setErroConversa,
      onSetPreparandoAnexo: setPreparandoAnexo,
    });
  }

  async function handleCapturarImagem() {
    if (!sessionAccessToken) {
      return;
    }

    await capturarImagemRascunhoFlow({
      abaAtiva,
      preparandoAnexo,
      uploadArquivosAtivo,
      imageQuality,
      cameraPermitida,
      montarAnexoImagem,
      onSetAnexoMesaRascunho: setAnexoMesaRascunho,
      onSetAnexoRascunho: setAnexoRascunho,
      onSetErroConversa: setErroConversa,
      onSetPreparandoAnexo: setPreparandoAnexo,
    });
  }

  async function handleSelecionarDocumento() {
    if (!sessionAccessToken) {
      return;
    }

    const gateDocumento = await gateHeavyTransfer({
      wifiOnlySync,
      requiresHeavyTransfer: autoUploadAttachments,
      blockedMessage:
        "O upload automático de documentos está restrito ao Wi-Fi neste dispositivo.",
    });
    const autoUploadDocuments = autoUploadAttachments && gateDocumento.allowed;
    if (autoUploadAttachments && !gateDocumento.allowed) {
      setErroConversa(
        gateDocumento.reason ||
          "Documento será mantido localmente até haver uma rede adequada.",
      );
    }

    await selecionarDocumentoRascunhoFlow({
      abaAtiva,
      preparandoAnexo,
      uploadArquivosAtivo,
      imageQuality,
      arquivosPermitidos,
      autoUploadDocuments,
      sessionAccessToken,
      statusApi,
      erroSugereModoOffline,
      montarAnexoDocumentoLocal,
      montarAnexoDocumentoMesa,
      onSetAnexoMesaRascunho: setAnexoMesaRascunho,
      onSetAnexoRascunho: setAnexoRascunho,
      onSetErroConversa: setErroConversa,
      onSetPreparandoAnexo: setPreparandoAnexo,
      onSetStatusOffline: () => {
        setStatusApi("offline");
      },
    });
  }

  async function handleEscolherAnexo(
    opcao: "camera" | "galeria" | "documento",
  ) {
    setAnexosAberto(false);
    if (!uploadArquivosAtivo) {
      return;
    }
    if (opcao === "camera" && !cameraPermitida) {
      onShowAlert(
        "Câmera indisponível",
        "Ative a câmera em Configurações > Permissões para anexar fotos.",
      );
      return;
    }
    if (opcao !== "camera" && !arquivosPermitidos) {
      onShowAlert(
        "Arquivos indisponíveis",
        "Ative o acesso a arquivos em Configurações > Permissões.",
      );
      return;
    }
    if (opcao === "camera") {
      await handleCapturarImagem();
      return;
    }
    if (opcao === "galeria") {
      await handleSelecionarImagem();
      return;
    }
    await handleSelecionarDocumento();
  }

  async function handleAbrirAnexo(anexo: MobileAttachment) {
    if (!sessionAccessToken) {
      return;
    }

    const absoluteUrl = urlAnexoAbsoluta(anexo.url);
    if (!absoluteUrl) {
      onShowAlert(
        "Anexo",
        "Esse anexo ainda não está disponível para abertura no app.",
      );
      return;
    }

    if (ehImagemAnexo(anexo)) {
      setPreviewAnexoImagem({
        titulo: nomeExibicaoAnexo(anexo, "Imagem"),
        uri: absoluteUrl,
      });
      return;
    }

    const key = onBuildAttachmentKey(anexo, "anexo");
    setAnexoAbrindoChave(key);

    try {
      const gateDownload = await gateHeavyTransfer({
        wifiOnlySync,
        requiresHeavyTransfer: disableAggressiveDownloads,
        blockedMessage:
          "O download deste anexo aguarda Wi-Fi por causa da economia de dados ativa.",
      });
      if (!gateDownload.allowed) {
        onShowAlert(
          "Anexo",
          gateDownload.reason ||
            "Esse anexo precisa de uma rede adequada para abrir.",
        );
        return;
      }

      const baseDir = `${FileSystem.cacheDirectory || ""}tariel-anexos`;
      await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });

      const extensao = inferirExtensaoAnexo(anexo);
      const nomeBase = nomeArquivoSeguro(
        nomeExibicaoAnexo(anexo, "anexo"),
        `anexo${extensao}`,
      );
      const nomeFinal =
        extensao && !nomeBase.toLowerCase().endsWith(extensao.toLowerCase())
          ? `${nomeBase}${extensao}`
          : nomeBase;
      const destino = `${baseDir}/${Date.now()}-${nomeFinal}`;

      const resultado = await FileSystem.downloadAsync(absoluteUrl, destino, {
        headers: {
          Authorization: `Bearer ${sessionAccessToken}`,
        },
      });

      const sharingDisponivel = await Sharing.isAvailableAsync();
      if (!sharingDisponivel) {
        onShowAlert("Anexo pronto", `Arquivo salvo em ${resultado.uri}`);
        return;
      }

      await Sharing.shareAsync(resultado.uri, {
        mimeType: anexo.mime_type || undefined,
        dialogTitle: `Abrir ${nomeExibicaoAnexo(anexo, "anexo")}`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível abrir o anexo no app.";
      onShowAlert("Anexo", message);
    } finally {
      setAnexoAbrindoChave((estadoAtual) =>
        estadoAtual === key ? "" : estadoAtual,
      );
    }
  }

  return {
    handleAbrirAnexo,
    handleAbrirSeletorAnexo,
    handleCapturarImagem,
    handleEscolherAnexo,
    handleSelecionarDocumento,
    handleSelecionarImagem,
  };
}
