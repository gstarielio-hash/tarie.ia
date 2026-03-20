import { SettingsPressRow, SettingsSection } from "./SettingsPrimitives";

interface SettingsPriorityActionsContentProps {
  temPrioridadesConfiguracao: boolean;
  permissoesNegadasTotal: number;
  ultimaVerificacaoAtualizacaoLabel: string;
  onRevisarPermissoesCriticas: () => void;
  onVerificarAtualizacoes: () => void;
}

export function SettingsPriorityActionsContent({
  temPrioridadesConfiguracao,
  permissoesNegadasTotal,
  ultimaVerificacaoAtualizacaoLabel,
  onRevisarPermissoesCriticas,
  onVerificarAtualizacoes,
}: SettingsPriorityActionsContentProps) {
  return (
    <SettingsSection
      icon="flash-outline"
      subtitle="O que ainda exige revisão funcional neste dispositivo."
      testID="settings-section-prioridades"
      title="Ações prioritárias"
    >
      {temPrioridadesConfiguracao ? (
        <>
          <SettingsPressRow
            description="Câmera, arquivos e notificações melhoram o uso do inspetor em campo."
            icon="shield-sync-outline"
            onPress={onRevisarPermissoesCriticas}
            title="Revisar permissões críticas"
            value={`${permissoesNegadasTotal} pendente(s)`}
          />
          <SettingsPressRow
            description="Confira o estado da build e as últimas mudanças do app."
            icon="refresh-circle"
            onPress={onVerificarAtualizacoes}
            title="Verificar atualizações"
            value={ultimaVerificacaoAtualizacaoLabel}
          />
        </>
      ) : (
        <>
          <SettingsPressRow
            description="As permissões essenciais já estão liberadas neste dispositivo."
            icon="check-circle-outline"
            title="Tudo em dia"
            value="Sem ações"
          />
          <SettingsPressRow
            description="Confira o estado da build e as últimas mudanças do app."
            icon="refresh-circle"
            onPress={onVerificarAtualizacoes}
            title="Verificar atualizações"
            value={ultimaVerificacaoAtualizacaoLabel}
          />
        </>
      )}
    </SettingsSection>
  );
}
