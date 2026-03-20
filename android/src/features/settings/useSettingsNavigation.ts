import { useRef, useState, type Dispatch, type SetStateAction } from "react";

import type {
  ConfirmSheetState,
  SettingsSheetState,
} from "./settingsSheetTypes";
import type {
  SettingsDrawerPage,
  SettingsSectionKey,
} from "./settingsNavigationMeta";

type SettingsDrawerSection = SettingsSectionKey | "all";

interface SettingsNavigationState {
  page: SettingsDrawerPage;
  section: SettingsDrawerSection;
}

function pushSettingsNavigationState(
  historyRef: { current: SettingsNavigationState[] },
  state: SettingsNavigationState,
): void {
  const history = historyRef.current;
  const last = history[history.length - 1];
  if (last && last.page === state.page && last.section === state.section) {
    return;
  }
  history.push(state);
}

interface UseSettingsNavigationState {
  settingsDrawerPage: SettingsDrawerPage;
  settingsDrawerSection: SettingsDrawerSection;
  settingsSheet: SettingsSheetState | null;
  settingsSheetLoading: boolean;
  settingsSheetNotice: string;
  confirmSheet: ConfirmSheetState | null;
  confirmTextDraft: string;
}

interface UseSettingsNavigationActions {
  setConfirmTextDraft: Dispatch<SetStateAction<string>>;
  setSettingsSheetLoading: Dispatch<SetStateAction<boolean>>;
  setSettingsSheetNotice: Dispatch<SetStateAction<string>>;
  handleAbrirPaginaConfiguracoes: (
    page: SettingsDrawerPage,
    section?: SettingsDrawerSection,
  ) => void;
  handleAbrirSecaoConfiguracoes: (section: SettingsSectionKey) => void;
  handleVoltarResumoConfiguracoes: () => void;
  abrirSheetConfiguracao: (config: SettingsSheetState) => void;
  fecharSheetConfiguracao: () => void;
  abrirConfirmacaoConfiguracao: (config: ConfirmSheetState) => void;
  fecharConfirmacaoConfiguracao: () => void;
  notificarConfiguracaoConcluida: (mensagem: string) => void;
  resetSettingsNavigation: () => void;
  resetSettingsUi: () => void;
  clearTransientSettingsUiPreservingReauth: () => void;
}

export function useSettingsNavigation(): {
  state: UseSettingsNavigationState;
  actions: UseSettingsNavigationActions;
} {
  const [settingsDrawerPage, setSettingsDrawerPage] =
    useState<SettingsDrawerPage>("overview");
  const [settingsDrawerSection, setSettingsDrawerSection] =
    useState<SettingsDrawerSection>("all");
  const [settingsSheet, setSettingsSheet] = useState<SettingsSheetState | null>(
    null,
  );
  const [settingsSheetLoading, setSettingsSheetLoading] = useState(false);
  const [settingsSheetNotice, setSettingsSheetNotice] = useState("");
  const [confirmSheet, setConfirmSheet] = useState<ConfirmSheetState | null>(
    null,
  );
  const [confirmTextDraft, setConfirmTextDraft] = useState("");
  const settingsNavigationHistoryRef = useRef<SettingsNavigationState[]>([]);

  function resetSettingsNavigation() {
    setSettingsDrawerPage("overview");
    setSettingsDrawerSection("all");
    settingsNavigationHistoryRef.current = [];
  }

  function resetSettingsUi() {
    resetSettingsNavigation();
    setSettingsSheet(null);
    setSettingsSheetLoading(false);
    setSettingsSheetNotice("");
    setConfirmSheet(null);
    setConfirmTextDraft("");
  }

  function clearTransientSettingsUiPreservingReauth() {
    setConfirmSheet(null);
    setConfirmTextDraft("");
    setSettingsSheet((estadoAtual) =>
      estadoAtual?.kind === "reauth" ? estadoAtual : null,
    );
    setSettingsSheetLoading(false);
    setSettingsSheetNotice("");
  }

  function handleAbrirPaginaConfiguracoes(
    page: SettingsDrawerPage,
    section: SettingsDrawerSection = "all",
  ) {
    if (settingsDrawerPage === page && settingsDrawerSection === section) {
      return;
    }
    pushSettingsNavigationState(settingsNavigationHistoryRef, {
      page: settingsDrawerPage,
      section: settingsDrawerSection,
    });
    setSettingsDrawerPage(page);
    setSettingsDrawerSection(section);
  }

  function handleAbrirSecaoConfiguracoes(section: SettingsSectionKey) {
    if (settingsDrawerSection === section) {
      return;
    }
    pushSettingsNavigationState(settingsNavigationHistoryRef, {
      page: settingsDrawerPage,
      section: settingsDrawerSection,
    });
    setSettingsDrawerSection(section);
  }

  function handleVoltarResumoConfiguracoes() {
    const anterior = settingsNavigationHistoryRef.current.pop();
    if (anterior) {
      setSettingsDrawerPage(anterior.page);
      setSettingsDrawerSection(anterior.section);
      return;
    }

    if (settingsDrawerSection !== "all") {
      setSettingsDrawerSection("all");
      return;
    }

    resetSettingsNavigation();
  }

  function abrirSheetConfiguracao(config: SettingsSheetState) {
    setSettingsSheetNotice("");
    setSettingsSheetLoading(false);
    setSettingsSheet(config);
  }

  function fecharSheetConfiguracao() {
    setSettingsSheet(null);
    setSettingsSheetLoading(false);
    setSettingsSheetNotice("");
  }

  function abrirConfirmacaoConfiguracao(config: ConfirmSheetState) {
    setConfirmTextDraft("");
    setConfirmSheet(config);
  }

  function fecharConfirmacaoConfiguracao() {
    setConfirmTextDraft("");
    setConfirmSheet(null);
  }

  function notificarConfiguracaoConcluida(mensagem: string) {
    setSettingsSheetNotice(mensagem);
  }

  return {
    state: {
      settingsDrawerPage,
      settingsDrawerSection,
      settingsSheet,
      settingsSheetLoading,
      settingsSheetNotice,
      confirmSheet,
      confirmTextDraft,
    },
    actions: {
      setConfirmTextDraft,
      setSettingsSheetLoading,
      setSettingsSheetNotice,
      handleAbrirPaginaConfiguracoes,
      handleAbrirSecaoConfiguracoes,
      handleVoltarResumoConfiguracoes,
      abrirSheetConfiguracao,
      fecharSheetConfiguracao,
      abrirConfirmacaoConfiguracao,
      fecharConfirmacaoConfiguracao,
      notificarConfiguracaoConcluida,
      resetSettingsNavigation,
      resetSettingsUi,
      clearTransientSettingsUiPreservingReauth,
    },
  };
}
