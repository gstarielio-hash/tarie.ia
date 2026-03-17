// ==========================================
// TARIEL CONTROL TOWER — API-CORE.JS
// Base compartilhada: logs, CSRF, escape, toast,
// validações simples e utilitários de ambiente.
// ==========================================

(function () {
    "use strict";

    if (window.TarielCore) return;

    const EM_PRODUCAO =
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1";

    function log(nivel, ...args) {
        if (EM_PRODUCAO && nivel !== "error") return;

        try {
            if (EM_PRODUCAO) {
                console.error("[Tariel]", args[0] ?? "Erro");
                return;
            }
            (console?.[nivel] ?? console?.log)?.call(console, "[Tariel]", ...args);
        } catch (_) { }
    }

    function obterCSRFToken() {
        return document.querySelector('meta[name="csrf-token"]')?.content?.trim() ?? "";
    }

    const CSRF_TOKEN = obterCSRFToken();

    if (!CSRF_TOKEN) {
        log("warn", "CSRF token não encontrado.");
    }

    function escapeHTML(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    let _toastTimer = null;
    let _toastEl = null;

    const ICONES_TOAST = {
        sucesso: "check_circle",
        erro: "error",
        aviso: "warning",
        info: "info",
    };

    function _obterToastEl() {
        if (_toastEl?.isConnected) return _toastEl;
        if (!document.body) return null;

        _toastEl = document.createElement("div");
        _toastEl.className = "toast-notificacao";
        _toastEl.setAttribute("role", "status");
        _toastEl.setAttribute("aria-live", "polite");
        document.body.appendChild(_toastEl);

        return _toastEl;
    }

    function mostrarToast(mensagem, tipo = "erro", duracaoMs = 4000) {
        if (typeof window.exibirToast === "function") {
            window.exibirToast(String(mensagem ?? ""), tipo, duracaoMs);
            return;
        }

        const el = _obterToastEl();
        if (!el) return;

        const icone = ICONES_TOAST[tipo] ?? "info";
        const tempo = Number.isFinite(duracaoMs) ? Math.max(1000, duracaoMs) : 4000;

        el.className = `toast-notificacao toast-${tipo}`;
        el.innerHTML = `
            <span class="material-symbols-rounded" aria-hidden="true">${icone}</span>
            <span>${escapeHTML(mensagem)}</span>
        `;

        clearTimeout(_toastTimer);
        el.classList.remove("visivel");
        void el.offsetWidth;
        el.classList.add("visivel");

        _toastTimer = setTimeout(() => {
            el.classList.remove("visivel");
        }, tempo);
    }

    function comCabecalhoCSRF(headers = {}) {
        const token = obterCSRFToken();
        return {
            ...headers,
            ...(token ? { "X-CSRF-Token": token } : {}),
        };
    }

    function criarFormDataComCSRF(extra = {}) {
        const form = new FormData();
        const token = obterCSRFToken();

        if (token) form.append("csrf_token", token);

        Object.entries(extra).forEach(([chave, valor]) => {
            if (valor !== undefined && valor !== null) {
                form.append(chave, valor);
            }
        });

        return form;
    }

    function validarPrefixoBase64(base64) {
        if (typeof base64 !== "string") return "";

        const valor = base64.trim();
        const prefixos = [
            "data:image/jpeg;base64,",
            "data:image/jpg;base64,",
            "data:image/png;base64,",
            "data:image/webp;base64,",
            "data:image/gif;base64,",
        ];

        return prefixos.some((p) => valor.startsWith(p)) ? valor : "";
    }

    const SETORES_VALIDOS = new Set([
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
    ]);

    function sanitizarSetor(setor) {
        const valor = String(setor || "").trim().toLowerCase();
        return SETORES_VALIDOS.has(valor) ? valor : "geral";
    }

    window.TarielCore = {
        EM_PRODUCAO,
        CSRF_TOKEN,
        ICONES_TOAST,
        SETORES_VALIDOS,
        log,
        escapeHTML,
        mostrarToast,
        validarPrefixoBase64,
        sanitizarSetor,
        comCabecalhoCSRF,
        criarFormDataComCSRF,
        obterCSRFToken,
    };
})();
