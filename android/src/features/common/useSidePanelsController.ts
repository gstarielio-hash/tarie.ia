import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  PanResponder,
  type PanResponderInstance,
} from "react-native";

import {
  HISTORY_PANEL_CLOSED_X,
  PANEL_ANIMATION_DURATION,
  PANEL_CLOSE_SWIPE_THRESHOLD,
  PANEL_EDGE_GESTURE_WIDTH,
  PANEL_OPEN_SWIPE_THRESHOLD,
  SCREEN_WIDTH,
  SETTINGS_PANEL_CLOSED_X,
} from "../InspectorMobileApp.constants";

interface UseSidePanelsControllerParams {
  configuracoesAberta: boolean;
  historicoAberto: boolean;
  keyboardHeight: number;
  resetSettingsNavigation: () => void;
  setBuscaHistorico: (value: string) => void;
  setConfiguracoesAberta: (value: boolean) => void;
  setHistoricoAberto: (value: boolean) => void;
}

interface UseSidePanelsControllerResult {
  configuracoesAbertaRef: React.MutableRefObject<boolean>;
  configuracoesDrawerX: Animated.Value;
  drawerOverlayOpacity: Animated.Value;
  fecharConfiguracoes: (options?: { manterOverlay?: boolean }) => void;
  fecharHistorico: (options?: {
    limparBusca?: boolean;
    manterOverlay?: boolean;
  }) => void;
  fecharPaineisLaterais: () => void;
  handleAbrirConfiguracoes: () => void;
  historyDrawerPanResponder: PanResponderInstance;
  historyEdgePanResponder: PanResponderInstance;
  historicoAbertoRef: React.MutableRefObject<boolean>;
  historicoDrawerX: Animated.Value;
  resetPainelLateralState: () => void;
  settingsDrawerPanResponder: PanResponderInstance;
  settingsEdgePanResponder: PanResponderInstance;
  abrirConfiguracoes: () => void;
  abrirHistorico: () => void;
}

export function useSidePanelsController({
  configuracoesAberta,
  historicoAberto,
  keyboardHeight,
  resetSettingsNavigation,
  setBuscaHistorico,
  setConfiguracoesAberta,
  setHistoricoAberto,
}: UseSidePanelsControllerParams): UseSidePanelsControllerResult {
  const historicoDrawerX = useRef(
    new Animated.Value(HISTORY_PANEL_CLOSED_X),
  ).current;
  const configuracoesDrawerX = useRef(
    new Animated.Value(SETTINGS_PANEL_CLOSED_X),
  ).current;
  const drawerOverlayOpacity = useRef(new Animated.Value(0)).current;
  const historicoAbertoRef = useRef(false);
  const configuracoesAbertaRef = useRef(false);
  const keyboardAbertoRef = useRef(false);

  function animarPainelLateral(
    valor: Animated.Value,
    toValue: number,
    onEnd?: () => void,
  ) {
    Animated.timing(valor, {
      toValue,
      duration: PANEL_ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && onEnd) {
        onEnd();
      }
    });
  }

  function fecharHistorico(options?: {
    limparBusca?: boolean;
    manterOverlay?: boolean;
  }) {
    if (!historicoAbertoRef.current && !historicoAberto) {
      historicoAbertoRef.current = false;
      if (options?.limparBusca) {
        setBuscaHistorico("");
      }
      historicoDrawerX.setValue(HISTORY_PANEL_CLOSED_X);
      if (!options?.manterOverlay && !configuracoesAbertaRef.current) {
        drawerOverlayOpacity.setValue(0);
      }
      return;
    }

    historicoAbertoRef.current = false;
    animarPainelLateral(historicoDrawerX, HISTORY_PANEL_CLOSED_X, () => {
      setHistoricoAberto(false);
      if (options?.limparBusca) {
        setBuscaHistorico("");
      }
    });

    if (!options?.manterOverlay && !configuracoesAbertaRef.current) {
      Animated.timing(drawerOverlayOpacity, {
        toValue: 0,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }

  function fecharConfiguracoes(options?: { manterOverlay?: boolean }) {
    if (!configuracoesAbertaRef.current && !configuracoesAberta) {
      configuracoesAbertaRef.current = false;
      configuracoesDrawerX.setValue(SETTINGS_PANEL_CLOSED_X);
      resetSettingsNavigation();
      if (!options?.manterOverlay && !historicoAbertoRef.current) {
        drawerOverlayOpacity.setValue(0);
      }
      return;
    }

    configuracoesAbertaRef.current = false;
    animarPainelLateral(configuracoesDrawerX, SETTINGS_PANEL_CLOSED_X, () => {
      setConfiguracoesAberta(false);
      resetSettingsNavigation();
    });

    if (!options?.manterOverlay && !historicoAbertoRef.current) {
      Animated.timing(drawerOverlayOpacity, {
        toValue: 0,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }

  function fecharPaineisLaterais() {
    if (historicoAbertoRef.current) {
      fecharHistorico({
        limparBusca: true,
        manterOverlay: configuracoesAbertaRef.current,
      });
    }
    if (configuracoesAbertaRef.current) {
      fecharConfiguracoes({ manterOverlay: historicoAbertoRef.current });
    }
  }

  function abrirHistorico() {
    if (configuracoesAbertaRef.current) {
      configuracoesAbertaRef.current = false;
      setConfiguracoesAberta(false);
      configuracoesDrawerX.setValue(SETTINGS_PANEL_CLOSED_X);
    }
    historicoAbertoRef.current = true;
    setHistoricoAberto(true);
    Animated.parallel([
      Animated.timing(drawerOverlayOpacity, {
        toValue: 1,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(historicoDrawerX, {
        toValue: 0,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function abrirConfiguracoes() {
    if (historicoAbertoRef.current) {
      historicoAbertoRef.current = false;
      setHistoricoAberto(false);
      historicoDrawerX.setValue(HISTORY_PANEL_CLOSED_X);
    }
    resetSettingsNavigation();
    configuracoesAbertaRef.current = true;
    setConfiguracoesAberta(true);
    Animated.parallel([
      Animated.timing(drawerOverlayOpacity, {
        toValue: 1,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(configuracoesDrawerX, {
        toValue: 0,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function handleAbrirConfiguracoes() {
    if (keyboardHeight > 0) {
      Keyboard.dismiss();
      return;
    }
    if (configuracoesAberta || configuracoesAbertaRef.current) {
      fecharConfiguracoes();
      return;
    }
    abrirConfiguracoes();
  }

  function resetPainelLateralState() {
    historicoAbertoRef.current = false;
    configuracoesAbertaRef.current = false;
    setHistoricoAberto(false);
    setConfiguracoesAberta(false);
    historicoDrawerX.setValue(HISTORY_PANEL_CLOSED_X);
    configuracoesDrawerX.setValue(SETTINGS_PANEL_CLOSED_X);
    drawerOverlayOpacity.setValue(0);
  }

  useEffect(() => {
    historicoAbertoRef.current = historicoAberto;
  }, [historicoAberto]);

  useEffect(() => {
    configuracoesAbertaRef.current = configuracoesAberta;
  }, [configuracoesAberta]);

  useEffect(() => {
    keyboardAbertoRef.current = keyboardHeight > 0;
  }, [keyboardHeight]);

  useEffect(() => {
    if (keyboardHeight <= 0) {
      return;
    }

    fecharPaineisLaterais();
  }, [keyboardHeight]);

  const historyEdgePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !keyboardAbertoRef.current &&
        !historicoAbertoRef.current &&
        !configuracoesAbertaRef.current &&
        gestureState.x0 <= PANEL_EDGE_GESTURE_WIDTH &&
        gestureState.dx > 8 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx >= PANEL_OPEN_SWIPE_THRESHOLD) {
          abrirHistorico();
        }
      },
    }),
  ).current;

  const settingsEdgePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !keyboardAbertoRef.current &&
        !historicoAbertoRef.current &&
        !configuracoesAbertaRef.current &&
        gestureState.x0 >= SCREEN_WIDTH - PANEL_EDGE_GESTURE_WIDTH &&
        gestureState.dx < -8 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx <= -PANEL_OPEN_SWIPE_THRESHOLD) {
          handleAbrirConfiguracoes();
        }
      },
    }),
  ).current;

  const historyDrawerPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        historicoAbertoRef.current &&
        gestureState.dx < -8 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx <= -PANEL_CLOSE_SWIPE_THRESHOLD) {
          fecharHistorico({ limparBusca: true });
        }
      },
    }),
  ).current;

  const settingsDrawerPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        configuracoesAbertaRef.current &&
        gestureState.dx > 8 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx >= PANEL_CLOSE_SWIPE_THRESHOLD) {
          fecharConfiguracoes();
        }
      },
    }),
  ).current;

  return {
    abrirConfiguracoes,
    abrirHistorico,
    configuracoesAbertaRef,
    configuracoesDrawerX,
    drawerOverlayOpacity,
    fecharConfiguracoes,
    fecharHistorico,
    fecharPaineisLaterais,
    handleAbrirConfiguracoes,
    historyDrawerPanResponder,
    historyEdgePanResponder,
    historicoAbertoRef,
    historicoDrawerX,
    resetPainelLateralState,
    settingsDrawerPanResponder,
    settingsEdgePanResponder,
  };
}
