from __future__ import annotations

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEGACY_MODULE = "app.domains.chat.routes"

ALLOWED_MODULE_IMPORTERS = {
    Path("app/domains/chat/chat.py"),
    Path("app/domains/chat/laudo.py"),
}

ALLOWED_FROM_IMPORTS: dict[Path, set[str]] = {
    Path("app/domains/chat/router.py"): {"roteador_inspetor"},
    Path("app/domains/revisor/routes.py"): {"inspetor_notif_manager"},
}

ALLOWED_ROUTES_EXPORTS = {
    "roteador_inspetor",
    "SessaoLocal",
    "inspetor_notif_manager",
    "cliente_ia",
    "_erro_cliente_ia_boot",
    "obter_cliente_ia_ativo",
}


def _parse_python(path: Path) -> ast.AST:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _relative(path: Path) -> Path:
    return path.resolve().relative_to(ROOT.resolve())


def _violacao(path: Path, msg: str) -> str:
    return f"{_relative(path)} :: {msg}"


def _verificar_imports_legados() -> list[str]:
    violacoes: list[str] = []

    for path in (ROOT / "app").rglob("*.py"):
        tree = _parse_python(path)
        rel = _relative(path)

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == LEGACY_MODULE and rel not in ALLOWED_MODULE_IMPORTERS:
                        violacoes.append(
                            _violacao(
                                path,
                                "import de routes.py não permitido aqui; use módulos novos do domínio.",
                            )
                        )

            if isinstance(node, ast.ImportFrom) and node.module == LEGACY_MODULE:
                nomes = {item.name for item in node.names}
                permitidos = ALLOWED_FROM_IMPORTS.get(rel)
                if permitidos is None:
                    violacoes.append(
                        _violacao(
                            path,
                            f"from routes import {sorted(nomes)} não permitido; use módulos novos.",
                        )
                    )
                    continue
                if not nomes.issubset(permitidos):
                    violacoes.append(
                        _violacao(
                            path,
                            f"importa símbolos não permitidos de routes.py: {sorted(nomes - permitidos)}",
                        )
                    )

    return violacoes


def _extrair_all(tree: ast.AST) -> set[str] | None:
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "__all__":
                    if not isinstance(node.value, (ast.List, ast.Tuple)):
                        return None
                    valores: set[str] = set()
                    for elt in node.value.elts:
                        if not isinstance(elt, ast.Constant) or not isinstance(elt.value, str):
                            return None
                        valores.add(elt.value)
                    return valores
    return None


def _verificar_routes_minimo() -> list[str]:
    violacoes: list[str] = []
    path = ROOT / "app/domains/chat/routes.py"
    texto = path.read_text(encoding="utf-8")
    linhas = texto.splitlines()
    tree = _parse_python(path)

    if len(linhas) > 120:
        violacoes.append(
            _violacao(
                path,
                f"routes.py deveria permanecer enxuto (<= 120 linhas), atual={len(linhas)}.",
            )
        )

    funcoes_top = [n.name for n in tree.body if isinstance(n, ast.FunctionDef)]
    classes_top = [n.name for n in tree.body if isinstance(n, ast.ClassDef)]

    if funcoes_top != ["obter_cliente_ia_ativo"]:
        violacoes.append(
            _violacao(
                path,
                f"funções top-level inesperadas em routes.py: {funcoes_top}",
            )
        )
    if classes_top:
        violacoes.append(
            _violacao(
                path,
                f"classes não são esperadas em routes.py compat: {classes_top}",
            )
        )

    all_exportado = _extrair_all(tree)
    if all_exportado is None:
        violacoes.append(
            _violacao(path, "__all__ ausente ou inválido em routes.py."),
        )
    elif all_exportado != ALLOWED_ROUTES_EXPORTS:
        faltando = sorted(ALLOWED_ROUTES_EXPORTS - all_exportado)
        sobrando = sorted(all_exportado - ALLOWED_ROUTES_EXPORTS)
        violacoes.append(
            _violacao(
                path,
                f"__all__ divergente. faltando={faltando} sobrando={sobrando}",
            )
        )

    return violacoes


def main() -> int:
    violacoes: list[str] = []
    violacoes.extend(_verificar_imports_legados())
    violacoes.extend(_verificar_routes_minimo())

    if violacoes:
        print("CHECK_CHAT_ARCHITECTURE=FAIL")
        for item in violacoes:
            print(f"- {item}")
        return 1

    print("CHECK_CHAT_ARCHITECTURE=OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
