import type { Dispatch, RefObject, SetStateAction } from "react";
import type { TextInput } from "react-native";

import type { LoginScreenProps } from "./LoginScreen";

interface BuildLoginScreenPropsInput {
  accentColor: string;
  animacoesAtivas: boolean;
  appGradientColors: readonly [string, string, ...string[]];
  carregando: boolean;
  email: string;
  emailInputRef: RefObject<TextInput | null>;
  entrando: boolean;
  erro: string;
  fontScale: number;
  handleEsqueciSenha: () => void | Promise<void>;
  handleLogin: () => void | Promise<void>;
  handleLoginSocial: (provider: "Google" | "Microsoft") => void | Promise<void>;
  introVisivel: boolean;
  keyboardAvoidingBehavior: LoginScreenProps["keyboardAvoidingBehavior"];
  keyboardVisible: boolean;
  loginKeyboardBottomPadding: number;
  loginKeyboardVerticalOffset: number;
  mostrarSenha: boolean;
  senha: string;
  senhaInputRef: RefObject<TextInput | null>;
  setEmail: Dispatch<SetStateAction<string>>;
  setIntroVisivel: Dispatch<SetStateAction<boolean>>;
  setMostrarSenha: Dispatch<SetStateAction<boolean>>;
  setSenha: Dispatch<SetStateAction<string>>;
}

export function buildLoginScreenProps(
  input: BuildLoginScreenPropsInput,
): LoginScreenProps {
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
