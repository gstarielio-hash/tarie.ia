# ==========================================
# TARIEL CONTROL TOWER — TEMPLATES_IA.PY
# Responsabilidade: Modelos estruturados (Pydantic)
# para forçar a IA a preencher checklists perfeitamente.
# ==========================================

from pydantic import BaseModel, Field
from typing import Literal, Optional

# Tipos de resposta padrão do Bombeiro
CondicaoEnum = Literal["C", "NC", "N/A"]


class ItemChecklist(BaseModel):
    """Estrutura base para qualquer item de checklist do laudo"""

    condicao: CondicaoEnum = Field(description="Selecione 'C' (Conforme), 'NC' (Não Conforme) ou 'N/A' (Não se Aplica) com base no relato.")
    observacao: Optional[str] = Field(
        default=None,
        description="Justificativa técnica curta se for NC, ou localização da anomalia. Deixe vazio se for C ou N/A.",
    )


class SegurancaEstrutural(BaseModel):
    """Checklist de inspeção predial visual para verificação de condições estruturais (CBM-GO)"""

    item_01_fissuras_trincas: ItemChecklist = Field(description="Fissuras diagonais em paredes/vigas, trincas horizontais")
    item_02_corrosao_concreto: ItemChecklist = Field(description="Corrosão, descolamento de concreto, armadura exposta, flambagem")
    item_03_revestimento_teto: ItemChecklist = Field(description="Desprendimento de revestimento de fachadas/paredes/teto/forro")
    item_04_pisos: ItemChecklist = Field(description="Desprendimento/afundamento dos pisos ou caimento irregular")
    item_05_vazamentos_subsolo: ItemChecklist = Field(description="Vazamentos pelas prumadas no subsolo/áreas comuns")
    item_06_infiltracoes: ItemChecklist = Field(description="Infiltrações crônicas que comprometem aderência")
    item_07_esquadrias: ItemChecklist = Field(description="Esquadrias soltas ou desalinhadas")
    item_08_ferragens: ItemChecklist = Field(description="Ferragens e metais avariados")
    item_09_geometria: ItemChecklist = Field(description="Irregularidades geométricas (esquadro/prumo/nível)")
    item_10_deformacao: ItemChecklist = Field(description="Peça estrutural com deformação excessiva")
    item_11_armaduras_expostas: ItemChecklist = Field(description="Armaduras expostas (Geral)")
    item_12_recalques: ItemChecklist = Field(description="Monitorar recalques diferenciais (afundamento)")


class CMAR(BaseModel):
    """Controle de Material de Acabamento e Revestimento (NT10/2022)"""

    item_01_piso: ItemChecklist = Field(description="Material empregado no piso confere com projeto")
    item_02_paredes: ItemChecklist = Field(description="Material empregado nas paredes confere com projeto")
    item_03_teto: ItemChecklist = Field(description="Material empregado no teto/forro confere com projeto")
    item_04_cobertura: ItemChecklist = Field(description="Material empregado na cobertura confere com projeto")
    item_05_tratamento_retardante: ItemChecklist = Field(description="Instalação de material com tratamento antichama")
    item_06_laudo_fabricante: ItemChecklist = Field(description="Existe laudo de conformidade do fabricante atestando o tratamento")


class VerificacaoDocumental(BaseModel):
    """Verificação Documental das Instalações"""

    item_01_plano_manutencao: ItemChecklist = Field(description="Há plano de manutenção preditiva das instalações")
    item_02_coerencia_plano: ItemChecklist = Field(description="Plano coerente com fabricantes e normas")
    item_03_adequacao_rotinas: ItemChecklist = Field(description="Adequação de rotinas à idade das instalações")
    item_04_acesso_equipamentos: ItemChecklist = Field(description="Condições de acesso aos equipamentos")
    item_05_seguranca_usuarios: ItemChecklist = Field(description="Condições de segurança para os usuários durante manutenção")
    item_06_documentos_pertinentes: ItemChecklist = Field(description="Documentos pertinentes à manutenção")


class RecomendacoesGerais(BaseModel):
    """Recomendações e Intervenções"""

    item_01_interdicao: ItemChecklist = Field(description="Situações de interdição parcial ou total")
    item_02_mudanca_uso: ItemChecklist = Field(description="Mudanças significativas no uso que causem deficiências")
    item_03_intervencao_imediata: ItemChecklist = Field(description="Instalações passivas de necessidade de intervenção imediata")
    outros: Optional[str] = Field(description="Observações adicionais ou notas do inspetor")


class RelatorioCBMGO(BaseModel):
    """Modelo Raiz que engloba todo o relatório do Bombeiro de Goiás"""

    seguranca_estrutural: SegurancaEstrutural
    cmar: CMAR
    verificacao_documental: VerificacaoDocumental
    recomendacoes_gerais: RecomendacoesGerais
    resumo_executivo: str = Field(
        description="Um parágrafo de resumo escrito pela IA destacando as principais falhas críticas (se houver) para o Engenheiro ler rapidamente."
    )
