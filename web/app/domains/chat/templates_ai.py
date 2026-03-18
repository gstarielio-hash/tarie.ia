# ==========================================
# TARIEL CONTROL TOWER — TEMPLATES_IA.PY
# Responsabilidade: Modelos estruturados (Pydantic)
# para forçar a IA a preencher checklists perfeitamente.
# ==========================================

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

# Tipos de resposta padrão do Bombeiro
CondicaoEnum = Literal["C", "NC", "N/A"]
TipologiaInspecaoEnum = Literal["Residencial", "Comercial", "Industrial", "Outros", "Não informado"]
SimNaoEnum = Literal["Sim", "Não", "Não informado"]

TITULOS_SECOES_CBMGO: dict[str, str] = {
    "seguranca_estrutural": "SEGURANCA ESTRUTURAL",
    "cmar": "CMAR - CONTROLE DE MATERIAL DE ACABAMENTO E REVESTIMENTO",
    "verificacao_documental": "VERIFICACAO DOCUMENTAL DAS INSTALACOES",
    "recomendacoes_gerais": "RECOMENDACOES GERAIS",
}

MAPA_VERIFICACOES_CBMGO: dict[str, dict[str, str]] = {
    "seguranca_estrutural": {
        "item_01_fissuras_trincas": "Avaliar fissuras diagonais em paredes/vigas, trincas horizontais e fissuras em cantos de portas e janelas.",
        "item_02_corrosao_concreto": "Verificar corrosao, descolamento do concreto, armadura exposta e flambagem de pilares/lajes.",
        "item_03_revestimento_teto": "Desprendimento de revestimento de fachadas/paredes, teto/forro.",
        "item_04_pisos": "Trincas/ranhuras em pisos, desprendimento/afundamento ou caimento irregular.",
        "item_05_vazamentos_subsolo": "Vazamentos pelas prumadas no subsolo/areas comuns.",
        "item_06_infiltracoes": "Infiltracoes cronicas que comprometem aderencia e corroem aco.",
        "item_07_esquadrias": "Esquadrias soltas, desalinhadas ou com mau funcionamento.",
        "item_08_ferragens": "Ferragens e metais avariados.",
        "item_09_geometria": "Irregularidades geometricas (esquadro/prumo/nivel) ou falhas de concretagem.",
        "item_10_deformacao": "Peca estrutural com deformacao excessiva.",
        "item_11_armaduras_expostas": "Armaduras expostas.",
        "item_12_recalques": "Recalques diferenciais, novas fissuras e inclinacoes nas edificacoes.",
    },
    "cmar": {
        "item_01_piso": "Material empregado no piso confere com memorial/projeto aprovado.",
        "item_02_paredes": "Material empregado nas paredes confere com memorial/projeto aprovado.",
        "item_03_teto": "Material empregado no teto/forro confere com memorial/projeto aprovado.",
        "item_04_cobertura": "Material empregado na cobertura confere com memorial/projeto aprovado.",
        "item_05_tratamento_retardante": "Existencia de material com funcao retardante/antichama/antipropagante.",
        "item_06_laudo_fabricante": "Existe laudo de conformidade do fabricante atestando tratamento.",
    },
    "verificacao_documental": {
        "item_01_plano_manutencao": "Ha plano de manutencao preditiva das instalacoes.",
        "item_02_coerencia_plano": "Plano coerente com fabricantes, normas e instrucoes tecnicas.",
        "item_03_adequacao_rotinas": "Adequacao de rotinas/frequencias considerando idade e uso das instalacoes.",
        "item_04_acesso_equipamentos": "Condicoes de acesso aos equipamentos para manutencao.",
        "item_05_seguranca_usuarios": "Condicoes de seguranca para usuarios durante a manutencao.",
        "item_06_documentos_pertinentes": "Documentos pertinentes a manutencao disponiveis.",
    },
    "recomendacoes_gerais": {
        "item_01_interdicao": "Situacoes de interdição parcial ou total da edificacao.",
        "item_02_mudanca_uso": "Mudancas significativas no uso que gerem deficiencias futuras.",
        "item_03_intervencao_imediata": "Instalacoes passivas com necessidade de intervencao imediata.",
    },
}


class ItemChecklist(BaseModel):
    """Estrutura base para qualquer item de checklist do laudo."""

    condicao: CondicaoEnum = Field(description="Selecione 'C' (Conforme), 'NC' (Não Conforme) ou 'N/A' (Não se Aplica) com base no relato.")
    localizacao: Optional[str] = Field(
        default="",
        description="Localização do item avaliado (setor, ambiente, pavimento, equipamento).",
    )
    observacao: Optional[str] = Field(
        default="",
        description="Justificativa técnica curta para NC, pendência, ressalva ou evidência complementar.",
    )

    model_config = ConfigDict(extra="ignore")


class InformacoesGerais(BaseModel):
    """Metadados principais do checklist CMAR/CBMGO."""

    responsavel_pela_inspecao: str = Field(default="", description="Nome do inspetor responsável.")
    data_inspecao: str = Field(default="", description="Data da inspeção.")
    local_inspecao: str = Field(default="", description="Local da inspeção.")
    cnpj: str = Field(default="", description="CNPJ do local/cliente inspecionado.")
    numero_projeto_cbmgo: str = Field(default="", description="Número do projeto no CBM-GO, quando existir.")
    possui_cercon: SimNaoEnum = Field(default="Não informado", description="Indica existência de CERCON.")
    numero_cercon: str = Field(default="", description="Número do CERCON.")
    validade_cercon: str = Field(default="", description="Validade do CERCON.")
    responsavel_empresa_acompanhamento: str = Field(
        default="",
        description="Nome de quem acompanhou a inspeção na empresa.",
    )
    tipologia: TipologiaInspecaoEnum = Field(
        default="Não informado",
        description="Tipologia predominante da edificação/instalação.",
    )
    outros_tipologia: str = Field(default="", description="Preencher quando tipologia for 'Outros'.")

    model_config = ConfigDict(extra="ignore")


class SegurancaEstrutural(BaseModel):
    """Checklist de inspeção predial visual para condições estruturais (CBM-GO)."""

    item_01_fissuras_trincas: ItemChecklist
    item_02_corrosao_concreto: ItemChecklist
    item_03_revestimento_teto: ItemChecklist
    item_04_pisos: ItemChecklist
    item_05_vazamentos_subsolo: ItemChecklist
    item_06_infiltracoes: ItemChecklist
    item_07_esquadrias: ItemChecklist
    item_08_ferragens: ItemChecklist
    item_09_geometria: ItemChecklist
    item_10_deformacao: ItemChecklist
    item_11_armaduras_expostas: ItemChecklist
    item_12_recalques: ItemChecklist

    model_config = ConfigDict(extra="ignore")


class CMAR(BaseModel):
    """Controle de Material de Acabamento e Revestimento (NT 10/2022)."""

    item_01_piso: ItemChecklist
    item_02_paredes: ItemChecklist
    item_03_teto: ItemChecklist
    item_04_cobertura: ItemChecklist
    item_05_tratamento_retardante: ItemChecklist
    item_06_laudo_fabricante: ItemChecklist

    model_config = ConfigDict(extra="ignore")


class VerificacaoDocumental(BaseModel):
    """Verificação documental das instalações."""

    item_01_plano_manutencao: ItemChecklist
    item_02_coerencia_plano: ItemChecklist
    item_03_adequacao_rotinas: ItemChecklist
    item_04_acesso_equipamentos: ItemChecklist
    item_05_seguranca_usuarios: ItemChecklist
    item_06_documentos_pertinentes: ItemChecklist

    model_config = ConfigDict(extra="ignore")


class RecomendacoesGerais(BaseModel):
    """Recomendações e intervenções."""

    item_01_interdicao: ItemChecklist
    item_02_mudanca_uso: ItemChecklist
    item_03_intervencao_imediata: ItemChecklist
    outros: Optional[str] = Field(
        default="",
        description="Observações adicionais ou notas do inspetor.",
    )

    model_config = ConfigDict(extra="ignore")


class ColetaAssinaturas(BaseModel):
    """Coleta de assinaturas da inspeção."""

    responsavel_pela_inspecao: str = Field(default="", description="Nome do responsável pela inspeção.")
    assinatura_responsavel: str = Field(default="", description="Assinatura do responsável pela inspeção.")
    responsavel_empresa_acompanhamento: str = Field(
        default="",
        description="Nome do responsável da empresa que acompanhou a inspeção.",
    )
    assinatura_empresa: str = Field(default="", description="Assinatura do responsável da empresa.")

    model_config = ConfigDict(extra="ignore")


class RelatorioCBMGO(BaseModel):
    """Modelo raiz que engloba o checklist CMAR/CBMGO completo."""

    informacoes_gerais: InformacoesGerais = Field(default_factory=InformacoesGerais)
    seguranca_estrutural: SegurancaEstrutural
    cmar: CMAR
    trrf_observacoes: str = Field(
        default="",
        description="Síntese técnica do TRRF e referências normativas aplicadas.",
    )
    verificacao_documental: VerificacaoDocumental
    recomendacoes_gerais: RecomendacoesGerais
    coleta_assinaturas: ColetaAssinaturas = Field(default_factory=ColetaAssinaturas)
    resumo_executivo: str = Field(description=("Um parágrafo de resumo destacando principais achados, criticidades e orientação para validação de engenharia."))

    model_config = ConfigDict(extra="ignore")
