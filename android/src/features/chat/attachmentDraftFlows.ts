import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

import { uploadDocumentoChatMobile } from "../../config/api";
import type { ActiveThread, ComposerAttachment } from "./types";

interface AttachmentDraftBaseParams {
  abaAtiva: ActiveThread;
  preparandoAnexo: boolean;
  uploadArquivosAtivo: boolean;
  imageQuality: number;
  onSetAnexoMesaRascunho: (value: ComposerAttachment | null) => void;
  onSetAnexoRascunho: (value: ComposerAttachment | null) => void;
  onSetErroConversa: (value: string) => void;
  onSetPreparandoAnexo: (value: boolean) => void;
}

interface SelectImageAttachmentDraftFlowParams extends AttachmentDraftBaseParams {
  arquivosPermitidos: boolean;
  montarAnexoImagem: (
    asset: ImagePicker.ImagePickerAsset,
    resumo: string,
  ) => ComposerAttachment;
}

interface CaptureImageAttachmentDraftFlowParams extends AttachmentDraftBaseParams {
  cameraPermitida: boolean;
  montarAnexoImagem: (
    asset: ImagePicker.ImagePickerAsset,
    resumo: string,
  ) => ComposerAttachment;
}

interface SelectDocumentAttachmentDraftFlowParams extends AttachmentDraftBaseParams {
  arquivosPermitidos: boolean;
  autoUploadDocuments: boolean;
  erroSugereModoOffline: (erro: unknown) => boolean;
  montarAnexoDocumentoLocal: (
    asset: DocumentPicker.DocumentPickerAsset,
    resumo: string,
  ) => ComposerAttachment;
  montarAnexoDocumentoMesa: (
    asset: DocumentPicker.DocumentPickerAsset,
  ) => ComposerAttachment;
  onSetStatusOffline: () => void;
  sessionAccessToken: string;
  statusApi: string;
}

function aplicarAnexoRascunho(
  abaAtiva: ActiveThread,
  anexo: ComposerAttachment,
  onSetAnexoRascunho: (value: ComposerAttachment | null) => void,
  onSetAnexoMesaRascunho: (value: ComposerAttachment | null) => void,
) {
  if (abaAtiva === "mesa") {
    onSetAnexoMesaRascunho(anexo);
    return;
  }
  onSetAnexoRascunho(anexo);
}

export async function selecionarImagemRascunhoFlow({
  abaAtiva,
  preparandoAnexo,
  uploadArquivosAtivo,
  imageQuality,
  arquivosPermitidos,
  montarAnexoImagem,
  onSetAnexoMesaRascunho,
  onSetAnexoRascunho,
  onSetErroConversa,
  onSetPreparandoAnexo,
}: SelectImageAttachmentDraftFlowParams) {
  if (preparandoAnexo || !uploadArquivosAtivo || !arquivosPermitidos) {
    return;
  }

  try {
    onSetPreparandoAnexo(true);
    onSetErroConversa("");

    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted && permissao.accessPrivileges !== "limited") {
      Alert.alert(
        "Biblioteca de imagens",
        "Permita acesso às imagens para anexar evidências no chat.",
      );
      return;
    }

    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      base64: true,
      quality: imageQuality,
    });

    if (resultado.canceled || !resultado.assets?.length) {
      return;
    }

    const asset = resultado.assets[0];
    const anexo = montarAnexoImagem(
      asset,
      abaAtiva === "mesa"
        ? "Imagem pronta para seguir direto para a mesa avaliadora."
        : "Imagem pronta para seguir com a mensagem do inspetor.",
    );
    aplicarAnexoRascunho(
      abaAtiva,
      anexo,
      onSetAnexoRascunho,
      onSetAnexoMesaRascunho,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível selecionar a imagem.";
    Alert.alert("Imagem", message);
  } finally {
    onSetPreparandoAnexo(false);
  }
}

export async function capturarImagemRascunhoFlow({
  abaAtiva,
  preparandoAnexo,
  uploadArquivosAtivo,
  imageQuality,
  cameraPermitida,
  montarAnexoImagem,
  onSetAnexoMesaRascunho,
  onSetAnexoRascunho,
  onSetErroConversa,
  onSetPreparandoAnexo,
}: CaptureImageAttachmentDraftFlowParams) {
  if (preparandoAnexo || !uploadArquivosAtivo || !cameraPermitida) {
    return;
  }

  try {
    onSetPreparandoAnexo(true);
    onSetErroConversa("");

    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert(
        "Câmera",
        "Permita acesso à câmera para registrar evidências pelo app.",
      );
      return;
    }

    const resultado = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      base64: true,
      quality: imageQuality,
    });

    if (resultado.canceled || !resultado.assets?.length) {
      return;
    }

    const asset = resultado.assets[0];
    const anexo = montarAnexoImagem(
      asset,
      abaAtiva === "mesa"
        ? "Foto capturada no app e pronta para seguir para a mesa."
        : "Foto capturada no app e pronta para seguir com a conversa.",
    );
    aplicarAnexoRascunho(
      abaAtiva,
      anexo,
      onSetAnexoRascunho,
      onSetAnexoMesaRascunho,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível usar a câmera agora.";
    Alert.alert("Câmera", message);
  } finally {
    onSetPreparandoAnexo(false);
  }
}

export async function selecionarDocumentoRascunhoFlow({
  abaAtiva,
  preparandoAnexo,
  uploadArquivosAtivo,
  imageQuality: _imageQuality,
  arquivosPermitidos,
  autoUploadDocuments,
  sessionAccessToken,
  statusApi,
  erroSugereModoOffline,
  montarAnexoDocumentoLocal,
  montarAnexoDocumentoMesa,
  onSetAnexoMesaRascunho,
  onSetAnexoRascunho,
  onSetErroConversa,
  onSetPreparandoAnexo,
  onSetStatusOffline,
}: SelectDocumentAttachmentDraftFlowParams) {
  if (preparandoAnexo || !uploadArquivosAtivo || !arquivosPermitidos) {
    return;
  }

  try {
    onSetPreparandoAnexo(true);
    onSetErroConversa("");

    const resultado = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (resultado.canceled || !resultado.assets?.length) {
      return;
    }

    const asset = resultado.assets[0];
    if (abaAtiva === "mesa") {
      onSetAnexoMesaRascunho(montarAnexoDocumentoMesa(asset));
      return;
    }

    try {
      if (!autoUploadDocuments) {
        onSetAnexoRascunho(
          montarAnexoDocumentoLocal(
            asset,
            "Documento mantido no rascunho. A conversão acontecerá só no envio.",
          ),
        );
        return;
      }
      const documento = await uploadDocumentoChatMobile(sessionAccessToken, {
        uri: asset.uri,
        nome: asset.name,
        mimeType: asset.mimeType,
      });

      onSetAnexoRascunho({
        kind: "document",
        label: documento.nome,
        resumo: documento.truncado
          ? `Documento convertido com corte de segurança em ${documento.chars} caracteres.`
          : `Documento convertido com ${documento.chars} caracteres prontos para a IA.`,
        textoDocumento: documento.texto,
        nomeDocumento: documento.nome,
        chars: documento.chars,
        truncado: documento.truncado,
        fileUri: asset.uri,
        mimeType: asset.mimeType || "application/octet-stream",
      });
    } catch (error) {
      if (statusApi === "offline" || erroSugereModoOffline(error)) {
        onSetAnexoRascunho(
          montarAnexoDocumentoLocal(
            asset,
            "Documento salvo localmente e pronto para conversão assim que a conexão voltar.",
          ),
        );
        onSetErroConversa(
          "Documento salvo no rascunho. Ele será convertido quando você enviar com internet.",
        );
        onSetStatusOffline();
        return;
      }
      throw error;
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível preparar o documento.";
    Alert.alert("Documento", message);
  } finally {
    onSetPreparandoAnexo(false);
  }
}
