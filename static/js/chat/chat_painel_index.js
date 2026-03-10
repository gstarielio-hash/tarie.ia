// ==========================================
// TARIEL CONTROL TOWER — CHAT_PAINEL_INDEX.JS
// Papel: orquestração final do ChatPainel.
// Responsável por:
// - aguardar o core ficar disponível
// - executar os boot tasks registrados
// - evitar boot duplicado
// - expor uma API pública de compatibilidade
//
// Dependência:
// - window.TarielChatPainel
// ==========================================

(function () {
    "use strict";

    if (window.__TARIEL_CHAT_PAINEL_INDEX_WIRED__) return;
    window.__TARIEL_CHAT_PAINEL_INDEX_WIRED__ = true;

    const MAX_TENTATIVAS_CORE = 40;
    const INTERVALO_TENTATIVA_MS = 100;
    const FLAG_BOOT_DATASET = "chatPainelBoot";

    const STATE = {
        bootAgendado: false,
    };

    // =========================================================
    // HELPERS
    // =========================================================

    function obterTP() {
        return window.TarielChatPainel || null;
    }

    function coreEstaDisponivel() {
        const TP = obterTP();
        return !!(TP && typeof TP.executarBootTasks === "function");
    }

    function bootJaExecutado() {
        return document.documentElement.dataset[FLAG_BOOT_DATASET] === "done";
    }

    function marcarBootComoExecutado() {
        document.documentElement.dataset[FLAG_BOOT_DATASET] = "done";
    }

    function logSeguro(nivel, ...args) {
        const TP = obterTP();

        if (typeof TP?.log === "function") {
            TP.log(nivel, ...args);
            return;
        }

        try {
            (console?.[nivel] ?? console?.log)?.call(
                console,
                "[Tariel ChatPainel]",
                ...args
            );
        } catch (_) {}
    }

    // =========================================================
    // API DE COMPATIBILIDADE
    // Mantém compatibilidade com partes antigas do sistema.
    // =========================================================

    function criarApiCompatibilidade(TP) {
        return {
            selecionarLaudo(...args) {
                return TP?.selecionarLaudo?.(...args);
            },

            obterLaudoAtual() {
                return (
                    window.TarielAPI?.obterLaudoAtualId?.() ||
                    TP?.obterLaudoIdDaURL?.() ||
                    TP?.state?.laudoAtualId ||
                    null
                );
            },

            atualizarBreadcrumb(...args) {
                return TP?.atualizarBreadcrumb?.(...args);
            },

            iniciarRelatorio(tipo) {
                return window.TarielAPI?.iniciarRelatorio?.(tipo);
            },

            finalizarRelatorio(...args) {
                return (
                    TP?.finalizarInspecaoCompleta?.(...args) ||
                    window.finalizarInspecaoCompleta?.(...args) ||
                    null
                );
            },

            atualizarBadge(...args) {
                return TP?.atualizarBadgeRelatorio?.(...args);
            },

            enviarParaMesaAvaliadora(...args) {
                return TP?.enviarParaMesaAvaliadora?.(...args);
            },

            ativarAtalhoMesa(...args) {
                return TP?.enviarParaMesaAvaliadora?.(...args);
            },

            boot() {
                return executarBootSeguro();
            },
        };
    }

    function exporApiCompatibilidade(TP) {
        if (!TP) return;

        const api = criarApiCompatibilidade(TP);

        if (!window.TarielScript) {
            window.TarielScript = api;
            return;
        }

        Object.assign(window.TarielScript, api);
    }

    // =========================================================
    // BOOT
    // =========================================================

    function executarBootSeguro() {
        const TP = obterTP();

        if (!TP) {
            logSeguro("warn", "Core do ChatPainel ainda não disponível.");
            return false;
        }

        if (bootJaExecutado()) {
            exporApiCompatibilidade(TP);
            logSeguro("info", "ChatPainel já inicializado.");
            return true;
        }

        try {
            TP.executarBootTasks?.();
            marcarBootComoExecutado();
            exporApiCompatibilidade(TP);

            logSeguro("info", "ChatPainel pronto.");
            return true;
        } catch (erro) {
            logSeguro("error", "Falha no boot do ChatPainel:", erro);
            return false;
        }
    }

    function agendarBootQuandoDOMEstiverPronto() {
        if (STATE.bootAgendado) return;
        STATE.bootAgendado = true;

        const boot = () => {
            executarBootSeguro();
        };

        const TP = obterTP();

        if (typeof TP?.onReady === "function") {
            TP.onReady(boot);
            return;
        }

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", boot, { once: true });
            return;
        }

        boot();
    }

    function iniciarQuandoCoreEstiverPronto(tentativa = 0) {
        if (!coreEstaDisponivel()) {
            if (tentativa >= MAX_TENTATIVAS_CORE) {
                console.error("[Tariel ChatPainel] Core não encontrado para inicialização do index.");
                return;
            }

            window.setTimeout(() => {
                iniciarQuandoCoreEstiverPronto(tentativa + 1);
            }, INTERVALO_TENTATIVA_MS);

            return;
        }

        const TP = obterTP();
        if (!TP) return;

        exporApiCompatibilidade(TP);
        agendarBootQuandoDOMEstiverPronto();
    }

    // =========================================================
    // INÍCIO
    // =========================================================

    iniciarQuandoCoreEstiverPronto();
})();