import type { AppSettings } from "../../settings";

export interface AttachmentHandlingPolicy {
  imageQuality: number;
  autoUploadDocuments: boolean;
  disableAggressiveDownloads: boolean;
  summaryLabel: string;
}

export function resolveImageCompressionQuality(
  dataSaver: boolean,
  compression: AppSettings["dataControls"]["mediaCompression"],
): number {
  if (dataSaver || compression === "forte") {
    return 0.38;
  }
  if (compression === "equilibrada") {
    return 0.58;
  }
  if (compression === "leve") {
    return 0.8;
  }
  return 1;
}

export function buildAttachmentHandlingPolicy(
  settings: AppSettings,
): AttachmentHandlingPolicy {
  const imageQuality = resolveImageCompressionQuality(
    settings.system.dataSaver,
    settings.dataControls.mediaCompression,
  );
  return {
    imageQuality,
    autoUploadDocuments: settings.dataControls.autoUploadAttachments,
    disableAggressiveDownloads: settings.system.dataSaver,
    summaryLabel: settings.system.dataSaver
      ? `economia ativa • compressão ${settings.dataControls.mediaCompression}`
      : `compressão ${settings.dataControls.mediaCompression}`,
  };
}
