// ==========================================
// TARIEL CONTROL TOWER — CHAT_PAINEL_MESA.JS
// Papel: integração com mesa avaliadora (@insp).
// Responsável por:
// - normalizar prefixos da mesa avaliadora
// - ativar o modo de envio para engenharia/revisão
// - focar o campo de mensagem
// - bind do botão do composer e atalhos globais
//
// Dependência:
// - window.TarielChatPainel (core)
// ==========================================

(function () {
    "use strict";

    const TP = window.TarielChatPainel;
    if (!TP || TP.__mesaWired__) return;
    TP.__mesaWired__ = true;

    // =========================================================
    // CONFIGURAÇÃO
    // =========================================================

    // Prefixo oficial usado pelo backend para encaminhar a mensagem
    // ao fluxo da mesa avaliadora / engenharia.
    const PREFIXO_BASE = String(TP.config?.ATALHO_MESA_AVALIADORA || "@insp").trim() || "@insp";
    const PREFIXO_MESA = `${PREFIXO_BASE} `;

    // Todos os aliases aceitos no início da mensagem.
    // Exemplo:
    // - eng texto
    // - @eng texto
    // - @mesa texto
    // - revisor texto
    const REGEX_ALIAS_MESA_INICIAL = /^@?(insp|inspetor|eng|engenharia|revisor|mesa|avaliador|avaliacao)\b\s*[:\-]?\s*/i;

    // =========================================================
    // HELPERS
    // =========================================================

    function obterCampoMensagem() {
        return TP.obterCampoMensagem?.() || document.getElementById("campo-mensagem");
    }

    function obterBotaoComposerMesa() {
        return document.getElementById("btn-toggle-humano");
    }

    function possuiWidgetMesaDedicado() {
        return Boolean(
            document.getElementById("painel-mesa-widget") &&
            document.getElementById("mesa-widget-input")
        );
    }

    function abrirWidgetMesaDedicado(texto = "") {
        if (!possuiWidgetMesaDedicado()) return false;

        const painel = document.getElementById("painel-mesa-widget");
        const botaoToggle = document.getElementById("btn-mesa-widget-toggle");
        const input = document.getElementById("mesa-widget-input");

        const aberto =
            botaoToggle?.getAttribute("aria-expanded") === "true" ||
            painel?.classList.contains("aberto") ||
            (painel ? !painel.hidden : false);

        if (!aberto && botaoToggle) {
            botaoToggle.click();
        }

        const sugestao = String(texto || "")
            .replace(REGEX_ALIAS_MESA_INICIAL, "")
            .trim();

        if (input) {
            if (sugestao && !String(input.value || "").trim()) {
                input.value = sugestao;
                input.dispatchEvent(new Event("input", { bubbles: true }));
            }

            try {
                input.focus({ preventScroll: true });
            } catch (_) {
                input.focus();
            }

            try {
                const fim = input.value.length;
                input.setSelectionRange(fim, fim);
            } catch (_) { }
        }

        fecharSidebarMobile();
        return true;
    }

    function fecharSidebarMobile() {
        if (window.innerWidth >= 768) return;

        // Primeiro tenta usar a infraestrutura global, se existir.
        window.TarielUI?.fecharSidebar?.();

        // Fallback defensivo.
        const sidebar =
            document.getElementById("barra-historico") ||
            document.getElementById("sidebar");
        const overlay = document.getElementById("overlay-sidebar");

        sidebar?.classList.remove("aberta", "aberto");
        overlay?.classList.remove("ativo");
        document.body.classList.remove("sidebar-aberta");
    }

    function posicionarCursorNoFinal(campo) {
        if (!campo) return;

        try {
            const fim = campo.value.length;
            campo.setSelectionRange(fim, fim);
        } catch (_) { }
    }

    function focarCampoMensagem(campo) {
        if (!campo) return;

        try {
            campo.focus({ preventScroll: true });
        } catch (_) {
            campo.focus();
        }

        posicionarCursorNoFinal(campo);
    }

    function sincronizarUIComposer(campo, houveMudanca) {
        if (!campo) return;

        if (houveMudanca) {
            campo.dispatchEvent(new Event("input", { bubbles: true }));
            campo.dispatchEvent(new Event("change", { bubbles: true }));
            return;
        }

        TP.atualizarEstadoBotao?.();
        TP.atualizarContadorChars?.();
    }

    function textoJaEstaNoModoMesa(texto) {
        return /^@insp\b/i.test(String(texto || "").trimStart());
    }

    // Normaliza qualquer alias de entrada para o prefixo oficial @insp.
    // Exemplos:
    // "eng preciso de ajuda"      -> "@insp preciso de ajuda"
    // "@engenharia revisar isso"  -> "@insp revisar isso"
    // "@mesa: analisar laudo"     -> "@insp analisar laudo"
    // "texto comum"               -> "@insp texto comum"
    // ""                          -> "@insp "
    function normalizarTextoMesa(texto) {
        const bruto = String(texto || "");
        const semEspacosIniciais = bruto.replace(/^\s+/, "");

        if (!semEspacosIniciais.trim()) {
            return PREFIXO_MESA;
        }

        if (textoJaEstaNoModoMesa(semEspacosIniciais)) {
            const semPrefixoDuplicado = semEspacosIniciais.replace(/^@insp\b\s*[:\-]?\s*/i, "");
            return semPrefixoDuplicado
                ? `${PREFIXO_MESA}${semPrefixoDuplicado}`.trimEnd()
                : PREFIXO_MESA;
        }

        if (REGEX_ALIAS_MESA_INICIAL.test(semEspacosIniciais)) {
            const semAlias = semEspacosIniciais.replace(REGEX_ALIAS_MESA_INICIAL, "");
            return semAlias
                ? `${PREFIXO_MESA}${semAlias}`.trimEnd()
                : PREFIXO_MESA;
        }

        return `${PREFIXO_MESA}${semEspacosIniciais}`.trimEnd();
    }

    // =========================================================
    // API DE MESA AVALIADORA
    // =========================================================

    // Apenas ativa/preenche o composer com o prefixo @insp.
    // Não dispara envio automático.
    function ativarMesaAvaliadora(texto = "") {
        if (abrirWidgetMesaDedicado(texto)) {
            return true;
        }

        const campo = obterCampoMensagem();
        if (!campo) return false;

        const valorAtual = String(campo.value || "");
        const base = texto || valorAtual;
        const valorNormalizado = normalizarTextoMesa(base);

        const houveMudanca = valorAtual !== valorNormalizado;
        campo.value = valorNormalizado;

        sincronizarUIComposer(campo, houveMudanca);
        focarCampoMensagem(campo);
        fecharSidebarMobile();

        TP.emitir?.("tariel:mesa-avaliadora-ativada", {
            atalho: "@insp",
            valor: campo.value,
            alterado: houveMudanca,
        });

        return true;
    }

    // Atalho de conveniência para UI.
    function enviarParaMesaAvaliadora(texto = "") {
        const ok = ativarMesaAvaliadora(texto);

        if (!ok) {
            TP.toast?.("Campo de mensagem não encontrado.", "erro", 3000);
            return false;
        }

        if (possuiWidgetMesaDedicado()) {
            TP.toast?.("Chat da mesa avaliadora aberto.", "info", 1800);
            return true;
        }

        TP.toast?.("Atalho @insp ativado para a mesa avaliadora.", "info", 1800);
        return true;
    }

    // =========================================================
    // ATALHOS E GATILHOS
    // =========================================================

    function deveIgnorarAtalhoTeclado(evento) {
        if (!evento) return true;
        if (evento.defaultPrevented) return true;
        if (evento.isComposing) return true;
        if (evento.repeat) return true;

        const alvo = evento.target;
        if (!alvo) return false;

        // Permite uso dentro do textarea/input,
        // mas bloqueia em selects e áreas explicitamente marcadas.
        const tag = String(alvo.tagName || "").toLowerCase();

        if (tag === "select" || tag === "option") {
            return true;
        }

        if (alvo.closest?.('[data-bloquear-atalho-mesa="true"]')) {
            return true;
        }

        return false;
    }

    function onClickBotaoMesa() {
        enviarParaMesaAvaliadora();
    }

    function onClickGatilhoDelegado(evento) {
        const gatilho = evento.target.closest(
            "[data-atalho-mesa='insp'], [data-abrir-mesa-avaliadora='true']"
        );
        if (!gatilho) return;

        evento.preventDefault();

        enviarParaMesaAvaliadora(
            gatilho.dataset?.textoMesa ||
            gatilho.getAttribute("data-texto-mesa") ||
            ""
        );
    }

    function onKeydownAtalhoMesa(evento) {
        if (deveIgnorarAtalhoTeclado(evento)) return;

        const tecla = String(evento.key || "").toLowerCase();
        const atalhoPressionado =
            (evento.ctrlKey || evento.metaKey) &&
            evento.altKey &&
            tecla === "i";

        if (!atalhoPressionado) return;

        evento.preventDefault();
        enviarParaMesaAvaliadora();
    }

    function onEventoProgramaticoMesa(evento) {
        const texto =
            evento?.detail?.texto ||
            evento?.detail?.mensagem ||
            "";

        ativarMesaAvaliadora(texto);
    }

    // =========================================================
    // BIND
    // =========================================================

    function wireBotaoComposerMesa() {
        const botao = obterBotaoComposerMesa();
        if (!botao || botao.dataset.boundMesa === "true") return;

        botao.dataset.boundMesa = "true";
        botao.addEventListener("click", onClickBotaoMesa);
    }

    function wireMesaAvaliadoraHooks() {
        if (TP.state?.flags?.mesaHooksBound) return;
        TP.state.flags.mesaHooksBound = true;

        wireBotaoComposerMesa();

        document.addEventListener("click", onClickGatilhoDelegado);
        document.addEventListener("keydown", onKeydownAtalhoMesa);

        // Gatilho programático para outros módulos.
        document.addEventListener("tariel:ativar-mesa-avaliadora", onEventoProgramaticoMesa);
        document.addEventListener("tarielativar-mesa-avaliadora", onEventoProgramaticoMesa);
    }

    // =========================================================
    // BOOT
    // =========================================================

    TP.registrarBootTask("chat_painel_mesa", () => {
        wireMesaAvaliadoraHooks();
    });

    // =========================================================
    // EXPORTS
    // =========================================================

    Object.assign(TP, {
        normalizarTextoMesa,
        ativarMesaAvaliadora,
        enviarParaMesaAvaliadora,
        wireMesaAvaliadoraHooks,
    });
})();
