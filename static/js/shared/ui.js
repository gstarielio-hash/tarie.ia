// =========================================================================
// TARIEL CONTROL TOWER — UI.JS (VERSÃO AJUSTADA)
// Orquestração: Sidebar, Login/Logout, Notificações, Modo Foco e Suporte
// =========================================================================

(function () {
    "use strict";

    const EM_PRODUCAO =
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1";

    const MARCADOR_ENG = "eng ";
    const KEY_MODO_FOCO = "wf_modo_foco";
    const KEY_MODO_RESPOSTA = "wf_modo_resposta";
    const TOGGLE_COLOR = "#F47B20";
    const _toastsAtivos = new Map();

    function log(nivel, ...args) {
        if (EM_PRODUCAO && nivel !== "error") return;
        try {
            (console?.[nivel] ?? console?.log)?.call(console, "[Tariel UI]", ...args);
        } catch (_) { }
    }

    function qs(sel, root = document) {
        return root.querySelector(sel);
    }

    function qsa(sel, root = document) {
        return Array.from(root.querySelectorAll(sel));
    }

    function escapeHTML(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#x27;")
            .replace(/\//g, "&#x2F;");
    }

    function obterCampoMensagem() {
        return document.getElementById("campo-mensagem");
    }

    function obterModoSalvo() {
        try {
            return localStorage.getItem(KEY_MODO_RESPOSTA) || "detalhado";
        } catch (_) {
            return "detalhado";
        }
    }

    function salvarModo(modo) {
        try {
            localStorage.setItem(KEY_MODO_RESPOSTA, modo);
        } catch (_) { }
    }

    function obterModoFocoSalvo() {
        try {
            return localStorage.getItem(KEY_MODO_FOCO) === "true";
        } catch (_) {
            return false;
        }
    }

    function salvarModoFoco(ativo) {
        try {
            localStorage.setItem(KEY_MODO_FOCO, String(ativo));
        } catch (_) { }
    }

    function obterSidebar() {
        return document.getElementById("barra-historico") || document.getElementById("sidebar");
    }

    function obterOverlaySidebar() {
        return document.querySelector(".overlay-sidebar");
    }

    function isMobile() {
        return window.innerWidth <= 768;
    }

    function sidebarEstaAberta(sidebar) {
        if (!sidebar) return false;

        if (isMobile()) {
            return sidebar.classList.contains("aberto") || sidebar.classList.contains("aberta");
        }

        return !sidebar.classList.contains("oculta");
    }

    function definirEstadoSidebar(abrir) {
        const btnMenu = document.getElementById("btn-menu");
        const sidebar = obterSidebar();
        const overlay = obterOverlaySidebar();

        if (!sidebar) return;

        if (isMobile()) {
            document.body.classList.remove("sidebar-colapsada");
            sidebar.classList.toggle("aberto", !!abrir);
            sidebar.classList.toggle("aberta", !!abrir);
            sidebar.classList.remove("oculta");

            overlay?.classList.toggle("ativo", !!abrir);
            overlay?.setAttribute("aria-hidden", String(!abrir));
            document.body.classList.toggle("sidebar-aberta", !!abrir);
            document.body.style.overflow = abrir ? "hidden" : "";
            sidebar.setAttribute("aria-hidden", String(!abrir));
            btnMenu?.setAttribute("aria-expanded", String(!!abrir));
            return;
        }

        document.body.classList.toggle("sidebar-colapsada", !abrir);
        sidebar.classList.remove("aberto", "aberta");
        sidebar.classList.toggle("oculta", !abrir);
        sidebar.setAttribute("aria-hidden", String(!abrir));
        btnMenu?.setAttribute("aria-expanded", String(!!abrir));

        overlay?.classList.remove("ativo");
        overlay?.setAttribute("aria-hidden", "true");
        document.body.classList.remove("sidebar-aberta");
        document.body.style.overflow = "";
    }

    function marcarBotaoPressionado(botao, ativo, { color = "", tituloAtivo = "", tituloInativo = "" } = {}) {
        if (!botao) return;
        botao.setAttribute("aria-pressed", String(!!ativo));
        botao.classList.toggle("ativo", !!ativo);
        botao.style.color = ativo && color ? color : "";
        const titulo = ativo ? tituloAtivo : tituloInativo;
        if (titulo) {
            botao.title = titulo;
            botao.setAttribute("aria-label", titulo);
        }
    }

    function definirLoadingBotao(botao, ativo, {
        iconIdle = "",
        labelIdle = "",
        iconLoading = "sync",
        labelLoading = "Processando..."
    } = {}) {
        if (!botao) return;

        if (!botao.dataset.labelIdle && labelIdle) botao.dataset.labelIdle = labelIdle;
        if (!botao.dataset.iconIdle && iconIdle) botao.dataset.iconIdle = iconIdle;

        const finalLabelIdle = botao.dataset.labelIdle || labelIdle || botao.textContent.trim();
        const finalIconIdle = botao.dataset.iconIdle || iconIdle || "";

        botao.disabled = !!ativo;
        botao.setAttribute("aria-busy", String(!!ativo));

        if (ativo) {
            botao.innerHTML = `
                <span class="material-symbols-rounded" aria-hidden="true">${iconLoading}</span>
                <span>${escapeHTML(labelLoading)}</span>
            `;
            return;
        }

        if (finalIconIdle) {
            botao.innerHTML = `
                <span class="material-symbols-rounded" aria-hidden="true">${finalIconIdle}</span>
                <span>${escapeHTML(finalLabelIdle)}</span>
            `;
        } else {
            botao.textContent = finalLabelIdle;
        }
    }

    function fecharSidebarSilencioso() {
        definirEstadoSidebar(false);
    }

    function abrirFecharSidebar() {
        const sidebar = obterSidebar();
        if (!sidebar) return;
        definirEstadoSidebar(!sidebarEstaAberta(sidebar));
    }

    function aplicarModoFoco(ativo) {
        const btnToggle = document.getElementById("btn-toggle-ui");
        const iconeToggle =
            document.getElementById("icone-toggle-ui") ||
            btnToggle?.querySelector(".material-symbols-rounded");

        document.body.classList.toggle("modo-foco", !!ativo);

        if (btnToggle) {
            const txt = ativo ? "Mostrar interface" : "Ocultar interface";
            btnToggle.setAttribute("aria-pressed", String(!!ativo));
            btnToggle.dataset.tooltip = txt;
            btnToggle.title = txt;
        }

        if (iconeToggle) {
            iconeToggle.textContent = ativo ? "left_panel_open" : "left_panel_close";
        }

        salvarModoFoco(!!ativo);
    }

    function obterModo() {
        return obterModoSalvo();
    }

    function atualizarBotoesModo(modoFinal) {
        qsa(".chip-modo-resposta").forEach((chip) => {
            const ativo = chip.dataset.modo === modoFinal;
            chip.classList.toggle("ativo", ativo);
            chip.setAttribute("aria-pressed", String(ativo));
        });
    }

    function definirModo(modo) {
        const modoFinal = String(modo || "detalhado");
        salvarModo(modoFinal);
        atualizarBotoesModo(modoFinal);

        document.dispatchEvent(
            new CustomEvent("tariel:modo-alterado", {
                detail: { modo: modoFinal },
                bubbles: true,
            })
        );

        return modoFinal;
    }

    function normalizarTextoEngenharia(texto) {
        const base = String(texto || "").trimStart();
        if (!base) return MARCADOR_ENG.trimEnd();
        if (/^eng\b/i.test(base)) return base;
        if (/^@eng\b/i.test(base)) return base.replace(/^@eng\b/i, "eng");
        if (/^@insp\b/i.test(base)) return base.replace(/^@insp\b/i, "eng");
        return `${MARCADOR_ENG}${base}`.trimEnd();
    }

    function possuiMesaWidgetDedicado() {
        return Boolean(
            document.getElementById("painel-mesa-widget") &&
            document.getElementById("mesa-widget-input")
        );
    }

    function abrirMesaWidgetDedicado(texto = "") {
        if (!possuiMesaWidgetDedicado()) return false;

        const painel = document.getElementById("painel-mesa-widget");
        const botaoToggle = document.getElementById("btn-mesa-widget-toggle");
        const campoMesa = document.getElementById("mesa-widget-input");

        const aberto =
            botaoToggle?.getAttribute("aria-expanded") === "true" ||
            painel?.classList.contains("aberto") ||
            (painel ? !painel.hidden : false);

        if (!aberto && botaoToggle) {
            botaoToggle.click();
        }

        const sugestao = String(texto || "")
            .replace(/^@?(insp|inspetor|eng|engenharia|revisor|mesa|avaliador|avaliacao)\b\s*[:\-]?\s*/i, "")
            .trim();

        if (campoMesa) {
            if (sugestao && !String(campoMesa.value || "").trim()) {
                campoMesa.value = sugestao;
                campoMesa.dispatchEvent(new Event("input", { bubbles: true }));
            }

            campoMesa.focus();
            if (typeof campoMesa.setSelectionRange === "function") {
                const fim = campoMesa.value.length;
                campoMesa.setSelectionRange(fim, fim);
            }
        }

        if (isMobile()) {
            fecharSidebarSilencioso();
        }

        return true;
    }

    function atualizarEstadoToggleMesa() {
        const campo = obterCampoMensagem();
        const btnToggle = document.getElementById("btn-toggle-humano");
        const btnSidebar = document.getElementById("btn-sidebar-engenheiro");
        if (!campo) return;

        const widgetDedicadoAtivo = possuiMesaWidgetDedicado();
        const ativo = widgetDedicadoAtivo ? false : /^eng\b/i.test(campo.value);
        const tituloAtivo = widgetDedicadoAtivo
            ? "Chat da mesa aberto"
            : "Desativar conversa com engenharia";
        const tituloInativo = widgetDedicadoAtivo
            ? "Abrir chat da mesa avaliadora"
            : "Falar com engenharia";

        marcarBotaoPressionado(btnToggle, ativo, {
            color: TOGGLE_COLOR,
            tituloAtivo,
            tituloInativo
        });

        marcarBotaoPressionado(btnSidebar, ativo, {
            color: TOGGLE_COLOR,
            tituloAtivo,
            tituloInativo
        });
    }

    function ativarMesaAvaliadora(texto = "") {
        if (abrirMesaWidgetDedicado(texto)) {
            atualizarEstadoToggleMesa();
            return true;
        }

        const campo = obterCampoMensagem();
        if (!campo) return false;

        campo.value = normalizarTextoEngenharia(texto || campo.value || "");
        campo.dispatchEvent(new Event("input", { bubbles: true }));
        campo.focus();
        campo.setSelectionRange(campo.value.length, campo.value.length);

        atualizarEstadoToggleMesa();

        if (isMobile()) {
            fecharSidebarSilencioso();
        }

        return true;
    }

    function alternarMesaAvaliadora() {
        if (abrirMesaWidgetDedicado()) {
            atualizarEstadoToggleMesa();
            return;
        }

        const campo = obterCampoMensagem();
        if (!campo) return;

        if (/^eng\b/i.test(campo.value)) {
            campo.value = campo.value.replace(/^eng\b\s*/i, "");
        } else {
            campo.value = normalizarTextoEngenharia(campo.value);
        }

        campo.dispatchEvent(new Event("input", { bubbles: true }));
        campo.focus();
        campo.setSelectionRange(campo.value.length, campo.value.length);
        atualizarEstadoToggleMesa();

        if (isMobile()) {
            fecharSidebarSilencioso();
        }
    }

    const TIPOS_TOAST = {
        info: { icon: "info" },
        sucesso: { icon: "check_circle" },
        erro: { icon: "error" },
        aviso: { icon: "warning" },
    };

    function exibirToast(mensagem, tipo = "info", duracaoMs = 3000) {
        const config = TIPOS_TOAST[tipo] ?? TIPOS_TOAST.info;
        const texto = String(mensagem ?? "");
        const chave = `${tipo}:${texto}`;

        if (_toastsAtivos.has(chave)) return;
        _toastsAtivos.set(chave, true);

        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");
        toast.className = `toast-notificacao toast-${tipo}`;
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        toast.innerHTML = `
            <span class="material-symbols-rounded" aria-hidden="true">${config.icon}</span>
            <span>${escapeHTML(texto)}</span>
        `;

        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = "1";
            toast.style.transform = "translateY(0)";
        });

        let removido = false;

        const remover = () => {
            if (removido) return;
            removido = true;

            toast.style.opacity = "0";
            toast.style.transform = "translateY(8px)";

            setTimeout(() => {
                toast.remove();
                _toastsAtivos.delete(chave);
            }, 300);
        };

        toast.addEventListener("click", remover);
        setTimeout(remover, Math.max(1000, duracaoMs));
    }

    async function executarLogout() {
        if (!confirm("Deseja realmente sair do sistema Tariel WF?")) return;

        try {
            if (navigator.serviceWorker?.controller) {
                navigator.serviceWorker.controller.postMessage({ tipo: "LIMPAR_CACHE" });
            }
            window.location.replace("/app/logout");
        } catch (_) {
            window.location.replace("/admin/login");
        }
    }

    function inicializarSuporteEngenharia() {
        const campo = obterCampoMensagem();
        const btnToggle = document.getElementById("btn-toggle-humano");
        const btnSidebar = document.getElementById("btn-sidebar-engenheiro");

        if (btnToggle && btnToggle.dataset.uiWired !== "true") {
            btnToggle.dataset.uiWired = "true";
            btnToggle.addEventListener("click", alternarMesaAvaliadora);
        }

        if (btnSidebar && btnSidebar.dataset.uiWired !== "true") {
            btnSidebar.dataset.uiWired = "true";
            btnSidebar.addEventListener("click", alternarMesaAvaliadora);
        }

        campo?.addEventListener("input", atualizarEstadoToggleMesa);

        document.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === "i") {
                e.preventDefault();
                alternarMesaAvaliadora();
            }
        });

        atualizarEstadoToggleMesa();
    }

    function inicializarMenuLateral() {
        const btnMenu = document.getElementById("btn-menu");
        const sidebar = obterSidebar();
        const overlay = obterOverlaySidebar();

        if (!btnMenu || !sidebar || !overlay) return;

        // Estado inicial correto por viewport:
        // desktop = lateral visível; mobile = lateral fechada.
        definirEstadoSidebar(isMobile() ? false : !sidebar.classList.contains("oculta"));

        if (btnMenu.dataset.uiWired !== "true") {
            btnMenu.dataset.uiWired = "true";
            btnMenu.addEventListener("click", abrirFecharSidebar);
        }

        if (overlay.dataset.uiWired !== "true") {
            overlay.dataset.uiWired = "true";
            overlay.addEventListener("click", fecharSidebarSilencioso);
        }

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && sidebarEstaAberta(sidebar)) {
                fecharSidebarSilencioso();
            }
        });

        let mobileAnterior = isMobile();
        window.addEventListener("resize", () => {
            const mobileAtual = isMobile();
            if (mobileAtual === mobileAnterior) return;

            mobileAnterior = mobileAtual;

            if (mobileAtual) {
                definirEstadoSidebar(false);
                return;
            }

            definirEstadoSidebar(true);
        });
    }

    function inicializarModoFoco() {
        const btnToggle = document.getElementById("btn-toggle-ui");
        if (!btnToggle) return;

        aplicarModoFoco(obterModoFocoSalvo());

        if (btnToggle.dataset.uiWired !== "true") {
            btnToggle.dataset.uiWired = "true";
            btnToggle.addEventListener("click", () => {
                const isAtivo = document.body.classList.contains("modo-foco");
                aplicarModoFoco(!isAtivo);
            });
        }

        document.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
                e.preventDefault();
                btnToggle.click();
            }
        });
    }

    function inicializarLogoutForm() {
        qsa(".btn-logout").forEach((btn) => {
            if (btn.dataset.uiWired === "true") return;
            btn.dataset.uiWired = "true";

            btn.addEventListener("click", (e) => {
                e.preventDefault();
                executarLogout();
            });
        });
    }

    function inicializarLoginForm() {
        const btnEntrar = document.getElementById("btn-entrar");
        const form = btnEntrar?.closest("form");
        if (!btnEntrar || !form) return;

        definirLoadingBotao(btnEntrar, false, {
            iconIdle: "login",
            labelIdle: btnEntrar.textContent.trim() || "Entrar"
        });

        if (form.dataset.uiWired === "true") return;
        form.dataset.uiWired = "true";

        form.addEventListener("submit", () => {
            definirLoadingBotao(btnEntrar, true, {
                iconIdle: "login",
                labelIdle: btnEntrar.textContent.trim() || "Entrar",
                iconLoading: "sync",
                labelLoading: "Autenticando..."
            });
        });
    }

    function inicializarPins() {
        // Mantido por compatibilidade.
    }

    function inicializarChipModo() {
        const chips = qsa(".chip-modo-resposta");
        if (!chips.length) return;

        const modoSalvo = obterModo();
        let encontrouModoSalvo = false;

        chips.forEach((chip) => {
            const ativo = chip.dataset.modo === modoSalvo;
            chip.classList.toggle("ativo", ativo);
            chip.setAttribute("aria-pressed", String(ativo));
            if (ativo) encontrouModoSalvo = true;

            if (chip.dataset.uiWired === "true") return;
            chip.dataset.uiWired = "true";

            chip.addEventListener("click", () => {
                if (chip.classList.contains("chip-bloqueado-plano")) {
                    exibirToast("Modo disponível no plano Ilimitado.", "aviso");
                    return;
                }

                definirModo(chip.dataset.modo || "detalhado");
            });
        });

        if (!encontrouModoSalvo) {
            const primeiroDisponivel = chips.find((chip) => !chip.classList.contains("chip-bloqueado-plano"));
            if (primeiroDisponivel) {
                definirModo(primeiroDisponivel.dataset.modo || "detalhado");
            }
        }
    }

    function inicializarChipsSugestao() {
        const container = document.getElementById("sugestoes-rapidas");
        const setorSelect = document.getElementById("setor-industrial");

        const renderizar = () => {
            if (typeof window.TarielUI?.renderizarSugestoes === "function") {
                window.TarielUI.renderizarSugestoes(container);
            }
        };

        setorSelect?.addEventListener("change", renderizar);
        renderizar();
    }

    function inicializar() {
        if (document.documentElement.dataset.uiEvents === "wired") return;
        document.documentElement.dataset.uiEvents = "wired";

        log("info", "Iniciando módulos de interface...");

        inicializarMenuLateral();
        inicializarModoFoco();
        inicializarLoginForm();
        inicializarLogoutForm();
        inicializarPins();
        inicializarChipModo();
        inicializarChipsSugestao();
        inicializarSuporteEngenharia();

        obterCampoMensagem()?.focus();
    }

    window.TarielUI = {
        exibirToast,
        escapeHTML,
        modoFoco: aplicarModoFoco,
        fecharSidebar: fecharSidebarSilencioso,
        logout: executarLogout,
        obterModo,
        definirModo,
        ativarMesaAvaliadora,
        alternarMesaAvaliadora,
        obterMarcadorMesa: () => MARCADOR_ENG,
    };

    window.exibirToast = exibirToast;
    window.fecharSidebar = fecharSidebarSilencioso;

    document.addEventListener("DOMContentLoaded", inicializar);
})();
