import { useRef } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
  type PanResponderInstance,
} from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";

interface HistoryDrawerSection<TItem> {
  key: string;
  title: string;
  items: TItem[];
}

const HISTORY_DELETE_SWIPE_TRIGGER = 112;
const HISTORY_DELETE_SWIPE_DISMISS = 420;

type HistoryDrawerItemRecord = {
  id: number;
  titulo: string;
  preview: string;
};

function HistoryDrawerListItem<TItem extends HistoryDrawerItemRecord>({
  ativo,
  item,
  onExcluir,
  onSelecionar,
  testID,
}: {
  ativo: boolean;
  item: TItem;
  onExcluir: () => void;
  onSelecionar: () => void;
  testID: string;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const animandoExclusaoRef = useRef(false);
  const swipeProgress = translateX.interpolate({
    inputRange: [0, 28, HISTORY_DELETE_SWIPE_TRIGGER],
    outputRange: [0, 0.3, 1],
    extrapolate: "clamp",
  });

  const resetSwipe = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 120,
      friction: 12,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !animandoExclusaoRef.current &&
        gestureState.dx > 10 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2,
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(Math.max(0, gestureState.dx));
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx >= HISTORY_DELETE_SWIPE_TRIGGER) {
          animandoExclusaoRef.current = true;
          Animated.timing(translateX, {
            toValue: HISTORY_DELETE_SWIPE_DISMISS,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            onExcluir();
            animandoExclusaoRef.current = false;
            translateX.setValue(0);
          });
          return;
        }

        resetSwipe();
      },
      onPanResponderTerminate: resetSwipe,
    }),
  ).current;

  return (
    <View style={styles.historyItemShell}>
      <Animated.View
        pointerEvents="none"
        style={[styles.historyItemDeleteRail, { opacity: swipeProgress }]}
      >
        <Animated.View
          style={[
            styles.historyItemDeleteRailBadge,
            {
              transform: [
                {
                  scale: swipeProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <MaterialCommunityIcons
            name="trash-can-outline"
            size={18}
            color={colors.danger}
          />
          <Text style={styles.historyItemDeleteRailText}>Excluir</Text>
        </Animated.View>
      </Animated.View>

      <Animated.View
        {...panResponder.panHandlers}
        style={{ transform: [{ translateX }] }}
      >
        <Pressable
          onPress={onSelecionar}
          style={[
            styles.historyItem,
            styles.historyItemPrimary,
            ativo ? styles.historyItemActive : null,
          ]}
          testID={testID}
        >
          <View style={styles.historyItemCopy}>
            <Text
              numberOfLines={1}
              style={[
                styles.historyItemTitle,
                ativo ? styles.historyItemTitleActive : null,
              ]}
            >
              {item.titulo}
            </Text>
            <Text
              numberOfLines={2}
              style={[
                styles.historyItemPreview,
                ativo ? styles.historyItemPreviewActive : null,
              ]}
            >
              {item.preview || "Sem atualização recente"}
            </Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={18}
            color={ativo ? "rgba(255,255,255,0.78)" : colors.textSecondary}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function HistoryDrawerPanel<
  TItem extends {
    id: number;
    titulo: string;
    data_iso: string;
    status_card: string;
    status_card_label: string;
    pinado: boolean;
    tipo_template: string | null;
    permite_edicao: boolean;
    permite_reabrir: boolean;
    preview: string;
  },
>({
  historyDrawerPanResponder,
  historicoDrawerX,
  onCloseHistory,
  buscaHistorico,
  onBuscaHistoricoChange,
  conversasOcultasTotal,
  historicoAgrupadoFinal,
  laudoSelecionadoId,
  onSelecionarHistorico,
  onExcluirConversaHistorico,
  historicoVazioTitulo,
  historicoVazioTexto,
  brandMarkSource,
}: {
  historyDrawerPanResponder: PanResponderInstance;
  historicoDrawerX: Animated.Value;
  onCloseHistory: () => void;
  buscaHistorico: string;
  onBuscaHistoricoChange: (value: string) => void;
  conversasOcultasTotal: number;
  historicoAgrupadoFinal: HistoryDrawerSection<TItem>[];
  laudoSelecionadoId: number | null;
  onSelecionarHistorico: (item: TItem) => void;
  onExcluirConversaHistorico: (item: TItem) => void;
  historicoVazioTitulo: string;
  historicoVazioTexto: string;
  brandMarkSource: ImageSourcePropType;
}) {
  const totalHistorico =
    historicoAgrupadoFinal.reduce(
      (total, section) => total + section.items.length,
      0,
    ) + conversasOcultasTotal;
  const exibirBusca = totalHistorico > 0 || Boolean(buscaHistorico.trim());

  return (
    <Animated.View
      {...historyDrawerPanResponder.panHandlers}
      style={[
        styles.sidePanelDrawer,
        styles.sidePanelDrawerLeft,
        { transform: [{ translateX: historicoDrawerX }] },
      ]}
      testID="history-drawer"
    >
      <View style={styles.sidePanelHeader}>
        <View style={styles.sidePanelCopy}>
          <View style={styles.historyBrandRow}>
            <Image source={brandMarkSource} style={styles.historyBrandIcon} />
            <Text style={styles.historyBrandEyebrow}>tariel.ia</Text>
          </View>
          <Text style={styles.sidePanelTitle}>Histórico</Text>
        </View>
        <Pressable
          onPress={onCloseHistory}
          style={styles.sidePanelCloseButton}
          testID="close-history-drawer-button"
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={22}
            color={colors.textPrimary}
          />
        </Pressable>
      </View>

      {exibirBusca ? (
        <View style={styles.historySearchShell}>
          <MaterialCommunityIcons
            name="magnify"
            size={20}
            color={colors.textSecondary}
          />
          <TextInput
            onChangeText={onBuscaHistoricoChange}
            placeholder="Buscar histórico"
            placeholderTextColor={colors.textSecondary}
            style={styles.historySearchInput}
            testID="history-search-input"
            value={buscaHistorico}
          />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.historySections}>
        {historicoAgrupadoFinal.length ? (
          historicoAgrupadoFinal.map((section, sectionIndex) => (
            <View key={section.key} style={styles.historySection}>
              <View style={styles.historySectionHeader}>
                <Text style={styles.historySectionTitle}>{section.title}</Text>
                <View style={styles.historySectionCountBadge}>
                  <Text style={styles.historySectionCountText}>
                    {section.items.length}
                  </Text>
                </View>
              </View>
              <View style={styles.historySectionItems}>
                {section.items.map((item, itemIndex) => {
                  const ativo = item.id === laudoSelecionadoId;
                  const isFirstHistoryItem =
                    sectionIndex === 0 && itemIndex === 0;
                  return (
                    <HistoryDrawerListItem
                      key={`history-${section.key}-${item.id}`}
                      ativo={ativo}
                      item={item}
                      onExcluir={() => onExcluirConversaHistorico(item)}
                      onSelecionar={() => onSelecionarHistorico(item)}
                      testID={
                        isFirstHistoryItem
                          ? "history-first-item-button"
                          : `history-item-${item.id}`
                      }
                    />
                  );
                })}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.historyEmptyState}>
            <EmptyState
              compact
              description={historicoVazioTexto}
              icon="history"
              title={historicoVazioTitulo}
            />
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}
