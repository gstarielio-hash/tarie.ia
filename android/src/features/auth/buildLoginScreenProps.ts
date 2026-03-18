import type { ComponentProps } from "react";

import { LoginScreen } from "./LoginScreen";

type BuildLoginScreenPropsInput = Record<string, any>;

export function buildLoginScreenProps(
  input: BuildLoginScreenPropsInput,
): ComponentProps<typeof LoginScreen> {
  const {
    accentColor,
    animacoesAtivas,
    appGradientColors,
    carregando,
    email,
    emailInputRef,
    entrando,
    erro,
    fontScale,
    handleEsqueciSenha,
    handleLogin,
    handleLoginSocial,
    introVisivel,
    keyboardAvoidingBehavior,
    keyboardVisible,
    loginKeyboardBottomPadding,
    loginKeyboardVerticalOffset,
    mostrarSenha,
    senha,
    senhaInputRef,
    setEmail,
    setIntroVisivel,
    setMostrarSenha,
    setSenha,
  } = input;

  return {
    accentColor,
    animacoesAtivas,
    appGradientColors,
    carregando,
    email,
    emailInputRef,
    entrando,
    erro,
    fontScale,
    introVisivel,
    keyboardAvoidingBehavior,
    keyboardVisible,
    loginKeyboardBottomPadding,
    loginKeyboardVerticalOffset,
    mostrarSenha,
    onEmailChange: setEmail,
    onEmailSubmit: () => senhaInputRef.current?.focus(),
    onEsqueciSenha: () => {
      void handleEsqueciSenha();
    },
    onIntroDone: () => setIntroVisivel(false),
    onLogin: () => {
      void handleLogin();
    },
    onLoginSocial: (provider: "Google" | "Microsoft") => {
      void handleLoginSocial(provider);
    },
    onSenhaChange: setSenha,
    onSenhaSubmit: () => {
      if (entrando) {
        return;
      }
      void handleLogin();
    },
    onToggleMostrarSenha: () => setMostrarSenha((current: boolean) => !current),
    senha,
    senhaInputRef,
  };
}
