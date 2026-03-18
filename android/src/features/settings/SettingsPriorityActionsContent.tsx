import { Text, View } from "react-native";

import { styles } from "../InspectorMobileApp.styles";
import { SettingsPressRow, SettingsSection } from "./SettingsPrimitives";

interface SettingsPriorityActionsContentProps {
  temPrioridadesConfiguracao: boolean;
  twoFactorEnabled: boolean;
  provedoresConectadosTotal: number;
  existeProvedorDisponivel: boolean;
  permissoesNegadasTotal: number;
  sessoesSuspeitasTotal: number;
  ultimaVerificacaoAtualizacaoLabel: string;
  onToggle2FA: () => void;
  onConectarProximoProvedorDisponivel: () => void;
  onRevisarPermissoesCriticas: () => void;
  onEncerrarSessoesSuspeitas: () => void;
  onVerificarAtualizacoes: () => void;
}

export function SettingsPriorityActionsContent({
  temPrioridadesConfiguracao,
  twoFactorEnabled,
  provedoresConectadosTotal,
  existeProvedorDisponivel,
  permissoesNegadasTotal,
  sessoesSuspeitasTotal,
  ultimaVerificacaoAtualizacaoLabel,
  onToggle2FA,
  onConectarProximoProvedorDisponivel,
  onRevisarPermissoesCriticas,
  onEncerrarSessoesSuspeitas,
  onVerificarAtualizacoes,
}: SettingsPriorityActionsContentProps) {
  return (
    <SettingsSection
      icon="flash-outline"
      subtitle="O que merece atenção primeiro nesta conta do inspetor."
      testID="settings-section-prioridades"
      title="Ações prioritárias"
    >
      {temPrioridadesConfiguracao ? (
        <>
          {!twoFactorEnabled ? (
            <SettingsPressRow
              description="Ative proteção extra antes de depender apenas do email e senha."
              icon="shield-star-outline"
              onPress={onToggle2FA}
              testID="settings-priority-enable-twofa-row"
              title="Ativar verificação em duas etapas"
              value="Recomendado"
            />
          ) : null}
          {provedoresConectadosTotal <= 1 ? (
            <SettingsPressRow
              description="Cadastre outro método para não ficar preso a uma única forma de acesso."
              icon="account-plus-outline"
              onPress={onConectarProximoProvedorDisponivel}
              title="Adicionar outro método de acesso"
              value={existeProvedorDisponivel ? "Disponível" : "Revisar"}
            />
          ) : null}
          {permissoesNegadasTotal > 0 ? (
            <SettingsPressRow
              description="Câmera, arquivos e notificações melhoram o uso do inspetor em campo."
              icon="shield-sync-outline"
              onPress={onRevisarPermissoesCriticas}
              title="Revisar permissões críticas"
              value={`${permissoesNegadasTotal} pendente(s)`}
            />
          ) : null}
          {sessoesSuspeitasTotal > 0 ? (
            <SettingsPressRow
              danger
              description="Existem sessões marcadas como incomuns e prontas para revisão."
              icon="shield-alert-outline"
              onPress={onEncerrarSessoesSuspeitas}
              title="Encerrar sessões suspeitas"
              value={`${sessoesSuspeitasTotal} alerta(s)`}
            />
          ) : null}
          <SettingsPressRow
            description="Confira o estado da build e as últimas mudanças do app."
            icon="refresh-circle"
            onPress={onVerificarAtualizacoes}
            title="Verificar atualizações"
            value={ultimaVerificacaoAtualizacaoLabel}
          />
        </>
      ) : (
        <View style={styles.settingsInfoCard}>
          <Text style={styles.settingsInfoTitle}>Tudo em dia</Text>
          <Text style={styles.settingsInfoText}>
            A conta já está com 2FA, múltiplos métodos de acesso, permissões críticas e sessões sob controle.
          </Text>
        </View>
      )}
    </SettingsSection>
  );
}
