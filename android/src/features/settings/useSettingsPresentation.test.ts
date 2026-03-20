import { act, renderHook } from "@testing-library/react-native";

import { useSettingsPresentation } from "./useSettingsPresentation";

describe("useSettingsPresentation", () => {
  it("limpa drafts sensiveis e estados transientes ligados a sessao", () => {
    const { result } = renderHook(() => useSettingsPresentation());

    act(() => {
      result.current.actions.setNomeCompletoDraft("Inspetor Tariel");
      result.current.actions.setSenhaAtualDraft("senha-atual");
      result.current.actions.setNovaSenhaDraft("senha-nova");
      result.current.actions.setConfirmarSenhaDraft("senha-nova");
      result.current.actions.setReautenticacaoExpiraEm(
        "2026-03-20T12:00:00.000Z",
      );
      result.current.actions.setReautenticacaoStatus("Confirmada");
      result.current.actions.setBugAttachmentDraft({
        kind: "document",
        label: "print",
        resumo: "print do erro",
        textoDocumento: "erro",
        nomeDocumento: "erro.txt",
        chars: 4,
        truncado: false,
        fileUri: "file:///erro.txt",
        mimeType: "text/plain",
      });
      result.current.actions.setIntegracaoSincronizandoId("google_drive");
    });

    act(() => {
      result.current.actions.resetSessionBoundSettingsPresentationState();
    });

    expect(result.current.state.nomeCompletoDraft).toBe("");
    expect(result.current.state.senhaAtualDraft).toBe("");
    expect(result.current.state.novaSenhaDraft).toBe("");
    expect(result.current.state.confirmarSenhaDraft).toBe("");
    expect(result.current.state.reautenticacaoExpiraEm).toBe("");
    expect(result.current.state.reautenticacaoStatus).toBe("Não confirmada");
    expect(result.current.state.bugAttachmentDraft).toBeNull();
    expect(result.current.state.integracaoSincronizandoId).toBe("");
  });

  it("reseta o estado de apresentacao apos exclusao de conta", () => {
    const { result } = renderHook(() => useSettingsPresentation());

    act(() => {
      result.current.actions.setPlanoAtual("Enterprise");
      result.current.actions.setCartaoAtual("Mastercard final 1034");
      result.current.actions.setNomeAutomaticoConversas(false);
      result.current.actions.setFixarConversas(false);
      result.current.actions.setTwoFactorEnabled(true);
      result.current.actions.setCodigo2FA("123456");
      result.current.actions.setCodigosRecuperacao(["TG-12345"]);
      result.current.actions.setEventosSeguranca([
        {
          id: "sec-custom",
          title: "Evento",
          meta: "Meta",
          status: "Agora",
          type: "session",
        },
      ]);
      result.current.actions.setFeedbackDraft("Sugestao");
      result.current.actions.setBugDescriptionDraft("Erro");
      result.current.actions.setBugEmailDraft("inspetor@tariel.test");
      result.current.actions.setBuscaAjuda("offline");
      result.current.actions.setArtigoAjudaExpandidoId("artigo-custom");
    });

    act(() => {
      result.current.actions.resetSettingsPresentationAfterAccountDeletion();
    });

    expect(result.current.state.planoAtual).toBe("Pro");
    expect(result.current.state.cartaoAtual).toBe("Visa final 4242");
    expect(result.current.state.nomeAutomaticoConversas).toBe(true);
    expect(result.current.state.fixarConversas).toBe(true);
    expect(result.current.state.twoFactorEnabled).toBe(false);
    expect(result.current.state.codigo2FA).toBe("");
    expect(result.current.state.codigosRecuperacao).toEqual([]);
    expect(result.current.state.eventosSeguranca).toEqual([]);
    expect(result.current.state.feedbackDraft).toBe("");
    expect(result.current.state.bugDescriptionDraft).toBe("");
    expect(result.current.state.bugEmailDraft).toBe("");
    expect(result.current.state.buscaAjuda).toBe("");
    expect(result.current.state.artigoAjudaExpandidoId).not.toBe(
      "artigo-custom",
    );
  });
});
