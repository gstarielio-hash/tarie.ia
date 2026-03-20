// ==========================================
// TARIEL.IA — REVISOR_PAINEL_APRENDIZADOS.JS
// Papel: revisão e validação dos aprendizados visuais do laudo.
// ==========================================

(function () {
    "use strict";

    const NS = window.TarielRevisorPainel;
    if (!NS || NS.__aprendizadosWired__) return;
    NS.__aprendizadosWired__ = true;

    const {
        tokenCsrf,
        els,
        state,
        escapeHtml,
        nl2br,
        formatarDataHora,
        irParaMensagemTimeline,
        showStatus
    } = NS;

    const LABEL_STATUS = {
        rascunho_inspetor: "Rascunho do Inspetor",
        validado_mesa: "Validado pela Mesa",
        rejeitado_mesa: "Rejeitado pela Mesa"
    };

    const LABEL_VEREDITO = {
        conforme: "Conforme",
        nao_conforme: "Não conforme",
        ajuste: "Ajuste",
        duvida: "Dúvida"
    };

    const normalizarLista = (valor) => Array.isArray(valor) ? valor.filter(Boolean).map((item) => String(item).trim()).filter(Boolean) : [];

    const contarStatus = (itens = []) => itens.reduce((acc, item) => {
        const status = String(item?.status || "rascunho_inspetor");
        acc.total += 1;
        if (status === "validado_mesa") acc.validados += 1;
        else if (status === "rejeitado_mesa") acc.rejeitados += 1;
        else acc.rascunhos += 1;
        return acc;
    }, { total: 0, rascunhos: 0, validados: 0, rejeitados: 0 });

    const renderizarTagsAprendizado = (rotulo, itens, classeExtra = "") => {
        const lista = normalizarLista(itens);
        if (!lista.length) return "";
        return `
            <div class="aprendizado-tags-grupo ${classeExtra}">
                <span class="aprendizado-tags-rotulo">${escapeHtml(rotulo)}</span>
                <div class="aprendizado-tags-lista">
                    ${lista.map((item) => `<span class="aprendizado-tag">${escapeHtml(item)}</span>`).join("")}
                </div>
            </div>
        `;
    };

    const renderizarMetadadosAprendizado = (item) => {
        const itens = [];
        if (Number(item?.mensagem_referencia_id || 0) > 0) {
            itens.push(`<button type="button" class="aprendizado-meta-link" data-aprendizado-action="timeline-ref" data-ref-id="${Number(item.mensagem_referencia_id)}">Mensagem #${Number(item.mensagem_referencia_id)}</button>`);
        }
        if (item?.criado_em) {
            itens.push(`<span>Criado em ${escapeHtml(formatarDataHora(item.criado_em))}</span>`);
        }
        if (item?.validado_em) {
            itens.push(`<span>Revisado em ${escapeHtml(formatarDataHora(item.validado_em))}</span>`);
        }
        return itens.length ? `<div class="aprendizado-meta">${itens.join("")}</div>` : "";
    };

    const renderizarCardAprendizado = (item) => {
        const status = String(item?.status || "rascunho_inspetor");
        const vereditoAtual = String(item?.veredito_mesa || item?.veredito_inspetor || "");
        const resumo = String(item?.resumo || "Aprendizado visual").trim() || "Aprendizado visual";
        const correcaoInspetor = String(item?.correcao_inspetor || "").trim();
        const sinteseMesa = String(item?.sintese_consolidada || item?.parecer_mesa || "").trim();
        const descricao = String(item?.descricao_contexto || "").trim();
        const imagemUrl = String(item?.imagem_url || "").trim();
        const nomeImagem = String(item?.imagem_nome_original || "evidencia").trim() || "evidencia";
        const editorAberto = status === "rascunho_inspetor";
        const tituloEditor = editorAberto ? "Validar aprendizado" : "Revisar decisão";
        const descricaoEditor = editorAberto
            ? "Defina o veredito final e a síntese que realmente deve entrar na memória técnica da IA."
            : "Abra apenas se precisar ajustar a decisão já registrada pela mesa.";

        return `
            <article class="aprendizado-card" data-aprendizado-id="${Number(item.id)}">
                <div class="aprendizado-card-topo">
                    <div class="aprendizado-card-media ${imagemUrl ? "tem-imagem" : "sem-imagem"}">
                        ${imagemUrl
                            ? `<a href="${escapeHtml(imagemUrl)}" target="_blank" rel="noopener noreferrer" class="aprendizado-card-thumb-link" aria-label="Abrir evidência ${escapeHtml(nomeImagem)}"><img src="${escapeHtml(imagemUrl)}" alt="${escapeHtml(nomeImagem)}" class="aprendizado-card-thumb"></a>`
                            : `<span class="material-symbols-rounded" aria-hidden="true">image</span>`}
                    </div>
                    <div class="aprendizado-card-head">
                        <div class="aprendizado-card-head-topo">
                            <div>
                                <h3>${escapeHtml(resumo)}</h3>
                                <p>${escapeHtml(LABEL_STATUS[status] || "Aprendizado visual")}</p>
                            </div>
                            <span class="aprendizado-status ${escapeHtml(status)}">${escapeHtml(LABEL_STATUS[status] || status)}</span>
                        </div>
                        ${renderizarMetadadosAprendizado(item)}
                    </div>
                </div>

                <div class="aprendizado-card-corpo">
                    <section class="aprendizado-bloco">
                        <header>
                            <span class="material-symbols-rounded" aria-hidden="true">construction</span>
                            <strong>Leitura do campo</strong>
                        </header>
                        <p>${correcaoInspetor ? nl2br(correcaoInspetor) : "Sem correção textual explícita do inspetor."}</p>
                    </section>
                    <section class="aprendizado-bloco aprendizado-bloco-mesa">
                        <header>
                            <span class="material-symbols-rounded" aria-hidden="true">rule</span>
                            <strong>Referência final da mesa</strong>
                        </header>
                        <p>${sinteseMesa ? nl2br(sinteseMesa) : "Ainda sem síntese consolidada para o motor da IA."}</p>
                    </section>
                </div>

                ${descricao ? `<div class="aprendizado-contexto">${nl2br(descricao)}</div>` : ""}
                <div class="aprendizado-tags-wrap">
                    ${renderizarTagsAprendizado("Pontos-chave", item?.pontos_chave)}
                    ${renderizarTagsAprendizado("Normas", item?.referencias_norma, "normas")}
                </div>

                <details class="aprendizado-editor" ${editorAberto ? "open" : ""}>
                    <summary class="aprendizado-editor-resumo">
                        <div class="aprendizado-editor-resumo-texto">
                            <strong>${escapeHtml(tituloEditor)}</strong>
                            <span>${escapeHtml(descricaoEditor)}</span>
                        </div>
                        <span class="material-symbols-rounded" aria-hidden="true">expand_more</span>
                    </summary>

                    <div class="aprendizado-formulario">
                        <div class="aprendizado-form-grid">
                            <label class="aprendizado-campo">
                                <span>Resumo final</span>
                                <input
                                    type="text"
                                    class="js-aprendizado-resumo-final"
                                    maxlength="240"
                                    value="${escapeHtml(String(item?.resumo || ""))}"
                                    placeholder="Resumo curto para a base"
                                >
                            </label>
                            <label class="aprendizado-campo">
                                <span>Veredito final</span>
                                <select class="js-aprendizado-veredito">
                                    <option value="">Selecionar</option>
                                    ${Object.entries(LABEL_VEREDITO).map(([valor, rotulo]) => `
                                        <option value="${escapeHtml(valor)}" ${vereditoAtual === valor ? "selected" : ""}>${escapeHtml(rotulo)}</option>
                                    `).join("")}
                                </select>
                            </label>
                        </div>

                        <label class="aprendizado-campo">
                            <span>Síntese validada para a IA</span>
                            <textarea class="js-aprendizado-sintese" rows="3" placeholder="Descreva a regra final que a IA deve reutilizar.">${escapeHtml(String(item?.sintese_consolidada || ""))}</textarea>
                        </label>

                        <label class="aprendizado-campo">
                            <span>Observação da mesa</span>
                            <textarea class="js-aprendizado-parecer" rows="2" placeholder="Notas internas da validação.">${escapeHtml(String(item?.parecer_mesa || ""))}</textarea>
                        </label>

                        <div class="aprendizado-acoes">
                            ${imagemUrl ? `<a href="${escapeHtml(imagemUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-ver aprendizado-btn-link">
                                <span class="material-symbols-rounded" aria-hidden="true">open_in_new</span>
                                <span>Ver imagem</span>
                            </a>` : ""}
                            <button type="button" class="btn btn-ver aprendizado-btn-link" data-aprendizado-action="timeline-ref" data-ref-id="${Number(item?.mensagem_referencia_id || 0) || ""}" ${Number(item?.mensagem_referencia_id || 0) > 0 ? "" : "disabled"}>
                                <span class="material-symbols-rounded" aria-hidden="true">forum</span>
                                <span>Ir para contexto</span>
                            </button>
                            <button type="button" class="btn btn-rejeitar js-aprendizado-rejeitar" data-aprendizado-action="rejeitar">
                                <span class="material-symbols-rounded" aria-hidden="true">close</span>
                                <span>Rejeitar</span>
                            </button>
                            <button type="button" class="btn btn-aprovar js-aprendizado-aprovar" data-aprendizado-action="aprovar">
                                <span class="material-symbols-rounded" aria-hidden="true">check</span>
                                <span>Validar</span>
                            </button>
                        </div>
                    </div>
                </details>
            </article>
        `;
    };

    const renderizarPainelAprendizadosVisuais = (itens = []) => {
        const lista = Array.isArray(itens) ? itens : [];
        state.aprendizadosVisuais = [...lista];

        if (!els.aprendizadosVisuaisPainel || !els.aprendizadosVisuaisConteudo) return;

        if (!lista.length) {
            els.aprendizadosVisuaisPainel.hidden = true;
            els.aprendizadosVisuaisConteudo.innerHTML = "";
            return;
        }

        const resumo = contarStatus(lista);
        els.aprendizadosVisuaisConteudo.innerHTML = `
            <div class="aprendizados-topo">
                <div>
                    <h3>Aprendizados Visuais</h3>
                    <p>Revise o que foi capturado no chat e valide o que realmente deve entrar na memória técnica da IA.</p>
                </div>
                <div class="aprendizados-resumo">
                    <span><strong>${escapeHtml(String(resumo.total))}</strong> total</span>
                    <span><strong>${escapeHtml(String(resumo.rascunhos))}</strong> rascunho(s)</span>
                    <span><strong>${escapeHtml(String(resumo.validados))}</strong> validado(s)</span>
                    <span><strong>${escapeHtml(String(resumo.rejeitados))}</strong> rejeitado(s)</span>
                </div>
            </div>
            <div class="aprendizados-lista">
                ${lista.map((item) => renderizarCardAprendizado(item)).join("")}
            </div>
        `;
        els.aprendizadosVisuaisPainel.hidden = false;
    };

    const encontrarAprendizadoPorId = (aprendizadoId) =>
        (state.aprendizadosVisuais || []).find((item) => Number(item?.id || 0) === Number(aprendizadoId)) || null;

    const bloquearCardAprendizado = (card, bloqueado, textoBotao = "") => {
        if (!card) return;
        card.classList.toggle("is-saving", !!bloqueado);
        card.querySelectorAll("button, input, textarea, select").forEach((elemento) => {
            elemento.disabled = !!bloqueado;
        });
        if (textoBotao) {
            const alvo = card.querySelector(".js-aprendizado-aprovar, .js-aprendizado-rejeitar");
            if (alvo) {
                alvo.dataset.textoOriginal = alvo.dataset.textoOriginal || alvo.innerHTML;
            }
        }
    };

    const restaurarBotoesCard = (card) => {
        if (!card) return;
        card.classList.remove("is-saving");
        card.querySelectorAll("button, input, textarea, select").forEach((elemento) => {
            elemento.disabled = false;
        });
    };

    const montarPayloadValidacao = (item, card, acao) => {
        const resumoFinal = card.querySelector(".js-aprendizado-resumo-final")?.value?.trim() || "";
        const sintese = card.querySelector(".js-aprendizado-sintese")?.value?.trim() || "";
        const parecer = card.querySelector(".js-aprendizado-parecer")?.value?.trim() || "";
        const veredito = card.querySelector(".js-aprendizado-veredito")?.value?.trim() || "";
        const fallbackSintese = sintese || parecer || String(item?.correcao_inspetor || "").trim() || String(item?.resumo || "").trim();

        return {
            acao,
            resumo_final: resumoFinal || String(item?.resumo || "").trim(),
            sintese_consolidada: acao === "aprovar" ? fallbackSintese : sintese,
            parecer_mesa: parecer || (acao === "rejeitar" ? "Rejeitado pela mesa após revisão visual." : ""),
            veredito_mesa: veredito || String(item?.veredito_mesa || item?.veredito_inspetor || "").trim() || null,
            pontos_chave: normalizarLista(item?.pontos_chave),
            referencias_norma: normalizarLista(item?.referencias_norma),
            marcacoes: Array.isArray(item?.marcacoes) ? item.marcacoes : []
        };
    };

    const validarAprendizadoVisual = async (aprendizadoId, acao, card) => {
        const item = encontrarAprendizadoPorId(aprendizadoId);
        if (!item || !state.laudoAtivoId || !card) return;

        const botaoAcionado = card.querySelector(acao === "aprovar" ? ".js-aprendizado-aprovar" : ".js-aprendizado-rejeitar");
        const labelOriginal = botaoAcionado ? botaoAcionado.innerHTML : "";
        bloquearCardAprendizado(card, true);
        if (botaoAcionado) {
            botaoAcionado.innerHTML = acao === "aprovar"
                ? `<span class="material-symbols-rounded" aria-hidden="true">sync</span><span>Validando...</span>`
                : `<span class="material-symbols-rounded" aria-hidden="true">sync</span><span>Rejeitando...</span>`;
        }

        try {
            const res = await fetch(`/revisao/api/aprendizados/${aprendizadoId}/validar`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": tokenCsrf,
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: JSON.stringify(montarPayloadValidacao(item, card, acao))
            });

            if (!res.ok) {
                let detalhe = `Falha HTTP ${res.status}`;
                try {
                    const payload = await res.json();
                    detalhe = String(payload?.detail || detalhe);
                } catch (_) {
                    // noop
                }
                throw new Error(detalhe);
            }

            showStatus(
                acao === "aprovar" ? "Aprendizado visual validado pela mesa." : "Aprendizado visual rejeitado pela mesa.",
                acao === "aprovar" ? "rule" : "cancel"
            );

            if (typeof NS.carregarLaudo === "function") {
                await NS.carregarLaudo(state.laudoAtivoId);
            }
        } catch (erro) {
            if (botaoAcionado) {
                botaoAcionado.innerHTML = labelOriginal;
            }
            restaurarBotoesCard(card);
            showStatus(erro?.message || "Erro ao validar aprendizado visual.", "error");
            console.error("[Tariel] Falha ao validar aprendizado visual:", erro);
        }
    };

    els.aprendizadosVisuaisPainel?.addEventListener("click", (event) => {
        const acao = event.target.closest("[data-aprendizado-action]");
        if (!acao) return;

        if (acao.dataset.aprendizadoAction === "timeline-ref") {
            const referenciaId = Number(acao.dataset.refId || 0);
            if (Number.isFinite(referenciaId) && referenciaId > 0) {
                irParaMensagemTimeline(referenciaId);
            }
            return;
        }

        const card = event.target.closest(".aprendizado-card");
        const aprendizadoId = Number(card?.dataset?.aprendizadoId || 0);
        if (!Number.isFinite(aprendizadoId) || aprendizadoId <= 0) return;

        if (acao.dataset.aprendizadoAction === "aprovar") {
            validarAprendizadoVisual(aprendizadoId, "aprovar", card);
            return;
        }

        if (acao.dataset.aprendizadoAction === "rejeitar") {
            validarAprendizadoVisual(aprendizadoId, "rejeitar", card);
        }
    });

    Object.assign(NS, {
        renderizarPainelAprendizadosVisuais
    });
})();
