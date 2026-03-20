import type { ImageSourcePropType } from "react-native";
import { Image, Text, View } from "react-native";

import { styles } from "../InspectorMobileApp.styles";
import {
  IntegrationConnectionCard,
  type ExternalIntegrationCardModel,
} from "./IntegrationConnectionCard";
import { SettingsSwitchRow, SettingsTextField } from "./SettingsPrimitives";

interface ConnectedProviderSummary {
  label: string;
  connected: boolean;
}

export function SettingsReauthSheetContent({
  reauthReason,
  provedoresConectados,
  reautenticacaoExpiraEm,
  formatarStatusReautenticacao,
  brandMarkSource,
}: {
  reauthReason: string;
  provedoresConectados: readonly ConnectedProviderSummary[];
  reautenticacaoExpiraEm: string;
  formatarStatusReautenticacao: (value: string) => string;
  brandMarkSource: ImageSourcePropType;
}) {
  return (
    <View style={styles.settingsFlowStack}>
      <View style={styles.settingsInlineHero}>
        <Image source={brandMarkSource} style={styles.settingsInlineHeroMark} />
        <View style={styles.settingsInlineHeroCopy}>
          <Text style={styles.settingsInlineHeroTitle}>
            Janela temporária de confiança
          </Text>
          <Text style={styles.settingsInlineHeroText}>{reauthReason}</Text>
        </View>
      </View>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Métodos disponíveis</Text>
        <Text style={styles.settingsInfoText}>
          {provedoresConectados
            .filter((item) => item.connected)
            .map((item) => item.label)
            .join(" • ") || "Conta corporativa"}
        </Text>
      </View>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Status atual</Text>
        <Text style={styles.settingsInfoText}>
          {formatarStatusReautenticacao(reautenticacaoExpiraEm)}
        </Text>
      </View>
    </View>
  );
}

export function SettingsPhotoSheetContent({
  photoSource,
  perfilFotoHint,
}: {
  photoSource: ImageSourcePropType;
  perfilFotoHint: string;
}) {
  return (
    <View style={styles.settingsFlowStack}>
      <View style={styles.settingsInlineHero}>
        <Image source={photoSource} style={styles.settingsInlineHeroMark} />
        <View style={styles.settingsInlineHeroCopy}>
          <Text style={styles.settingsInlineHeroTitle}>
            Foto de perfil do inspetor
          </Text>
          <Text style={styles.settingsInlineHeroText}>
            A identidade visual do usuário aparece na conta, no histórico e nos
            fluxos de suporte.
          </Text>
        </View>
      </View>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Status atual</Text>
        <Text style={styles.settingsInfoText}>{perfilFotoHint}</Text>
      </View>
    </View>
  );
}

export function SettingsProfileSheetContent({
  nomeCompletoDraft,
  nomeExibicaoDraft,
  telefoneDraft,
  onNomeCompletoChange,
  onNomeExibicaoChange,
  onTelefoneChange,
}: {
  nomeCompletoDraft: string;
  nomeExibicaoDraft: string;
  telefoneDraft: string;
  onNomeCompletoChange: (value: string) => void;
  onNomeExibicaoChange: (value: string) => void;
  onTelefoneChange: (value: string) => void;
}) {
  return (
    <View style={styles.settingsFlowStack}>
      <SettingsTextField
        autoCapitalize="words"
        icon="account-outline"
        onChangeText={onNomeCompletoChange}
        placeholder="Nome completo"
        title="Nome do usuário"
        value={nomeCompletoDraft}
      />
      <SettingsTextField
        autoCapitalize="words"
        icon="badge-account-outline"
        onChangeText={onNomeExibicaoChange}
        placeholder="Nome exibido no app"
        title="Nome de exibição"
        value={nomeExibicaoDraft}
      />
      <SettingsTextField
        autoCapitalize="none"
        icon="phone-outline"
        keyboardType="phone-pad"
        onChangeText={onTelefoneChange}
        placeholder="(11) 99999-9999"
        title="Número de telefone"
        value={telefoneDraft}
      />
    </View>
  );
}

export function SettingsPlanSheetContent({
  planoAtual,
}: {
  planoAtual: string;
}) {
  return (
    <View style={styles.settingsFlowStack}>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Plano atual</Text>
        <Text style={styles.settingsInfoText}>{planoAtual}</Text>
      </View>
      <View style={styles.settingsMiniList}>
        <View style={styles.settingsMiniListItem}>
          <Text style={styles.settingsMiniListTitle}>Operação em campo</Text>
          <Text style={styles.settingsMiniListMeta}>
            Chat, mesa, fila offline e histórico sincronizado do inspetor.
          </Text>
        </View>
        <View style={styles.settingsMiniListItem}>
          <Text style={styles.settingsMiniListTitle}>
            Segurança e privacidade
          </Text>
          <Text style={styles.settingsMiniListMeta}>
            Reautenticação sensível, eventos de segurança e proteção local do
            dispositivo.
          </Text>
        </View>
        <View style={styles.settingsMiniListItem}>
          <Text style={styles.settingsMiniListTitle}>Próximo passo</Text>
          <Text style={styles.settingsMiniListMeta}>
            Ao confirmar, o app troca para a próxima opção de plano disponível
            nesta conta.
          </Text>
        </View>
      </View>
    </View>
  );
}

export function SettingsBillingSheetContent({
  cartaoAtual,
}: {
  cartaoAtual: string;
}) {
  return (
    <View style={styles.settingsFlowStack}>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Cartão cadastrado</Text>
        <Text style={styles.settingsInfoText}>{cartaoAtual}</Text>
      </View>
      <View style={styles.settingsMiniList}>
        <View style={styles.settingsMiniListItem}>
          <Text style={styles.settingsMiniListTitle}>Cobrança protegida</Text>
          <Text style={styles.settingsMiniListMeta}>
            O método de pagamento é apenas referenciado no app, nunca exposto
            por completo.
          </Text>
        </View>
        <View style={styles.settingsMiniListItem}>
          <Text style={styles.settingsMiniListTitle}>Próxima atualização</Text>
          <Text style={styles.settingsMiniListMeta}>
            Ao confirmar, o app troca para a próxima forma de pagamento
            cadastrada neste perfil.
          </Text>
        </View>
      </View>
    </View>
  );
}

export function SettingsEmailSheetContent({
  emailAtualConta,
  emailLogin,
  novoEmailDraft,
  onNovoEmailChange,
}: {
  emailAtualConta: string;
  emailLogin: string;
  novoEmailDraft: string;
  onNovoEmailChange: (value: string) => void;
}) {
  return (
    <View style={styles.settingsFlowStack}>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Email atual</Text>
        <Text style={styles.settingsInfoText}>
          {emailAtualConta || emailLogin || "Sem email cadastrado"}
        </Text>
      </View>
      <SettingsTextField
        autoCapitalize="none"
        icon="email-edit-outline"
        keyboardType="email-address"
        onChangeText={onNovoEmailChange}
        placeholder="novoemail@empresa.com"
        title="Novo email"
        value={novoEmailDraft}
      />
    </View>
  );
}

export function SettingsPasswordSheetContent({
  senhaAtualDraft,
  novaSenhaDraft,
  confirmarSenhaDraft,
  onSenhaAtualChange,
  onNovaSenhaChange,
  onConfirmarSenhaChange,
}: {
  senhaAtualDraft: string;
  novaSenhaDraft: string;
  confirmarSenhaDraft: string;
  onSenhaAtualChange: (value: string) => void;
  onNovaSenhaChange: (value: string) => void;
  onConfirmarSenhaChange: (value: string) => void;
}) {
  return (
    <View style={styles.settingsFlowStack}>
      <SettingsTextField
        autoCapitalize="none"
        icon="lock-check-outline"
        onChangeText={onSenhaAtualChange}
        placeholder="Senha atual"
        secureTextEntry
        title="Senha atual"
        value={senhaAtualDraft}
      />
      <SettingsTextField
        autoCapitalize="none"
        icon="lock-plus-outline"
        onChangeText={onNovaSenhaChange}
        placeholder="Nova senha"
        secureTextEntry
        title="Nova senha"
        value={novaSenhaDraft}
      />
      <SettingsTextField
        autoCapitalize="none"
        icon="shield-check-outline"
        onChangeText={onConfirmarSenhaChange}
        placeholder="Confirmar nova senha"
        secureTextEntry
        title="Confirmar senha"
        value={confirmarSenhaDraft}
      />
    </View>
  );
}

export function SettingsPaymentsSheetContent() {
  return (
    <View style={styles.settingsFlowStack}>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Últimos lançamentos</Text>
        <View style={styles.settingsMiniList}>
          <View style={styles.settingsMiniListItem}>
            <Text style={styles.settingsMiniListTitle}>
              Plano Pro • Fevereiro
            </Text>
            <Text style={styles.settingsMiniListMeta}>
              Pago em 05/03 • Visa final 4242
            </Text>
          </View>
          <View style={styles.settingsMiniListItem}>
            <Text style={styles.settingsMiniListTitle}>
              Plano Pro • Janeiro
            </Text>
            <Text style={styles.settingsMiniListMeta}>
              Pago em 05/02 • Visa final 4242
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function SettingsIntegrationsSheetContent<
  T extends ExternalIntegrationCardModel,
>({
  integracoesConectadasTotal,
  integracoesDisponiveisTotal,
  integracoesExternas,
  integracaoSincronizandoId,
  formatarHorarioAtividade,
  onSyncNow,
  onToggle,
}: {
  integracoesConectadasTotal: number;
  integracoesDisponiveisTotal: number;
  integracoesExternas: readonly T[];
  integracaoSincronizandoId: string;
  formatarHorarioAtividade: (iso: string) => string;
  onSyncNow: (integration: T) => void;
  onToggle: (integration: T) => void;
}) {
  return (
    <View style={styles.settingsFlowStack}>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Resumo das integrações</Text>
        <Text style={styles.settingsInfoText}>
          {integracoesConectadasTotal} de {integracoesDisponiveisTotal}{" "}
          conectada(s)
        </Text>
        <Text style={styles.settingsInfoSubtle}>
          Conecte o serviço e use "Sincronizar agora" para validar o fluxo
          local.
        </Text>
      </View>
      <View style={styles.settingsMiniList}>
        {integracoesExternas.map((integration) => (
          <IntegrationConnectionCard
            formatarHorario={formatarHorarioAtividade}
            integration={integration}
            key={integration.id}
            onSyncNow={onSyncNow}
            onToggle={onToggle}
            syncing={integracaoSincronizandoId === integration.id}
            testID={`settings-integration-${integration.id}`}
          />
        ))}
      </View>
    </View>
  );
}

export function SettingsPluginsSheetContent({
  uploadArquivosAtivo,
  nomeAutomaticoConversas,
  onToggleUploadArquivos,
  onToggleNomeAutomaticoConversas,
}: {
  uploadArquivosAtivo: boolean;
  nomeAutomaticoConversas: boolean;
  onToggleUploadArquivos: (value: boolean) => void;
  onToggleNomeAutomaticoConversas: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingsFlowStack}>
      <SettingsSwitchRow
        icon="wrench-cog-outline"
        onValueChange={onToggleUploadArquivos}
        title="Análise assistida de anexos"
        value={uploadArquivosAtivo}
      />
      <SettingsSwitchRow
        icon="text-box-search-outline"
        onValueChange={onToggleNomeAutomaticoConversas}
        title="Títulos automáticos de conversa"
        value={nomeAutomaticoConversas}
      />
    </View>
  );
}
