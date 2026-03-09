# ==========================================
# TARIEL CONTROL TOWER — CLIENTE_IA.PY
# Responsabilidade: Comunicação com Google Gemini,
# Streaming, OCR, Saídas Estruturadas e Roteamento @insp
# ==========================================

from __future__ import annotations

import os
import re
import json
import base64
import asyncio
import logging
from typing import Any, Generator, Literal, Optional, Type

from dotenv import load_dotenv
from google.genai import Client
from google.genai import types
from google.genai.errors import ClientError
from google.cloud import vision
from pydantic import BaseModel

load_dotenv()

logger = logging.getLogger(__name__)

_CUSTO_INPUT_POR_TOKEN = float(os.getenv("GEMINI_CUSTO_INPUT_USD", "0.000000075"))
_CUSTO_OUTPUT_POR_TOKEN = float(os.getenv("GEMINI_CUSTO_OUTPUT_USD", "0.0000003"))
_USD_PARA_BRL = float(os.getenv("TAXA_CAMBIO_USD_BRL", "5.80"))

_MODELO_GEMINI = os.getenv("GEMINI_MODELO", "gemini-2.5-flash")

_MAX_IMAGEM_BYTES = 10 * 1024 * 1024
_MAX_BASE64_CHARS = (_MAX_IMAGEM_BYTES * 4 // 3) + 64
_MAX_HISTORICO_ENTRADAS = 20
_MAX_TEXTO_HISTORICO = 8_000
_MAX_MENSAGEM_CHARS = 4_000
_MAX_OCR_CHARS = 2_000
_MAX_DOCUMENTO_CHARS = 40_000

_PREFIXOS_DATAURL_VALIDOS = frozenset(
    [
        "data:image/jpeg;base64,",
        "data:image/jpg;base64,",
        "data:image/png;base64,",
        "data:image/webp;base64,",
        "data:image/gif;base64,",
    ]
)

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

_PAPEIS_VALIDOS = frozenset(["usuario", "assistente"])

_SENTINEL_META_INICIO = "__METADATA__:"
_SENTINEL_CITACOES = "__CITACOES__:"
_SENTINEL_MODO_HUMANO = "__MODO_HUMANO__:"

_ModoLiteral = Literal["curto", "detalhado", "deepresearch"]

_MODO_ALIASES: dict[str, str] = {
    "curto": "curto",
    "detalhado": "detalhado",
    "deepresearch": "deepresearch",
    "deep_research": "deepresearch",
}

_CONFIG_MODO: dict[str, dict[str, Any]] = {
    "curto": {
        "max_output_tokens": 1024,
        "instrucao_extra": (
            "\n\nMODO RESPOSTA CURTA: Seja direto e objetivo. "
            "Máximo 3 parágrafos ou uma lista concisa de até 5 itens. "
            "Cite apenas a norma principal. Sem introduções ou conclusões longas."
        ),
    },
    "detalhado": {
        "max_output_tokens": 8192,
        "instrucao_extra": (
            "\n\nMODO LAUDO COMPLETO: Elabore um laudo técnico estruturado com: "
            "1) Identificação do equipamento/situação, "
            "2) Normas aplicáveis com itens específicos, "
            "3) Não conformidades identificadas, "
            "4) Recomendações técnicas detalhadas, "
            "5) Referências normativas."
        ),
    },
    "deepresearch": {
        "max_output_tokens": 8192,
        "instrucao_extra": (
            "\n\nMODO DEEP RESEARCH COM CITAÇÕES: Elabore um laudo técnico completo "
            "com citações normativas precisas e rastreáveis. "
            "Cite o item exato de cada norma no corpo do texto (ex: NR-12, item 12.38.3). "
            "Ao final da resposta, inclua OBRIGATORIAMENTE a seção abaixo com este "
            "formato exato — sem variações:\n\n"
            "## Referências Normativas\n\n"
            "1. **<identificador exato>** — <excerto ou descrição do item, máx. 200 caracteres>\n"
            "2. **<identificador exato>** — <excerto>\n\n"
            'Exemplos de identificadores aceitos: "NR-12, item 12.38.3", '
            '"ABNT NBR 5419:2015, seção 4.2.1", "NR-10, item 10.2.4".\n'
            "Cite apenas normas mencionadas no corpo do laudo. "
            "Mínimo 3 referências, máximo 10."
        ),
    },
}

_RE_SECAO_REFERENCIAS = re.compile(
    r"##\s*Referências?\s+Normativas?\s*\n+(.*?)(?=\n\s*##\s|\Z)",
    re.IGNORECASE | re.DOTALL,
)

_RE_ITEM_REFERENCIA = re.compile(
    r"(?:^|\n)\s*\d+\.\s+\*\*([^\n\*]{2,180})\*\*\s*[—\-–]\s*([^\n]+)",
    re.MULTILINE,
)

_RE_MENCAO_INSP = re.compile(r"^@insp\b", re.IGNORECASE)
_RE_MENCAO_ENG = re.compile(r"^@eng\b", re.IGNORECASE)


class ClienteIA:
    _INSTRUCAO_SISTEMA: str = """
Você é a Tariel IA, Engenheira Especialista em Segurança e Diagnóstico Industrial da WF Soluções Industriais, sediada em Sertãozinho-SP.

Suas competências técnicas abrangem:
- NR-10, NR-12, NR-13, NR-33, NR-35, SPDA, LOTO, AVCB, CMAR

Diretrizes:
- Cite sempre a norma e o item exato ao identificar não conformidade.
- Ao analisar imagens, descreva o equipamento e os riscos visíveis.
- Nunca substitua um laudo técnico com ART assinado por um humano.
""".strip()

    def __init__(self) -> None:
        chave_gemini = os.getenv("CHAVE_API_GEMINI")
        if not chave_gemini:
            raise EnvironmentError("Variável CHAVE_API_GEMINI não definida.")

        self.cliente = Client(api_key=chave_gemini)

        try:
            self.motor_visao = vision.ImageAnnotatorClient()
            self._ocr_disponivel = True
        except Exception:
            logger.warning("Google Vision API indisponível. OCR desativado.")
            self.motor_visao = None
            self._ocr_disponivel = False

    # =========================================================================
    # HELPERS GERAIS
    # =========================================================================

    @staticmethod
    def _texto_seguro(valor: Optional[str], limite: int) -> str:
        return str(valor or "").strip()[:limite]

    @staticmethod
    def _normalizar_modo(modo: Optional[str]) -> str:
        chave = str(modo or "").strip().lower()
        return _MODO_ALIASES.get(chave, "detalhado")

    @staticmethod
    def _normalizar_setor(setor: Optional[str]) -> str:
        setor_seguro = str(setor or "geral").strip().lower()
        return setor_seguro if setor_seguro in _SETORES_VALIDOS else "geral"

    @classmethod
    def _instrucao_para_modo(cls, modo: Optional[str]) -> str:
        modo_normalizado = cls._normalizar_modo(modo)
        return cls._INSTRUCAO_SISTEMA + _CONFIG_MODO[modo_normalizado]["instrucao_extra"]

    # =========================================================================
    # HELPERS DE IMAGEM / OCR
    # =========================================================================

    @classmethod
    def _validar_e_decodificar_imagem(cls, dados_imagem: str) -> Optional[bytes]:
        if not dados_imagem or not isinstance(dados_imagem, str):
            return None

        if len(dados_imagem) > _MAX_BASE64_CHARS:
            logger.warning("Imagem base64 excede limite de %d chars.", _MAX_BASE64_CHARS)
            return None

        prefixo = next(
            (p for p in _PREFIXOS_DATAURL_VALIDOS if dados_imagem.startswith(p)),
            None,
        )
        base64_puro = dados_imagem[len(prefixo) :] if prefixo else dados_imagem.split(",")[-1]

        try:
            imagem_bytes = base64.b64decode(base64_puro, validate=True)
        except Exception:
            logger.debug("Falha ao decodificar base64 da imagem.")
            return None

        if not imagem_bytes or len(imagem_bytes) > _MAX_IMAGEM_BYTES:
            logger.warning("Imagem descartada por tamanho inválido.")
            return None

        return imagem_bytes

    @staticmethod
    def _detectar_mime(bytes_imagem: bytes) -> str:
        if bytes_imagem[:3] == b"\xff\xd8\xff":
            return "image/jpeg"
        if bytes_imagem[:8] == b"\x89PNG\r\n\x1a\n":
            return "image/png"
        if bytes_imagem[:4] == b"RIFF" and bytes_imagem[8:12] == b"WEBP":
            return "image/webp"
        if bytes_imagem[:6] in (b"GIF87a", b"GIF89a"):
            return "image/gif"
        return "image/jpeg"

    def _extrair_ocr_imagem(self, bytes_imagem: bytes) -> str:
        if not self._ocr_disponivel or not self.motor_visao or not bytes_imagem:
            return ""

        try:
            imagem = vision.Image(content=bytes_imagem)
            resposta = self.motor_visao.text_detection(image=imagem)
            if resposta.error.message:
                logger.warning("OCR retornou erro: %s", resposta.error.message)
                return ""

            texto = ""
            if resposta.full_text_annotation and resposta.full_text_annotation.text:
                texto = resposta.full_text_annotation.text
            elif resposta.text_annotations:
                texto = resposta.text_annotations[0].description or ""

            return texto.strip()[:_MAX_OCR_CHARS]
        except Exception:
            logger.warning("Falha no OCR da imagem.", exc_info=True)
            return ""

    # =========================================================================
    # HELPERS DE HISTÓRICO
    # =========================================================================

    @staticmethod
    def _validar_historico(historico: Any) -> list[dict[str, str]]:
        if not isinstance(historico, list):
            return []

        validos: list[dict[str, str]] = []

        for entrada in historico:
            if not isinstance(entrada, dict):
                continue

            papel = entrada.get("papel")
            if papel not in _PAPEIS_VALIDOS:
                continue

            texto = str(entrada.get("texto") or "").strip()
            if not texto:
                continue

            validos.append(
                {
                    "papel": papel,
                    "texto": texto[:_MAX_TEXTO_HISTORICO],
                }
            )

        return validos[-_MAX_HISTORICO_ENTRADAS:]

    @staticmethod
    def _construir_contents_historico(
        historico: list[dict[str, str]],
    ) -> list[types.Content]:
        contents: list[types.Content] = []

        for msg in historico:
            role = "user" if msg["papel"] == "usuario" else "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg["texto"])],
                )
            )

        return contents

    # =========================================================================
    # MODO HUMANO (@insp / @eng)
    # =========================================================================

    @staticmethod
    def is_mensagem_humana(mensagem: Optional[str]) -> bool:
        texto = str(mensagem or "").strip()
        return bool(texto and _RE_MENCAO_INSP.match(texto))

    @staticmethod
    def is_resposta_engenheiro(mensagem: Optional[str]) -> bool:
        texto = str(mensagem or "").strip()
        return bool(texto and _RE_MENCAO_ENG.match(texto))

    @staticmethod
    def remover_mencao(mensagem: Optional[str]) -> str:
        texto = str(mensagem or "").strip()
        return re.sub(r"^@(?:insp|eng)\s*", "", texto, flags=re.IGNORECASE)

    @staticmethod
    def detectar_encerramento_modo_humano(mensagem: Optional[str]) -> bool:
        texto = str(mensagem or "").strip()
        return not bool(_RE_MENCAO_INSP.match(texto))

    # =========================================================================
    # CUSTO
    # =========================================================================

    @staticmethod
    def _calcular_custo_reais(tokens_input: int, tokens_output: int) -> float:
        custo_usd = (tokens_input or 0) * _CUSTO_INPUT_POR_TOKEN + (tokens_output or 0) * _CUSTO_OUTPUT_POR_TOKEN
        return round(custo_usd * _USD_PARA_BRL, 8)

    # =========================================================================
    # CITAÇÕES
    # =========================================================================

    @staticmethod
    def _extrair_citacoes(texto_completo: str) -> list[dict[str, Any]]:
        citacoes: list[dict[str, Any]] = []
        if not texto_completo:
            return citacoes

        secao_match = _RE_SECAO_REFERENCIAS.search(texto_completo)
        if not secao_match:
            return citacoes

        corpo_secao = secao_match.group(1)

        for ordem, match in enumerate(
            _RE_ITEM_REFERENCIA.finditer(corpo_secao),
            start=1,
        ):
            referencia = match.group(1).strip()
            trecho = match.group(2).strip()[:300]

            if not referencia:
                continue

            citacoes.append(
                {
                    "referencia": referencia,
                    "trecho": trecho,
                    "ordem": ordem,
                }
            )

        return citacoes[:10]

    # =========================================================================
    # MONTAGEM DE PARTES
    # =========================================================================

    def _montar_partes_usuario(
        self,
        mensagem: Optional[str],
        setor: Optional[str],
        dados_imagem: Optional[str] = None,
        texto_documento: Optional[str] = None,
        nome_documento: Optional[str] = None,
    ) -> list[types.Part]:
        partes: list[types.Part] = []

        mensagem_truncada = self._texto_seguro(mensagem, _MAX_MENSAGEM_CHARS)
        setor_seguro = self._normalizar_setor(setor)

        texto_base = mensagem_truncada or "[Sem texto digitado pelo usuário]"
        partes.append(types.Part.from_text(text=f"[Setor: {setor_seguro.upper()}]\n\n{texto_base}"))

        if dados_imagem:
            bytes_img = self._validar_e_decodificar_imagem(dados_imagem)
            if bytes_img:
                partes.append(
                    types.Part.from_bytes(
                        data=bytes_img,
                        mime_type=self._detectar_mime(bytes_img),
                    )
                )

                texto_ocr = self._extrair_ocr_imagem(bytes_img)
                if texto_ocr:
                    partes.append(types.Part.from_text(text=f"[OCR da imagem]\n{texto_ocr}"))
            else:
                logger.warning("Imagem inválida descartada no prompt.")

        if texto_documento:
            cabecalho = f"Documento: {str(nome_documento).strip()[:120]}" if nome_documento else "Documento Anexo"
            partes.append(types.Part.from_text(text=f"[{cabecalho}]\n{str(texto_documento)[:_MAX_DOCUMENTO_CHARS]}"))

        return partes

    # =========================================================================
    # GERAÇÃO DE SAÍDA ESTRUTURADA (JSON / FORMULÁRIOS)
    # =========================================================================

    async def gerar_json_estruturado(
        self,
        schema_pydantic: Type[BaseModel],
        historico: Optional[list] = None,
        dados_imagem: Optional[str] = None,
        texto_documento: Optional[str] = None,
    ) -> dict[str, Any]:
        loop = asyncio.get_running_loop()

        def _executar() -> dict[str, Any]:
            historico_validado = self._validar_historico(historico or [])
            contents = self._construir_contents_historico(historico_validado)

            partes_extras: list[types.Part] = []

            if dados_imagem:
                bytes_img = self._validar_e_decodificar_imagem(dados_imagem)
                if bytes_img:
                    mime = self._detectar_mime(bytes_img)
                    partes_extras.append(types.Part.from_bytes(data=bytes_img, mime_type=mime))

                    texto_ocr = self._extrair_ocr_imagem(bytes_img)
                    if texto_ocr:
                        partes_extras.append(types.Part.from_text(text=f"Texto OCR da imagem:\n{texto_ocr}"))

            if texto_documento:
                doc_truncado = str(texto_documento)[:_MAX_DOCUMENTO_CHARS]
                partes_extras.append(types.Part.from_text(text=f"Documento Anexo:\n{doc_truncado}"))

            partes_extras.append(
                types.Part.from_text(
                    text=(
                        "Baseado em todo o histórico e evidências acima, "
                        "preencha o formulário/checklist de inspeção de forma técnica, "
                        "rigorosa e coerente com as normas aplicáveis."
                    )
                )
            )

            contents.append(types.Content(role="user", parts=partes_extras))

            try:
                resposta = self.cliente.models.generate_content(
                    model=_MODELO_GEMINI,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=schema_pydantic,
                        temperature=0.1,
                        system_instruction=(
                            "Você é um assistente de engenharia. "
                            "Analise as evidências do inspetor (fotos, histórico e documentos) "
                            "e preencha as caixinhas de conformidade (C, NC, N/A) rigorosamente."
                        ),
                    ),
                )

                texto = (getattr(resposta, "text", None) or "").strip()
                if not texto:
                    logger.warning("IA retornou JSON estruturado vazio.")
                    return {}

                return json.loads(texto)

            except json.JSONDecodeError as e:
                logger.error("JSON inválido retornado pela IA: %s", e, exc_info=True)
                return {}
            except ClientError as e:
                logger.error(
                    "Erro de cliente Gemini (estruturado): %s",
                    e,
                    exc_info=True,
                )
                return {}
            except Exception as e:
                logger.error(
                    "Erro inesperado ao gerar JSON estruturado: %s",
                    e,
                    exc_info=True,
                )
                return {}

        return await loop.run_in_executor(None, _executar)

    # =========================================================================
    # STREAM DO CHAT
    # =========================================================================

    def gerar_resposta_stream(
        self,
        mensagem: str,
        dados_imagem: Optional[str] = None,
        setor: str = "geral",
        empresa_id: Optional[int] = None,
        historico: Optional[list] = None,
        modo: str = "detalhado",
        texto_documento: Optional[str] = None,
        nome_documento: Optional[str] = None,
    ) -> Generator[str, None, None]:
        texto_original = str(mensagem or "")

        if self.is_mensagem_humana(texto_original):
            logger.info(
                "Mensagem @insp detectada — IA silenciada. empresa_id=%s",
                empresa_id,
            )
            yield _SENTINEL_MODO_HUMANO + json.dumps(
                {
                    "tipo": "mensagem_humana",
                    "remetente": "inspetor",
                    "destinatario": "engenheiro",
                    "custo_reais": "0",
                },
                ensure_ascii=False,
            )
            return

        if self.is_resposta_engenheiro(texto_original):
            logger.info(
                "Mensagem @eng detectada — IA silenciada. empresa_id=%s",
                empresa_id,
            )
            yield _SENTINEL_MODO_HUMANO + json.dumps(
                {
                    "tipo": "mensagem_humana",
                    "remetente": "engenheiro",
                    "destinatario": "inspetor",
                    "custo_reais": "0",
                },
                ensure_ascii=False,
            )
            return

        modo_seguro = self._normalizar_modo(modo)
        setor_seguro = self._normalizar_setor(setor)
        historico_validado = self._validar_historico(historico or [])

        if not any(
            [
                self._texto_seguro(texto_original, _MAX_MENSAGEM_CHARS),
                dados_imagem,
                texto_documento,
            ]
        ):
            yield "\n\n**[Entrada inválida]** Envie texto, imagem ou documento."
            return

        partes_mensagem_atual = self._montar_partes_usuario(
            mensagem=texto_original,
            setor=setor_seguro,
            dados_imagem=dados_imagem,
            texto_documento=texto_documento,
            nome_documento=nome_documento,
        )

        contents = self._construir_contents_historico(historico_validado)
        contents.append(types.Content(role="user", parts=partes_mensagem_atual))

        texto_completo: list[str] = []
        tokens_input = 0
        tokens_output = 0

        try:
            respostas = self.cliente.models.generate_content_stream(
                model=_MODELO_GEMINI,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=self._instrucao_para_modo(modo_seguro),
                    temperature=0.2,
                    max_output_tokens=_CONFIG_MODO[modo_seguro]["max_output_tokens"],
                ),
            )

            for pedaco in respostas:
                usage = getattr(pedaco, "usage_metadata", None)
                if usage:
                    tokens_input = getattr(usage, "prompt_token_count", 0) or tokens_input
                    tokens_output = getattr(usage, "candidates_token_count", 0) or tokens_output

                texto_chunk = getattr(pedaco, "text", None)
                if texto_chunk:
                    texto_completo.append(texto_chunk)
                    yield texto_chunk

        except ClientError as e:
            status = getattr(e, "status_code", None)
            logger.error(
                "ClientError Gemini: status=%s empresa_id=%s",
                status,
                empresa_id,
                exc_info=True,
            )

            if status == 429:
                yield "\n\n**[Limite de taxa]** Muitas requisições simultâneas. Tente em instantes."
            elif status in (500, 503):
                yield "\n\n**[Serviço indisponível]** A IA está temporariamente sobrecarregada."
            else:
                yield f"\n\n**[Erro]** {str(e)}"
            return

        except Exception:
            logger.error(
                "Erro inesperado no stream. empresa_id=%s",
                empresa_id,
                exc_info=True,
            )
            yield "\n\n**[Erro Interno]** Falha ao processar a resposta."
            return

        custo_reais = self._calcular_custo_reais(tokens_input, tokens_output)
        yield _SENTINEL_META_INICIO + json.dumps(
            {
                "tokens_input": tokens_input,
                "tokens_output": tokens_output,
                "custo_reais": str(custo_reais),
                "modelo": _MODELO_GEMINI,
                "modo": modo_seguro,
            },
            ensure_ascii=False,
        )

        if modo_seguro == "deepresearch" and texto_completo:
            texto_final = "".join(texto_completo)
            citacoes = self._extrair_citacoes(texto_final)
            if citacoes:
                yield _SENTINEL_CITACOES + json.dumps(citacoes, ensure_ascii=False)
            else:
                logger.warning(
                    "deepresearch sem citações extraídas. empresa_id=%s tokens=%d",
                    empresa_id,
                    tokens_output,
                )
