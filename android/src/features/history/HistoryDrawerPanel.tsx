import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Animated, Image, type ImageSourcePropType, Pressable, ScrollView, Text, TextInput, View, type PanResponderInstance } from "react-native";

import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";

interface HistoryDrawerSection<TItem> {
  key: string;
  title: string;
  items: TItem[];
}

interface HistoryFilterItem {
  key: string;
  label: string;
  count: number;
}

export function HistoryDrawerPanel<TItem extends {
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
}>({
  historyDrawerPanResponder,
  historicoDrawerX,
  onCloseHistory,
  buscaHistorico,
  onBuscaHistoricoChange,
  conversasVisiveisTotal,
  conversasFixadasTotal,
  conversasOcultasTotal,
  resumoHistoricoDrawer,
  filtrosHistoricoComContagem,
  filtroHistorico,
  onFiltroHistoricoChange,
  historicoAgrupadoFinal,
  laudoSelecionadoId,
  formatarTipoTemplateLaudo,
  formatarHorarioAtividade,
  onSelecionarHistorico,
  onAlternarFixadoHistorico,
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
  conversasVisiveisTotal: number;
  conversasFixadasTotal: number;
  conversasOcultasTotal: number;
  resumoHistoricoDrawer: string;
  filtrosHistoricoComContagem: HistoryFilterItem[];
  filtroHistorico: string;
  onFiltroHistoricoChange: (key: string) => void;
  historicoAgrupadoFinal: HistoryDrawerSection<TItem>[];
  laudoSelecionadoId: number | null;
  formatarTipoTemplateLaudo: (value: string | null | undefined) => string;
  formatarHorarioAtividade: (value: string) => string;
  onSelecionarHistorico: (item: TItem) => void;
  onAlternarFixadoHistorico: (item: TItem) => void;
  onExcluirConversaHistorico: (item: TItem) => void;
  historicoVazioTitulo: string;
  historicoVazioTexto: string;
  brandMarkSource: ImageSourcePropType;
}) {
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
          <Text style={styles.sidePanelDescription}>
            Retome laudos recentes e volte para o ponto certo da conversa.
          </Text>
        </View>
        <Pressable
          onPress={onCloseHistory}
          style={styles.sidePanelCloseButton}
          testID="close-history-drawer-button"
        >
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.historySearchShell}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.textSecondary} />
        <TextInput
          onChangeText={onBuscaHistoricoChange}
          placeholder="Buscar conversas..."
          placeholderTextColor={colors.textSecondary}
          style={styles.historySearchInput}
          testID="history-search-input"
          value={buscaHistorico}
        />
      </View>

      <View style={styles.historySummaryCard}>
        <View style={styles.historySummaryMetrics}>
          <View style={styles.historySummaryMetric}>
            <Text style={styles.historySummaryMetricValue}>{conversasVisiveisTotal}</Text>
            <Text style={styles.historySummaryMetricLabel}>Visíveis</Text>
          </View>
          <View style={styles.historySummaryMetric}>
            <Text style={styles.historySummaryMetricValue}>{conversasFixadasTotal}</Text>
            <Text style={styles.historySummaryMetricLabel}>Fixadas</Text>
          </View>
          <View style={styles.historySummaryMetric}>
            <Text style={styles.historySummaryMetricValue}>{conversasOcultasTotal}</Text>
            <Text style={styles.historySummaryMetricLabel}>Ocultas</Text>
          </View>
        </View>
        <Text style={styles.historySummaryText}>{resumoHistoricoDrawer}</Text>
      </View>

      <View style={styles.historyFilterRow}>
        {filtrosHistoricoComContagem.map((item) => {
          const ativo = filtroHistorico === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => onFiltroHistoricoChange(item.key)}
              style={[styles.historyFilterChip, ativo ? styles.historyFilterChipActive : null]}
              testID={`history-filter-${item.key}`}
            >
              <Text style={[styles.historyFilterChipText, ativo ? styles.historyFilterChipTextActive : null]}>
                {item.label}
              </Text>
              <View style={[styles.historyFilterCount, ativo ? styles.historyFilterCountActive : null]}>
                <Text
                  style={[
                    styles.historyFilterCountText,
                    ativo ? styles.historyFilterCountTextActive : null,
                  ]}
                >
                  {item.count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.historySections}>
        {historicoAgrupadoFinal.length ? (
          historicoAgrupadoFinal.map((section, sectionIndex) => (
            <View key={section.key} style={styles.historySection}>
              <View style={styles.historySectionHeader}>
                <Text style={styles.historySectionTitle}>{section.title}</Text>
                <View style={styles.historySectionCountBadge}>
                  <Text style={styles.historySectionCountText}>{section.items.length}</Text>
                </View>
              </View>
              <View style={styles.historySectionItems}>
                {section.items.map((item, itemIndex) => {
                  const ativo = item.id === laudoSelecionadoId;
                  const isFirstHistoryItem = sectionIndex === 0 && itemIndex === 0;
                  const templateLabel = formatarTipoTemplateLaudo(item.tipo_template);
                  const modoLaudoLabel = item.permite_edicao
                    ? "Editável"
                    : item.permite_reabrir
                      ? "Reabrir"
                      : "Leitura";
                  return (
                    <View key={`history-${section.key}-${item.id}`} style={styles.historyItemShell}>
                      <Pressable
                        onPress={() => onSelecionarHistorico(item)}
                        style={[
                          styles.historyItem,
                          styles.historyItemPrimary,
                          ativo ? styles.historyItemActive : null,
                        ]}
                        testID={isFirstHistoryItem ? "history-first-item-button" : `history-item-${item.id}`}
                      >
                        <View style={[styles.historyItemIcon, ativo ? styles.historyItemIconActive : null]}>
                          <Image source={brandMarkSource} style={styles.historyItemBrandIcon} />
                        </View>
                        <View style={styles.historyItemCopy}>
                          <View style={styles.historyItemHeading}>
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
                              style={[
                                styles.historyItemTime,
                                ativo ? styles.historyItemTimeActive : null,
                              ]}
                            >
                              {formatarHorarioAtividade(item.data_iso)}
                            </Text>
                          </View>
                          <View style={styles.historyItemMetaRow}>
                            <View
                              style={[
                                styles.historyItemStatus,
                                item.status_card === "ajustes"
                                  ? styles.historyItemStatusDanger
                                  : item.status_card === "aprovado"
                                    ? styles.historyItemStatusSuccess
                                    : item.status_card === "aguardando"
                                      ? styles.historyItemStatusAccent
                                      : null,
                                ativo ? styles.historyItemStatusActive : null,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.historyItemStatusText,
                                  item.status_card === "ajustes"
                                    ? styles.historyItemStatusTextDanger
                                    : item.status_card === "aprovado"
                                      ? styles.historyItemStatusTextSuccess
                                      : item.status_card === "aguardando"
                                        ? styles.historyItemStatusTextAccent
                                        : null,
                                  ativo ? styles.historyItemStatusTextActive : null,
                                ]}
                              >
                                {item.status_card_label}
                              </Text>
                            </View>
                            {item.pinado ? (
                              <View style={[styles.historyItemPinnedTag, ativo ? styles.historyItemPinnedTagActive : null]}>
                                <MaterialCommunityIcons
                                  color={ativo ? colors.white : colors.accent}
                                  name="pin"
                                  size={12}
                                />
                                <Text
                                  style={[
                                    styles.historyItemPinnedTagText,
                                    ativo ? styles.historyItemPinnedTagTextActive : null,
                                  ]}
                                >
                                  Fixada
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={styles.historyItemMetaRow}>
                            <View style={[styles.historyItemInfoTag, ativo ? styles.historyItemInfoTagActive : null]}>
                              <MaterialCommunityIcons
                                color={ativo ? colors.white : colors.textSecondary}
                                name="shape-outline"
                                size={12}
                              />
                              <Text
                                style={[
                                  styles.historyItemInfoTagText,
                                  ativo ? styles.historyItemInfoTagTextActive : null,
                                ]}
                              >
                                {templateLabel}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.historyItemInfoTag,
                                item.permite_edicao ? styles.historyItemInfoTagEditable : null,
                                ativo ? styles.historyItemInfoTagActive : null,
                              ]}
                            >
                              <MaterialCommunityIcons
                                color={
                                  ativo
                                    ? colors.white
                                    : item.permite_edicao
                                      ? colors.success
                                      : colors.textSecondary
                                }
                                name={item.permite_edicao ? "pencil-outline" : "lock-outline"}
                                size={12}
                              />
                              <Text
                                style={[
                                  styles.historyItemInfoTagText,
                                  item.permite_edicao ? styles.historyItemInfoTagTextEditable : null,
                                  ativo ? styles.historyItemInfoTagTextActive : null,
                                ]}
                              >
                                {modoLaudoLabel}
                              </Text>
                            </View>
                          </View>
                          <Text
                            numberOfLines={2}
                            style={[
                              styles.historyItemPreview,
                              ativo ? styles.historyItemPreviewActive : null,
                            ]}
                          >
                            {item.preview || "Sem resumo recente"}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name="chevron-right"
                          size={18}
                          color={ativo ? "rgba(255,255,255,0.78)" : colors.textSecondary}
                        />
                      </Pressable>

                      <View style={styles.historyItemActions}>
                        <Pressable
                          accessibilityLabel={item.pinado ? "Desafixar conversa" : "Fixar conversa"}
                          onPress={() => onAlternarFixadoHistorico(item)}
                          style={[
                            styles.historyItemActionButton,
                            item.pinado ? styles.historyItemActionButtonPinned : null,
                          ]}
                          testID={isFirstHistoryItem ? "history-first-item-pin-button" : `history-item-pin-${item.id}`}
                        >
                          <MaterialCommunityIcons
                            name={item.pinado ? "pin-off-outline" : "pin-outline"}
                            size={18}
                            color={item.pinado ? colors.white : colors.accent}
                          />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="Remover conversa do histórico"
                          onPress={() => onExcluirConversaHistorico(item)}
                          style={[styles.historyItemActionButton, styles.historyItemActionButtonDanger]}
                          testID={isFirstHistoryItem ? "history-first-item-delete-button" : `history-item-delete-${item.id}`}
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={18} color="#B85A4A" />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.historyEmptyState}>
            <Image source={brandMarkSource} style={styles.historyEmptyBrand} />
            <Text style={styles.historyEmptyTitle}>{historicoVazioTitulo}</Text>
            <Text style={styles.historyEmptyText}>{historicoVazioTexto}</Text>
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}
