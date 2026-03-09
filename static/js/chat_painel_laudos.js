// ==========================================
// TARIEL CONTROL TOWER — CHAT_PAINEL_LAUDOS.JS
// Papel: seleção de laudos, breadcrumb, estado da URL,
// persistência do laudo atual e carga inicial.
//
// Dependência:
// - window.TarielChatPainel (core)
//
// Responsável por:
// - marcar item ativo no histórico
// - criar/atualizar breadcrumb do laudo
// - controlar tabs da thread (chat / anexos)
// - persistir laudo atual
// - sincronizar URL ?laudo=
// - carregar laudo inicial
// - atualizar badge visual de status do relatório
// ==========================================

(function () {
    "use strict";

    const TP = window.TarielChatPainel;
    if (!TP || TP.__laudosWired__) return;
    TP.__laudosWired__ = true;

    const STATE_LOCAL = {
        popStateBound: false,
        navBound: false,
        eventosLaudosBound: false,
        tentativaLaudoInicialTimer: null,
    };

    // =========================================================
    // HELPERS LOCAIS
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

    function obterSidebar() {
        return (
            document.getElementById("barra-historico") ||
            document.getElementById("sidebar")
        );
    }

    function fecharSidebarMobile() {
        const sidebar = obterSidebar();
        const overlay = document.getElementById("overlay-sidebar");

        if (window.innerWidth >= 768) return;

        sidebar?.classList.remove("aberta", "aberto");
        overlay?.classList.remove("ativo");
        document.body.classList.remove("sidebar-aberta");
    }

    function definirLaudoAtualNoCore(laudoId) {
        const id = laudoId ? Number(laudoId) : null;
        const idValido = Number.isFinite(id) && id > 0 ? id : null;

        TP.state.laudoAtualId = idValido;
        TP.persistirLaudoAtual(idValido || "");

        document.body.dataset.laudoAtualId = idValido
            ? String(idValido)
            : "";
    }

    function obterEstadoRelatorioAtual() {
        if (window.TarielAPI?.obterEstadoRelatorioNormalizado) {
            return normalizarEstadoRelatorio(
                window.TarielAPI.obterEstadoRelatorioNormalizado()
            );
        }

        if (window.TarielAPI?.obterEstadoRelatorio) {
            return normalizarEstadoRelatorio(
                window.TarielAPI.obterEstadoRelatorio()
            );
        }

        return normalizarEstadoRelatorio(TP.state.estadoRelatorio);
    }

    function obterLaudoAtivoNaApi() {
        const valor = window.TarielAPI?.obterLaudoAtualId?.();
        const id = Number(valor);
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    // =========================================================
    // BADGE VISUAL DE RELATÓRIO
    // =========================================================

    function atualizarBadgeRelatorio(laudoId, status) {
        const item = TP.getItemHistoricoPorId(laudoId);
        if (!item) return;

        item.querySelector(".badge-relatorio-status")?.remove();

        if (!status) return;

        const badge = document.createElement("span");
        badge.className = `badge-relatorio-status badge-rel-${status}`;

        const configs = {
            ativo: {
                label: "Relatório em andamento",
                text: "● Em andamento",
            },
            aguardando: {
                label: "Aguardando avaliação",
                text: "⏳ Em avaliação",
            },
        };

        const cfg = configs[status] ?? {
            label: String(status),
            text: String(status),
        };

        badge.setAttribute("aria-label", cfg.label);
        badge.textContent = cfg.text;

        const alvoTexto =
            item.querySelector(".texto-laudo-historico") ||
            item.querySelector(".preview-mensagem") ||
            item;

        alvoTexto.appendChild(badge);
    }

    function limparBadgesRelatorio(status = null) {
        TP.qsa(".badge-relatorio-status").forEach((badge) => {
            if (!status) {
                badge.remove();
                return;
            }

            if (badge.classList.contains(`badge-rel-${status}`)) {
                badge.remove();
            }
        });
    }

    // =========================================================
    // ITEM ATIVO NO HISTÓRICO
    // =========================================================

    function setAtivoNoHistorico(laudoId) {
        TP.limparSelecaoAtual();

        const item = TP.getItemHistoricoPorId(laudoId);
        if (!item) return false;

        item.classList.add("ativo");
        item.setAttribute("aria-current", "true");

        const reduzMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

        item.scrollIntoView({
            block: "nearest",
            behavior: reduzMovimento ? "auto" : "smooth",
        });

        return true;
    }

    // =========================================================
    // THREAD NAV / BREADCRUMB
    // =========================================================

    function garantirThreadNav() {
        let nav = TP.qs(".thread-nav");
        if (nav) return nav;

        const areaMensagens = document.getElementById("area-mensagens");
        if (!areaMensagens?.parentElement) return null;

        nav = document.createElement("div");
        nav.className = "thread-nav";
        nav.innerHTML = `
            <div class="thread-nav-inner">
                <div class="thread-breadcrumb" aria-label="Navegação do laudo">
                    <a href="/app/" data-bc="home">Laudos</a>
                    <span aria-hidden="true">›</span>
                    <span data-bc="atual">—</span>
                </div>

                <div class="thread-tabs" role="tablist" aria-label="Seções do laudo">
                    <button
                        type="button"
                        class="thread-tab ativo"
                        role="tab"
                        aria-selected="true"
                        data-tab="chat"
                    >
                        Chat
                    </button>

                    <button
                        type="button"
                        class="thread-tab"
                        role="tab"
                        aria-selected="false"
                        data-tab="anexos"
                    >
                        Anexos
                    </button>
                </div>
            </div>
        `;

        areaMensagens.parentElement.insertBefore(nav, areaMensagens);

        if (!STATE_LOCAL.navBound) {
            nav.addEventListener("click", (event) => {
                const btn = event.target.closest(".thread-tab[data-tab]");
                if (!btn) return;

                selecionarThreadTab(btn.dataset.tab || "chat");
            });

            STATE_LOCAL.navBound = true;
        }

        return nav;
    }

    function selecionarThreadTab(tab) {
        const nav = garantirThreadNav();
        if (!nav) return;

        const valor = String(tab || "chat").trim().toLowerCase();
        const tabs = nav.querySelectorAll(".thread-tab[data-tab]");

        tabs.forEach((btn) => {
            const ativo = btn.dataset.tab === valor;
            btn.classList.toggle("ativo", ativo);
            btn.setAttribute("aria-selected", String(ativo));
        });

        document.body.dataset.threadTab = valor;

        TP.emitir("tariel:thread-tab-alterada", { tab: valor });
    }

    function atualizarBreadcrumb(laudoId) {
        const nav = garantirThreadNav();
        if (!nav) return;

        const atual = nav.querySelector('[data-bc="atual"]');
        if (!atual) return;

        atual.textContent =
            TP.obterTituloLaudo(laudoId) ||
            `Laudo ${laudoId || ""}`.trim() ||
            "—";
    }

    // =========================================================
    // LAUDO INICIAL
    // =========================================================

    function obterLaudoInicial() {
        return (
            TP.obterLaudoIdDaURL() ||
            String(window.TarielAPI?.obterLaudoAtualId?.() || "") ||
            TP.obterLaudoPersistido()
        );
    }

    function tentarSelecionarLaudoInicial(laudoId, tentativa = 0) {
        if (!laudoId) return;

        const id = Number(laudoId);
        if (!Number.isFinite(id) || id <= 0) return;

        const apiPronta = document.body.dataset.apiEvents === "wired";
        const itemExiste = !!TP.getItemHistoricoPorId(id);

        if (apiPronta && itemExiste) {
            selecionarLaudo(id, {
                atualizarURL: true,
                replaceURL: true,
                origem: "boot",
                ignorarBloqueioRelatorio: true,
            });
            return;
        }

        if (tentativa >= TP.config.BOOT_RETRIES_MAX) {
            TP.log(
                "warn",
                "API ou item do histórico não ficaram prontos a tempo para carregar o laudo inicial."
            );
            return;
        }

        clearTimeout(STATE_LOCAL.tentativaLaudoInicialTimer);
        STATE_LOCAL.tentativaLaudoInicialTimer = setTimeout(() => {
            tentarSelecionarLaudoInicial(id, tentativa + 1);
        }, TP.config.BOOT_RETRY_MS);
    }

    // =========================================================
    // SELEÇÃO DE LAUDO
    // =========================================================

    function selecionarLaudo(laudoId, opts = {}) {
        const {
            atualizarURL = true,
            replaceURL = false,
            origem = "ui",
            ignorarBloqueioRelatorio = false,
        } = opts;

        const id = Number(laudoId);
        if (!Number.isFinite(id) || id <= 0) return false;

        const estadoRelatorio = obterEstadoRelatorioAtual();
        const laudoAtivoApi = obterLaudoAtivoNaApi();

        if (
            !ignorarBloqueioRelatorio &&
            estadoRelatorio === "relatorio_ativo" &&
            laudoAtivoApi &&
            Number(laudoAtivoApi) !== id
        ) {
            TP.toast(
                `Você está visualizando outro histórico. Para enviar novas mensagens, volte ao laudo ativo #${laudoAtivoApi}.`,
                "info",
                4200
            );
        }

        TP.log("info", `Selecionando laudo: ${id}`, { origem });

        definirLaudoAtualNoCore(id);
        setAtivoNoHistorico(id);
        atualizarBreadcrumb(id);

        if (atualizarURL) {
            TP.definirLaudoIdNaURL(id, { replace: replaceURL });
        }

        fecharSidebarMobile();

        TP.emitir("tariel:laudo-selecionado", {
            laudoId: id,
            origem,
        });

        return true;
    }

    // =========================================================
    // POPSTATE
    // =========================================================

    function wirePopState() {
        if (STATE_LOCAL.popStateBound) return;
        STATE_LOCAL.popStateBound = true;

        window.addEventListener("popstate", (event) => {
            const laudoId = event.state?.laudoId || TP.obterLaudoIdDaURL();
            if (!laudoId) return;

            selecionarLaudo(laudoId, {
                atualizarURL: false,
                origem: "popstate",
                ignorarBloqueioRelatorio: true,
            });
        });
    }

    // =========================================================
    // EVENTOS DE SISTEMA
    // =========================================================

    function wireEventosLaudos() {
        if (STATE_LOCAL.eventosLaudosBound) return;
        STATE_LOCAL.eventosLaudosBound = true;

        document.addEventListener("tariel:laudo-criado", (event) => {
            const laudoId = Number(event.detail?.laudoId || 0);
            if (!laudoId) return;

            setTimeout(() => {
                setAtivoNoHistorico(laudoId);
                atualizarBreadcrumb(laudoId);
                definirLaudoAtualNoCore(laudoId);
                TP.definirLaudoIdNaURL(laudoId, { replace: true });
            }, 350);
        });

        document.addEventListener("tariel:relatorio-iniciado", (event) => {
            const laudoId = Number(event.detail?.laudoId || 0);
            if (!laudoId) return;

            limparBadgesRelatorio("ativo");
            atualizarBadgeRelatorio(laudoId, "ativo");
            definirLaudoAtualNoCore(laudoId);
        });

        document.addEventListener("tariel:relatorio-finalizado", (event) => {
            const laudoId = Number(event.detail?.laudoId || 0);

            limparBadgesRelatorio("ativo");

            if (!laudoId) return;

            atualizarBadgeRelatorio(laudoId, "aguardando");
        });

        document.addEventListener("tariel:cancelar-relatorio", () => {
            limparBadgesRelatorio("ativo");
        });

        window.addEventListener("pagehide", () => {
            clearTimeout(STATE_LOCAL.tentativaLaudoInicialTimer);
        });
    }

    // =========================================================
    // BOOT
    // =========================================================

    TP.registrarBootTask("chat_painel_laudos", () => {
        garantirThreadNav();
        selecionarThreadTab("chat");
        wirePopState();
        wireEventosLaudos();

        const laudoInicial = obterLaudoInicial();
        if (!laudoInicial) return true;

        requestAnimationFrame(() => {
            const id = Number(laudoInicial);
            if (!Number.isFinite(id) || id <= 0) return;

            definirLaudoAtualNoCore(id);
            setAtivoNoHistorico(id);
            atualizarBreadcrumb(id);
            tentarSelecionarLaudoInicial(id);
        });

        return true;
    });

    // =========================================================
    // EXPORTS
    // =========================================================

    Object.assign(TP, {
        atualizarBadgeRelatorio,
        limparBadgesRelatorio,
        setAtivoNoHistorico,
        selecionarThreadTab,
        garantirThreadNav,
        atualizarBreadcrumb,
        obterLaudoInicial,
        selecionarLaudo,
        wirePopState,
        tentarSelecionarLaudoInicial,
        normalizarEstadoRelatorio,
    });
})();
