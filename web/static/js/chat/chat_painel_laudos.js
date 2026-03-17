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

    const STATUS_CARD = {
        aberto: "Aberto",
        aguardando: "Aguardando",
        ajustes: "Ajustes",
        aprovado: "Aprovado",
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

        if (estado === "aguardando" || estado === "aguardando_avaliacao") {
            return "aguardando";
        }

        if (estado === "ajustes" || estado === "aprovado") {
            return estado;
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
    // HISTÓRICO DINÂMICO / STATUS VISUAL
    // =========================================================

    function escaparHTMLLocal(valor) {
        return TP.escaparHTML?.(valor) ?? String(valor ?? "");
    }

    function normalizarStatusCard(status) {
        const valor = String(status || "").trim().toLowerCase();

        if (valor === "ativo" || valor === "relatorio_ativo") return "aberto";
        if (valor === "aguardando_aval") return "aguardando";
        if (valor === "rejeitado") return "ajustes";
        if (STATUS_CARD[valor]) return valor;
        return "aberto";
    }

    function obterLabelStatusCard(status) {
        const normalizado = normalizarStatusCard(status);
        return STATUS_CARD[normalizado] || "Aberto";
    }

    function getListaHistorico() {
        return document.getElementById("lista-historico");
    }

    function getEstadoVazioHistorico() {
        return document.getElementById("estado-vazio-historico");
    }

    function alternarEstadoVazioHistorico() {
        const lista = getListaHistorico();
        const estadoVazio = getEstadoVazioHistorico();
        if (!lista || !estadoVazio) return;

        const possuiItens = !!lista.querySelector(".item-historico[data-laudo-id]");
        estadoVazio.hidden = possuiItens;
    }

    function atualizarPillStatusItem(item, status) {
        if (!item) return;

        const normalizado = normalizarStatusCard(status);
        item.dataset.cardStatus = normalizado;

        const pill = item.querySelector(".pill-status-laudo");
        if (!pill) return;

        pill.className = `pill-status-laudo pill-status-${normalizado}`;
        pill.textContent = obterLabelStatusCard(normalizado);
    }

    function atualizarPreviewItem(item, preview, horaBr = "") {
        if (!item) return;
        const container = item.querySelector(".texto-laudo-historico");
        if (!container) return;

        let previewEl = container.querySelector(".preview-mensagem");
        if (!previewEl) {
            previewEl = document.createElement("span");
            previewEl.className = "preview-mensagem";
            container.appendChild(previewEl);
        }

        const texto = String(preview || "").trim();
        previewEl.textContent = texto || horaBr || "";
    }

    function criarBotaoAcaoLaudo({ acao, title, icone, pinado = false }) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn-acao-laudo ${acao === "pin" ? "btn-pin-laudo" : "btn-deletar-laudo"}`;
        btn.dataset.acaoLaudo = acao;
        btn.title = title;
        btn.setAttribute("aria-label", title);

        if (acao === "pin") {
            btn.setAttribute("aria-pressed", String(!!pinado));
        }

        const icon = document.createElement("span");
        icon.className = "material-symbols-rounded";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = icone;
        btn.appendChild(icon);

        return btn;
    }

    function obterIconeSetor(titulo) {
        const chave = String(titulo || "").trim().toLowerCase();
        if (chave.includes("avcb") || chave.includes("bombeiro")) return "local_fire_department";
        if (chave.includes("nr-12") || chave.includes("nr12")) return "precision_manufacturing";
        if (chave.includes("nr-13") || chave.includes("nr13")) return "warehouse";
        if (chave.includes("rti") || chave.includes("elétrica") || chave.includes("eletrica")) return "bolt";
        if (chave.includes("spda")) return "thunderstorm";
        if (chave.includes("pie")) return "schema";
        if (chave.includes("loto")) return "lock";
        return "history";
    }

    function obterOuCriarSecaoPinados(lista) {
        let secao = document.getElementById("secao-laudos-pinados");
        if (secao) return secao;

        secao = document.createElement("section");
        secao.id = "secao-laudos-pinados";
        secao.className = "secao-pinados";
        secao.setAttribute("aria-label", "Laudos fixados");
        secao.hidden = true;
        secao.innerHTML = `
            <div class="secao-pinados-titulo">
                <span class="material-symbols-rounded" aria-hidden="true">keep</span>
                Fixados
            </div>
        `;
        lista.appendChild(secao);
        return secao;
    }

    function obterOuCriarSecaoHistorico(lista) {
        let secao = document.getElementById("secao-laudos-historico");
        if (secao) return secao;

        secao = document.createElement("section");
        secao.id = "secao-laudos-historico";
        secao.className = "secao-laudos-historico";
        secao.setAttribute("aria-label", "Laudos recentes");
        lista.appendChild(secao);
        return secao;
    }

    function obterOuCriarGrupoData(secaoHistorico, dataIso, dataBr) {
        let grupo = secaoHistorico.querySelector(`.grupo-data[data-data="${CSS.escape(String(dataIso))}"]`);
        if (grupo) return grupo.querySelector(".grupo-data-lista");

        grupo = document.createElement("section");
        grupo.className = "grupo-data";
        grupo.dataset.data = String(dataIso || "");
        grupo.innerHTML = `
            <div class="grupo-data-header">${escaparHTMLLocal(dataBr || "")}</div>
            <div class="grupo-data-lista"></div>
        `;

        const grupos = Array.from(secaoHistorico.querySelectorAll(".grupo-data"));
        const existenteMaisNovo = grupos.find((el) => String(el.dataset.data || "") < String(dataIso || ""));
        if (existenteMaisNovo) {
            secaoHistorico.insertBefore(grupo, existenteMaisNovo);
        } else {
            secaoHistorico.appendChild(grupo);
        }

        return grupo.querySelector(".grupo-data-lista");
    }

    function criarItemHistorico(card) {
        const item = document.createElement("div");
        item.className = "item-historico";
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        item.dataset.laudoId = String(card.id);
        item.dataset.pinado = String(!!card.pinado);
        item.dataset.data = String(card.data_iso || "");
        item.dataset.statusRevisao = String(card.status_revisao || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_");
        item.dataset.cardStatus = normalizarStatusCard(card.status_card);
        item.title = `Abrir laudo ${card.titulo || ""}`.trim();
        item.setAttribute("aria-label", item.title || "Abrir laudo");

        if (card.pinado) {
            item.classList.add("pinado");
        }

        const icon = document.createElement("span");
        icon.className = "material-symbols-rounded";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = obterIconeSetor(card.titulo);

        const texto = document.createElement("span");
        texto.className = "texto-laudo-historico";

        const titulo = document.createElement("span");
        titulo.textContent = String(card.titulo || "Inspeção");
        texto.appendChild(titulo);

        const preview = document.createElement("span");
        preview.className = "preview-mensagem";
        preview.textContent = String(card.preview || card.hora_br || "");
        texto.appendChild(preview);

        const pill = document.createElement("span");
        pill.className = "pill-status-laudo";

        item.appendChild(icon);
        item.appendChild(texto);
        item.appendChild(pill);
        item.appendChild(
            criarBotaoAcaoLaudo({
                acao: "pin",
                title: card.pinado ? "Desafixar laudo" : "Fixar laudo",
                icone: card.pinado ? "keep" : "push_pin",
                pinado: !!card.pinado,
            })
        );
        item.appendChild(
            criarBotaoAcaoLaudo({
                acao: "delete",
                title: "Excluir laudo",
                icone: "delete",
            })
        );

        atualizarPillStatusItem(item, card.status_card);
        return item;
    }

    function anexarItemHistorico(card) {
        const lista = getListaHistorico();
        if (!lista) return null;

        const item = criarItemHistorico(card);
        if (card.pinado) {
            const secaoPinados = obterOuCriarSecaoPinados(lista);
            secaoPinados.hidden = false;
            const titulo = secaoPinados.querySelector(".secao-pinados-titulo");
            secaoPinados.insertBefore(item, titulo?.nextSibling || null);
        } else {
            const secaoHistorico = obterOuCriarSecaoHistorico(lista);
            secaoHistorico.hidden = false;
            const grupoLista = obterOuCriarGrupoData(secaoHistorico, card.data_iso, card.data_br);
            grupoLista.prepend(item);
        }

        alternarEstadoVazioHistorico();
        return item;
    }

    function sincronizarCardLaudo(card, opts = {}) {
        const { selecionar = false } = opts;
        const id = Number(card?.id || 0);
        if (!id) return null;

        let item = TP.getItemHistoricoPorId(id);
        if (!item) {
            item = anexarItemHistorico(card);
        }
        if (!item) return null;

        item.dataset.pinado = String(!!card.pinado);
        item.dataset.data = String(card.data_iso || item.dataset.data || "");
        item.dataset.statusRevisao = String(card.status_revisao || item.dataset.statusRevisao || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_");
        item.querySelector(".texto-laudo-historico span:first-child").textContent = String(
            card.titulo || "Inspeção"
        );
        atualizarPreviewItem(item, card.preview, card.hora_br);
        atualizarPillStatusItem(item, card.status_card);

        const icone = item.querySelector(".material-symbols-rounded");
        if (icone) {
            icone.textContent = obterIconeSetor(card.titulo);
        }

        if (!!card.pinado !== item.classList.contains("pinado")) {
            item.classList.toggle("pinado", !!card.pinado);
        }

        if (selecionar) {
            setAtivoNoHistorico(id);
        }

        alternarEstadoVazioHistorico();
        return item;
    }

    function atualizarBadgeRelatorio(laudoId, status) {
        const item = TP.getItemHistoricoPorId(laudoId);
        if (!item) return;
        atualizarPillStatusItem(item, status);
    }

    function limparBadgesRelatorio(status = null) {
        if (!status) return;
        const normalizado = normalizarStatusCard(status);
        TP.qsa(`.item-historico[data-card-status="${normalizado}"]`).forEach((item) => {
            atualizarPillStatusItem(item, "aberto");
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

    function urlSolicitaTelaInicial() {
        try {
            const url = new URL(window.location.href);
            return url.searchParams.get("home") === "1";
        } catch (_) {
            return false;
        }
    }

    function consumirFlagTelaInicial() {
        let viaUrl = false;
        let viaSessao = false;

        try {
            viaUrl = urlSolicitaTelaInicial();
            viaSessao = sessionStorage.getItem("tariel_force_home_landing") === "1";
            if (viaSessao) {
                sessionStorage.removeItem("tariel_force_home_landing");
            }
        } catch (_) {
            // silêncio intencional
        }

        if (viaUrl) {
            try {
                const url = new URL(window.location.href);
                url.searchParams.delete("home");
                history.replaceState(history.state || {}, "", url.toString());
            } catch (_) {
                // silêncio intencional
            }
        }

        const forcarTelaInicial = viaUrl || viaSessao;
        document.body.dataset.forceHomeLanding = forcarTelaInicial ? "true" : "false";

        return forcarTelaInicial;
    }

    function obterLaudoInicial() {
        if (consumirFlagTelaInicial()) {
            return "";
        }

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

        TP.log("info", `Selecionando laudo: ${id}`, { origem });

        document.body.dataset.forceHomeLanding = "false";

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

            if (!laudoId) return;

            atualizarBadgeRelatorio(laudoId, "aguardando");
        });

        document.addEventListener("tariel:cancelar-relatorio", () => {
            // o card continua existindo normalmente no histórico
        });

        document.addEventListener("tariel:laudo-card-sincronizado", (event) => {
            const card = event.detail?.card;
            if (!card?.id) return;
            sincronizarCardLaudo(card, {
                selecionar: !!event.detail?.selecionar,
            });
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
        sincronizarCardLaudo,
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

