// ==========================================
// TARIEL CONTROL TOWER — CHAT_SIDEBAR.JS
// Papel: comportamento da sidebar do chat.
// Responsável por:
// - botão "Falar com Engenheiro"
// - fechar sidebar no mobile
// - manter compatibilidade com métodos legados da sidebar
// - manter compatibilidade com eventos legados
// - integrar com o core do painel quando disponível
// ==========================================

(function () {
    "use strict";

    if (window.__TARIEL_CHAT_SIDEBAR_WIRED__) return;
    window.__TARIEL_CHAT_SIDEBAR_WIRED__ = true;

    const PREFIXO_ENGENHARIA = "@insp ";

    const estado = {
        bootExecutado: false,
        eventosRelatorioBindados: false,
    };

    // =========================================================
    // ACESSO DINÂMICO AO CORE
    // Não congelamos a referência no load do arquivo.
    // Assim, se o core carregar depois, este módulo ainda consegue usá-lo.
    // =========================================================
    function obterTP() {
        return window.TarielChatPainel || null;
    }

    // =========================================================
    // HELPERS DE ACESSO À UI
    // =========================================================
    function getBtnEngenharia() {
        return document.getElementById("btn-sidebar-engenheiro");
    }

    function getCampoMensagem() {
        return document.getElementById("campo-mensagem");
    }

    function getSidebar() {
        return document.getElementById("barra-historico");
    }

    function getOverlay() {
        return document.getElementById("overlay-sidebar");
    }

    function getBtnMenu() {
        return document.getElementById("btn-menu");
    }

    // =========================================================
    // UTILITÁRIOS
    // =========================================================
    function log(nivel, ...args) {
        const TP = obterTP();

        if (TP?.log) {
            TP.log(nivel, ...args);
            return;
        }

        try {
            (console?.[nivel] ?? console?.log)?.call(console, "[Tariel ChatSidebar]", ...args);
        } catch (_) {}
    }

    function emitir(nome, detail = {}) {
        const TP = obterTP();

        if (TP?.emitir) {
            TP.emitir(nome, detail);
            return;
        }

        document.dispatchEvent(
            new CustomEvent(nome, {
                detail,
                bubbles: true,
            })
        );
    }

    function mostrarToast(mensagem, tipo = "info", duracao = 3000) {
        const TP = obterTP();

        if (TP?.toast) {
            TP.toast(mensagem, tipo, duracao);
            return;
        }

        if (typeof window.mostrarToast === "function") {
            window.mostrarToast(mensagem, tipo, duracao);
            return;
        }

        if (typeof window.exibirToast === "function") {
            window.exibirToast(mensagem, tipo, duracao);
        }
    }

    function normalizarEstadoRelatorio(valor) {
        const estadoNormalizado = String(valor || "").trim().toLowerCase();

        if (estadoNormalizado === "relatorioativo" || estadoNormalizado === "relatorio_ativo") {
            return "relatorio_ativo";
        }

        if (estadoNormalizado === "semrelatorio" || estadoNormalizado === "sem_relatorio") {
            return "sem_relatorio";
        }

        if (estadoNormalizado === "aguardando" || estadoNormalizado === "aguardando_avaliacao") {
            return "aguardando";
        }

        return estadoNormalizado || "sem_relatorio";
    }

    function sincronizarAcessibilidadeSidebar(estaAberta) {
        const sidebar = getSidebar();
        const overlay = getOverlay();
        const btnMenu = getBtnMenu();

        sidebar?.setAttribute("aria-hidden", String(!estaAberta));
        overlay?.setAttribute("aria-hidden", String(!estaAberta));
        btnMenu?.setAttribute("aria-expanded", String(!!estaAberta));
    }

    function obterLaudoAtivoInicialDaSidebar() {
        const sidebar = getSidebar();
        if (!sidebar) return null;

        const valor = sidebar.dataset.laudoAtivoId || "";
        const id = Number(valor);

        return Number.isFinite(id) && id > 0 ? id : null;
    }

    function obterEstadoInicialDaSidebar() {
        const sidebar = getSidebar();
        if (!sidebar) return "sem_relatorio";

        return normalizarEstadoRelatorio(sidebar.dataset.estadoRelatorio || "sem_relatorio");
    }

    function obterLaudoAtualSeguro() {
        const viaApi = window.TarielAPI?.obterLaudoAtualId?.();
        const viaSidebar = obterLaudoAtivoInicialDaSidebar();
        const valor = viaApi || viaSidebar || null;

        const id = Number(valor);
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    // =========================================================
    // SIDEBAR MOBILE
    // =========================================================
    function fecharSidebarNoMobile() {
        if (window.innerWidth >= 768) return;

        const sidebar = getSidebar();
        const overlay = getOverlay();

        sidebar?.classList.remove("aberta", "aberto");
        overlay?.classList.remove("ativo");
        document.body.classList.remove("sidebar-aberta");

        sincronizarAcessibilidadeSidebar(false);

        emitir("tariel:sidebar-fechada", {
            origem: "chat_sidebar",
        });
    }

    function focarCampoNoFim() {
        const campoMensagem = getCampoMensagem();
        if (!campoMensagem) return false;

        try {
            campoMensagem.focus({ preventScroll: true });
        } catch (_) {
            campoMensagem.focus();
        }

        const tamanhoTexto = campoMensagem.value.length;
        if (typeof campoMensagem.setSelectionRange === "function") {
            campoMensagem.setSelectionRange(tamanhoTexto, tamanhoTexto);
        }

        campoMensagem.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    }

    function garantirPrefixoEngenharia() {
        const campoMensagem = getCampoMensagem();
        if (!campoMensagem) return false;

        const valorAtual = String(campoMensagem.value || "");
        const valorSemEspacosIniciais = valorAtual.trimStart();

        if (!/^@insp\b/i.test(valorSemEspacosIniciais)) {
            campoMensagem.value = PREFIXO_ENGENHARIA + valorSemEspacosIniciais;
        } else {
            campoMensagem.value = valorSemEspacosIniciais;
        }

        return true;
    }

    function mostrarBannerRelatorio() {}

    function ocultarBannerRelatorio() {}

    function abrirRelatorioEmAndamento(evento = null) {
        if (evento) {
            evento.preventDefault();
            evento.stopPropagation();
        }
        return false;
    }

    function sincronizarBannerInicial() {
        return false;
    }

    // =========================================================
    // FLUXO "FALAR COM ENGENHEIRO"
    // Preferimos delegar ao módulo de mesa avaliadora.
    // Se ele não estiver disponível, usamos fallback local.
    // =========================================================
    function ativarFluxoEngenharia() {
        const TP = obterTP();

        if (typeof TP?.enviarParaMesaAvaliadora === "function") {
            return TP.enviarParaMesaAvaliadora(PREFIXO_ENGENHARIA);
        }

        emitir("tariel:ativar-mesa-avaliadora", {
            texto: PREFIXO_ENGENHARIA,
            origem: "sidebar",
        });

        const ok = garantirPrefixoEngenharia();
        if (ok) {
            focarCampoNoFim();
        }

        return ok;
    }

    function onClickFalarComEngenharia(event) {
        event.preventDefault();
        event.stopPropagation();

        const ok = ativarFluxoEngenharia();

        if (!ok) {
            log("warn", "Campo de mensagem não encontrado ao ativar fluxo da engenharia.");
            mostrarToast("Campo de mensagem não encontrado.", "erro", 3000);
            return;
        }

        fecharSidebarNoMobile();

        emitir("tariel:engenharia-ativada", {
            prefixo: PREFIXO_ENGENHARIA.trim(),
            origem: "sidebar",
        });

        mostrarToast(
            "Chat da mesa avaliadora aberto. Escreva sua mensagem por lá.",
            "info",
            3000
        );
    }

    // =========================================================
    // BINDS
    // =========================================================
    function bindBotaoEngenharia() {
        const btnEngenharia = getBtnEngenharia();
        if (!btnEngenharia) {
            log("warn", 'Botão "Falar com Engenheiro" não encontrado.');
            return;
        }

        if (btnEngenharia.dataset.sidebarBound === "true") return;

        btnEngenharia.dataset.sidebarBound = "true";
        btnEngenharia.addEventListener("click", onClickFalarComEngenharia);
    }

    // =========================================================
    // BOOT
    // =========================================================
    function boot() {
        if (estado.bootExecutado) return;
        estado.bootExecutado = true;

        bindBotaoEngenharia();

        log("info", "Chat sidebar pronta.");
    }

    function destruir() {
        const btnEngenharia = getBtnEngenharia();

        btnEngenharia?.removeEventListener("click", onClickFalarComEngenharia);

        estado.bootExecutado = false;
    }

    const TP = obterTP();

    if (typeof TP?.onReady === "function") {
        TP.onReady(boot);
    } else if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }

    window.TarielChatSidebar = Object.assign(window.TarielChatSidebar || {}, {
        fecharSidebarNoMobile,
        focarCampoNoFim,
        garantirPrefixoEngenharia,
        mostrarBannerRelatorio,
        ocultarBannerRelatorio,
        sincronizarBannerInicial,
        destruir,
    });
})();
