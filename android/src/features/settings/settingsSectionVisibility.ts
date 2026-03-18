import type { SettingsSectionKey } from "./settingsNavigationMeta";

type SettingsSectionGroup = "prioridades" | "acesso" | "experiencia" | "seguranca" | "sistema";
type SettingsDrawerFilter = "todos" | SettingsSectionGroup;

interface SettingsSectionCatalogEntry {
  key: SettingsSectionKey;
  group: SettingsSectionGroup;
  terms: string[];
}

interface BuildSettingsSectionVisibilityInput {
  buscaConfiguracoes: string;
  filtroConfiguracoes: SettingsDrawerFilter;
  perfilNomeCompleto: string;
  contaEmailLabel: string;
  modeloIa: string;
  estiloResposta: string;
  idiomaResposta: string;
  temaApp: string;
  tamanhoFonte: string;
  densidadeInterface: string;
  corDestaque: string;
  somNotificacao: string;
  provedorPrimario: string;
  resumoSessaoAtual: string;
  resumoBlindagemSessoes: string;
  resumo2FAStatus: string;
  lockTimeout: string;
  reautenticacaoStatus: string;
  totalEventosSeguranca: number;
  resumoDadosConversas: string;
  resumoPermissoes: string;
  resumoPrivacidadeNotificacoes: string;
  resumoExcluirConta: string;
  appVersionLabel: string;
  appBuildChannel: string;
  resumoFilaSuporteLocal: string;
  twoFactorEnabled: boolean;
  provedoresConectadosTotal: number;
  permissoesNegadasTotal: number;
  sessoesSuspeitasTotal: number;
}

interface BuildSettingsSectionVisibilityResult {
  buscaConfiguracoesNormalizada: string;
  mostrarSecaoConfiguracao: (key: SettingsSectionKey) => boolean;
  mostrarGrupoContaAcesso: boolean;
  mostrarGrupoExperiencia: boolean;
  mostrarGrupoSeguranca: boolean;
  mostrarGrupoSistema: boolean;
  totalSecoesConfiguracaoVisiveis: number;
  totalSecoesContaAcesso: number;
  totalSecoesExperiencia: number;
  totalSecoesSeguranca: number;
  totalSecoesSistema: number;
  totalPrioridadesAbertas: number;
  resumoBuscaConfiguracoes: string;
}

function normalizarTextoBusca(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function buildSettingsSectionVisibility(
  input: BuildSettingsSectionVisibilityInput,
): BuildSettingsSectionVisibilityResult {
  const buscaConfiguracoesNormalizada = normalizarTextoBusca(input.buscaConfiguracoes);
  const catalogoSecoesConfiguracao: readonly SettingsSectionCatalogEntry[] = [
    {
      key: "prioridades",
      group: "prioridades",
      terms: ["acoes prioritarias 2fa metodo de acesso permissoes criticas sessoes suspeitas atualizacoes"],
    },
    {
      key: "conta",
      group: "acesso",
      terms: [
        `conta perfil email senha plano assinatura pagamento logout excluir ${input.perfilNomeCompleto} ${input.contaEmailLabel}`,
      ],
    },
    {
      key: "preferenciasIa",
      group: "experiencia",
      terms: [
        `preferencias ia modelo estilo resposta idioma memoria aprendizado tom temperatura ${input.modeloIa} ${input.estiloResposta} ${input.idiomaResposta}`,
      ],
    },
    {
      key: "aparencia",
      group: "experiencia",
      terms: [
        `aparencia tema fonte densidade cor destaque animacoes ${input.temaApp} ${input.tamanhoFonte} ${input.densidadeInterface} ${input.corDestaque}`,
      ],
    },
    {
      key: "notificacoes",
      group: "experiencia",
      terms: [`notificacoes push respostas som vibracao emails ${input.somNotificacao}`],
    },
    {
      key: "contasConectadas",
      group: "seguranca",
      terms: [`contas conectadas google apple microsoft metodo principal vinculo provedor ${input.provedorPrimario}`],
    },
    {
      key: "sessoes",
      group: "seguranca",
      terms: [`sessoes dispositivos login atividade suspeita revisar encerrar ${input.resumoSessaoAtual} ${input.resumoBlindagemSessoes}`],
    },
    {
      key: "twofa",
      group: "seguranca",
      terms: [`verificacao em duas etapas 2fa autenticador email codigos recuperacao ${input.resumo2FAStatus}`],
    },
    {
      key: "protecaoDispositivo",
      group: "seguranca",
      terms: [`protecao no dispositivo biometria bloqueio local multitarefa ${input.lockTimeout}`],
    },
    {
      key: "verificacaoIdentidade",
      group: "seguranca",
      terms: [`verificacao de identidade reautenticacao acoes sensiveis ${input.reautenticacaoStatus}`],
    },
    {
      key: "atividadeSeguranca",
      group: "seguranca",
      terms: [`atividade de seguranca eventos logins provedores 2fa exportacao historico ${input.totalEventosSeguranca}`],
    },
    {
      key: "dadosConversas",
      group: "seguranca",
      terms: [`dados e conversas historico exportar apagar retencao backup sincronizacao ${input.resumoDadosConversas}`],
    },
    {
      key: "permissoes",
      group: "seguranca",
      terms: [`permissoes microfone camera arquivos notificacoes biometria ${input.resumoPermissoes}`],
    },
    {
      key: "segurancaArquivos",
      group: "seguranca",
      terms: ["seguranca de arquivos upload pdf imagem docx urls assinadas validacao tamanho"],
    },
    {
      key: "privacidadeNotificacoes",
      group: "seguranca",
      terms: [`privacidade em notificacoes previa tela bloqueada nova mensagem ${input.resumoPrivacidadeNotificacoes}`],
    },
    {
      key: "excluirConta",
      group: "seguranca",
      terms: [`excluir conta apagamento remocao permanente exportar dados ${input.resumoExcluirConta}`],
    },
    {
      key: "recursosAvancados",
      group: "sistema",
      terms: ["recursos avancados voz plugins integracoes google drive slack notion upload arquivos"],
    },
    {
      key: "sistema",
      group: "sistema",
      terms: [`sistema idioma regiao bateria versao atualizacoes atividade fila offline ${input.appVersionLabel} ${input.appBuildChannel}`],
    },
    {
      key: "suporte",
      group: "sistema",
      terms: [`suporte ajuda feedback bug licencas termos diagnostico atualizacoes ${input.resumoFilaSuporteLocal}`],
    },
  ];

  const secoesConfiguracaoVisiveis = catalogoSecoesConfiguracao.filter((section) => {
    if (input.filtroConfiguracoes !== "todos" && input.filtroConfiguracoes !== section.group) {
      return false;
    }
    if (!buscaConfiguracoesNormalizada) {
      return true;
    }
    const alvo = normalizarTextoBusca(section.terms.join(" "));
    return alvo.includes(buscaConfiguracoesNormalizada);
  });
  const secoesConfiguracaoVisiveisSet = new Set(secoesConfiguracaoVisiveis.map((item) => item.key));
  const mostrarSecaoConfiguracao = (key: SettingsSectionKey) => secoesConfiguracaoVisiveisSet.has(key);
  const mostrarGrupoContaAcesso = mostrarSecaoConfiguracao("conta");
  const mostrarGrupoExperiencia =
    mostrarSecaoConfiguracao("preferenciasIa") ||
    mostrarSecaoConfiguracao("aparencia") ||
    mostrarSecaoConfiguracao("notificacoes");
  const mostrarGrupoSeguranca =
    mostrarSecaoConfiguracao("contasConectadas") ||
    mostrarSecaoConfiguracao("sessoes") ||
    mostrarSecaoConfiguracao("twofa") ||
    mostrarSecaoConfiguracao("protecaoDispositivo") ||
    mostrarSecaoConfiguracao("verificacaoIdentidade") ||
    mostrarSecaoConfiguracao("atividadeSeguranca") ||
    mostrarSecaoConfiguracao("dadosConversas") ||
    mostrarSecaoConfiguracao("permissoes") ||
    mostrarSecaoConfiguracao("segurancaArquivos") ||
    mostrarSecaoConfiguracao("privacidadeNotificacoes") ||
    mostrarSecaoConfiguracao("excluirConta");
  const mostrarGrupoSistema =
    mostrarSecaoConfiguracao("recursosAvancados") ||
    mostrarSecaoConfiguracao("sistema") ||
    mostrarSecaoConfiguracao("suporte");
  const totalSecoesConfiguracaoVisiveis = secoesConfiguracaoVisiveis.length;
  const totalSecoesContaAcesso = secoesConfiguracaoVisiveis.filter((item) => item.group === "acesso").length;
  const totalSecoesExperiencia = secoesConfiguracaoVisiveis.filter((item) => item.group === "experiencia").length;
  const totalSecoesSeguranca = secoesConfiguracaoVisiveis.filter((item) => item.group === "seguranca").length;
  const totalSecoesSistema = secoesConfiguracaoVisiveis.filter((item) => item.group === "sistema").length;
  const totalPrioridadesAbertas = [
    !input.twoFactorEnabled,
    input.provedoresConectadosTotal <= 1,
    input.permissoesNegadasTotal > 0,
    input.sessoesSuspeitasTotal > 0,
    true,
  ].filter(Boolean).length;
  const resumoBuscaConfiguracoes = !buscaConfiguracoesNormalizada && input.filtroConfiguracoes === "todos"
    ? ""
    : totalSecoesConfiguracaoVisiveis
      ? `${totalSecoesConfiguracaoVisiveis} bloco${totalSecoesConfiguracaoVisiveis > 1 ? "s" : ""} correspondente${totalSecoesConfiguracaoVisiveis > 1 ? "s" : ""}`
      : "Nenhum bloco encontrado";

  return {
    buscaConfiguracoesNormalizada,
    mostrarSecaoConfiguracao,
    mostrarGrupoContaAcesso,
    mostrarGrupoExperiencia,
    mostrarGrupoSeguranca,
    mostrarGrupoSistema,
    totalSecoesConfiguracaoVisiveis,
    totalSecoesContaAcesso,
    totalSecoesExperiencia,
    totalSecoesSeguranca,
    totalSecoesSistema,
    totalPrioridadesAbertas,
    resumoBuscaConfiguracoes,
  };
}
