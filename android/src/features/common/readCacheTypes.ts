import type {
  MobileBootstrapResponse,
  MobileLaudoCard,
  MobileMesaMessage,
} from "../../types/mobile";
import type { ChatState, ComposerAttachment } from "../chat/types";

export interface MobileReadCache {
  bootstrap: MobileBootstrapResponse | null;
  laudos: MobileLaudoCard[];
  conversaAtual: ChatState | null;
  conversasPorLaudo: Record<string, ChatState>;
  mesaPorLaudo: Record<string, MobileMesaMessage[]>;
  chatDrafts: Record<string, string>;
  mesaDrafts: Record<string, string>;
  chatAttachmentDrafts: Record<string, ComposerAttachment>;
  mesaAttachmentDrafts: Record<string, ComposerAttachment>;
  updatedAt: string;
}
