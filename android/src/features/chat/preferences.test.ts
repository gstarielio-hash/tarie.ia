import {
  applyChatAiPreferencesToMessage,
  buildChatAiRequestConfig,
  describeChatAiBehaviorChange,
  mapAiModelToChatMode,
} from "./preferences";
import { createDefaultAppSettings } from "../../settings/schema/defaults";

describe("chat preferences", () => {
  it("maps AI models to supported chat modes", () => {
    expect(mapAiModelToChatMode("rápido")).toBe("curto");
    expect(mapAiModelToChatMode("equilibrado")).toBe("detalhado");
    expect(mapAiModelToChatMode("avançado")).toBe("deep_research");
  });

  it("injects local AI preferences into outgoing messages", () => {
    const settings = createDefaultAppSettings();
    const config = buildChatAiRequestConfig({
      ...settings.ai,
      model: "avançado",
      responseLanguage: "Português",
      responseStyle: "detalhado",
      tone: "técnico",
      temperature: 0.2,
      memoryEnabled: false,
    });

    const mensagem = applyChatAiPreferencesToMessage(
      "Verifique a ancoragem.",
      config,
    );

    expect(mensagem).toContain("[preferencias_ia_mobile]");
    expect(mensagem).toContain("responda em Português");
    expect(mensagem).toContain("use tom técnico");
    expect(mensagem).toContain("Verifique a ancoragem.");
    expect(config.mode).toBe("deep_research");
  });

  it("summarizes behavior changes only when the summary changes", () => {
    expect(describeChatAiBehaviorChange("A", "A")).toBe("");
    expect(describeChatAiBehaviorChange("", "B")).toBe("");
    expect(describeChatAiBehaviorChange("curto", "detalhado")).toContain(
      "detalhado",
    );
  });
});
