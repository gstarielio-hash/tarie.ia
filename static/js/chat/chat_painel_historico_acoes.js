// ==========================================
// TARIEL CONTROL TOWER — CHAT_PAINEL_HISTORICO_ACOES.JS
// Papel: binds e ações do histórico de laudos.
// Responsável por:
// - clique e teclado nos itens do histórico
// - ação de fixar / desafixar
// - ação de excluir
// - observer para novos itens dinâmicos
// - fallback de seleção após exclusão
//
// Dependência:
// - window.TarielChatPainel (core + laudos)
// ==========================================

(function () {
    "use strict";

    const TP = window.TarielChatPainel;
    if (!TP || TP.__historicoAcoesWired__) return;
    TP.__historicoAcoesWired__ = true;

    const STATE_LOCAL = {
        cleanupBound: false,
    };

    // =========================================================
    // HELPERS
    // =========================================================

    function normalizarEstadoRelatorio(valor) {
        const estado = String(valor || "").trim().toLowerCase();

        if (estado === "relatorioativo" || estado === "relatorio_ativo") {
            return "relatorio_ativo";
        }

        if (estado === "semrelatorio" || estado === "sem_relatorio") {
            return "sem_relatorio";
        }

        return estado || "sem_relatorio";
    }

    function resolverContainerHistorico() {
        return (
            document.getElementById("lista-historico") ||
            document.getElementById("barra-historico") ||
            document.getElementById("sidebar")
        );
    }

    function resolverItemHistoricoAPartirEvento(target) {
        return target?.closest?.(".item-historico[data-laudo-id]") || null;
    }

    function obterLaudoIdDoEvento(target) {
        const item = resolverItemHistoricoAPartirEvento(target);
        if (item?.dataset?.laudoId) {
            return String(item.dataset.laudoId);
        }

        const viaData =
            target?.closest?.("[data-laudo-id]")?.dataset?.laudoId ||
            target?.dataset?.laudoId ||
            "";

        return viaData ? String(viaData) : "";
    }

    function itemEhPinado(item) {
        if (!item) return false;

        return (
            item.dataset.pinado === "true" ||
            item.classList.contains("pinado") ||
            item.classList.contains("pinned") ||
            item.classList.contains("laudo-pinado")
        );
    }

    function resolverProximoLaudoAposExclusao(itemAtual) {
        if (!itemAtual) return "";

        const candidatos = TP.qsa(".item-historico[data-laudo-id]").filter(
            (el) => el !== itemAtual
        );

        const proximoMesmoGrupo = itemAtual.nextElementSibling;
        if (
            proximoMesmoGrupo?.matches?.(".item-historico[data-laudo-id]") &&
            proximoMesmoGrupo.dataset?.laudoId
        ) {
            return String(proximoMesmoGrupo.dataset.laudoId);
        }

        const anteriorMesmoGrupo = itemAtual.previousElementSibling;
        if (
            anteriorMesmoGrupo?.matches?.(".item-historico[data-laudo-id]") &&
            anteriorMesmoGrupo.dataset?.laudoId
        ) {
            return String(anteriorMesmoGrupo.dataset.laudoId);
        }

        return candidatos[0]?.dataset?.laudoId || "";
    }

    function statusRevisaoBloqueiaExclusao(item) {
        const status = String(item?.dataset?.statusRevisao || "")
            .trim()
            .toLowerCase();

        return status === "aguardando_aval" || status === "aprovado";
    }

    function atualizarTextoBotaoPin(btn, pinado) {
        if (!btn) return;

        btn.setAttribute("aria-pressed", String(!!pinado));
        btn.dataset.pinado = String(!!pinado);
        btn.title = pinado ? "Desafixar laudo" : "Fixar laudo";
        btn.setAttribute("aria-label", pinado ? "Desafixar laudo" : "Fixar laudo");

        const icone = btn.querySelector(".material-symbols-rounded");
        if (icone) {
            icone.textContent = pinado ? "keep" : "push_pin";
        }
    }

    function atualizarUIItemPin(item, pinado) {
        if (!item) return;

        const ativo = !!pinado;

        item.dataset.pinado = String(ativo);
        item.classList.toggle("pinado", ativo);
        item.classList.toggle("pinned", ativo);
        item.classList.toggle("laudo-pinado", ativo);

        const botoesPin = item.querySelectorAll(
            "[data-acao-laudo='pin'], [data-action='pin'], .btn-pin-laudo, .btn-acao-pin"
        );

        botoesPin.forEach((btn) => {
            atualizarTextoBotaoPin(btn, ativo);
        });
    }

    function marcarItemComoProcessando(item, ativo) {
        if (!item) return;

        item.classList.toggle("is-loading", !!ativo);
        item.setAttribute("aria-busy", String(!!ativo));
    }

    function limparSelecaoSemLaudo() {
        TP.limparSelecaoAtual?.();
        TP.persistirLaudoAtual?.("");
        TP.definirLaudoIdNaURL?.("", { replace: true });
        TP.atualizarBreadcrumb?.("");

        if (TP.state) {
            TP.state.laudoAtualId = null;
        }

        document.body.dataset.laudoAtualId = "";

        TP.emitir?.("tariel:nenhum-laudo-selecionado", {});
    }

    // =========================================================
    // AÇÕES DE PIN
    // =========================================================

    async function alternarPinLaudo(laudoId, itemEl, btn) {
        const id = Number(laudoId);
        if (!Number.isFinite(id) || id <= 0) return null;

        const pinadoAtual =
            btn?.dataset?.pinado === "true" ||
            itemEhPinado(itemEl);

        marcarItemComoProcessando(itemEl, true);

        try {
            const dados = await TP.fetchJSON(`/app/api/laudo/${id}/pin`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    pinado: !pinadoAtual,
                }),
            });

            const novoEstado = typeof dados?.pinado === "boolean"
                ? dados.pinado
                : !pinadoAtual;

            atualizarUIItemPin(itemEl, novoEstado);

            TP.emitir("tariel:laudo-pin-alterado", {
                laudoId: id,
                pinado: novoEstado,
            });

            TP.toast(
                novoEstado ? "Laudo fixado." : "Laudo desafixado.",
                "sucesso",
                1800
            );

            return dados;
        } catch (e) {
            TP.log("error", "Falha ao alterar pin do laudo:", e);
            TP.toast(`Não foi possível alterar o pin: ${e.message}`, "erro", 3500);
            return null;
        } finally {
            marcarItemComoProcessando(itemEl, false);
        }
    }

    // =========================================================
    // AÇÕES DE EXCLUSÃO
    // =========================================================

    async function excluirLaudo(laudoId, itemEl) {
        const id = Number(laudoId);
        if (!Number.isFinite(id) || id <= 0) return null;

        if (statusRevisaoBloqueiaExclusao(itemEl)) {
            TP.toast(
                "Esse laudo não pode ser excluído no estado atual.",
                "aviso",
                3600
            );
            return null;
        }

        const estadoRelatorio = normalizarEstadoRelatorio(
            window.TarielAPI?.obterEstadoRelatorioNormalizado?.() ||
            window.TarielAPI?.obterEstadoRelatorio?.() ||
            TP.state?.estadoRelatorio
        );

        const laudoAtivo = Number(
            window.TarielAPI?.obterLaudoAtualId?.() ||
            TP.state?.laudoAtualId ||
            0
        ) || null;

        if (
            estadoRelatorio === "relatorio_ativo" &&
            laudoAtivo &&
            laudoAtivo === id
        ) {
            TP.toast(
                "Cancele ou finalize o relatório ativo antes de excluir este laudo.",
                "aviso",
                4000
            );
            return null;
        }

        const confirmou = window.confirm("Deseja realmente excluir este laudo?");
        if (!confirmou) return null;

        marcarItemComoProcessando(itemEl, true);

        try {
            await TP.fetchJSON(`/app/api/laudo/${id}`, {
                method: "DELETE",
            });

            const eraAtivo =
                String(window.TarielAPI?.obterLaudoAtualId?.() || "") === String(id) ||
                itemEl?.classList?.contains("ativo");

            const proximoLaudo = resolverProximoLaudoAposExclusao(itemEl);

            itemEl?.remove();

            TP.emitir("tariel:laudo-excluido", { laudoId: id });

            if (eraAtivo && proximoLaudo) {
                TP.selecionarLaudo?.(proximoLaudo, {
                    atualizarURL: true,
                    replaceURL: true,
                    origem: "delete_fallback",
                    ignorarBloqueioRelatorio: true,
                });
            } else if (eraAtivo) {
                limparSelecaoSemLaudo();
            }

            TP.toast("Laudo excluído.", "sucesso", 1800);
            return true;
        } catch (e) {
            TP.log("error", "Falha ao excluir laudo:", e);
            TP.toast(`Não foi possível excluir o laudo: ${e.message}`, "erro", 3500);
            return null;
        } finally {
            marcarItemComoProcessando(itemEl, false);
        }
    }

    // =========================================================
    // BIND DE ITENS DO HISTÓRICO
    // =========================================================

    function onClickItemHistorico(evento) {
        if (
            evento.target.closest(
                ".btn-acao-laudo, .btn-pin-laudo, .btn-deletar-laudo, [data-acao-laudo], [data-action]"
            )
        ) {
            return;
        }

        const item = resolverItemHistoricoAPartirEvento(evento.currentTarget);
        const laudoId = item?.dataset?.laudoId;
        if (!laudoId) return;

        TP.selecionarLaudo?.(laudoId, {
            atualizarURL: true,
            origem: "historico_click",
        });
    }

    function onKeydownItemHistorico(evento) {
        if (evento.key !== "Enter" && evento.key !== " ") return;

        if (
            evento.target.closest(
                ".btn-acao-laudo, .btn-pin-laudo, .btn-deletar-laudo, [data-acao-laudo], [data-action]"
            )
        ) {
            return;
        }

        evento.preventDefault();

        const item = resolverItemHistoricoAPartirEvento(evento.currentTarget);
        const laudoId = item?.dataset?.laudoId;
        if (!laudoId) return;

        TP.selecionarLaudo?.(laudoId, {
            atualizarURL: true,
            origem: "historico_keyboard",
        });
    }

    function bindItemHistorico(itemEl) {
        if (!itemEl || itemEl.dataset.bound === "true") return;
        itemEl.dataset.bound = "true";

        const laudoId = itemEl.dataset.laudoId;
        if (!laudoId) return;

        itemEl.addEventListener("click", onClickItemHistorico);
        itemEl.addEventListener("keydown", onKeydownItemHistorico);

        atualizarUIItemPin(itemEl, itemEhPinado(itemEl));
    }

    // =========================================================
    // OBSERVER DO HISTÓRICO
    // =========================================================

    function wireHistoricoClick() {
        const container = resolverContainerHistorico();
        if (!container) return;

        container
            .querySelectorAll(".item-historico[data-laudo-id]")
            .forEach((el) => bindItemHistorico(el));

        if (TP.state.observerHistorico) {
            TP.state.observerHistorico.disconnect();
        }

        TP.state.observerHistorico = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType !== 1) return;

                    if (node.matches?.(".item-historico[data-laudo-id]")) {
                        bindItemHistorico(node);
                    }

                    node
                        .querySelectorAll?.(".item-historico[data-laudo-id]")
                        .forEach((el) => bindItemHistorico(el));
                });
            });
        });

        TP.state.observerHistorico.observe(container, {
            childList: true,
            subtree: true,
        });

        if (!STATE_LOCAL.cleanupBound) {
            STATE_LOCAL.cleanupBound = true;

            window.addEventListener("pagehide", () => {
                TP.state.observerHistorico?.disconnect?.();
            });
        }
    }

    // =========================================================
    // AÇÕES DELEGADAS
    // =========================================================

    function wireHistoricoActions() {
        if (TP.state.flags.historicoActionsBound) return;
        TP.state.flags.historicoActionsBound = true;

        document.addEventListener("click", async (evento) => {
            const btnPin = evento.target.closest(
                "[data-acao-laudo='pin'], [data-action='pin'], .btn-pin-laudo, .btn-acao-pin"
            );

            if (btnPin) {
                evento.preventDefault();
                evento.stopPropagation();

                const item = resolverItemHistoricoAPartirEvento(btnPin);
                const laudoId = obterLaudoIdDoEvento(btnPin);
                await alternarPinLaudo(laudoId, item, btnPin);
                return;
            }

            const btnDelete = evento.target.closest(
                "[data-acao-laudo='delete'], [data-action='delete'], .btn-deletar-laudo, .btn-excluir-laudo, .btn-delete-laudo, .btn-acao-excluir"
            );

            if (btnDelete) {
                evento.preventDefault();
                evento.stopPropagation();

                const item = resolverItemHistoricoAPartirEvento(btnDelete);
                const laudoId = obterLaudoIdDoEvento(btnDelete);
                await excluirLaudo(laudoId, item);
            }
        });
    }

    // =========================================================
    // BOOT
    // =========================================================

    TP.registrarBootTask("chat_painel_historico_acoes", () => {
        wireHistoricoClick();
        wireHistoricoActions();
        return true;
    });

    // =========================================================
    // EXPORTS
    // =========================================================

    Object.assign(TP, {
        resolverItemHistoricoAPartirEvento,
        obterLaudoIdDoEvento,
        resolverProximoLaudoAposExclusao,
        atualizarUIItemPin,
        alternarPinLaudo,
        excluirLaudo,
        bindItemHistorico,
        wireHistoricoClick,
        wireHistoricoActions,
    });
})();
