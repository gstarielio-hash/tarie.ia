// ==========================================
// TARIEL.IA — PAINEL_REVISOR_PAGE.JS
// Papel: bootstrap do painel do revisor.
// Responsável por:
// - websocket de whispers
// - carregamento do laudo ativo
// - binds de eventos da interface
// ==========================================

(function () {
    "use strict";

    const NS = window.TarielRevisorPainel;
    if (!NS || NS.__indexWired__) return;
    NS.__indexWired__ = true;

    const {
        tokenCsrf,
        els,
        state,
        limparAnexoResposta,
        selecionarAnexoResposta,
        showStatus,
        limparReferenciaMensagemAtiva,
        definirReferenciaMensagemAtiva,
        setActiveItem,
        atualizarIndicadoresListaLaudo,
        marcarWhispersComoLidosLaudo,
        irParaMensagemTimeline,
        setViewLoading,
        encontrarMensagemPorId,
        carregarPainelMesaOperacional,
        renderMessageBubble,
        renderWhisperItem,
        renderActionButtons,
        carregarHistoricoMensagens,
        atualizarPendenciaMesaOperacional,
        openModal,
        closeModal,
        trapFocus,
        abrirResumoPacoteMesa,
        baixarPacoteMesaJson,
        baixarPacoteMesaPdf,
        renderizarModalRelatorio
    } = NS;

const inicializarWebSocket = () => {
        clearTimeout(state.wsReconnectTimer);

        if (state.socketWhisper && state.socketWhisper.readyState === WebSocket.OPEN) {
            return;
        }

        const protocolo = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocolo}//${window.location.host}/revisao/ws/whispers`;
        state.socketWhisper = new WebSocket(wsUrl);

        state.socketWhisper.addEventListener("open", () => {
            console.info("[Tariel] Canal de whispers conectado.");
        });

        state.socketWhisper.addEventListener("message", (evento) => {
            try {
                const dados = JSON.parse(evento.data);
                if (!dados?.laudo_id) return;

                const laudoAtivo = Number(state.laudoAtivoId || 0);
                const laudoEvento = Number(dados.laudo_id || 0);
                if (laudoAtivo > 0 && laudoAtivo === laudoEvento) {
                    carregarHistoricoMensagens({ appendAntigas: false }).catch(() => {});
                    carregarPainelMesaOperacional({ forcar: true }).catch(() => {});
                    marcarWhispersComoLidosLaudo(laudoEvento, { silencioso: true }).catch(() => {});
                    showStatus("Novo whisper recebido no laudo aberto.", "notifications_active");
                    return;
                }

                if (els.containerWhispers) {
                    els.containerWhispers.hidden = false;
                }

                const existente = els.listaWhispers.querySelector(`[data-id="${CSS.escape(String(dados.laudo_id))}"]`);
                if (existente) {
                    existente.remove();
                }

                els.listaWhispers.prepend(renderWhisperItem(dados));
                const contagemAtual = Number(
                    document.querySelector(`.js-item-laudo[data-id="${CSS.escape(String(laudoEvento))}"]`)?.dataset?.whispersNaoLidos || 0
                ) || 0;
                atualizarIndicadoresListaLaudo(laudoEvento, {
                    whispersNaoLidos: Math.max(contagemAtual, 0) + 1
                });
                showStatus("Novo whisper recebido.", "notifications_active");
            } catch (erro) {
                console.error("[Tariel] Erro ao processar whisper:", erro);
            }
        });

        state.socketWhisper.addEventListener("close", () => {
            console.info("[Tariel] WebSocket fechado; tentando reconectar...");
            state.wsReconnectTimer = setTimeout(inicializarWebSocket, 5000);
        });

        state.socketWhisper.addEventListener("error", () => {
            state.socketWhisper?.close();
        });
    };

    const finalizarWebSocket = () => {
        clearTimeout(state.wsReconnectTimer);
        if (state.socketWhisper) {
            state.socketWhisper.close();
            state.socketWhisper = null;
        }
    };

    const carregarLaudo = async (id) => {
        state.laudoAtivoId = id;
        limparReferenciaMensagemAtiva();
        setActiveItem(id);
        setViewLoading();

        try {
            const res = await fetch(`/revisao/api/laudo/${id}/completo`, {
                headers: { "X-Requested-With": "XMLHttpRequest" }
            });

            if (!res.ok) {
                throw new Error(`Falha HTTP ${res.status}`);
            }

            const dados = await res.json();
            state.jsonEstruturadoAtivo = dados.dados_formulario || null;
            state.pacoteMesaAtivo = null;
            state.historicoMensagens = [];
            state.historicoCursorProximo = null;
            state.historicoTemMais = false;
            state.carregandoHistoricoAntigo = false;
            limparAnexoResposta();

            els.viewHash.textContent = `Inspeção #${dados.hash}`;
            els.viewMeta.textContent = `Protocolo: ${String(dados.tipo_template || "").toUpperCase()} | Criado: ${dados.criado_em}`;

            renderActionButtons(dados);
            await Promise.all([
                carregarHistoricoMensagens({ appendAntigas: false }),
                carregarPainelMesaOperacional({ forcar: true })
            ]);
            await marcarWhispersComoLidosLaudo(id, { silencioso: true });
            els.inputResposta.focus();
        } catch (erro) {
            els.timeline.innerHTML = `<div class="timeline-status erro">Erro ao carregar laudo.</div>`;
            console.error("[Tariel] Falha ao carregar laudo:", erro);
        }
    };

    const enviarMensagemEngenheiro = async () => {
        const texto = els.inputResposta.value.trim();
        const anexoPendente = state.respostaAnexoPendente?.arquivo || null;
        if ((!texto && !anexoPendente) || !state.laudoAtivoId || state.pendingSend) return;
        const referenciaMensagemId = Number(state.referenciaMensagemAtiva?.id) || null;
        const detalheEnvio = String(
            texto || state.respostaAnexoPendente?.nome || "Anexo enviado"
        ).slice(0, 120);

        state.pendingSend = true;
        els.btnEnviarMsg.disabled = true;
        els.inputResposta.disabled = true;
        if (els.btnAnexoResposta) {
            els.btnAnexoResposta.disabled = true;
        }

        const bubble = renderMessageBubble({
            tipo: "humano_eng",
            texto,
            referencia_mensagem_id: referenciaMensagemId,
            data: "Enviando...",
            anexos: state.respostaAnexoPendente ? [{
                id: -1,
                nome: state.respostaAnexoPendente.nome,
                url: "#",
                eh_imagem: state.respostaAnexoPendente.ehImagem,
                tamanho_bytes: state.respostaAnexoPendente.tamanho
            }] : []
        }, true);

        if (bubble) {
            els.timeline.appendChild(bubble);
            els.timeline.scrollTop = els.timeline.scrollHeight;
        }

        els.inputResposta.value = "";

        try {
            let res;
            if (anexoPendente) {
                const form = new FormData();
                form.set("arquivo", anexoPendente);
                if (texto) {
                    form.set("texto", texto);
                }
                if (referenciaMensagemId) {
                    form.set("referencia_mensagem_id", String(referenciaMensagemId));
                }

                res = await fetch(`/revisao/api/laudo/${state.laudoAtivoId}/responder-anexo`, {
                    method: "POST",
                    headers: {
                        "X-CSRF-Token": tokenCsrf,
                        "X-Requested-With": "XMLHttpRequest"
                    },
                    body: form
                });
            } else {
                res = await fetch(`/revisao/api/laudo/${state.laudoAtivoId}/responder`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-Token": tokenCsrf,
                        "X-Requested-With": "XMLHttpRequest"
                    },
                    body: JSON.stringify({
                        texto,
                        referencia_mensagem_id: referenciaMensagemId
                    })
                });
            }

            if (!res.ok) {
                throw new Error(`Falha HTTP ${res.status}`);
            }

            await carregarLaudo(state.laudoAtivoId);
            limparReferenciaMensagemAtiva();
            limparAnexoResposta();
            showStatus("Mensagem enviada para o inspetor.", "send");
        } catch (erro) {
            showStatus("Erro ao enviar mensagem.", "error");
            console.error("[Tariel] Falha ao responder:", erro);
            await carregarLaudo(state.laudoAtivoId);
        } finally {
            state.pendingSend = false;
            els.btnEnviarMsg.disabled = false;
            els.inputResposta.disabled = false;
            if (els.btnAnexoResposta) {
                els.btnAnexoResposta.disabled = false;
            }
            els.inputResposta.focus();
        }
    };

    const confirmarDevolucao = async () => {
        const motivo = els.inputMotivo.value.trim();
        if (!motivo || !state.laudoAtivoId) {
            els.inputMotivo.classList.add("erro");
            els.inputMotivo.focus();
            return;
        }

        els.btnConfirmarMotivo.disabled = true;
        els.btnConfirmarMotivo.textContent = "Devolvendo...";

        try {
            const fd = new FormData();
            fd.append("csrf_token", tokenCsrf);
            fd.append("acao", "rejeitar");
            fd.append("motivo", motivo);

            const res = await fetch(`/revisao/api/laudo/${state.laudoAtivoId}/avaliar`, {
                method: "POST",
                body: fd
            });

            if (!res.ok) {
                throw new Error(`Falha HTTP ${res.status}`);
            }

            window.location.reload();
        } catch (erro) {
            els.btnConfirmarMotivo.disabled = false;
            els.btnConfirmarMotivo.textContent = "Confirmar Devolução";
            showStatus("Erro ao devolver laudo.", "error");
            console.error("[Tariel] Falha ao devolver:", erro);
        }
    };

    const handleListaClick = (event) => {
        const item = event.target.closest(".js-item-laudo");
        if (!item) return;

        carregarLaudo(item.dataset.id);
    };

    const handleListaKeydown = (event) => {
        const item = event.target.closest(".js-item-laudo");
        if (!item) return;

        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            item.click();
        }
    };

    els.listaLaudos.addEventListener("click", handleListaClick);
    els.listaLaudos.addEventListener("keydown", handleListaKeydown);
    els.listaWhispers.addEventListener("click", handleListaClick);
    els.listaWhispers.addEventListener("keydown", handleListaKeydown);
    els.timeline.addEventListener("click", (event) => {
        const referencia = event.target.closest(".bolha-referencia[data-ref-id]");
        if (!referencia) return;
        const referenciaId = Number(referencia.dataset.refId || 0);
        if (!Number.isFinite(referenciaId) || referenciaId <= 0) return;
        irParaMensagemTimeline(referenciaId);
    });
    els.mesaOperacaoPainel?.addEventListener("click", (event) => {
        const acao = event.target.closest("[data-mesa-action]");
        if (!acao) return;

        if (acao.dataset.mesaAction === "timeline-msg") {
            const mensagemId = Number(acao.dataset.msgId || 0);
            if (Number.isFinite(mensagemId) && mensagemId > 0) {
                irParaMensagemTimeline(mensagemId);
            }
            return;
        }

        if (acao.dataset.mesaAction === "timeline-ref") {
            const referenciaId = Number(acao.dataset.refId || 0);
            if (Number.isFinite(referenciaId) && referenciaId > 0) {
                irParaMensagemTimeline(referenciaId);
            }
            return;
        }

        if (acao.dataset.mesaAction === "responder-item") {
            const mensagemId = Number(acao.dataset.msgId || 0);
            if (!Number.isFinite(mensagemId) || mensagemId <= 0) return;
            const mensagem = encontrarMensagemPorId(mensagemId) || {
                id: mensagemId,
                texto: `Mensagem #${mensagemId}`
            };
            definirReferenciaMensagemAtiva(mensagem);
            els.boxResposta?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            return;
        }

        if (acao.dataset.mesaAction === "alternar-pendencia") {
            const mensagemId = Number(acao.dataset.msgId || 0);
            const proximaLida = String(acao.dataset.proximaLida || "").toLowerCase() === "true";
            if (!Number.isFinite(mensagemId) || mensagemId <= 0) return;
            atualizarPendenciaMesaOperacional(mensagemId, proximaLida);
        }
    });

    els.btnEnviarMsg.addEventListener("click", enviarMensagemEngenheiro);
    els.btnAnexoResposta?.addEventListener("click", () => {
        els.inputAnexoResposta?.click();
    });
    els.inputAnexoResposta?.addEventListener("change", (event) => {
        const arquivo = event.target?.files?.[0];
        if (arquivo) {
            selecionarAnexoResposta(arquivo);
        }
    });
    els.previewRespostaAnexo?.addEventListener("click", (event) => {
        const remover = event.target.closest(".btn-remover-anexo-chat");
        if (remover) {
            limparAnexoResposta();
        }
    });
    els.btnLimparRefAtiva?.addEventListener("click", limparReferenciaMensagemAtiva);
    els.inputResposta.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            enviarMensagemEngenheiro();
        }
    });

    els.viewAcoes.addEventListener("click", (event) => {
        if (event.target.closest(".js-btn-pacote-resumo")) {
            abrirResumoPacoteMesa();
            return;
        }

        if (event.target.closest(".js-btn-pacote-json")) {
            baixarPacoteMesaJson();
            return;
        }

        if (event.target.closest(".js-btn-pacote-pdf")) {
            baixarPacoteMesaPdf();
            return;
        }

        if (event.target.closest(".js-btn-abrir-rel")) {
            renderizarModalRelatorio();
            openModal(els.modalRelatorio, els.btnFecharRelatorio);
            return;
        }

        if (event.target.closest(".js-btn-abrir-dev")) {
            els.inputMotivo.value = "";
            els.inputMotivo.classList.remove("erro");
            openModal(els.dialogMotivo, els.inputMotivo);
        }
    });

    els.viewAcoes.addEventListener("submit", (event) => {
        const form = event.target.closest(".js-form-aprovar");
        if (!form) return;

        const btn = form.querySelector("button[type='submit']");
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">sync</span><span>Aprovando...</span>`;
        }
    });

    els.btnFecharRelatorio.addEventListener("click", () => closeModal(els.modalRelatorio));
    els.btnFecharPacote.addEventListener("click", () => closeModal(els.modalPacote));
    els.btnCancelarMotivo.addEventListener("click", () => closeModal(els.dialogMotivo));
    els.btnConfirmarMotivo.addEventListener("click", confirmarDevolucao);

    els.modalRelatorio.addEventListener("click", (event) => {
        if (event.target === els.modalRelatorio) closeModal(els.modalRelatorio);
    });

    els.modalPacote.addEventListener("click", (event) => {
        if (event.target === els.modalPacote) closeModal(els.modalPacote);
    });

    els.dialogMotivo.addEventListener("click", (event) => {
        if (event.target === els.dialogMotivo) closeModal(els.dialogMotivo);
    });

    els.modalRelatorio.addEventListener("keydown", (event) => trapFocus(els.modalRelatorio, event));
    els.modalPacote.addEventListener("keydown", (event) => trapFocus(els.modalPacote, event));
    els.dialogMotivo.addEventListener("keydown", (event) => trapFocus(els.dialogMotivo, event));

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (els.dialogMotivo.classList.contains("ativo")) closeModal(els.dialogMotivo);
        else if (els.modalPacote.classList.contains("ativo")) closeModal(els.modalPacote);
        else if (els.modalRelatorio.classList.contains("ativo")) closeModal(els.modalRelatorio);
    });

    els.inputMotivo.addEventListener("input", () => {
        els.inputMotivo.classList.remove("erro");
    });

    window.addEventListener("pagehide", finalizarWebSocket);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && (!state.socketWhisper || state.socketWhisper.readyState > 1)) {
            inicializarWebSocket();
        }
    });

    document.addEventListener("DOMContentLoaded", () => {
        inicializarWebSocket();
    });


    Object.assign(NS, {
        inicializarWebSocket,
        finalizarWebSocket,
        carregarLaudo,
        enviarMensagemEngenheiro,
        confirmarDevolucao
    });
})();
