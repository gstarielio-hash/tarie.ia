import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { RefObject } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
  type KeyboardAvoidingViewProps,
} from "react-native";

import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";
import { BrandIntroMark, BrandLaunchOverlay } from "../common/BrandElements";

interface LoginScreenProps {
  appGradientColors: readonly [string, string, ...string[]];
  keyboardAvoidingBehavior: KeyboardAvoidingViewProps["behavior"];
  loginKeyboardVerticalOffset: number;
  keyboardVisible: boolean;
  loginKeyboardBottomPadding: number;
  accentColor: string;
  carregando: boolean;
  fontScale: number;
  email: string;
  senha: string;
  erro: string;
  entrando: boolean;
  mostrarSenha: boolean;
  animacoesAtivas: boolean;
  introVisivel: boolean;
  emailInputRef: RefObject<TextInput | null>;
  senhaInputRef: RefObject<TextInput | null>;
  onEmailChange: (value: string) => void;
  onSenhaChange: (value: string) => void;
  onEmailSubmit: () => void;
  onSenhaSubmit: () => void;
  onToggleMostrarSenha: () => void;
  onEsqueciSenha: () => void;
  onLogin: () => void;
  onLoginSocial: (provider: "Google" | "Microsoft") => void;
  onIntroDone: () => void;
}

export function LoginScreen({
  appGradientColors,
  keyboardAvoidingBehavior,
  loginKeyboardVerticalOffset,
  keyboardVisible,
  loginKeyboardBottomPadding,
  accentColor,
  carregando,
  fontScale,
  email,
  senha,
  erro,
  entrando,
  mostrarSenha,
  animacoesAtivas,
  introVisivel,
  emailInputRef,
  senhaInputRef,
  onEmailChange,
  onSenhaChange,
  onEmailSubmit,
  onSenhaSubmit,
  onToggleMostrarSenha,
  onEsqueciSenha,
  onLogin,
  onLoginSocial,
  onIntroDone,
}: LoginScreenProps) {
  return (
    <LinearGradient colors={appGradientColors} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={keyboardAvoidingBehavior}
          keyboardVerticalOffset={loginKeyboardVerticalOffset}
          style={styles.keyboard}
        >
          <ScrollView
            contentContainerStyle={[
              styles.loginScrollContent,
              keyboardVisible ? styles.loginScrollContentKeyboardVisible : null,
              { paddingBottom: loginKeyboardBottomPadding },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.loginScreen}>
              <View style={styles.loginBrand}>
                <BrandIntroMark brandColor={accentColor} compact />
              </View>

              <View style={styles.loginCard}>
                {carregando ? (
                  <View style={styles.loadingState}>
                    <ActivityIndicator color={colors.accent} size="large" />
                    <Text style={styles.loadingText}>Preparando o app do inspetor...</Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.loginFields}>
                      <View style={styles.mobileField}>
                        <MaterialCommunityIcons color={colors.ink600} name="email-outline" size={22} />
                        <TextInput
                          ref={emailInputRef}
                          autoCapitalize="none"
                          autoComplete="email"
                          autoCorrect={false}
                          importantForAutofill="yes"
                          keyboardType="email-address"
                          onChangeText={onEmailChange}
                          onSubmitEditing={onEmailSubmit}
                          placeholder="Email"
                          placeholderTextColor="#8EA0B3"
                          returnKeyType="next"
                          style={[styles.mobileFieldInput, { fontSize: 17 * fontScale }]}
                          testID="login-email-input"
                          textContentType="emailAddress"
                          value={email}
                        />
                      </View>

                      <View style={styles.mobileField}>
                        <MaterialCommunityIcons color={colors.ink600} name="lock-outline" size={22} />
                        <TextInput
                          ref={senhaInputRef}
                          autoCapitalize="none"
                          autoComplete="password"
                          importantForAutofill="yes"
                          onChangeText={onSenhaChange}
                          onSubmitEditing={onSenhaSubmit}
                          placeholder="Password"
                          placeholderTextColor="#8EA0B3"
                          returnKeyType="done"
                          secureTextEntry={!mostrarSenha}
                          style={[styles.mobileFieldInput, { fontSize: 17 * fontScale }]}
                          testID="login-password-input"
                          textContentType="password"
                          value={senha}
                        />
                        <Pressable
                          onPress={onToggleMostrarSenha}
                          style={styles.mobileFieldAction}
                          testID="toggle-password-visibility-button"
                        >
                          <MaterialCommunityIcons
                            color="#8EA0B3"
                            name={mostrarSenha ? "eye-off-outline" : "eye-outline"}
                            size={20}
                          />
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.loginForgotRow}>
                      <View />
                      <Pressable onPress={onEsqueciSenha}>
                        <Text style={styles.loginForgotLink}>Esqueceu a senha?</Text>
                      </Pressable>
                    </View>

                    {!!erro && <Text style={styles.errorText}>{erro}</Text>}

                    <Pressable
                      disabled={entrando}
                      onPress={onLogin}
                      style={[
                        styles.loginPrimaryButton,
                        { backgroundColor: accentColor, shadowColor: accentColor },
                        entrando ? styles.primaryButtonDisabled : null,
                      ]}
                      testID="login-submit-button"
                    >
                      {entrando ? (
                        <ActivityIndicator color={colors.white} />
                      ) : (
                        <Text style={styles.loginPrimaryButtonText}>Login</Text>
                      )}
                    </Pressable>

                    <View style={styles.loginDividerRow}>
                      <View style={styles.loginDividerLine} />
                      <Text style={styles.loginDividerText}>ou</Text>
                      <View style={styles.loginDividerLine} />
                    </View>

                    <View style={styles.loginSocialStack}>
                      <Text style={styles.loginSocialLabel}>Entrar com</Text>
                      <Pressable
                        onPress={() => onLoginSocial("Google")}
                        style={styles.loginSocialButton}
                        testID="login-google-button"
                      >
                        <View style={styles.loginSocialIconShell}>
                          <MaterialCommunityIcons color={colors.textPrimary} name="google" size={18} />
                        </View>
                        <Text style={styles.loginSocialButtonText}>Continuar com Google</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onLoginSocial("Microsoft")}
                        style={styles.loginSocialButton}
                        testID="login-microsoft-button"
                      >
                        <View style={styles.loginSocialIconShell}>
                          <MaterialCommunityIcons color={colors.textPrimary} name="microsoft-windows" size={18} />
                        </View>
                        <Text style={styles.loginSocialButtonText}>Continuar com Microsoft</Text>
                      </Pressable>
                    </View>

                    <Text style={styles.loginFooterText}>
                      Precisa de acesso? Fale com o administrador da sua empresa.
                    </Text>
                  </>
                )}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <BrandLaunchOverlay
        accentColor={accentColor}
        animationsEnabled={animacoesAtivas}
        onDone={onIntroDone}
        visible={introVisivel}
      />
    </LinearGradient>
  );
}
