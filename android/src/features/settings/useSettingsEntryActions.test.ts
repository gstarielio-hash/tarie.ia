import { renderHook } from "@testing-library/react-native";

import { HELP_CENTER_ARTICLES } from "../InspectorMobileApp.constants";
import { useSettingsEntryActions } from "./useSettingsEntryActions";

describe("useSettingsEntryActions", () => {
  it("preenche drafts de perfil e abre a sheet correta", () => {
    const abrirSheetConfiguracao = jest.fn();
    const setNomeCompletoDraft = jest.fn();
    const setNomeExibicaoDraft = jest.fn();
    const setTelefoneDraft = jest.fn();

    const { result } = renderHook(() =>
      useSettingsEntryActions({
        perfilNome: "Inspetor Tariel Silva",
        perfilExibicao: "",
        contaTelefone: "(11) 99999-0000",
        emailAtualConta: "inspetor@tariel.test",
        fallbackEmail: "fallback@tariel.test",
        abrirSheetConfiguracao,
        handleAbrirPaginaConfiguracoes: jest.fn(),
        setNomeCompletoDraft,
        setNomeExibicaoDraft,
        setTelefoneDraft,
        setNovoEmailDraft: jest.fn(),
        setSenhaAtualDraft: jest.fn(),
        setNovaSenhaDraft: jest.fn(),
        setConfirmarSenhaDraft: jest.fn(),
        setBuscaAjuda: jest.fn(),
        setArtigoAjudaExpandidoId: jest.fn(),
        setBugDescriptionDraft: jest.fn(),
        setBugEmailDraft: jest.fn(),
        setBugAttachmentDraft: jest.fn(),
        setFeedbackDraft: jest.fn(),
      }),
    );

    result.current.handleEditarPerfil();

    expect(setNomeCompletoDraft).toHaveBeenCalledWith("Inspetor Tariel Silva");
    expect(setNomeExibicaoDraft).toHaveBeenCalledWith("Inspetor");
    expect(setTelefoneDraft).toHaveBeenCalledWith("(11) 99999-0000");
    expect(abrirSheetConfiguracao).toHaveBeenCalledWith({
      kind: "profile",
      title: "Editar perfil",
      subtitle:
        "Atualize nome, nome de exibição e telefone usados nesta conta.",
      actionLabel: "Salvar perfil",
    });
  });

  it("reseta ajuda e abre a central com o primeiro artigo expandido", () => {
    const abrirSheetConfiguracao = jest.fn();
    const setBuscaAjuda = jest.fn();
    const setArtigoAjudaExpandidoId = jest.fn();

    const { result } = renderHook(() =>
      useSettingsEntryActions({
        perfilNome: "",
        perfilExibicao: "",
        contaTelefone: "",
        emailAtualConta: "",
        fallbackEmail: "",
        abrirSheetConfiguracao,
        handleAbrirPaginaConfiguracoes: jest.fn(),
        setNomeCompletoDraft: jest.fn(),
        setNomeExibicaoDraft: jest.fn(),
        setTelefoneDraft: jest.fn(),
        setNovoEmailDraft: jest.fn(),
        setSenhaAtualDraft: jest.fn(),
        setNovaSenhaDraft: jest.fn(),
        setConfirmarSenhaDraft: jest.fn(),
        setBuscaAjuda,
        setArtigoAjudaExpandidoId,
        setBugDescriptionDraft: jest.fn(),
        setBugEmailDraft: jest.fn(),
        setBugAttachmentDraft: jest.fn(),
        setFeedbackDraft: jest.fn(),
      }),
    );

    result.current.handleCentralAjuda();

    expect(setBuscaAjuda).toHaveBeenCalledWith("");
    expect(setArtigoAjudaExpandidoId).toHaveBeenCalledWith(
      HELP_CENTER_ARTICLES[0]?.id ?? "",
    );
    expect(abrirSheetConfiguracao).toHaveBeenCalledWith({
      kind: "help",
      title: "Central de ajuda",
      subtitle:
        "Acesse artigos, respostas rápidas e atalhos para suporte do inspetor.",
    });
  });

  it("alterna o artigo expandido da ajuda e redireciona permissões", () => {
    const handleAbrirPaginaConfiguracoes = jest.fn();
    const setArtigoAjudaExpandidoId = jest.fn();

    const { result } = renderHook(() =>
      useSettingsEntryActions({
        perfilNome: "",
        perfilExibicao: "",
        contaTelefone: "",
        emailAtualConta: "",
        fallbackEmail: "",
        abrirSheetConfiguracao: jest.fn(),
        handleAbrirPaginaConfiguracoes,
        setNomeCompletoDraft: jest.fn(),
        setNomeExibicaoDraft: jest.fn(),
        setTelefoneDraft: jest.fn(),
        setNovoEmailDraft: jest.fn(),
        setSenhaAtualDraft: jest.fn(),
        setNovaSenhaDraft: jest.fn(),
        setConfirmarSenhaDraft: jest.fn(),
        setBuscaAjuda: jest.fn(),
        setArtigoAjudaExpandidoId,
        setBugDescriptionDraft: jest.fn(),
        setBugEmailDraft: jest.fn(),
        setBugAttachmentDraft: jest.fn(),
        setFeedbackDraft: jest.fn(),
      }),
    );

    result.current.handlePermissoes();
    result.current.handleAlternarArtigoAjuda("artigo-1");

    expect(handleAbrirPaginaConfiguracoes).toHaveBeenCalledWith(
      "seguranca",
      "permissoes",
    );
    expect(setArtigoAjudaExpandidoId).toHaveBeenCalledTimes(1);

    const updater = setArtigoAjudaExpandidoId.mock.calls[0]?.[0] as (
      current: string,
    ) => string;
    expect(updater("artigo-1")).toBe("");
    expect(updater("artigo-2")).toBe("artigo-1");
  });
});
