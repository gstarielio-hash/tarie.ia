"""Contratos e enums compartilhados da camada de persistência."""

from __future__ import annotations

import enum
import re
from dataclasses import dataclass
from typing import Any


def _normalizar_texto_chave(valor: Any) -> str:
    texto = str(valor or "").strip().lower()
    texto = (
        texto.replace("á", "a")
        .replace("à", "a")
        .replace("ã", "a")
        .replace("â", "a")
        .replace("é", "e")
        .replace("ê", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ô", "o")
        .replace("õ", "o")
        .replace("ú", "u")
        .replace("ç", "c")
    )
    return re.sub(r"[\s\-_\\/]+", "_", texto)


class NivelAcesso(enum.IntEnum):
    INSPETOR = 1
    REVISOR = 50
    ADMIN_CLIENTE = 80
    DIRETORIA = 99

    @classmethod
    def normalizar(cls, valor: Any) -> int:
        if isinstance(valor, cls):
            return int(valor)

        if valor is None:
            return int(cls.INSPETOR)

        try:
            inteiro = int(valor)
        except (TypeError, ValueError):
            chave = _normalizar_texto_chave(valor)
            mapa = {
                "inspetor": cls.INSPETOR,
                "inspector": cls.INSPETOR,
                "revisor": cls.REVISOR,
                "reviewer": cls.REVISOR,
                "admin_cliente": cls.ADMIN_CLIENTE,
                "admincliente": cls.ADMIN_CLIENTE,
                "cliente_admin": cls.ADMIN_CLIENTE,
                "clienteadmin": cls.ADMIN_CLIENTE,
                "administrador_cliente": cls.ADMIN_CLIENTE,
                "diretoria": cls.DIRETORIA,
                "admin": cls.DIRETORIA,
                "administrador": cls.DIRETORIA,
            }
            if chave not in mapa:
                raise ValueError(f"Nível de acesso inválido: {valor!r}")
            return int(mapa[chave])

        validos = {
            int(cls.INSPETOR),
            int(cls.REVISOR),
            int(cls.ADMIN_CLIENTE),
            int(cls.DIRETORIA),
        }
        if inteiro not in validos:
            raise ValueError(f"Nível de acesso inválido: {valor!r}")
        return inteiro


class _EnumTexto(str, enum.Enum):
    @classmethod
    def valores(cls) -> list[str]:
        return [item.value for item in cls]


class StatusLaudo(_EnumTexto):
    PENDENTE = "Pendente"
    CONFORME = "Conforme"
    NAO_CONFORME = "Nao Conforme"
    EM_ANDAMENTO = "Em Andamento"

    @classmethod
    def normalizar(cls, valor: Any) -> str:
        chave = _normalizar_texto_chave(valor)
        mapa = {
            "pendente": cls.PENDENTE.value,
            "conforme": cls.CONFORME.value,
            "nao_conforme": cls.NAO_CONFORME.value,
            "em_andamento": cls.EM_ANDAMENTO.value,
        }
        if chave in mapa:
            return mapa[chave]
        if valor in cls.valores():
            return str(valor)
        raise ValueError(f"Status de laudo inválido: {valor!r}")


class StatusRevisao(_EnumTexto):
    RASCUNHO = "Rascunho"
    AGUARDANDO = "Aguardando Aval"
    APROVADO = "Aprovado"
    REJEITADO = "Rejeitado"

    @classmethod
    def normalizar(cls, valor: Any) -> str:
        chave = _normalizar_texto_chave(valor)
        mapa = {
            "rascunho": cls.RASCUNHO.value,
            "aguardando": cls.AGUARDANDO.value,
            "aguardando_aval": cls.AGUARDANDO.value,
            "aguardando_avaliacao": cls.AGUARDANDO.value,
            "aprovado": cls.APROVADO.value,
            "rejeitado": cls.REJEITADO.value,
        }
        if chave in mapa:
            return mapa[chave]
        if valor in cls.valores():
            return str(valor)
        raise ValueError(f"Status de revisão inválido: {valor!r}")


class StatusAprendizadoIa(_EnumTexto):
    RASCUNHO_INSPETOR = "rascunho_inspetor"
    VALIDADO_MESA = "validado_mesa"
    REJEITADO_MESA = "rejeitado_mesa"

    @classmethod
    def normalizar(cls, valor: Any) -> str:
        chave = _normalizar_texto_chave(valor)
        mapa = {
            "rascunho": cls.RASCUNHO_INSPETOR.value,
            "rascunho_inspetor": cls.RASCUNHO_INSPETOR.value,
            "validado": cls.VALIDADO_MESA.value,
            "validado_mesa": cls.VALIDADO_MESA.value,
            "aprovado_mesa": cls.VALIDADO_MESA.value,
            "rejeitado": cls.REJEITADO_MESA.value,
            "rejeitado_mesa": cls.REJEITADO_MESA.value,
        }
        if chave in mapa:
            return mapa[chave]
        if valor in cls.valores():
            return str(valor)
        raise ValueError(f"Status de aprendizado IA inválido: {valor!r}")


class VereditoAprendizadoIa(_EnumTexto):
    CONFORME = "conforme"
    NAO_CONFORME = "nao_conforme"
    AJUSTE = "ajuste"
    DUVIDA = "duvida"

    @classmethod
    def normalizar(cls, valor: Any) -> str:
        chave = _normalizar_texto_chave(valor)
        mapa = {
            "conforme": cls.CONFORME.value,
            "correto": cls.CONFORME.value,
            "ok": cls.CONFORME.value,
            "nao_conforme": cls.NAO_CONFORME.value,
            "incorreto": cls.NAO_CONFORME.value,
            "errado": cls.NAO_CONFORME.value,
            "ajuste": cls.AJUSTE.value,
            "parcial": cls.AJUSTE.value,
            "duvida": cls.DUVIDA.value,
            "incerto": cls.DUVIDA.value,
        }
        if chave in mapa:
            return mapa[chave]
        if valor in cls.valores():
            return str(valor)
        raise ValueError(f"Veredito de aprendizado IA inválido: {valor!r}")


class PlanoEmpresa(_EnumTexto):
    INICIAL = "Inicial"
    INTERMEDIARIO = "Intermediario"
    ILIMITADO = "Ilimitado"

    @classmethod
    def normalizar(cls, valor: Any) -> str:
        chave = _normalizar_texto_chave(valor)
        mapa = {
            "inicial": cls.INICIAL.value,
            "piloto": cls.INICIAL.value,
            "starter": cls.INICIAL.value,
            "intermediario": cls.INTERMEDIARIO.value,
            "pro": cls.INTERMEDIARIO.value,
            "profissional": cls.INTERMEDIARIO.value,
            "ilimitado": cls.ILIMITADO.value,
            "enterprise": cls.ILIMITADO.value,
        }
        if chave in mapa:
            return mapa[chave]
        if valor in cls.valores():
            return str(valor)
        raise ValueError(f"Plano inválido: {valor!r}")


class ModoResposta(_EnumTexto):
    CURTO = "curto"
    DETALHADO = "detalhado"
    DEEP_RESEARCH = "deep_research"

    @classmethod
    def normalizar(cls, valor: Any) -> str:
        chave = _normalizar_texto_chave(valor)
        mapa = {
            "curto": cls.CURTO.value,
            "detalhado": cls.DETALHADO.value,
            "deepresearch": cls.DEEP_RESEARCH.value,
            "deep_research": cls.DEEP_RESEARCH.value,
        }
        if chave in mapa:
            return mapa[chave]
        if valor in cls.valores():
            return str(valor)
        raise ValueError(f"Modo de resposta inválido: {valor!r}")


class TipoMensagem(_EnumTexto):
    USER = "user"
    IA = "ia"
    HUMANO_INSP = "humano_insp"
    HUMANO_ENG = "humano_eng"

    @classmethod
    def normalizar(cls, valor: Any) -> str:
        chave = _normalizar_texto_chave(valor)
        mapa = {
            "user": cls.USER.value,
            "usuario": cls.USER.value,
            "ia": cls.IA.value,
            "assistente": cls.IA.value,
            "humano_insp": cls.HUMANO_INSP.value,
            "whisper_insp": cls.HUMANO_INSP.value,
            "humano_eng": cls.HUMANO_ENG.value,
            "humanoeng": cls.HUMANO_ENG.value,
            "whisper_eng": cls.HUMANO_ENG.value,
        }
        if chave in mapa:
            return mapa[chave]
        if valor in cls.valores():
            return str(valor)
        raise ValueError(f"Tipo de mensagem inválido: {valor!r}")


_TIPOS_MENSAGEM_VALIDOS = ", ".join(f"'{tipo.value}'" for tipo in TipoMensagem)


def _valores_enum(cls: type[enum.Enum]) -> list[str]:
    return [item.value for item in cls]


LIMITES_PADRAO: dict[str, dict[str, Any]] = {
    PlanoEmpresa.INICIAL.value: {
        "laudos_mes": 50,
        "usuarios_max": 1,
        "upload_doc": False,
        "deep_research": False,
        "integracoes_max": 0,
        "retencao_dias": 30,
    },
    PlanoEmpresa.INTERMEDIARIO.value: {
        "laudos_mes": 300,
        "usuarios_max": 5,
        "upload_doc": True,
        "deep_research": False,
        "integracoes_max": 1,
        "retencao_dias": 365,
    },
    PlanoEmpresa.ILIMITADO.value: {
        "laudos_mes": None,
        "usuarios_max": None,
        "upload_doc": True,
        "deep_research": True,
        "integracoes_max": None,
        "retencao_dias": None,
    },
}


@dataclass(slots=True)
class LimitePlanoFallback:
    plano: str
    laudos_mes: int | None
    usuarios_max: int | None
    upload_doc: bool
    deep_research: bool
    integracoes_max: int | None
    retencao_dias: int | None

    def laudos_ilimitados(self) -> bool:
        return self.laudos_mes is None

    def usuarios_ilimitados(self) -> bool:
        return self.usuarios_max is None


__all__ = [
    "LIMITES_PADRAO",
    "LimitePlanoFallback",
    "ModoResposta",
    "NivelAcesso",
    "PlanoEmpresa",
    "StatusAprendizadoIa",
    "StatusLaudo",
    "StatusRevisao",
    "TipoMensagem",
    "VereditoAprendizadoIa",
    "_TIPOS_MENSAGEM_VALIDOS",
    "_valores_enum",
]
