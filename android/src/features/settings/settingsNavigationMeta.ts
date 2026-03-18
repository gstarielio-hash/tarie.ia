import { MaterialCommunityIcons } from "@expo/vector-icons";

export type SettingsSectionKey =
  | "prioridades"
  | "conta"
  | "preferenciasIa"
  | "aparencia"
  | "notificacoes"
  | "contasConectadas"
  | "sessoes"
  | "twofa"
  | "protecaoDispositivo"
  | "verificacaoIdentidade"
  | "atividadeSeguranca"
  | "dadosConversas"
  | "permissoes"
  | "segurancaArquivos"
  | "privacidadeNotificacoes"
  | "excluirConta"
  | "recursosAvancados"
  | "sistema"
  | "suporte";

export type SettingsDrawerPage =
  | "overview"
  | "prioridades"
  | "contaAcesso"
  | "experiencia"
  | "seguranca"
  | "sistemaSuporte";

interface SettingsSectionMeta {
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

interface SettingsPageMeta {
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  sections: SettingsSectionKey[];
}

export const SETTINGS_DRAWER_SECTION_META: Record<SettingsSectionKey, SettingsSectionMeta> = {
  prioridades: {
    title: "Ações prioritárias",
    subtitle: "O que merece atenção primeiro nesta conta do inspetor.",
    icon: "flash-outline",
  },
  conta: {
    title: "Conta",
    subtitle: "Informações da conta e assinatura do inspetor.",
    icon: "account-circle-outline",
  },
  preferenciasIa: {
    title: "Preferências da IA",
    subtitle: "Escolha modelo, idioma, tom e nível de criatividade.",
    icon: "robot-outline",
  },
  aparencia: {
    title: "Aparência",
    subtitle: "Tema, densidade, fonte e cor de destaque do aplicativo.",
    icon: "palette-outline",
  },
  notificacoes: {
    title: "Notificações",
    subtitle: "Alertas, push, som, vibração e emails.",
    icon: "bell-outline",
  },
  contasConectadas: {
    title: "Contas conectadas",
    subtitle: "Google, Apple e Microsoft vinculados ao acesso.",
    icon: "account-outline",
  },
  sessoes: {
    title: "Sessões e dispositivos",
    subtitle: "Dispositivos ativos, atividade suspeita e logout remoto.",
    icon: "devices",
  },
  twofa: {
    title: "Verificação em duas etapas",
    subtitle: "2FA, método preferido e códigos de recuperação.",
    icon: "shield-key-outline",
  },
  protecaoDispositivo: {
    title: "Proteção no dispositivo",
    subtitle: "Biometria, bloqueio local e proteção em multitarefa.",
    icon: "cellphone-lock",
  },
  verificacaoIdentidade: {
    title: "Verificação de identidade",
    subtitle: "Reautenticação para ações sensíveis no app.",
    icon: "shield-account-outline",
  },
  atividadeSeguranca: {
    title: "Atividade de segurança",
    subtitle: "Eventos críticos, logins e ações sensíveis recentes.",
    icon: "history",
  },
  dadosConversas: {
    title: "Dados e conversas",
    subtitle: "Histórico, retenção, exportação e exclusão de conversas.",
    icon: "database-outline",
  },
  permissoes: {
    title: "Permissões",
    subtitle: "Câmera, arquivos, microfone, notificações e biometria.",
    icon: "shield-sync-outline",
  },
  segurancaArquivos: {
    title: "Segurança de arquivos enviados",
    subtitle: "Formatos, limites, validação e proteção dos uploads.",
    icon: "file-lock-outline",
  },
  privacidadeNotificacoes: {
    title: "Privacidade em notificações",
    subtitle: "Controle o quanto aparece das mensagens nas prévias.",
    icon: "bell-cog-outline",
  },
  excluirConta: {
    title: "Excluir conta",
    subtitle: "Área crítica para remoção permanente da conta.",
    icon: "alert-outline",
  },
  recursosAvancados: {
    title: "Recursos avançados",
    subtitle: "Entrada por voz, integrações e plugins do app.",
    icon: "flask-outline",
  },
  sistema: {
    title: "Sistema",
    subtitle: "Idioma, região, bateria, versão e manutenção do app.",
    icon: "cellphone-cog",
  },
  suporte: {
    title: "Suporte",
    subtitle: "Ajuda, feedback, diagnóstico e documentos do aplicativo.",
    icon: "lifebuoy",
  },
};

export const SETTINGS_DRAWER_PAGE_META: Record<Exclude<SettingsDrawerPage, "overview">, SettingsPageMeta> = {
  prioridades: {
    title: "Ações prioritárias",
    subtitle: "O que merece atenção primeiro nesta conta do inspetor.",
    icon: "flash-outline",
    sections: ["prioridades"],
  },
  contaAcesso: {
    title: "Conta e acesso",
    subtitle: "Perfil, assinatura, email, senha e métodos de acesso da conta.",
    icon: "account-circle-outline",
    sections: ["conta"],
  },
  experiencia: {
    title: "Experiência do app",
    subtitle: "Preferências da IA, aparência e notificações do aplicativo.",
    icon: "palette-outline",
    sections: ["preferenciasIa", "aparencia", "notificacoes"],
  },
  seguranca: {
    title: "Segurança e privacidade",
    subtitle: "Sessões, 2FA, permissões, dados e proteção do dispositivo.",
    icon: "shield-lock-outline",
    sections: [
      "verificacaoIdentidade",
      "twofa",
      "contasConectadas",
      "sessoes",
      "protecaoDispositivo",
      "permissoes",
      "privacidadeNotificacoes",
      "dadosConversas",
      "segurancaArquivos",
      "atividadeSeguranca",
      "excluirConta",
    ],
  },
  sistemaSuporte: {
    title: "Sistema e suporte",
    subtitle: "Recursos avançados, manutenção do app e canais de ajuda.",
    icon: "cellphone-cog",
    sections: ["sistema", "recursosAvancados", "suporte"],
  },
};
