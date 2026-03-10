# ==========================================
# TARIEL CONTROL TOWER — GERADOR_LAUDOS.PY
# Responsabilidade: Gerar PDF de laudo técnico,
# suportar relatórios estruturados (JSON) e
# persistir registro no banco.
# ==========================================

import os
import re
import tempfile
import uuid
import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

from fpdf import FPDF
from fpdf.enums import XPos, YPos

from app.shared.database import SessaoLocal

logger = logging.getLogger(__name__)

# ── Limites de segurança ──────────────────────────────────────────────────────

_MAX_TEXTO_DIAGNOSTICO = 80_000
_MAX_TEXTO_CAMPO_META = 200
_MAX_SETOR_CHARS = 80

_DIR_PDF_BASE = Path(os.getenv("DIR_PDF_LAUDOS", tempfile.gettempdir())).resolve()

_SETORES_VALIDOS = frozenset(
    [
        "geral",
        "eletrica",
        "mecanica",
        "caldeiraria",
        "spda",
        "loto",
        "nr10",
        "nr12",
        "nr13",
        "nr35",
        "avcb",
        "pie",
        "rti",
    ]
)

_SUBSTITUICOES_UNICODE: dict[str, str] = {
    "\u201c": '"',
    "\u201d": '"',
    "\u2018": "'",
    "\u2019": "'",
    "\u2013": "-",
    "\u2014": "-",
    "\u2026": "...",
    "\u2022": "-",
    "\u2714": "[OK]",
    "\u2705": "[OK]",
    "\u274c": "[X]",
    "\u26a0": "[ATENCAO]",
    "\u00b0": "graus",
    "\u00b2": "2",
    "\u00b3": "3",
    "\u03a9": "Ohm",
    "\u03bc": "u",
    "\U0001f50d": "[ANALISE]",
    "\U0001f52c": "[DIAGNOSTICO]",
}

# ==========================================
# TEMPLATE DO DOCUMENTO WF
# ==========================================


class PDF_WF(FPDF):
    """Template de PDF com cabeçalho e rodapé padrão WF."""

    def header(self) -> None:
        if self.page_no() > 1:
            self.set_font("helvetica", "I", 8)
            self.set_text_color(150, 150, 150)
            self.cell(
                0,
                10,
                "WF Engenharia - Continuacao do Laudo Tecnico",
                new_x=XPos.LMARGIN,
                new_y=YPos.NEXT,
                align="R",
            )
            self.line(10, 20, 200, 20)
            self.ln(5)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("helvetica", "I", 8)
        self.set_text_color(128, 128, 128)
        self.line(10, self.get_y(), 200, self.get_y())
        self.cell(
            0,
            10,
            f"Documento Tecnico | WF Engenharia | Pagina {self.page_no()} / {{nb}}",
            align="C",
        )

    def linha_metadado(self, rotulo: str, valor: str) -> None:
        self.set_text_color(0, 0, 0)
        self.set_font("helvetica", "B", 10)
        self.cell(48, 6, str(rotulo)[:50], new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.set_font("helvetica", "", 10)
        self.cell(
            0,
            6,
            str(valor)[:_MAX_TEXTO_CAMPO_META],
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )


class PDF_MESA_PENDENCIAS(FPDF):
    """Template dedicado para relatório de pendências da mesa avaliadora."""

    def header(self) -> None:
        self.set_font("helvetica", "B", 9)
        self.set_text_color(110, 110, 110)
        self.cell(
            0,
            6,
            "WF Engenharia | Mesa Avaliadora",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
            align="R",
        )
        self.line(10, self.get_y() + 1, 200, self.get_y() + 1)
        self.ln(5)

    def footer(self) -> None:
        self.set_y(-14)
        self.set_font("helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.line(10, self.get_y(), 200, self.get_y())
        self.cell(
            0,
            8,
            f"Relatorio de Pendencias | Pagina {self.page_no()} / {{nb}}",
            align="C",
        )


# ==========================================
# MOTOR DE GERAÇÃO (MAESTRO)
# ==========================================


class GeradorLaudos:
    @staticmethod
    @contextmanager
    def _sessao_banco():
        banco = SessaoLocal()
        try:
            yield banco
            banco.commit()
        except Exception:
            banco.rollback()
            raise
        finally:
            banco.close()

    @staticmethod
    def _validar_caminho_saida(caminho_saida: str) -> Path:
        _DIR_PDF_BASE.mkdir(parents=True, exist_ok=True)
        caminho = Path(caminho_saida).resolve()
        try:
            caminho.relative_to(_DIR_PDF_BASE)
        except ValueError:
            raise ValueError("Caminho de saída fora do diretório permitido.")

        if caminho.suffix.lower() != ".pdf":
            raise ValueError("Extensão inválida para laudo. Esperado: .pdf")
        caminho.parent.mkdir(parents=True, exist_ok=True)
        return caminho

    @staticmethod
    def _validar_dados_entrada(dados: dict) -> dict:
        def _campo_texto(chave: str, limite: int, padrao: str = "N/A") -> str:
            valor = dados.get(chave, padrao)
            if not isinstance(valor, str):
                valor = str(valor) if valor is not None else padrao
            valor = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", valor)
            return valor[:limite].strip() or padrao

        setor_raw = _campo_texto("setor", _MAX_SETOR_CHARS, "geral").lower()
        setor = setor_raw if setor_raw in _SETORES_VALIDOS else "geral"

        return {
            "empresa_contratante": _campo_texto("empresa", _MAX_TEXTO_CAMPO_META),
            "setor": setor,
            "responsavel_tecnico": _campo_texto("inspetor", _MAX_TEXTO_CAMPO_META),
            "data_inspecao": _campo_texto("data", 40),
            "diagnostico_ia": _campo_texto("diagnostico", _MAX_TEXTO_DIAGNOSTICO, "Nenhum diagnóstico processado."),
            "dados_formulario": dados.get("dados_formulario"),  # Repassa o JSON estruturado se houver
        }

    @staticmethod
    def _sanitizar_texto_para_pdf(texto: str) -> str:
        for char_unicode, substituto in _SUBSTITUICOES_UNICODE.items():
            texto = texto.replace(char_unicode, substituto)
        return texto.encode("latin-1", errors="replace").decode("latin-1")

    # ── MÚSICO 1: PDF de Texto Corrido (Padrão) ──────────────────────────────

    @staticmethod
    def _construir_pdf_texto(pdf: PDF_WF, dados: dict, citacoes: Optional[list]) -> None:
        """Desenha o PDF tradicional baseado no texto livre da IA."""
        # Título do Parecer
        pdf.set_font("helvetica", "B", 12)
        pdf.set_fill_color(244, 123, 32)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(
            0,
            10,
            "  PARECER TECNICO E DIRETRIZES DE ENGENHARIA",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
            fill=True,
        )
        pdf.ln(5)

        # Corpo
        pdf.set_text_color(0, 0, 0)
        pdf.set_font("helvetica", "", 11)
        texto_seguro = GeradorLaudos._sanitizar_texto_para_pdf(dados["diagnostico_ia"])
        pdf.multi_cell(0, 6, texto_seguro, markdown=True)

    # ── MÚSICO 2: PDF Estruturado CBM-GO (Checklist) ─────────────────────────

    @staticmethod
    def _construir_pdf_estruturado(pdf: PDF_WF, dados: dict) -> None:
        """Desenha as tabelas do Bombeiro a partir do JSON gerado pela IA."""
        json_dados = dados["dados_formulario"]

        # 1. Resumo Executivo
        if "resumo_executivo" in json_dados:
            pdf.set_font("helvetica", "B", 11)
            pdf.set_fill_color(240, 245, 250)
            pdf.set_text_color(15, 43, 70)
            pdf.cell(
                0,
                8,
                "  RESUMO DA INSPECÃO (IA)",
                new_x=XPos.LMARGIN,
                new_y=YPos.NEXT,
                fill=True,
            )
            pdf.set_font("helvetica", "", 10)
            pdf.set_text_color(0, 0, 0)
            resumo = GeradorLaudos._sanitizar_texto_para_pdf(json_dados["resumo_executivo"])
            pdf.multi_cell(0, 6, resumo)
            pdf.ln(5)

        secoes_map = [
            ("seguranca_estrutural", "SEGURANCA ESTRUTURAL"),
            ("cmar", "CMAR - CONTROLE DE MATERIAL DE ACABAMENTO"),
            ("verificacao_documental", "VERIFICACAO DOCUMENTAL"),
            ("recomendacoes_gerais", "RECOMENDACOES GERAIS"),
        ]

        # 2. Desenhar as Tabelas
        for chave_secao, titulo in secoes_map:
            conteudo_secao = json_dados.get(chave_secao)
            if not conteudo_secao:
                continue

            # Título da Tabela
            pdf.ln(4)
            pdf.set_font("helvetica", "B", 10)
            pdf.set_fill_color(15, 43, 70)
            pdf.set_text_color(255, 255, 255)
            pdf.cell(0, 8, f"  {titulo}", new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)

            # Cabeçalho da Tabela
            pdf.set_font("helvetica", "B", 8)
            pdf.set_fill_color(220, 220, 220)
            pdf.set_text_color(0, 0, 0)
            pdf.cell(110, 8, " Item / Verificacao", border=1)
            pdf.cell(20, 8, " Condicao", align="C", border=1)
            pdf.cell(60, 8, " Observacao", border=1, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

            pdf.set_font("helvetica", "", 8)

            # Linhas da Tabela
            for key, val in conteudo_secao.items():
                if key == "outros" and isinstance(val, str):
                    pdf.set_font("helvetica", "B", 8)
                    pdf.cell(30, 8, " Outros:", border="L B")
                    pdf.set_font("helvetica", "", 8)
                    pdf.cell(
                        160,
                        8,
                        GeradorLaudos._sanitizar_texto_para_pdf(val),
                        border="R B",
                        new_x=XPos.LMARGIN,
                        new_y=YPos.NEXT,
                    )
                    continue

                if isinstance(val, dict) and "condicao" in val:
                    # Limpeza do nome da chave (ex: item_01_fissuras -> Item 01 Fissuras)
                    nome_limpo = " ".join(key.split("_")).title()

                    cond = val.get("condicao", "N/A")
                    obs = GeradorLaudos._sanitizar_texto_para_pdf(val.get("observacao", "") or "-")

                    # Calcula a altura necessária para a observação (se for muito longa)
                    linhas_obs = len(pdf.multi_cell(60, 6, obs, split_only=True))
                    linhas_nome = len(pdf.multi_cell(110, 6, nome_limpo, split_only=True))
                    alt_linha = max(linhas_obs, linhas_nome) * 6

                    y_inicio = pdf.get_y()
                    x_inicio = pdf.get_x()

                    # Desenha as colunas
                    pdf.multi_cell(110, 6, nome_limpo, border=1)
                    pdf.set_xy(x_inicio + 110, y_inicio)

                    # Colore a condição
                    if cond == "C":
                        pdf.set_text_color(0, 128, 0)
                    elif cond == "NC":
                        pdf.set_text_color(200, 0, 0)

                    pdf.cell(20, alt_linha, cond, border=1, align="C")
                    pdf.set_text_color(0, 0, 0)  # Volta pro preto

                    pdf.set_xy(x_inicio + 130, y_inicio)
                    pdf.multi_cell(60, 6, obs, border=1, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # ── Função de Orquestração (O Maestro) ───────────────────────────────────

    @classmethod
    def gerar_pdf_inspecao(
        cls,
        dados: dict,
        caminho_saida: str,
        empresa_id: Optional[int] = None,
        usuario_id: Optional[int] = None,
        is_deep: bool = False,
        citacoes: Optional[list] = None,
    ) -> str:
        caminho_seguro = cls._validar_caminho_saida(caminho_saida)
        dados_validados = cls._validar_dados_entrada(dados)
        codigo_hash = f"WF-{uuid.uuid4().hex[:12].upper()}"

        # ── 1. Inicializa o PDF e Cabeçalhos ──
        pdf = PDF_WF()
        pdf.alias_nb_pages()
        pdf.add_page()
        pdf.set_auto_page_break(auto=True, margin=20)

        pdf.set_font("helvetica", "B", 18)
        pdf.set_text_color(15, 43, 70)

        # Decide o título baseado no tipo de laudo
        titulo_laudo = "CHECKLIST DE INSPECÃO (CBM-GO)" if dados_validados.get("dados_formulario") else "LAUDO TECNICO DE INSPECÃO"
        pdf.cell(0, 10, titulo_laudo, new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")

        pdf.set_font("helvetica", "I", 10)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(
            0,
            5,
            "Diagnostico Assistido por Inteligencia Artificial (Tariel IA)",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
            align="C",
        )
        pdf.line(10, pdf.get_y() + 2, 200, pdf.get_y() + 2)
        pdf.ln(12)

        pdf.linha_metadado("Contratante:", dados_validados["empresa_contratante"])
        pdf.linha_metadado("Setor / Contexto:", dados_validados["setor"].upper())
        pdf.linha_metadado("Responsavel:", dados_validados["responsavel_tecnico"])
        pdf.linha_metadado(
            "Data / Validacao:",
            f"{dados_validados['data_inspecao']}  |  Hash: {codigo_hash}",
        )
        pdf.ln(8)

        # ── 2. DECISÃO (MAESTRO) ──
        if dados_validados.get("dados_formulario"):
            # Se for laudo estruturado do Bombeiro, usa o Músico 2
            cls._construir_pdf_estruturado(pdf, dados_validados)
        else:
            # Se for chat normal, usa o Músico 1
            cls._construir_pdf_texto(pdf, dados_validados, citacoes)

        # ── 3. Finalização e Assinatura ──
        pdf.ln(20)
        if pdf.get_y() > 240:
            pdf.add_page()
            pdf.ln(20)

        responsavel_seguro = cls._sanitizar_texto_para_pdf(dados_validados["responsavel_tecnico"])
        pdf.set_font("helvetica", "B", 11)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(0, 6, "_" * 52, new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")
        pdf.cell(0, 6, responsavel_seguro, new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")
        pdf.set_font("helvetica", "", 9)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(
            0,
            6,
            "Assinatura Digitalizada / Visto do Engenheiro",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
            align="C",
        )

        # ── 4. Grava no disco ──
        pdf.output(str(caminho_seguro))
        logger.info("PDF Gerado | hash=%s caminho=%s", codigo_hash, caminho_seguro.name)

        return codigo_hash

    @classmethod
    def gerar_pdf_pendencias_mesa(
        cls,
        *,
        caminho_saida: str,
        laudo_id: int,
        filtro: str,
        empresa: str,
        inspetor: str,
        data_geracao: str,
        total: int,
        abertas: int,
        resolvidas: int,
        pendencias: list[dict],
        engenheiro_nome: str = "Mesa Avaliadora WF",
        engenheiro_cargo: str = "Engenheiro Revisor",
        engenheiro_crea: str = "Nao informado",
        carimbo_texto: str = "CARIMBO DIGITAL WF",
    ) -> str:
        caminho_seguro = cls._validar_caminho_saida(caminho_saida)
        codigo_hash = f"WFM-{uuid.uuid4().hex[:12].upper()}"

        pdf = PDF_MESA_PENDENCIAS()
        pdf.alias_nb_pages()
        pdf.add_page()
        pdf.set_auto_page_break(auto=True, margin=18)

        titulo = cls._sanitizar_texto_para_pdf("RELATORIO DE PENDENCIAS DA MESA AVALIADORA")
        empresa_segura = cls._sanitizar_texto_para_pdf(str(empresa or "N/A")[:_MAX_TEXTO_CAMPO_META])
        inspetor_seguro = cls._sanitizar_texto_para_pdf(str(inspetor or "N/A")[:_MAX_TEXTO_CAMPO_META])
        data_segura = cls._sanitizar_texto_para_pdf(str(data_geracao or "N/A")[:40])
        filtro_seguro = cls._sanitizar_texto_para_pdf(str(filtro or "abertas").upper()[:20])
        assinatura_nome_seguro = cls._sanitizar_texto_para_pdf(str(engenheiro_nome or "Mesa Avaliadora WF")[:160])
        assinatura_cargo_seguro = cls._sanitizar_texto_para_pdf(str(engenheiro_cargo or "Engenheiro Revisor")[:120])
        assinatura_crea_seguro = cls._sanitizar_texto_para_pdf(str(engenheiro_crea or "Nao informado")[:80])
        carimbo_seguro = cls._sanitizar_texto_para_pdf(str(carimbo_texto or "CARIMBO DIGITAL WF")[:120])

        pdf.set_font("helvetica", "B", 15)
        pdf.set_text_color(15, 43, 70)
        pdf.cell(0, 9, titulo, new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")
        pdf.ln(2)

        pdf.set_font("helvetica", "", 10)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(0, 6, f"Laudo: #{int(laudo_id)}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.cell(0, 6, f"Empresa: {empresa_segura}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.cell(0, 6, f"Inspetor: {inspetor_seguro}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.cell(0, 6, f"Data de geracao: {data_segura}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.cell(0, 6, f"Filtro: {filtro_seguro} | Hash: {codigo_hash}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(4)

        pdf.set_font("helvetica", "B", 10)
        pdf.set_fill_color(240, 245, 250)
        pdf.set_text_color(15, 43, 70)
        pdf.cell(0, 8, " RESUMO", new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)

        pdf.set_text_color(0, 0, 0)
        pdf.set_font("helvetica", "", 10)
        pdf.cell(
            0,
            6,
            f"Total: {int(total)} | Abertas: {int(abertas)} | Resolvidas: {int(resolvidas)}",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        pdf.ln(3)

        pdf.set_font("helvetica", "B", 10)
        pdf.set_fill_color(15, 43, 70)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(0, 8, " PENDENCIAS", new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
        pdf.ln(2)

        if not pendencias:
            pdf.set_font("helvetica", "", 10)
            pdf.set_text_color(0, 0, 0)
            pdf.multi_cell(0, 6, "Nenhuma pendencia encontrada para o filtro selecionado.")
        else:
            for indice, item in enumerate(pendencias, start=1):
                status = "ABERTA" if not bool(item.get("lida")) else "RESOLVIDA"
                texto = cls._sanitizar_texto_para_pdf(str(item.get("texto") or "(sem conteudo)")[:1200])
                data_item = cls._sanitizar_texto_para_pdf(str(item.get("data_label") or item.get("data") or "-")[:40])
                resolvida_por = cls._sanitizar_texto_para_pdf(str(item.get("resolvida_por_nome") or "-")[:140])
                resolvida_em = cls._sanitizar_texto_para_pdf(str(item.get("resolvida_em_label") or item.get("resolvida_em") or "-")[:40])
                status_cor = (200, 0, 0) if status == "ABERTA" else (0, 120, 0)

                pdf.set_font("helvetica", "B", 10)
                pdf.set_text_color(15, 43, 70)
                pdf.cell(0, 6, f"{indice}. Pendencia #{item.get('id', '-')}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

                pdf.set_font("helvetica", "", 9)
                pdf.set_text_color(80, 80, 80)
                pdf.cell(0, 5, f"Criada em: {data_item}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

                pdf.set_font("helvetica", "B", 9)
                pdf.set_text_color(*status_cor)
                pdf.cell(0, 5, f"Status: {status}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

                if status == "RESOLVIDA":
                    pdf.set_font("helvetica", "", 9)
                    pdf.set_text_color(80, 80, 80)
                    pdf.cell(
                        0,
                        5,
                        f"Resolvida por: {resolvida_por} | Em: {resolvida_em}",
                        new_x=XPos.LMARGIN,
                        new_y=YPos.NEXT,
                    )

                pdf.set_font("helvetica", "", 10)
                pdf.set_text_color(0, 0, 0)
                pdf.multi_cell(0, 6, texto)
                pdf.ln(3)

        # Bloco de assinatura tecnica da mesa/revisor.
        if pdf.get_y() > 235:
            pdf.add_page()
            pdf.ln(12)

        pdf.ln(6)
        y_linha = pdf.get_y()
        pdf.set_draw_color(110, 110, 110)
        pdf.line(58, y_linha, 152, y_linha)
        pdf.ln(3)

        pdf.set_font("helvetica", "B", 10)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(0, 6, assinatura_nome_seguro, new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")

        pdf.set_font("helvetica", "", 9)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(
            0,
            5,
            f"{assinatura_cargo_seguro} | CREA: {assinatura_crea_seguro}",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
            align="C",
        )

        pdf.set_font("helvetica", "I", 8)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(
            0,
            5,
            f"{carimbo_seguro} / Assinatura digital da mesa",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
            align="C",
        )

        pdf.output(str(caminho_seguro))
        logger.info("PDF Pendencias Gerado | hash=%s caminho=%s", codigo_hash, caminho_seguro.name)
        return codigo_hash
