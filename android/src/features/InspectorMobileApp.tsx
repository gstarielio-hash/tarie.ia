import * as SecureStore from "expo-secure-store";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  API_BASE_URL,
  carregarBootstrapMobile,
  carregarMensagensLaudo,
  carregarStatusLaudo,
  enviarMensagemChatMobile,
  loginInspectorMobile,
  logoutInspectorMobile,
  pingApi,
  reabrirLaudoMobile,
} from "../config/api";
import { StatusPill } from "../components/StatusPill";
import { colors, radii, spacing } from "../theme/tokens";
import type {
  ApiHealthStatus,
  MobileBootstrapResponse,
  MobileChatMessage,
  MobileEstadoLaudo,
  MobileLaudoCard,
  MobileLaudoMensagensResponse,
  MobileLaudoStatusResponse,
} from "../types/mobile";

const TOKEN_KEY = "tariel_inspetor_access_token";
const EMAIL_KEY = "tariel_inspetor_email";

interface MobileSessionState {
  accessToken: string;
  bootstrap: MobileBootstrapResponse;
}

interface ChatState {
  laudoId: number | null;
  estado: MobileEstadoLaudo | string;
  statusCard: string;
  permiteEdicao: boolean;
  permiteReabrir: boolean;
  laudoCard: MobileLaudoCard | null;
  mensagens: MobileChatMessage[];
}

const quickActions = [{ icon: "message-processing-outline", label: "Chat focado no inspetor" }];

const MENSAGEM_BOAS_VINDAS: MobileChatMessage = {
  id: null,
  papel: "assistente",
  texto:
    "Estou pronto para abrir sua inspeção. Envie a primeira mensagem com o contexto do local, equipamento ou ocorrência e eu começo o laudo com você.",
  tipo: "ia",
  modo: "detalhado",
};

function obterNomeCurto(nomeCompleto: string): string {
  return (nomeCompleto || "").trim().split(/\s+/)[0] || "Inspetor";
}

function montarHistoricoParaEnvio(
  mensagens: MobileChatMessage[],
): Array<{ papel: "usuario" | "assistente"; texto: string }> {
  return mensagens
    .filter(
      (mensagem) =>
        (mensagem.papel === "usuario" || mensagem.papel === "assistente") &&
        typeof mensagem.texto === "string" &&
        mensagem.texto.trim(),
    )
    .slice(-20)
    .map((mensagem) => ({
      papel: mensagem.papel === "usuario" ? "usuario" : "assistente",
      texto: mensagem.texto.trim(),
    }));
}

function normalizarConversa(
  payload: MobileLaudoStatusResponse | MobileLaudoMensagensResponse,
): ChatState {
  return {
    laudoId: payload.laudo_id ?? null,
    estado: payload.estado,
    statusCard: payload.status_card || "aberto",
    permiteEdicao: Boolean(payload.permite_edicao),
    permiteReabrir: Boolean(payload.permite_reabrir),
    laudoCard: payload.laudo_card || null,
    mensagens: "itens" in payload ? payload.itens : [],
  };
}

function obterTonsStatusLaudo(statusCard: string): { fundo: string; texto: string } {
  const mapa: Record<string, { fundo: string; texto: string }> = {
    aberto: { fundo: "#E8F4EC", texto: "#1F7A4C" },
    aguardando: { fundo: "#EEF2F6", texto: "#3D556F" },
    ajustes: { fundo: "#FFF0E5", texto: "#B85A11" },
    aprovado: { fundo: "#EAF7F1", texto: "#187048" },
  };

  return mapa[statusCard] || { fundo: "#EEF2F6", texto: "#3D556F" };
}

export function InspectorMobileApp() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(true);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [statusApi, setStatusApi] = useState<ApiHealthStatus>("checking");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [entrando, setEntrando] = useState(false);
  const [session, setSession] = useState<MobileSessionState | null>(null);
  const [conversa, setConversa] = useState<ChatState | null>(null);
  const [carregandoConversa, setCarregandoConversa] = useState(false);
  const [sincronizandoConversa, setSincronizandoConversa] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erroConversa, setErroConversa] = useState("");
  const [enviandoMensagem, setEnviandoMensagem] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    void bootstrapApp();
  }, []);

  useEffect(() => {
    if (!session) {
      setConversa(null);
      setErroConversa("");
      return;
    }

    void carregarConversaAtual(session.accessToken);
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const timeout = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 60);

    return () => clearTimeout(timeout);
  }, [conversa?.mensagens.length, session]);

  async function bootstrapApp() {
    setCarregando(true);
    setErro("");

    const [online, savedEmail, savedToken] = await Promise.all([
      pingApi(),
      SecureStore.getItemAsync(EMAIL_KEY),
      SecureStore.getItemAsync(TOKEN_KEY),
    ]);

    setStatusApi(online ? "online" : "offline");
    if (savedEmail) {
      setEmail(savedEmail);
    }

    if (savedToken) {
      try {
        const bootstrap = await carregarBootstrapMobile(savedToken);
        setSession({ accessToken: savedToken, bootstrap });
      } catch {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
    }

    setCarregando(false);
  }

  async function handleLogin() {
    if (!email.trim() || !senha.trim()) {
      setErro("Preencha e-mail e senha para entrar no app.");
      return;
    }

    setEntrando(true);
    setErro("");

    try {
      const login = await loginInspectorMobile(email, senha, lembrar);
      const bootstrap = await carregarBootstrapMobile(login.access_token);

      if (lembrar) {
        await Promise.all([
          SecureStore.setItemAsync(TOKEN_KEY, login.access_token),
          SecureStore.setItemAsync(EMAIL_KEY, email.trim()),
        ]);
      } else {
        await Promise.all([
          SecureStore.deleteItemAsync(TOKEN_KEY),
          SecureStore.deleteItemAsync(EMAIL_KEY),
        ]);
      }

      setSenha("");
      setSession({ accessToken: login.access_token, bootstrap });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao autenticar no app.";
      setErro(message);
    } finally {
      setEntrando(false);
    }
  }

  async function handleRefresh() {
    const online = await pingApi();
    setStatusApi(online ? "online" : "offline");

    if (session) {
      await carregarConversaAtual(session.accessToken, true);
    }
  }

  async function handleLogout() {
    try {
      if (session) {
        await logoutInspectorMobile(session.accessToken);
      }
    } catch {
      // Mantém a saída local mesmo se o backend já tiver expirado o token.
    } finally {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setSession(null);
      setConversa(null);
      setMensagem("");
      setSenha("");
    }
  }

  async function carregarConversaAtual(accessToken: string, silencioso = false) {
    if (silencioso) {
      setSincronizandoConversa(true);
    } else {
      setCarregandoConversa(true);
    }
    setErroConversa("");

    try {
      const status = await carregarStatusLaudo(accessToken);
      let proximaConversa = normalizarConversa(status);

      if (status.laudo_id) {
        const historico = await carregarMensagensLaudo(accessToken, status.laudo_id);
        proximaConversa = normalizarConversa(historico);
      }

      setConversa(proximaConversa);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível atualizar a conversa do inspetor.";
      setErroConversa(message);
    } finally {
      setCarregandoConversa(false);
      setSincronizandoConversa(false);
    }
  }

  async function handleReabrir() {
    if (!session || !conversa?.laudoId) {
      return;
    }

    try {
      await reabrirLaudoMobile(session.accessToken, conversa.laudoId);
      await carregarConversaAtual(session.accessToken, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível reabrir o laudo.";
      Alert.alert("Reabrir laudo", message);
    }
  }

  async function handleEnviarMensagem() {
    const texto = mensagem.trim();
    if (!texto || !session) {
      return;
    }
    if (conversa && !conversa.permiteEdicao) {
      return;
    }

    const mensagemOtimista: MobileChatMessage = {
      id: Date.now(),
      papel: "usuario",
      texto,
      tipo: "user",
      modo: "detalhado",
    };
    const snapshotConversa = conversa;

    setMensagem("");
    setErroConversa("");
    setEnviandoMensagem(true);
    setConversa((estadoAtual) => ({
      laudoId: estadoAtual?.laudoId || null,
      estado: estadoAtual?.estado || "sem_relatorio",
      statusCard: estadoAtual?.statusCard || "aberto",
      permiteEdicao: estadoAtual?.permiteEdicao ?? true,
      permiteReabrir: estadoAtual?.permiteReabrir ?? false,
      laudoCard: estadoAtual?.laudoCard || null,
      mensagens: [...(estadoAtual?.mensagens || []), mensagemOtimista],
    }));

    try {
      await enviarMensagemChatMobile(session.accessToken, {
        mensagem: texto,
        laudoId: snapshotConversa?.laudoId ?? null,
        historico: montarHistoricoParaEnvio([...(snapshotConversa?.mensagens || []), mensagemOtimista]),
      });
      await carregarConversaAtual(session.accessToken, true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível enviar a mensagem do inspetor.";
      setMensagem(texto);
      setConversa(snapshotConversa);
      setErroConversa(message);
    } finally {
      setEnviandoMensagem(false);
    }
  }

  const tituloPrincipal = session
    ? `Olá, ${obterNomeCurto(session.bootstrap.usuario.nome_completo)}`
    : "Operação de campo em um app próprio";

  const subtitulo = session
    ? "Seu app mobile já está ligado ao chat do inspetor com uma conversa limpa e leve."
    : "Essa base nasce separada da web e pronta para Android e iPhone com um código só.";

  const conversaAtiva = conversa;
  const mensagensVisiveis =
    conversaAtiva && conversaAtiva.mensagens.length > 0 ? conversaAtiva.mensagens : [MENSAGEM_BOAS_VINDAS];
  const podeEditarConversa = conversaAtiva ? conversaAtiva.permiteEdicao : true;
  const resumoConversa = !conversaAtiva?.laudoId
    ? "A conversa nasce limpa. Sua primeira mensagem já abre o laudo no app."
    : conversaAtiva.permiteReabrir
      ? "A mesa liberou ajustes. Reabra o laudo para voltar a editar."
      : !conversaAtiva.permiteEdicao
        ? "Esse laudo está em leitura por enquanto. Atualize o status ou aguarde retorno da mesa."
        : conversaAtiva.laudoCard?.preview || "Conversa ativa. Continue descrevendo a inspeção como se estivesse no chat web.";
  const tituloConversa = conversaAtiva?.laudoCard?.titulo || "Nova inspeção";
  const placeholderComposer = conversaAtiva?.permiteReabrir
    ? "Reabra o laudo para continuar."
    : conversaAtiva && !conversaAtiva.permiteEdicao
      ? "Laudo em modo leitura."
      : "Escreva sua mensagem de inspeção...";
  const tonsStatus = obterTonsStatusLaudo(conversaAtiva?.statusCard || "aberto");

  if (session) {
    return (
      <LinearGradient colors={[colors.ink900, colors.ink800, colors.ink600]} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView
            style={styles.keyboard}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.chatLayout}>
              <View style={styles.chatHeader}>
                <View style={styles.chatHeaderTop}>
                  <View style={styles.userBadge}>
                    <Text style={styles.userBadgeText}>
                      {obterNomeCurto(session.bootstrap.usuario.nome_completo).slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.chatHeaderCopy}>
                    <Text style={styles.chatEyebrow}>tariel.ia</Text>
                    <Text style={styles.chatTitle}>Chat do Inspetor</Text>
                    <Text style={styles.chatSubtitle}>{session.bootstrap.usuario.empresa_nome}</Text>
                  </View>
                </View>

                <View style={styles.chatHeaderActions}>
                  <StatusPill status={statusApi} />
                  <Pressable onPress={handleRefresh} style={styles.iconButton}>
                    <MaterialCommunityIcons name="refresh" size={20} color={colors.white} />
                  </Pressable>
                  <Pressable onPress={handleLogout} style={styles.iconButton}>
                    <MaterialCommunityIcons name="logout-variant" size={20} color={colors.white} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.chatPanel}>
                <View style={styles.threadHeaderCard}>
                  <View style={styles.threadHeaderTop}>
                    <View style={styles.threadHeaderCopy}>
                      <Text style={styles.threadEyebrow}>{tituloPrincipal}</Text>
                      <Text style={styles.threadTitle}>{tituloConversa}</Text>
                    </View>
                    <View style={[styles.laudoStatusBadge, { backgroundColor: tonsStatus.fundo }]}>
                      <Text style={[styles.laudoStatusText, { color: tonsStatus.texto }]}>
                        {conversaAtiva?.laudoCard?.status_card_label || "Aberto"}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.threadDescription}>{resumoConversa}</Text>

                  <View style={styles.threadMetaRow}>
                    <Text style={styles.threadMetaText}>
                      {conversaAtiva?.laudoCard
                        ? `Laudo #${conversaAtiva.laudoCard.id} • ${conversaAtiva.laudoCard.data_br} às ${conversaAtiva.laudoCard.hora_br}`
                        : "A primeira mensagem já cria um laudo padrão para você."}
                    </Text>
                    {sincronizandoConversa ? <ActivityIndicator size="small" color={colors.accent} /> : null}
                  </View>

                  {conversaAtiva?.permiteReabrir ? (
                    <Pressable onPress={handleReabrir} style={styles.reopenButton}>
                      <MaterialCommunityIcons name="history" size={16} color={colors.accent} />
                      <Text style={styles.reopenButtonText}>Reabrir laudo</Text>
                    </Pressable>
                  ) : null}
                </View>

                {!!erroConversa && <Text style={styles.errorText}>{erroConversa}</Text>}

                <View style={styles.threadBody}>
                  {carregandoConversa && !conversaAtiva ? (
                    <View style={styles.loadingState}>
                      <ActivityIndicator size="large" color={colors.accent} />
                      <Text style={styles.loadingText}>Carregando a conversa do inspetor...</Text>
                    </View>
                  ) : (
                    <ScrollView
                      ref={scrollRef}
                      contentContainerStyle={styles.threadContent}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                    >
                      {mensagensVisiveis.map((item, index) => {
                        const mensagemEhUsuario = item.papel === "usuario";
                        const mensagemEhEngenharia = item.papel === "engenheiro";

                        return (
                          <View
                            key={`${item.id ?? "placeholder"}-${index}`}
                            style={[
                              styles.messageRow,
                              mensagemEhUsuario ? styles.messageRowOutgoing : styles.messageRowIncoming,
                            ]}
                          >
                            <View
                              style={[
                                styles.messageBubble,
                                mensagemEhUsuario
                                  ? styles.messageBubbleOutgoing
                                  : mensagemEhEngenharia
                                    ? styles.messageBubbleEngineering
                                    : styles.messageBubbleIncoming,
                              ]}
                            >
                              <Text style={[styles.messageAuthor, mensagemEhUsuario ? styles.messageAuthorOutgoing : null]}>
                                {mensagemEhUsuario ? "Você" : mensagemEhEngenharia ? "Mesa" : "Tariel.ia"}
                              </Text>
                              <Text style={[styles.messageText, mensagemEhUsuario ? styles.messageTextOutgoing : null]}>
                                {item.texto}
                              </Text>
                              {item.citacoes?.length ? (
                                <Text style={styles.messageMeta}>
                                  {item.citacoes.length} referência{item.citacoes.length > 1 ? "s" : ""} anexada
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        );
                      })}

                      {enviandoMensagem ? (
                        <View style={styles.typingRow}>
                          <View style={styles.typingBubble}>
                            <ActivityIndicator size="small" color={colors.accent} />
                            <Text style={styles.typingText}>Tariel.ia está respondendo...</Text>
                          </View>
                        </View>
                      ) : null}
                    </ScrollView>
                  )}
                </View>

                <View style={styles.composerCard}>
                  <Text style={styles.composerHint}>
                    {podeEditarConversa
                      ? "Converse como no portal web, mas com a tela limpa para o campo."
                      : "Esse laudo está bloqueado para edição neste momento."}
                  </Text>

                  <View style={styles.composerRow}>
                    <TextInput
                      editable={podeEditarConversa && !enviandoMensagem && !carregandoConversa}
                      multiline
                      onChangeText={setMensagem}
                      placeholder={placeholderComposer}
                      placeholderTextColor={colors.textSecondary}
                      style={[styles.composerInput, !(podeEditarConversa && !carregandoConversa) ? styles.composerInputDisabled : null]}
                      value={mensagem}
                    />

                    <Pressable
                      disabled={!mensagem.trim() || enviandoMensagem || carregandoConversa || !podeEditarConversa}
                      onPress={handleEnviarMensagem}
                      style={[
                        styles.sendButton,
                        !mensagem.trim() || enviandoMensagem || carregandoConversa || !podeEditarConversa
                          ? styles.sendButtonDisabled
                          : null,
                      ]}
                    >
                      {enviandoMensagem ? (
                        <ActivityIndicator color={colors.white} size="small" />
                      ) : (
                        <MaterialCommunityIcons name="send" size={20} color={colors.white} />
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[colors.ink900, colors.ink800, colors.ink600]} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.heroCard}>
              <View style={styles.brandRow}>
                <View>
                  <Text style={styles.brandEyebrow}>tariel.ia</Text>
                  <Text style={styles.brandTitle}>Tariel Inspetor</Text>
                </View>
                <StatusPill status={statusApi} />
              </View>

              <Text style={styles.heroTitle}>{tituloPrincipal}</Text>
              <Text style={styles.heroDescription}>{subtitulo}</Text>

              <View style={styles.heroTags}>
                {quickActions.map((item) => (
                  <View key={item.label} style={styles.heroTag}>
                    <MaterialCommunityIcons name={item.icon as never} size={18} color={colors.white} />
                    <Text style={styles.heroTagLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.serverCard}>
                <Text style={styles.serverLabel}>Endpoint ativo</Text>
                <Text style={styles.serverValue}>{API_BASE_URL}</Text>
                <Pressable onPress={handleRefresh} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Atualizar conexão</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.formCard}>
              {carregando ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator size="large" color={colors.accent} />
                  <Text style={styles.loadingText}>Preparando o app do inspetor...</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.formEyebrow}>Portal do Inspetor</Text>
                  <Text style={styles.formTitle}>Entre no app mobile</Text>
                  <Text style={styles.formDescription}>
                    Use o acesso já liberado para o inspetor no Tariel.ia.
                  </Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>E-mail corporativo</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoComplete="email"
                      keyboardType="email-address"
                      onChangeText={setEmail}
                      placeholder="nome@empresa.com.br"
                      placeholderTextColor={colors.textSecondary}
                      style={styles.input}
                      value={email}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Senha</Text>
                    <View style={styles.passwordWrapper}>
                      <TextInput
                        autoCapitalize="none"
                        autoComplete="password"
                        onChangeText={setSenha}
                        placeholder="••••••••"
                        placeholderTextColor={colors.textSecondary}
                        secureTextEntry={!mostrarSenha}
                        style={styles.passwordInput}
                        value={senha}
                      />
                      <Pressable onPress={() => setMostrarSenha((current) => !current)} style={styles.passwordToggle}>
                        <MaterialCommunityIcons
                          name={mostrarSenha ? "eye-off-outline" : "eye-outline"}
                          size={20}
                          color={colors.textSecondary}
                        />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.switchRow}>
                    <View>
                      <Text style={styles.switchLabel}>Manter sessão neste dispositivo</Text>
                      <Text style={styles.switchHint}>Salva o token de acesso do inspetor com segurança.</Text>
                    </View>
                    <Switch
                      onValueChange={setLembrar}
                      thumbColor={lembrar ? colors.accent : colors.surfaceStroke}
                      trackColor={{ false: "#C5D1DD", true: "#F7B17A" }}
                      value={lembrar}
                    />
                  </View>

                  {!!erro && <Text style={styles.errorText}>{erro}</Text>}

                  <Pressable disabled={entrando} onPress={handleLogin} style={[styles.primaryButton, entrando && styles.primaryButtonDisabled]}>
                    {entrando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Entrar no app</Text>}
                  </Pressable>

                  <Text style={styles.footerHint}>
                    A primeira versão do app prioriza o fluxo real do chat do inspetor e depois cresce para câmera, anexos e mesa no próprio mobile.
                  </Text>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  heroCard: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  brandEyebrow: {
    color: colors.accentSoft,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  brandTitle: {
    color: colors.white,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 4,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  heroDescription: {
    color: "rgba(238,243,247,0.8)",
    fontSize: 15,
    lineHeight: 22,
  },
  heroTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  heroTag: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  heroTagLabel: {
    color: colors.white,
    fontWeight: "700",
  },
  serverCard: {
    marginTop: spacing.sm,
    backgroundColor: "rgba(9,16,25,0.35)",
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  serverLabel: {
    color: colors.accentSoft,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    fontWeight: "700",
  },
  serverValue: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryButton: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  secondaryButtonText: {
    color: colors.white,
    fontWeight: "700",
  },
  formCard: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
    shadowColor: colors.ink900,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  dashboardState: {
    gap: spacing.md,
  },
  formEyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  formTitle: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "800",
  },
  formDescription: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceStroke,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 15,
  },
  passwordWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceStroke,
    backgroundColor: colors.white,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 15,
  },
  passwordToggle: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  switchRow: {
    marginTop: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  switchLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  switchHint: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    maxWidth: 240,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "600",
  },
  primaryButton: {
    marginTop: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.75,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "800",
  },
  footerHint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  chatLayout: {
    flex: 1,
  },
  chatHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  chatHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  userBadge: {
    width: 46,
    height: 46,
    borderRadius: radii.pill,
    backgroundColor: "rgba(244,123,32,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  userBadgeText: {
    color: colors.accentSoft,
    fontSize: 18,
    fontWeight: "800",
  },
  chatHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  chatEyebrow: {
    color: colors.accentSoft,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  chatTitle: {
    color: colors.white,
    fontSize: 24,
    fontWeight: "800",
  },
  chatSubtitle: {
    color: "rgba(238,243,247,0.74)",
    fontSize: 13,
  },
  chatHeaderActions: {
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  chatPanel: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  threadHeaderCard: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceStroke,
    gap: spacing.sm,
  },
  threadHeaderTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  threadHeaderCopy: {
    flex: 1,
  },
  threadEyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  threadTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 2,
  },
  threadDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  threadMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  threadMetaText: {
    color: colors.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  laudoStatusBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  laudoStatusText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  reopenButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "#FFF5ED",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  reopenButtonText: {
    color: colors.accent,
    fontWeight: "700",
  },
  threadBody: {
    flex: 1,
    minHeight: 280,
  },
  threadContent: {
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  messageRow: {
    width: "100%",
  },
  messageRowIncoming: {
    alignItems: "flex-start",
  },
  messageRowOutgoing: {
    alignItems: "flex-end",
  },
  messageBubble: {
    maxWidth: "84%",
    borderRadius: 22,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: 6,
  },
  messageBubbleIncoming: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.surfaceStroke,
    borderBottomLeftRadius: 8,
  },
  messageBubbleOutgoing: {
    backgroundColor: colors.ink800,
    borderBottomRightRadius: 8,
  },
  messageBubbleEngineering: {
    backgroundColor: "#FFF7EF",
    borderWidth: 1,
    borderColor: "#FFD6B2",
    borderBottomLeftRadius: 8,
  },
  messageAuthor: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  messageAuthorOutgoing: {
    color: colors.accentSoft,
  },
  messageText: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  messageTextOutgoing: {
    color: colors.white,
  },
  messageMeta: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  typingRow: {
    alignItems: "flex-start",
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.surfaceStroke,
  },
  typingText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  composerCard: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  composerHint: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  composerInput: {
    flex: 1,
    minHeight: 54,
    maxHeight: 160,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceStroke,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 15,
  },
  composerInputDisabled: {
    backgroundColor: "#F0F3F6",
    color: colors.textSecondary,
  },
  sendButton: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.55,
  },
  metricsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceStroke,
    gap: 6,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "800",
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  actionList: {
    gap: spacing.sm,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceStroke,
  },
  actionText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
