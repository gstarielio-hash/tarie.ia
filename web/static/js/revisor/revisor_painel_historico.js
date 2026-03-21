// ==========================================
// TARIEL.IA — REVISOR_PAINEL_HISTORICO.JS
// Papel: timeline e histórico do canal campo <-> engenharia.
// ==========================================

(function () {
    "use strict";

    const NS = window.TarielRevisorPainel;
    if (!NS || NS.__historicoWired__) return;
    NS.__historicoWired__ = true;

    const {
        tokenCsrf,
        els,
        state,
        LIMITE_PAGINA_HISTORICO,
        escapeHtml,
        nl2br,
        normalizarAnexoMensagem,
        renderizarAnexosMensagem,
        resumoMensagem,
        textoBadgeAprendizado,
        textoBadgePendencia,
        classificarOperacaoLaudo,
        definirReferenciaMensagemAtiva,
        showStatus,
        ehAbortError,
        obterContextoLaudoAtivo,
        contextoLaudoAindaValido
    } = NS;

const renderMessageBubble = (msg, pendente = false) => {
        const anexos = Array.isArray(msg?.anexos) ? msg.anexos.map(normalizarAnexoMensagem).filter(Boolean) : [];
        if (!msg || ((!msg.texto || !String(msg.texto).trim()) && !anexos.length) || String(msg.texto || "").includes("[COMANDO_SISTEMA]")) {
            return null;
        }

        const bubble = document.createElement("div");
        bubble.classList.add("bolha");
        if (pendente) bubble.classList.add("pendente");

        let remetente = "Sistema";
        if (msg.tipo === "user" || msg.tipo === "humano_insp") {
            bubble.classList.add("inspetor");
            remetente = "Campo";
        } else if (msg.tipo === "ia") {
            bubble.classList.add("ia");
            remetente = "Tariel.ia";
        } else if (msg.tipo === "humano_eng") {
            bubble.classList.add("engenharia");
            remetente = "Você";
        }

        const mensagemId = Number(msg.id);
        if (Number.isFinite(mensagemId) && mensagemId > 0) {
            bubble.dataset.msgId = String(mensagemId);
        }

        const referenciaId = Number(msg.referencia_mensagem_id);
        let blocoReferencia = "";
        if (Number.isFinite(referenciaId) && referenciaId > 0) {
            const msgRef = (state.historicoMensagens || []).find(
                (item) => Number(item?.id) === referenciaId
            );
            const textoRef = resumoMensagem(msgRef?.texto || `Mensagem #${referenciaId}`);
            blocoReferencia = `
                <div class="bolha-referencia" data-ref-id="${referenciaId}">
                    <strong>Respondendo #${referenciaId}</strong>
                    <span>${escapeHtml(textoRef)}</span>
                </div>
            `;
        }

        const mostrarBotaoResponder = Number.isFinite(mensagemId) && mensagemId > 0;

        bubble.innerHTML = `
            <div class="bolha-header">
                <span>${escapeHtml(remetente)}</span>
                <span>${escapeHtml(msg.data || "")}</span>
            </div>
            ${blocoReferencia}
            ${String(msg.texto || "").trim() ? `<div>${nl2br(msg.texto)}</div>` : ""}
            ${renderizarAnexosMensagem(anexos)}
            ${mostrarBotaoResponder ? `<button type="button" class="btn-responder-msg" data-ref-id="${mensagemId}">Responder</button>` : ""}
        `;

        const btnResponder = bubble.querySelector(".btn-responder-msg");
        if (btnResponder) {
            btnResponder.addEventListener("click", () => {
                definirReferenciaMensagemAtiva(msg);
            });
        }

        return bubble;
    };

    const renderWhisperItem = (dados) => {
        const operacao = classificarOperacaoLaudo({
            statusRevisao: "Rascunho",
            whispersNaoLidos: 1,
            pendenciasAbertas: Number(dados?.pendencias_abertas || 0) || 0,
            aprendizadosPendentes: Number(dados?.aprendizados_pendentes || 0) || 0
        });
        const item = document.createElement("article");
        item.className = "item-lista whisper-item js-item-laudo";
        item.dataset.id = String(dados.laudo_id);
        item.dataset.whispersNaoLidos = "1";
        item.dataset.pendenciasAbertas = String(Number(dados?.pendencias_abertas || 0) || 0);
        item.dataset.aprendizadosPendentes = String(Number(dados?.aprendizados_pendentes || 0) || 0);
        item.dataset.statusRevisao = "Rascunho";
        item.dataset.filaOperacional = operacao.fila;
        item.dataset.prioridadeOperacional = operacao.prioridade;
        item.setAttribute("tabindex", "0");
        item.setAttribute("role", "button");
        item.setAttribute("aria-label", `Abrir chamado urgente #${dados.hash}`);

        item.innerHTML = `
            <div class="item-topo">
                <span class="item-hash">#${escapeHtml(dados.hash)}</span>
                <span class="badge urgente">Urgente</span>
            </div>
            <div class="item-preview">${escapeHtml((dados.texto || "").slice(0, 60))}${(dados.texto || "").length > 60 ? "..." : ""}</div>
            <div class="item-operacao-resumo">
                <span class="badge fila-operacional ${escapeHtml(operacao.fila)}">${escapeHtml(operacao.filaLabel)}</span>
                <span class="badge prioridade ${escapeHtml(operacao.prioridade)}">${escapeHtml(operacao.prioridadeLabel)}</span>
            </div>
            <div class="item-proxima-acao js-proxima-acao">${escapeHtml(operacao.proximaAcao)}</div>
            <div class="item-meta-rodape">
                <div class="item-indicadores">
                    <span class="badge indicador-whisper js-indicador-whispers">1 whisper</span>
                    <span class="badge indicador-pendencia js-indicador-pendencias" ${(Number(dados?.pendencias_abertas || 0) || 0) > 0 ? "" : "hidden"}>
                        ${escapeHtml(textoBadgePendencia(Number(dados?.pendencias_abertas || 0) || 0))}
                    </span>
                    <span class="badge indicador-aprendizado js-indicador-aprendizados" ${(Number(dados?.aprendizados_pendentes || 0) || 0) > 0 ? "" : "hidden"}>
                        ${escapeHtml(textoBadgeAprendizado(Number(dados?.aprendizados_pendentes || 0) || 0))}
                    </span>
                </div>
            </div>
        `;
        return item;
    };

    const renderActionButtons = (dados) => {
        const partes = [];

        partes.push(`
            <button class="btn btn-ver js-btn-pacote-resumo" type="button">
                <span class="material-symbols-rounded" aria-hidden="true">insights</span>
                <span>Resumo Mesa</span>
            </button>
        `);

        partes.push(`
            <button class="btn btn-ver js-btn-pacote-json" type="button">
                <span class="material-symbols-rounded" aria-hidden="true">download</span>
                <span>Pacote JSON</span>
            </button>
        `);

        partes.push(`
            <button class="btn btn-ver js-btn-pacote-pdf" type="button">
                <span class="material-symbols-rounded" aria-hidden="true">picture_as_pdf</span>
                <span>Pacote PDF</span>
            </button>
        `);

        if (dados.dados_formulario) {
            partes.push(`
                <button class="btn btn-ver js-btn-abrir-rel" type="button">
                    <span class="material-symbols-rounded" aria-hidden="true">visibility</span>
                    <span>Tabela IA</span>
                </button>
            `);
        }

        if (dados.status === "Aguardando Aval") {
            partes.push(`
                <form action="/revisao/api/laudo/${dados.id}/avaliar" method="POST" style="margin:0;" class="js-form-aprovar">
                    <input type="hidden" name="csrf_token" value="${escapeHtml(tokenCsrf)}">
                    <input type="hidden" name="acao" value="aprovar">
                    <button type="submit" class="btn btn-aprovar">
                        <span class="material-symbols-rounded" aria-hidden="true">check</span>
                        <span>Aprovar</span>
                    </button>
                </form>
            `);

            partes.push(`
                <button class="btn btn-rejeitar js-btn-abrir-dev" type="button">
                    <span class="material-symbols-rounded" aria-hidden="true">close</span>
                    <span>Devolver</span>
                </button>
            `);
        }

        els.viewAcoes.innerHTML = partes.join("");
        els.boxResposta.hidden = false;
    };

    const normalizarRespostaHistorico = (payload) => {
        if (Array.isArray(payload)) {
            return {
                itens: payload,
                cursor_proximo: null,
                tem_mais: false
            };
        }

        return {
            itens: Array.isArray(payload?.itens) ? payload.itens : [],
            cursor_proximo: Number.isFinite(Number(payload?.cursor_proximo))
                ? Number(payload.cursor_proximo)
                : null,
            tem_mais: !!payload?.tem_mais
        };
    };

    const renderTimeline = ({ rolarParaFim = true } = {}) => {
        els.timeline.innerHTML = "";

        const mensagens = (state.historicoMensagens || [])
            .map((msg) => renderMessageBubble(msg))
            .filter(Boolean);

        if (!mensagens.length) {
            els.timeline.innerHTML = `<div class="timeline-status">Sem mensagens disponíveis.</div>`;
            return;
        }

        if (state.historicoTemMais) {
            const btnAntigas = document.createElement("button");
            btnAntigas.type = "button";
            btnAntigas.className = "btn btn-ver";
            btnAntigas.style.marginBottom = "10px";
            btnAntigas.disabled = !!state.carregandoHistoricoAntigo;
            btnAntigas.setAttribute("aria-busy", String(!!state.carregandoHistoricoAntigo));
            btnAntigas.innerHTML = state.carregandoHistoricoAntigo
                ? `<span class="material-symbols-rounded" aria-hidden="true">sync</span><span>Carregando antigas...</span>`
                : `<span class="material-symbols-rounded" aria-hidden="true">history</span><span>Carregar mensagens antigas</span>`;
            btnAntigas.addEventListener("click", () => {
                carregarHistoricoMensagens({ appendAntigas: true });
            });
            els.timeline.appendChild(btnAntigas);
        }

        mensagens.forEach((node) => els.timeline.appendChild(node));

        if (rolarParaFim) {
            els.timeline.scrollTop = els.timeline.scrollHeight;
        }
    };

    const carregarHistoricoMensagens = async ({ appendAntigas = false } = {}) => {
        const contexto = obterContextoLaudoAtivo();
        if (!contexto.laudoId) return;
        if (appendAntigas && state.carregandoHistoricoAntigo) return;
        if (appendAntigas && !state.historicoTemMais) return;

        if (state.historicoAbortController) {
            state.historicoAbortController.abort();
        }
        const controller = new AbortController();
        state.historicoAbortController = controller;

        state.carregandoHistoricoAntigo = true;
        renderTimeline({ rolarParaFim: false });

        const topoAntes = els.timeline.scrollTop;
        const alturaAntes = els.timeline.scrollHeight;

        try {
            const params = new URLSearchParams();
            params.set("limite", String(LIMITE_PAGINA_HISTORICO));
            if (appendAntigas && Number.isFinite(Number(state.historicoCursorProximo))) {
                params.set("cursor", String(state.historicoCursorProximo));
            }

            const res = await fetch(`/revisao/api/laudo/${contexto.laudoId}/mensagens?${params.toString()}`, {
                headers: { "X-Requested-With": "XMLHttpRequest" },
                signal: controller.signal
            });

            if (!res.ok) {
                throw new Error(`Falha HTTP ${res.status}`);
            }

            const pagina = normalizarRespostaHistorico(await res.json());
            if (controller.signal.aborted || !contextoLaudoAindaValido(contexto)) {
                return;
            }

            if (appendAntigas) {
                state.historicoMensagens = [...pagina.itens, ...state.historicoMensagens];
            } else {
                state.historicoMensagens = [...pagina.itens];
            }

            state.historicoCursorProximo = pagina.cursor_proximo;
            state.historicoTemMais = !!pagina.tem_mais;

            renderTimeline({ rolarParaFim: !appendAntigas });

            if (appendAntigas) {
                const alturaDepois = els.timeline.scrollHeight;
                els.timeline.scrollTop = Math.max(
                    0,
                    topoAntes + (alturaDepois - alturaAntes)
                );
            }
        } catch (erro) {
            if (ehAbortError(erro)) {
                return;
            }
            showStatus("Erro ao carregar histórico.", "error");
            console.error("[Tariel] Falha ao carregar histórico paginado:", erro);
            if (contextoLaudoAindaValido(contexto)) {
                renderTimeline({ rolarParaFim: false });
            }
        } finally {
            if (state.historicoAbortController === controller) {
                state.historicoAbortController = null;
            }
            state.carregandoHistoricoAntigo = false;
        }
    };


        Object.assign(NS, {
            renderMessageBubble,
            renderWhisperItem,
            renderActionButtons,
            normalizarRespostaHistorico,
            renderTimeline,
            carregarHistoricoMensagens
        });
})();
