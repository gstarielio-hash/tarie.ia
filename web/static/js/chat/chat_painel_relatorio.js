// ==========================================
// TARIEL CONTROL TOWER — CHAT_PAINEL_RELATORIO.JS
// Papel: fluxo de relatório no painel do chat.
// Responsável por:
// - finalizar inspeção / relatório
// - refletir estado do laudo na UI
// - bloquear/desbloquear composer em modo leitura
// - oferecer reabertura manual após ajustes da mesa
// ==========================================

(function () {
    "use strict";

    const TP = window.TarielChatPainel;
    if (!TP || TP.__relatorioWired__) return;
    TP.__relatorioWired__ = true;

    const ESTADOS_LEITURA = new Set(["aguardando", "ajustes", "aprovado"]);

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

    function homeForcadoAtivo() {
        return document.body.dataset.forceHomeLanding === "true";
    }

    function definirLaudoAtualNoCore(laudoId) {
        const id = Number(laudoId);
        const laudoNormalizado = Number.isFinite(id) && id > 0 ? id : null;

        TP.state.laudoAtualId = laudoNormalizado;
        TP.persistirLaudoAtual?.(laudoNormalizado || "");
        document.body.dataset.laudoAtualId = laudoNormalizado ? String(laudoNormalizado) : "";
    }

    function definirEstadoRelatorioNoCore(estado) {
        const estadoNormalizado = normalizarEstadoRelatorio(estado);
        TP.state.estadoRelatorio = estadoNormalizado;
        document.body.dataset.estadoRelatorio = estadoNormalizado;
    }

    function obterAvisoBloqueio() {
        return document.getElementById("aviso-laudo-bloqueado");
    }

    function obterTituloAviso() {
        return document.getElementById("aviso-laudo-bloqueado-titulo");
    }

    function obterDescricaoAviso() {
        return document.getElementById("aviso-laudo-bloqueado-descricao");
    }

    function obterBotaoReabrir() {
        return document.getElementById("btn-reabrir-laudo");
    }

    function obterBotaoFinalizar() {
        return document.getElementById("btn-finalizar-inspecao");
    }

    function obterCampoMensagem() {
        return document.getElementById("campo-mensagem");
    }

    function obterMesaWidgetInput() {
        return document.getElementById("mesa-widget-input");
    }

    function obterMesaWidgetEnviar() {
        return document.getElementById("mesa-widget-enviar");
    }

    function atualizarAcaoFinalizar({ visivel, desabilitado = false, busy = false } = {}) {
        const btn = obterBotaoFinalizar();
        if (!btn) return;

        btn.hidden = !visivel;
        btn.disabled = !!desabilitado;
        btn.setAttribute("aria-busy", String(!!busy));
    }

    function configurarCampoMensagemSomenteLeitura(ativo, placeholderBloqueio = "") {
        const campo = obterCampoMensagem();
        if (!campo) return;

        if (!campo.dataset.placeholderOriginal) {
            campo.dataset.placeholderOriginal = campo.getAttribute("placeholder") || "";
        }

        campo.readOnly = !!ativo;
        campo.setAttribute("aria-readonly", String(!!ativo));
        campo.classList.toggle("campo-somente-leitura", !!ativo);

        if (ativo && placeholderBloqueio) {
            campo.setAttribute("placeholder", placeholderBloqueio);
            return;
        }

        campo.setAttribute("placeholder", campo.dataset.placeholderOriginal || "");
    }

    function configurarMesaWidgetSomenteLeitura(ativo, placeholderBloqueio = "") {
        const input = obterMesaWidgetInput();
        const btnEnviar = obterMesaWidgetEnviar();

        if (input) {
            if (!input.dataset.placeholderOriginal) {
                input.dataset.placeholderOriginal = input.getAttribute("placeholder") || "";
            }
            input.disabled = !!ativo;
            input.setAttribute("aria-disabled", String(!!ativo));
            input.setAttribute(
                "placeholder",
                ativo && placeholderBloqueio
                    ? placeholderBloqueio
                    : (input.dataset.placeholderOriginal || "")
            );
        }

        if (btnEnviar) {
            btnEnviar.disabled = !!ativo;
            btnEnviar.setAttribute("aria-disabled", String(!!ativo));
        }
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

    function ocultarAvisoLaudoBloqueado() {
        const aviso = obterAvisoBloqueio();
        const btnReabrir = obterBotaoReabrir();
        if (aviso) {
            aviso.hidden = true;
            aviso.dataset.status = "";
        }
        if (btnReabrir) {
            btnReabrir.hidden = true;
            btnReabrir.disabled = false;
            btnReabrir.removeAttribute("aria-busy");
        }
    }

    function mostrarAvisoLaudoBloqueado(estado, { permiteReabrir = false } = {}) {
        const aviso = obterAvisoBloqueio();
        const titulo = obterTituloAviso();
        const descricao = obterDescricaoAviso();
        const btnReabrir = obterBotaoReabrir();
        if (!aviso || !titulo || !descricao) return;

        let tituloTexto = "Laudo em modo leitura";
        let descricaoTexto = "Este laudo está temporariamente bloqueado para novas mensagens.";

        if (estado === "aguardando") {
            tituloTexto = "Laudo aguardando análise da mesa";
            descricaoTexto = "A mesa avaliadora ainda está revisando este laudo. Novas mensagens ficam bloqueadas até haver retorno.";
        } else if (estado === "ajustes") {
            tituloTexto = "Ajustes solicitados pela mesa";
            descricaoTexto = "A mesa respondeu com ajustes. Reabra a inspeção para continuar a conversa e complementar o laudo.";
        } else if (estado === "aprovado") {
            tituloTexto = "Laudo aprovado pela mesa";
            descricaoTexto = "Este laudo foi aprovado e agora está disponível apenas para consulta.";
        }

        titulo.textContent = tituloTexto;
        descricao.textContent = descricaoTexto;
        aviso.dataset.status = estado;
        aviso.hidden = false;

        if (btnReabrir) {
            btnReabrir.hidden = !(estado === "ajustes" && permiteReabrir);
        }
    }

    function obterPlaceholderBloqueio(estado) {
        if (estado === "aguardando") {
            return "Laudo aguardando retorno da mesa avaliadora...";
        }
        if (estado === "ajustes") {
            return "Reabra a inspeção para continuar após os ajustes da mesa...";
        }
        if (estado === "aprovado") {
            return "Laudo aprovado. Este histórico está somente leitura.";
        }
        return "";
    }

    function obterStatusCardPorEstado(estado) {
        if (estado === "relatorio_ativo") return "aberto";
        if (estado === "aguardando") return "aguardando";
        if (estado === "ajustes") return "ajustes";
        if (estado === "aprovado") return "aprovado";
        return null;
    }

    function selecionarCardHistorico(laudoId) {
        const id = Number(laudoId);
        if (!Number.isFinite(id) || id <= 0) return;

        TP.setAtivoNoHistorico?.(id);
        TP.atualizarBreadcrumb?.(id);
        TP.definirLaudoIdNaURL?.(id, { replace: true });
    }

    function aplicarModoLaudoSelecionado({ laudoId, estado, permiteReabrir = false } = {}) {
        const id = Number(laudoId);
        if (!Number.isFinite(id) || id <= 0) {
            TP.limparSelecaoAtual?.();
            ocultarAvisoLaudoBloqueado();
            desbloquearUIFinalizacao();
            configurarCampoMensagemSomenteLeitura(false);
            configurarMesaWidgetSomenteLeitura(false);
            atualizarAcaoFinalizar({ visivel: false });
            definirEstadoRelatorioNoCore("sem_relatorio");
            return;
        }

        const estadoNormalizado = normalizarEstadoRelatorio(estado);
        const statusCard = obterStatusCardPorEstado(estadoNormalizado);

        document.body.dataset.forceHomeLanding = "false";
        selecionarCardHistorico(id);
        definirLaudoAtualNoCore(id);
        definirEstadoRelatorioNoCore(estadoNormalizado);

        if (statusCard) {
            TP.atualizarBadgeRelatorio?.(id, statusCard);
        }

        if (estadoNormalizado === "relatorio_ativo") {
            ocultarAvisoLaudoBloqueado();
            configurarCampoMensagemSomenteLeitura(false);
            configurarMesaWidgetSomenteLeitura(false);
            atualizarAcaoFinalizar({ visivel: true, desabilitado: false });
            desbloquearUIFinalizacao();
            return;
        }

        if (ESTADOS_LEITURA.has(estadoNormalizado)) {
            mostrarAvisoLaudoBloqueado(estadoNormalizado, { permiteReabrir });
            configurarCampoMensagemSomenteLeitura(true, obterPlaceholderBloqueio(estadoNormalizado));
            configurarMesaWidgetSomenteLeitura(true, obterPlaceholderBloqueio(estadoNormalizado));
            atualizarAcaoFinalizar({ visivel: false, desabilitado: true });
            desbloquearUIFinalizacao();
            TP.setRodapeBloqueado?.(true);
            return;
        }

        ocultarAvisoLaudoBloqueado();
        configurarCampoMensagemSomenteLeitura(false);
        configurarMesaWidgetSomenteLeitura(false);
        atualizarAcaoFinalizar({ visivel: false });
        desbloquearUIFinalizacao();
    }

    async function finalizarInspecaoCompleta() {
        const laudoId = obterLaudoAtualSeguro();
        const tipoTemplate = obterTipoTemplateAtivo();
        const estadoAtual = obterEstadoAtualSeguro();

        if (!laudoId) {
            TP.toast?.("Não há laudo selecionado para finalizar.", "erro", 3000);
            return null;
        }

        if (finalizacaoEmAndamento()) {
            TP.toast?.("A finalização já está em andamento.", "aviso", 2500);
            return null;
        }

        if (estadoAtual !== "relatorio_ativo") {
            TP.toast?.("Somente laudos abertos podem ser finalizados.", "aviso", 3000);
            return null;
        }

        TP.log?.("info", `Finalizando laudo ${laudoId} com template ${tipoTemplate}.`);

        bloquearUIFinalizacao();
        aplicarModoLaudoSelecionado({
            laudoId,
            estado: "aguardando",
            permiteReabrir: false,
        });

        try {
            const resposta = await window.TarielAPI?.finalizarRelatorio?.({
                tipoTemplate,
            });

            if (!resposta) {
                throw new Error("FINALIZACAO_SEM_RESPOSTA");
            }

            sincronizarEstadoRelatorioNaUI(resposta);

            TP.emitir?.("tariel:finalizacao-ui-concluida", {
                laudoId,
                tipoTemplate,
            });

            return resposta;
        } catch (erro) {
            TP.log?.("error", "Falha ao finalizar inspeção:", erro);
            aplicarModoLaudoSelecionado({
                laudoId,
                estado: "relatorio_ativo",
                permiteReabrir: false,
            });
            desbloquearUIFinalizacao();
            TP.toast?.("Erro ao tentar finalizar a inspeção.", "erro", 3500);
            return null;
        }
    }

    async function reabrirLaudoAtual() {
        const laudoId = obterLaudoAtualSeguro();
        const btn = obterBotaoReabrir();

        if (!laudoId) {
            TP.toast?.("Nenhum laudo selecionado para reabrir.", "aviso", 2600);
            return null;
        }

        if (!window.TarielAPI?.reabrirLaudo) {
            TP.toast?.("A reabertura do laudo não está disponível agora.", "erro", 3200);
            return null;
        }

        if (btn) {
            btn.disabled = true;
            btn.setAttribute("aria-busy", "true");
        }

        try {
            const resposta = await window.TarielAPI.reabrirLaudo(laudoId);
            if (resposta) {
                sincronizarEstadoRelatorioNaUI(resposta);
                TP.toast?.(
                    resposta?.message || "Inspeção reaberta com sucesso.",
                    "sucesso",
                    2400
                );
            }
            return resposta;
        } catch (erro) {
            TP.log?.("error", "Falha ao reabrir laudo:", erro);
            TP.toast?.(
                String(erro?.message || "Não foi possível reabrir este laudo."),
                "erro",
                3200
            );
            return null;
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.removeAttribute("aria-busy");
            }
        }
    }

    function sincronizarEstadoRelatorioNaUI(dados = {}) {
        const estadoRecebido =
            dados.estado ??
            window.TarielAPI?.obterEstadoRelatorioNormalizado?.() ??
            window.TarielAPI?.obterEstadoRelatorio?.() ??
            TP.state?.estadoRelatorio;

        const laudoIdRecebido =
            dados.laudo_id ??
            dados.laudoId ??
            dados?.laudo_card?.id ??
            window.TarielAPI?.obterLaudoAtualId?.() ??
            TP.state?.laudoAtualId ??
            TP.obterLaudoIdDaURL?.();

        const estado = normalizarEstadoRelatorio(estadoRecebido);
        const laudoId = Number(laudoIdRecebido) || null;
        const permiteReabrir = !!(dados.permite_reabrir ?? dados?.laudo_card?.permite_reabrir);

        TP.log?.("info", "Sincronizando estado do relatório na UI:", {
            estado,
            laudoId,
            permiteReabrir,
        });

        if (homeForcadoAtivo() && estado !== "sem_relatorio") {
            TP.log?.("info", "Sincronização automática ignorada por Home forçado.");
            return;
        }

        if (estado === "sem_relatorio") {
            aplicarModoLaudoSelecionado({ laudoId: null, estado });
            return;
        }

        aplicarModoLaudoSelecionado({
            laudoId,
            estado,
            permiteReabrir,
        });
    }

    function handleRelatorioIniciado(evento) {
        const laudoId = Number(
            evento?.detail?.laudoId ||
            evento?.detail?.laudo_id ||
            0
        ) || null;

        if (!laudoId) return;

        TP.log?.("info", `Evento de relatório iniciado recebido para laudo ${laudoId}.`);
        aplicarModoLaudoSelecionado({
            laudoId,
            estado: "relatorio_ativo",
            permiteReabrir: false,
        });
    }

    function handleRelatorioFinalizado(evento) {
        const laudoId = Number(
            evento?.detail?.laudoId ||
            evento?.detail?.laudo_id ||
            0
        ) || obterLaudoAtualSeguro();

        if (!laudoId) {
            desbloquearUIFinalizacao();
            return;
        }

        TP.log?.("info", `Evento de relatório finalizado recebido para laudo ${laudoId}.`);
        aplicarModoLaudoSelecionado({
            laudoId,
            estado: "aguardando",
            permiteReabrir: false,
        });
    }

    function handleRelatorioCancelado() {
        TP.log?.("info", "Evento de cancelamento de relatório recebido.");
        aplicarModoLaudoSelecionado({
            laudoId: null,
            estado: "sem_relatorio",
            permiteReabrir: false,
        });
    }

    function handleEstadoRelatorio(evento) {
        sincronizarEstadoRelatorioNaUI(evento?.detail || {});
    }

    function bindEventosRelatorio() {
        document.addEventListener("tariel:relatorio-iniciado", handleRelatorioIniciado);
        document.addEventListener("tarielrelatorio-iniciado", handleRelatorioIniciado);

        document.addEventListener("tariel:relatorio-finalizado", handleRelatorioFinalizado);
        document.addEventListener("tarielrelatorio-finalizado", handleRelatorioFinalizado);

        document.addEventListener("tariel:cancelar-relatorio", handleRelatorioCancelado);
        document.addEventListener("tarielrelatorio-cancelado", handleRelatorioCancelado);

        document.addEventListener("tariel:estado-relatorio", handleEstadoRelatorio);

        const btnReabrir = obterBotaoReabrir();
        if (btnReabrir && btnReabrir.dataset.relatorioBound !== "true") {
            btnReabrir.dataset.relatorioBound = "true";
            btnReabrir.addEventListener("click", () => {
                reabrirLaudoAtual();
            });
        }
    }

    function bindFinalizacaoAoUnload() {
        window.addEventListener("pagehide", () => {
            TP.limparFailsafeFinalizacao?.();
            document.body.dataset.finalizandoLaudo = "false";
        });
    }

    TP.registrarBootTask("chat_painel_relatorio", () => {
        bindEventosRelatorio();
        bindFinalizacaoAoUnload();
        sincronizarEstadoRelatorioNaUI();
        return true;
    });

    window.finalizarInspecaoCompleta = finalizarInspecaoCompleta;

    Object.assign(TP, {
        finalizarInspecaoCompleta,
        reabrirLaudoAtual,
        sincronizarEstadoRelatorioNaUI,
        normalizarEstadoRelatorio,
    });
})();
