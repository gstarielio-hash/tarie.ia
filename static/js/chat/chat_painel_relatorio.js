// ==========================================
// TARIEL CONTROL TOWER — CHAT_PAINEL_RELATORIO.JS
// Papel: fluxo de relatório no painel do chat.
// Responsável por:
// - finalizar inspeção / relatório
// - sincronizar badge visual do histórico
// - bloquear/desbloquear rodapé durante finalização
// - refletir estado do relatório na UI
//
// Dependência:
// - window.TarielChatPainel (core + laudos)
// - window.TarielAPI (network)
// ==========================================

(function () {
    "use strict";

    const TP = window.TarielChatPainel;
    if (!TP || TP.__relatorioWired__) return;
    TP.__relatorioWired__ = true;

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

        if (estado === "aguardando" || estado === "aguardando_avaliacao") {
            return "aguardando";
        }

        return estado || "sem_relatorio";
    }

    function obterTipoTemplateAtivo() {
        return String(window.tipoTemplateAtivo || "padrao").trim().toLowerCase() || "padrao";
    }

    function obterLaudoAtualSeguro() {
        const viaApi = window.TarielAPI?.obterLaudoAtualId?.();
        const viaState = TP.state?.laudoAtualId;
        const viaUrl = TP.obterLaudoIdDaURL?.();
        const valor = viaApi || viaState || viaUrl || null;

        const id = Number(valor);
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    function obterEstadoAtualSeguro() {
        const viaApi =
            window.TarielAPI?.obterEstadoRelatorioNormalizado?.() ||
            window.TarielAPI?.obterEstadoRelatorio?.();

        const viaState = TP.state?.estadoRelatorio;
        return normalizarEstadoRelatorio(viaApi || viaState || "sem_relatorio");
    }

    function definirLaudoAtualNoCore(laudoId) {
        const id = Number(laudoId);
        const laudoNormalizado = Number.isFinite(id) && id > 0 ? id : null;

        TP.state.laudoAtualId = laudoNormalizado;
        TP.persistirLaudoAtual?.(laudoNormalizado || "");

        document.body.dataset.laudoAtualId = laudoNormalizado
            ? String(laudoNormalizado)
            : "";
    }

    function definirEstadoRelatorioNoCore(estado) {
        const estadoNormalizado = normalizarEstadoRelatorio(estado);
        TP.state.estadoRelatorio = estadoNormalizado;
        document.body.dataset.estadoRelatorio = estadoNormalizado;
    }

    function bloquearUIFinalizacao() {
        document.body.dataset.finalizandoLaudo = "true";
        TP.setRodapeBloqueado?.(true);
        TP.agendarFailsafeFinalizacao?.();
    }

    function desbloquearUIFinalizacao() {
        document.body.dataset.finalizandoLaudo = "false";
        TP.limparFailsafeFinalizacao?.();
        TP.setRodapeBloqueado?.(false);
    }

    function finalizacaoEmAndamento() {
        return document.body.dataset.finalizandoLaudo === "true";
    }

    function limparBadgeAtivo() {
        TP.limparBadgesRelatorio?.("ativo");
    }

    function limparBadgeAguardando() {
        TP.limparBadgesRelatorio?.("aguardando");
    }

    function limparTodosBadgesDeRelatorio() {
        limparBadgeAtivo();
        limparBadgeAguardando();
    }

    function marcarLaudoComoAtivo(laudoId) {
        const id = Number(laudoId);
        if (!Number.isFinite(id) || id <= 0) return;

        limparBadgeAtivo();
        TP.atualizarBadgeRelatorio?.(id, "ativo");
        TP.setAtivoNoHistorico?.(id);
        TP.atualizarBreadcrumb?.(id);
        TP.persistirLaudoAtual?.(id);
        TP.definirLaudoIdNaURL?.(id, { replace: true });

        definirLaudoAtualNoCore(id);
        definirEstadoRelatorioNoCore("relatorio_ativo");
    }

    function marcarLaudoComoAguardando(laudoId) {
        const id = Number(laudoId);
        if (!Number.isFinite(id) || id <= 0) return;

        limparBadgeAtivo();
        TP.atualizarBadgeRelatorio?.(id, "aguardando");
        TP.persistirLaudoAtual?.(id);

        definirLaudoAtualNoCore(id);
        definirEstadoRelatorioNoCore("aguardando");
    }

    function limparEstadoVisualDeRelatorioAtivo() {
        limparBadgeAtivo();
        desbloquearUIFinalizacao();
        definirEstadoRelatorioNoCore("sem_relatorio");
    }

    // =========================================================
    // FINALIZAÇÃO PRINCIPAL
    // =========================================================

    async function finalizarInspecaoCompleta() {
        const laudoId = obterLaudoAtualSeguro();
        const tipoTemplate = obterTipoTemplateAtivo();
        const estadoAtual = obterEstadoAtualSeguro();

        if (!laudoId) {
            TP.toast?.("Não há laudo ativo para finalizar.", "erro", 3000);
            return null;
        }

        if (finalizacaoEmAndamento()) {
            TP.toast?.("A finalização já está em andamento.", "aviso", 2500);
            return null;
        }

        if (estadoAtual !== "relatorio_ativo") {
            TP.toast?.("Este laudo não está em estado ativo para finalização.", "aviso", 3000);
            return null;
        }

        TP.log?.("info", `Finalizando laudo ${laudoId} com template ${tipoTemplate}.`);

        bloquearUIFinalizacao();
        marcarLaudoComoAguardando(laudoId);

        try {
            const resposta = await window.TarielAPI?.finalizarRelatorio?.({
                tipoTemplate,
            });

            if (!resposta) {
                throw new Error("FINALIZACAO_SEM_RESPOSTA");
            }

            marcarLaudoComoAguardando(laudoId);
            desbloquearUIFinalizacao();

            TP.emitir?.("tariel:finalizacao-ui-concluida", {
                laudoId,
                tipoTemplate,
            });

            return resposta;
        } catch (erro) {
            TP.log?.("error", "Falha ao finalizar inspeção:", erro);

            desbloquearUIFinalizacao();
            marcarLaudoComoAtivo(laudoId);

            TP.toast?.("Erro ao tentar finalizar a inspeção.", "erro", 3500);
            return null;
        }
    }

    // =========================================================
    // SINCRONIZAÇÃO DE ESTADO NA UI
    // =========================================================

    function sincronizarEstadoRelatorioNaUI(dados = {}) {
        const estadoRecebido =
            dados.estado ??
            window.TarielAPI?.obterEstadoRelatorioNormalizado?.() ??
            window.TarielAPI?.obterEstadoRelatorio?.() ??
            TP.state?.estadoRelatorio;

        const laudoIdRecebido =
            dados.laudo_id ??
            dados.laudoId ??
            window.TarielAPI?.obterLaudoAtualId?.() ??
            TP.state?.laudoAtualId ??
            TP.obterLaudoIdDaURL?.();

        const estado = normalizarEstadoRelatorio(estadoRecebido);
        const laudoId = Number(laudoIdRecebido) || null;

        TP.log?.("info", "Sincronizando estado do relatório na UI:", {
            estado,
            laudoId,
        });

        if (estado === "relatorio_ativo" && laudoId) {
            marcarLaudoComoAtivo(laudoId);
            desbloquearUIFinalizacao();
            return;
        }

        if (estado === "aguardando" && laudoId) {
            marcarLaudoComoAguardando(laudoId);
            desbloquearUIFinalizacao();
            return;
        }

        if (estado === "sem_relatorio") {
            limparEstadoVisualDeRelatorioAtivo();
        }
    }

    // =========================================================
    // HANDLERS DE EVENTOS
    // =========================================================

    function handleRelatorioIniciado(evento) {
        const laudoId = Number(
            evento?.detail?.laudoId ||
            evento?.detail?.laudo_id ||
            0
        ) || null;

        if (!laudoId) return;

        TP.log?.("info", `Evento de relatório iniciado recebido para laudo ${laudoId}.`);

        marcarLaudoComoAtivo(laudoId);
        desbloquearUIFinalizacao();
    }

    function handleRelatorioFinalizado(evento) {
        const laudoId = Number(
            evento?.detail?.laudoId ||
            evento?.detail?.laudo_id ||
            0
        ) || obterLaudoAtualSeguro();

        if (!laudoId) {
            desbloquearUIFinalizacao();
            definirEstadoRelatorioNoCore("aguardando");
            return;
        }

        TP.log?.("info", `Evento de relatório finalizado recebido para laudo ${laudoId}.`);

        marcarLaudoComoAguardando(laudoId);
        desbloquearUIFinalizacao();
    }

    function handleRelatorioCancelado() {
        TP.log?.("info", "Evento de cancelamento de relatório recebido.");

        limparBadgeAtivo();
        desbloquearUIFinalizacao();
        definirEstadoRelatorioNoCore("sem_relatorio");
    }

    function handleEstadoRelatorio(evento) {
        sincronizarEstadoRelatorioNaUI(evento?.detail || {});
    }

    // =========================================================
    // BIND
    // =========================================================

    function bindEventosRelatorio() {
        document.addEventListener("tariel:relatorio-iniciado", handleRelatorioIniciado);
        document.addEventListener("tarielrelatorio-iniciado", handleRelatorioIniciado);

        document.addEventListener("tariel:relatorio-finalizado", handleRelatorioFinalizado);
        document.addEventListener("tarielrelatorio-finalizado", handleRelatorioFinalizado);

        document.addEventListener("tariel:cancelar-relatorio", handleRelatorioCancelado);
        document.addEventListener("tarielrelatorio-cancelado", handleRelatorioCancelado);

        document.addEventListener("tariel:estado-relatorio", handleEstadoRelatorio);
    }

    function bindFinalizacaoAoUnload() {
        window.addEventListener("pagehide", () => {
            TP.limparFailsafeFinalizacao?.();
            document.body.dataset.finalizandoLaudo = "false";
        });
    }

    // =========================================================
    // BOOT
    // =========================================================

    TP.registrarBootTask("chat_painel_relatorio", () => {
        bindEventosRelatorio();
        bindFinalizacaoAoUnload();
        sincronizarEstadoRelatorioNaUI();
        return true;
    });

    // Compatibilidade com index/page e legado.
    window.finalizarInspecaoCompleta = finalizarInspecaoCompleta;

    Object.assign(TP, {
        finalizarInspecaoCompleta,
        sincronizarEstadoRelatorioNaUI,
        normalizarEstadoRelatorio,
    });
})();