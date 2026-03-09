// ==========================================
// TARIEL CONTROL TOWER — CHAT_PAINEL.JS
// Papel: orquestração da página do chat (threads/laudos,
// breadcrumb, deep-link, URL state, pin, delete, relatório).
// Convenção: @insp = mesa avaliadora.
// ==========================================

(function () {
    "use strict";

    if (window.__TARIEL_CHAT_PANEL_WIRED__) return;
    window.__TARIEL_CHAT_PANEL_WIRED__ = true;

    const EM_PRODUCAO =
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1";

    const CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]')?.content ?? "";
    const KEY_LAUDO_ATUAL = "wf_laudo_atual";
    const ATALHO_MESA_AVALIADORA = "@insp ";
    const BOOT_RETRIES_MAX = 40;
    const BOOT_RETRY_MS = 100;
    const FAILSAFE_FINALIZACAO_MS = 15000;

    let _observerHistorico = null;
    let _timerFailsafeFinalizacao = null;
    let _popStateBound = false;
    let _historicoActionsBound = false;
    let _mesaHooksBound = false;

    function log(nivel, ...args) {
        if (EM_PRODUCAO && nivel !== "error") return;
        try {
            (console?.[nivel] ?? console?.log)?.call(console, "[Tariel ChatPanel]", ...args);
        } catch (_) { }
    }

    // =========================================================================
    // UTILITÁRIOS
    // =========================================================================

    function _qs(sel, root = document) {
        return root.querySelector(sel);
    }

    function _qsa(sel, root = document) {
        return Array.from(root.querySelectorAll(sel));
    }

    function _escapeSel(valor) {
        try {
            return CSS.escape(String(valor));
        } catch (_) {
            return String(valor).replace(/["\\]/g, "\\$&");
        }
    }

    function _obterLaudoIdDaURL() {
        try {
            return new URL(window.location.href).searchParams.get("laudo") || "";
        } catch (_) {
            return "";
        }
    }

    function _obterLaudoPersistido() {
        try {
            return localStorage.getItem(KEY_LAUDO_ATUAL) || "";
        } catch (_) {
            return "";
        }
    }

    function _persistirLaudoAtual(laudoId) {
        try {
            if (laudoId) {
                localStorage.setItem(KEY_LAUDO_ATUAL, String(laudoId));
            } else {
                localStorage.removeItem(KEY_LAUDO_ATUAL);
            }
        } catch (_) { }
    }

    function _definirLaudoIdNaURL(laudoId, opts = {}) {
        const { replace = false } = opts;

        try {
            const url = new URL(window.location.href);
            const atual = url.searchParams.get("laudo") || "";
            const proximo = laudoId ? String(laudoId) : "";

            if (atual === proximo) return;

            if (proximo) {
                url.searchParams.set("laudo", proximo);
            } else {
                url.searchParams.delete("laudo");
            }

            const method = replace ? "replaceState" : "pushState";
            history[method]({ laudoId: proximo || null }, "", url.toString());
        } catch (e) {
            log("warn", "Falha ao atualizar URL:", e);
        }
    }

    function _getItemHistoricoPorId(laudoId) {
        if (!laudoId) return null;
        return document.querySelector(
            `.item-historico[data-laudo-id="${_escapeSel(laudoId)}"]`
        );
    }

    function _obterTituloLaudo(laudoId) {
        const item = _getItemHistoricoPorId(laudoId);
        if (!item) return "";

        const span =
            item.querySelector(".texto-laudo-historico span:first-child") ||
            item.querySelector(".texto-laudo-historico") ||
            item.querySelector(".nome-laudo") ||
            item;

        return (span.textContent || "").trim();
    }

    function _toast(msg, tipo = "info", ms = 3000) {
        if (typeof window.exibirToast === "function") {
            return window.exibirToast(msg, tipo, ms);
        }
        if (typeof window.mostrarToast === "function") {
            return window.mostrarToast(msg, tipo, ms);
        }
    }

    function _obterCampoMensagem() {
        return document.getElementById("campo-mensagem");
    }

    function _obterRodapeEntrada() {
        return document.querySelector(".rodape-entrada");
    }

    function _setRodapeBloqueado(ativo) {
        const rodape = _obterRodapeEntrada();
        if (!rodape) return;

        rodape.style.opacity = ativo ? "0.5" : "1";
        rodape.style.pointerEvents = ativo ? "none" : "all";
        rodape.setAttribute("aria-busy", String(!!ativo));
    }

    function _limparFailsafeFinalizacao() {
        if (_timerFailsafeFinalizacao) {
            clearTimeout(_timerFailsafeFinalizacao);
            _timerFailsafeFinalizacao = null;
        }
    }

    function _agendarFailsafeFinalizacao() {
        _limparFailsafeFinalizacao();
        _timerFailsafeFinalizacao = setTimeout(() => {
            document.body.dataset.finalizandoLaudo = "false";
            _setRodapeBloqueado(false);
        }, FAILSAFE_FINALIZACAO_MS);
    }

    function _normalizarTextoMesa(texto) {
        const base = String(texto || "").trim();
        if (!base) return ATALHO_MESA_AVALIADORA.trim();
        if (/^@insp\b/i.test(base)) return base;
        if (/^@inspetor\b/i.test(base)) return base.replace(/^@inspetor\b/i, "@insp");
        if (/^@eng\b/i.test(base)) return base.replace(/^@eng\b/i, "@insp");
        if (/^@engenharia\b/i.test(base)) return base.replace(/^@engenharia\b/i, "@insp");
        if (/^@revisor\b/i.test(base)) return base.replace(/^@revisor\b/i, "@insp");
        return `${ATALHO_MESA_AVALIADORA}${base}`.trim();
    }

    function _ativarMesaAvaliadora(texto = "") {
        const campo = _obterCampoMensagem();
        if (!campo) return false;

        campo.value = _normalizarTextoMesa(texto || campo.value || "");
        campo.dispatchEvent(new Event("input", { bubbles: true }));
        campo.focus();
        campo.setSelectionRange(campo.value.length, campo.value.length);

        if (window.innerWidth < 768) {
            window.TarielUI?.fecharSidebar?.();
        }

        document.dispatchEvent(
            new CustomEvent("tariel:mesa-avaliadora-ativada", {
                detail: {
                    atalho: "@insp",
                    valor: campo.value,
                },
                bubbles: true,
            })
        );

        return true;
    }

    function _obterLaudoInicial() {
        return (
            _obterLaudoIdDaURL() ||
            String(window.TarielAPI?.obterLaudoAtualId?.() || "") ||
            _obterLaudoPersistido()
        );
    }

    async function _fetchJSON(url, opts = {}) {
        const headers = new Headers(opts.headers || {});
        if (CSRF_TOKEN && !headers.has("X-CSRF-Token")) {
            headers.set("X-CSRF-Token", CSRF_TOKEN);
        }
        if (!headers.has("Accept")) {
            headers.set("Accept", "application/json");
        }

        const resp = await fetch(url, {
            credentials: "same-origin",
            ...opts,
            headers,
        });

        let dados = null;
        try {
            dados = await resp.json();
        } catch (_) {
            dados = null;
        }

        if (!resp.ok) {
            const detalhe =
                dados?.detail ||
                dados?.erro ||
                dados?.message ||
                `HTTP_${resp.status}`;
            throw new Error(detalhe);
        }

        return dados;
    }

    function _resolverItemHistoricoAPartirEvento(target) {
        return target.closest(".item-historico[data-laudo-id]");
    }

    function _obterLaudoIdDoEvento(target) {
        const item = _resolverItemHistoricoAPartirEvento(target);
        if (item?.dataset.laudoId) return String(item.dataset.laudoId);

        const viaData =
            target.closest("[data-laudo-id]")?.dataset?.laudoId ||
            target.dataset?.laudoId;

        return viaData ? String(viaData) : "";
    }

    function _resolverProximoLaudoAposExclusao(itemAtual) {
        if (!itemAtual) return "";
        const candidatos = _qsa(".item-historico[data-laudo-id]")
            .filter((el) => el !== itemAtual);
        return candidatos[0]?.dataset?.laudoId || "";
    }

    function _atualizarUIItemPin(item, pinado) {
        if (!item) return;

        item.dataset.pinado = String(!!pinado);
        item.classList.toggle("pinned", !!pinado);
        item.classList.toggle("laudo-pinado", !!pinado);

        const btns = item.querySelectorAll(
            "[data-acao-laudo='pin'], [data-action='pin'], .btn-pin-laudo, .btn-acao-pin"
        );

        btns.forEach((btn) => {
            btn.setAttribute("aria-pressed", String(!!pinado));
            btn.dataset.pinado = String(!!pinado);
            btn.title = pinado ? "Desafixar" : "Fixar";

            const icone = btn.querySelector(".material-symbols-rounded");
            if (icone) {
                icone.textContent = pinado ? "keep_off" : "keep";
            }
        });
    }

    function _limparSelecaoAtual() {
        _qsa(".item-historico").forEach((el) => {
            el.classList.remove("ativo");
            el.removeAttribute("aria-current");
        });
    }

    // =========================================================================
    // BADGE E SELEÇÃO (UI)
    // =========================================================================

    function _atualizarBadgeRelatorio(laudoId, status) {
        const item = _getItemHistoricoPorId(laudoId);
        if (!item) return;

        item.querySelector(".badge-relatorio-status")?.remove();
        if (!status) return;

        const badge = document.createElement("span");
        badge.className = `badge-relatorio-status badge-rel-${status}`;

        const configs = {
            ativo: { label: "Em andamento", text: "● Em andamento" },
            aguardando: { label: "Aguardando avaliação", text: "⏳ Em avaliação" },
        };

        const cfg = configs[status] ?? { label: status, text: status };
        badge.setAttribute("aria-label", cfg.label);
        badge.textContent = cfg.text;

        const texto = item.querySelector(".texto-laudo-historico") || item;
        texto.appendChild(badge);
    }

    function _limparBadgesRelatorio(status = null) {
        _qsa(".badge-relatorio-status").forEach((badge) => {
            if (!status || badge.classList.contains(`badge-rel-${status}`)) {
                badge.remove();
            }
        });
    }

    function _setAtivoNoHistorico(laudoId) {
        _limparSelecaoAtual();

        const item = _getItemHistoricoPorId(laudoId);
        if (!item) return;

        item.classList.add("ativo");
        item.setAttribute("aria-current", "true");

        const reduzMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        item.scrollIntoView({
            block: "nearest",
            behavior: reduzMovimento ? "auto" : "smooth",
        });
    }

    // =========================================================================
    // THREAD-NAV / BREADCRUMB
    // =========================================================================

    function _selecionarThreadTab(tab) {
        const nav = _garantirThreadNav();
        const tabs = nav.querySelectorAll(".thread-tab[data-tab]");

        tabs.forEach((b) => {
            const ativo = b.dataset.tab === tab;
            b.classList.toggle("ativo", ativo);
            b.setAttribute("aria-selected", String(ativo));
        });

        document.body.dataset.threadTab = tab;

        document.dispatchEvent(
            new CustomEvent("tariel:thread-tab-alterada", {
                detail: { tab },
                bubbles: true,
            })
        );
    }

    function _garantirThreadNav() {
        let nav = _qs(".thread-nav");
        if (nav) return nav;

        nav = document.createElement("div");
        nav.className = "thread-nav";
        nav.innerHTML = `
            <div class="thread-breadcrumb" aria-label="Navegação do laudo">
                <a href="/app/" data-bc="home">Laudos</a>
                <span aria-hidden="true">›</span>
                <span data-bc="atual">—</span>
            </div>
            <div class="thread-tabs" role="tablist" aria-label="Seções">
                <button type="button" class="thread-tab ativo" role="tab" aria-selected="true" data-tab="chat">Chat</button>
                <button type="button" class="thread-tab" role="tab" aria-selected="false" data-tab="anexos">Anexos</button>
            </div>
        `;

        const areaMensagens = document.getElementById("area-mensagens");
        if (areaMensagens?.parentElement) {
            areaMensagens.parentElement.insertBefore(nav, areaMensagens);
        } else {
            document.body.insertBefore(nav, document.body.firstChild);
        }

        nav.addEventListener("click", (e) => {
            const btn = e.target.closest(".thread-tab[data-tab]");
            if (!btn) return;
            _selecionarThreadTab(btn.dataset.tab || "chat");
        });

        return nav;
    }

    function _atualizarBreadcrumb(laudoId) {
        const nav = _garantirThreadNav();
        const atual = nav.querySelector('[data-bc="atual"]');
        if (!atual) return;

        atual.textContent =
            _obterTituloLaudo(laudoId) ||
            `Laudo ${laudoId || ""}`.trim() ||
            "—";
    }

    // =========================================================================
    // FUNÇÃO PRINCIPAL: SELECIONAR LAUDO
    // =========================================================================

    function selecionarLaudo(laudoId, opts = {}) {
        const {
            atualizarURL = true,
            replaceURL = false,
            origem = "ui",
        } = opts;

        const id = Number(laudoId);
        if (!Number.isFinite(id) || id <= 0) return false;

        const estadoRel = window.TarielAPI?.obterEstadoRelatorio?.();
        const laudoAtivo = window.TarielAPI?.obterLaudoAtualId?.();

        if (
            estadoRel === "relatorio_ativo" &&
            laudoAtivo &&
            Number(laudoAtivo) !== id
        ) {
            _toast("Finalize ou cancele o relatório ativo antes de trocar de laudo.", "aviso", 4000);
            return false;
        }

        log("info", `Selecionando laudo: ${id}`);

        _setAtivoNoHistorico(id);
        _atualizarBreadcrumb(id);
        _persistirLaudoAtual(id);

        if (atualizarURL) {
            _definirLaudoIdNaURL(id, { replace: replaceURL });
        }

        window.TarielUI?.fecharSidebar?.();

        const sidebar =
            document.getElementById("sidebar") ||
            document.getElementById("barra-historico");

        if (sidebar && window.innerWidth < 768) {
            sidebar.classList.remove("aberta");
            sidebar.classList.remove("aberto");
        }

        document.dispatchEvent(
            new CustomEvent("tariel:laudo-selecionado", {
                detail: { laudoId: id, origem },
                bubbles: true,
            })
        );

        return true;
    }

    // =========================================================================
    // MESA AVALIADORA (@insp)
    // =========================================================================

    function enviarParaMesaAvaliadora(texto = "") {
        const ok = _ativarMesaAvaliadora(texto);
        if (!ok) {
            _toast("Campo de mensagem não encontrado.", "erro");
            return false;
        }

        _toast("Atalho @insp ativado para a mesa avaliadora.", "info", 1800);
        return true;
    }

    // =========================================================================
    // FINALIZAR INSPEÇÃO
    // =========================================================================

    window.finalizarInspecaoCompleta = async function () {
        const tipo = window.tipoTemplateAtivo || "padrao";
        const laudoId =
            window.TarielAPI?.obterLaudoAtualId?.() || _obterLaudoIdDaURL();

        if (!laudoId) {
            _toast("Não há laudo ativo para finalizar.", "erro");
            return;
        }

        if (document.body.dataset.finalizandoLaudo === "true") {
            _toast("A finalização já está em andamento.", "aviso", 2500);
            return;
        }

        log("info", `Comando de finalização disparado para laudo ${laudoId}, tipo: ${tipo}`);

        document.body.dataset.finalizandoLaudo = "true";
        _setRodapeBloqueado(true);
        _agendarFailsafeFinalizacao();
        _atualizarBadgeRelatorio(laudoId, "aguardando");

        try {
            document.dispatchEvent(
                new CustomEvent("tariel:disparar-comando-sistema", {
                    detail: {
                        comando: "FINALIZAR_LAUDO_AGORA",
                        tipo,
                        destino: "mesa_avaliadora",
                        atalho: "@insp",
                        laudoId: Number(laudoId),
                    },
                    bubbles: true,
                })
            );
        } catch (e) {
            log("error", "Falha ao finalizar inspeção:", e);
            document.body.dataset.finalizandoLaudo = "false";
            _limparFailsafeFinalizacao();
            _setRodapeBloqueado(false);
            _toast("Erro ao tentar finalizar a inspeção.", "erro");
        }
    };

    // =========================================================================
    // PIN / DELETE
    // =========================================================================

    async function _alternarPinLaudo(laudoId, itemEl, btn) {
        if (!laudoId) return;

        const pinadoAtual =
            btn?.dataset?.pinado === "true" ||
            itemEl?.dataset?.pinado === "true" ||
            itemEl?.classList?.contains("pinned") ||
            itemEl?.classList?.contains("laudo-pinado");

        try {
            const dados = await _fetchJSON(`/app/api/laudo/${laudoId}/pin`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pinado: !pinadoAtual }),
            });

            _atualizarUIItemPin(itemEl, !!dados?.pinado);
            _toast(dados?.pinado ? "Laudo fixado." : "Laudo desafixado.", "sucesso", 1800);
        } catch (e) {
            log("error", "Falha ao alterar pin:", e);
            _toast(`Não foi possível alterar o pin: ${e.message}`, "erro", 3500);
        }
    }

    async function _excluirLaudo(laudoId, itemEl) {
        if (!laudoId) return;

        const estadoRel = window.TarielAPI?.obterEstadoRelatorio?.();
        const laudoAtivo = window.TarielAPI?.obterLaudoAtualId?.();

        if (
            estadoRel === "relatorio_ativo" &&
            laudoAtivo &&
            Number(laudoAtivo) === Number(laudoId)
        ) {
            _toast("Cancele ou finalize o relatório ativo antes de excluir este laudo.", "aviso", 4000);
            return;
        }

        const confirmou = window.confirm("Deseja realmente excluir este laudo?");
        if (!confirmou) return;

        try {
            await _fetchJSON(`/app/api/laudo/${laudoId}`, {
                method: "DELETE",
            });

            const eraAtivo =
                String(window.TarielAPI?.obterLaudoAtualId?.() || "") === String(laudoId) ||
                itemEl?.classList?.contains("ativo");

            const proximo = _resolverProximoLaudoAposExclusao(itemEl);
            itemEl?.remove();

            if (eraAtivo && proximo) {
                selecionarLaudo(proximo, {
                    atualizarURL: true,
                    replaceURL: true,
                    origem: "delete_fallback",
                });
            } else if (eraAtivo) {
                _limparSelecaoAtual();
                _persistirLaudoAtual("");
                _definirLaudoIdNaURL("", { replace: true });
                _atualizarBreadcrumb("");
                window.location.assign("/app/");
                return;
            }

            _toast("Laudo excluído.", "sucesso", 1800);
        } catch (e) {
            log("error", "Falha ao excluir laudo:", e);
            _toast(`Não foi possível excluir o laudo: ${e.message}`, "erro", 3500);
        }
    }

    // =========================================================================
    // EVENTOS DE CLICK, OBSERVERS E SETUP
    // =========================================================================

    function _bindItemHistorico(itemEl) {
        if (!itemEl || itemEl.dataset.bound === "true") return;
        itemEl.dataset.bound = "true";

        const laudoId = itemEl.dataset.laudoId;
        if (!laudoId) return;

        const areaClique =
            itemEl.querySelector(".texto-laudo-historico, .nome-laudo") || itemEl;

        areaClique.addEventListener("click", (e) => {
            if (
                e.target.closest(
                    ".btn-acao-laudo, .menu-laudo, .popup-confirmar, [data-acao-laudo], [data-action]"
                )
            ) return;

            selecionarLaudo(laudoId, {
                atualizarURL: true,
                origem: "historico_click",
            });
        });
    }

    function _wireHistoricoClick() {
        const container =
            document.getElementById("lista-historico") ||
            document.getElementById("barra-historico") ||
            document.getElementById("sidebar");

        if (!container) return;

        container
            .querySelectorAll(".item-historico[data-laudo-id]")
            .forEach((el) => _bindItemHistorico(el));

        if (_observerHistorico) {
            _observerHistorico.disconnect();
        }

        _observerHistorico = new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                m.addedNodes.forEach((node) => {
                    if (node.nodeType !== 1) return;

                    if (node.matches?.(".item-historico[data-laudo-id]")) {
                        _bindItemHistorico(node);
                    }

                    node
                        .querySelectorAll?.(".item-historico[data-laudo-id]")
                        .forEach((el) => _bindItemHistorico(el));
                });
            });
        });

        _observerHistorico.observe(container, { childList: true, subtree: true });
    }

    function _wirePopState() {
        if (_popStateBound) return;
        _popStateBound = true;

        window.addEventListener("popstate", (e) => {
            const laudoId = e.state?.laudoId || _obterLaudoIdDaURL();
            if (!laudoId) return;
            selecionarLaudo(laudoId, { atualizarURL: false, origem: "popstate" });
        });
    }

    function _wireMesaAvaliadoraHooks() {
        if (_mesaHooksBound) return;
        _mesaHooksBound = true;

        document.addEventListener("click", (e) => {
            const gatilho = e.target.closest(
                "[data-atalho-mesa='insp'], [data-abrir-mesa-avaliadora='true']"
            );
            if (!gatilho) return;

            e.preventDefault();
            enviarParaMesaAvaliadora();
        });

        document.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === "i") {
                e.preventDefault();
                enviarParaMesaAvaliadora();
            }
        });
    }

    function _wireHistoricoActions() {
        if (_historicoActionsBound) return;
        _historicoActionsBound = true;

        document.addEventListener("click", async (e) => {
            const btnPin = e.target.closest(
                "[data-acao-laudo='pin'], [data-action='pin'], .btn-pin-laudo, .btn-acao-pin"
            );

            if (btnPin) {
                e.preventDefault();
                e.stopPropagation();

                const item = _resolverItemHistoricoAPartirEvento(btnPin);
                const laudoId = _obterLaudoIdDoEvento(btnPin);
                await _alternarPinLaudo(laudoId, item, btnPin);
                return;
            }

            const btnDelete = e.target.closest(
                "[data-acao-laudo='delete'], [data-action='delete'], .btn-excluir-laudo, .btn-delete-laudo, .btn-acao-excluir"
            );

            if (btnDelete) {
                e.preventDefault();
                e.stopPropagation();

                const item = _resolverItemHistoricoAPartirEvento(btnDelete);
                const laudoId = _obterLaudoIdDoEvento(btnDelete);
                await _excluirLaudo(laudoId, item);
            }
        });
    }

    function _sincronizarEstadoRelatorioNaUI(dados = {}) {
        const estado = dados.estado ?? window.TarielAPI?.obterEstadoRelatorio?.();
        const laudoId = Number(dados.laudo_id ?? window.TarielAPI?.obterLaudoAtualId?.() ?? 0);

        if (estado === "relatorio_ativo" && laudoId) {
            _limparBadgesRelatorio("ativo");
            _atualizarBadgeRelatorio(laudoId, "ativo");
            return;
        }

        if (estado === "sem_relatorio") {
            _limparBadgesRelatorio("ativo");
        }
    }

    function _tentarSelecionarLaudoInicial(laudoId, tentativa = 0) {
        if (!laudoId) return;

        if (document.body.dataset.apiEvents === "wired") {
            selecionarLaudo(laudoId, {
                atualizarURL: true,
                replaceURL: true,
                origem: "boot",
            });
            return;
        }

        if (tentativa >= BOOT_RETRIES_MAX) {
            log("warn", "API não ficou pronta a tempo para carregar o laudo inicial.");
            return;
        }

        setTimeout(() => {
            _tentarSelecionarLaudoInicial(laudoId, tentativa + 1);
        }, BOOT_RETRY_MS);
    }

    // =========================================================================
    // ESCUTAS DO API.JS
    // =========================================================================

    document.addEventListener("tariel:laudo-criado", (e) => {
        const laudoId = e.detail?.laudoId;
        if (!laudoId) return;

        setTimeout(() => {
            const novoItem = _getItemHistoricoPorId(laudoId);
            if (novoItem) {
                _bindItemHistorico(novoItem);
            }

            _setAtivoNoHistorico(laudoId);
            _atualizarBreadcrumb(laudoId);
            _persistirLaudoAtual(laudoId);
            _definirLaudoIdNaURL(laudoId, { replace: true });
        }, 350);
    });

    document.addEventListener("tariel:relatorio-iniciado", (e) => {
        const laudoId = e.detail?.laudoId;
        if (!laudoId) return;

        _limparFailsafeFinalizacao();
        document.body.dataset.finalizandoLaudo = "false";
        _setRodapeBloqueado(false);
        _limparBadgesRelatorio("ativo");
        _atualizarBadgeRelatorio(laudoId, "ativo");
        _persistirLaudoAtual(laudoId);
        _definirLaudoIdNaURL(laudoId, { replace: true });
        _setAtivoNoHistorico(laudoId);
        _atualizarBreadcrumb(laudoId);
    });

    document.addEventListener("tariel:relatorio-finalizado", (e) => {
        const laudoId = e.detail?.laudoId;
        if (!laudoId) return;

        _limparFailsafeFinalizacao();
        document.body.dataset.finalizandoLaudo = "false";
        _setRodapeBloqueado(false);
        _limparBadgesRelatorio("ativo");
        _atualizarBadgeRelatorio(laudoId, "aguardando");
    });

    document.addEventListener("tariel:estado-relatorio", (e) => {
        _sincronizarEstadoRelatorioNaUI(e.detail || {});
    });

    // =========================================================================
    // BOOT
    // =========================================================================

    function _boot() {
        if (document.documentElement.dataset.chatPanelEvents === "wired") return;

        _garantirThreadNav();
        _selecionarThreadTab("chat");
        _wireHistoricoClick();
        _wireHistoricoActions();
        _wirePopState();
        _wireMesaAvaliadoraHooks();

        const laudoInicial = _obterLaudoInicial();

        if (laudoInicial) {
            requestAnimationFrame(() => {
                _setAtivoNoHistorico(laudoInicial);
                _atualizarBreadcrumb(laudoInicial);
                _persistirLaudoAtual(laudoInicial);
                _tentarSelecionarLaudoInicial(laudoInicial);
            });
        }

        document.documentElement.dataset.chatPanelEvents = "wired";
        log("info", "ChatPanel pronto.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", _boot, { once: true });
    } else {
        _boot();
    }

    // =========================================================================
    // EXPOSIÇÃO DA API
    // =========================================================================

    window.TarielScript = {
        selecionarLaudo,
        obterLaudoAtual: _obterLaudoIdDaURL,
        atualizarBreadcrumb: _atualizarBreadcrumb,
        iniciarRelatorio: (tipo) => window.TarielAPI?.iniciarRelatorio?.(tipo),
        finalizarRelatorio: window.finalizarInspecaoCompleta,
        atualizarBadge: _atualizarBadgeRelatorio,
        enviarParaMesaAvaliadora,
        ativarAtalhoMesa: enviarParaMesaAvaliadora,
    };
})();
