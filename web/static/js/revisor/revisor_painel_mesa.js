// ==========================================
// TARIEL.IA — REVISOR_PAINEL_MESA.JS
// Papel: operação da mesa e pacote técnico no painel do revisor.
// ==========================================

(function () {
    "use strict";

    const NS = window.TarielRevisorPainel;
    if (!NS || NS.__mesaWired__) return;
    NS.__mesaWired__ = true;

    const {
        tokenCsrf,
        els,
        state,
        escapeHtml,
        nl2br,
        formatarDataHora,
        normalizarAnexoMensagem,
        renderizarAnexosMensagem,
        showStatus,
        resumoMensagem,
        downloadJson,
        obterPacoteMesaLaudo,
        atualizarIndicadoresListaLaudo,
        openModal
    } = NS;

const renderizarItemOperacaoMesa = (item, { tipo = "aberta", permitirResponder = false } = {}) => {
        const mensagemId = Number(item?.id || 0);
        const referenciaId = Number(item?.referencia_mensagem_id || 0);
        const dataBase = tipo === "resolvida" ? item?.resolvida_em : item?.criado_em;
        const dataLabel = formatarDataHora(dataBase || item?.criado_em);
        const anexos = Array.isArray(item?.anexos) ? item.anexos.map(normalizarAnexoMensagem).filter(Boolean) : [];
        const texto = resumoMensagem(item?.texto || (anexos.length ? "Anexo enviado" : ""));
        const resolvedorNome = String(item?.resolvida_por_nome || "").trim();
        const titulo = tipo === "whisper"
            ? `Whisper #${mensagemId || "-"}`
            : `Mensagem #${mensagemId || "-"}`;
        const chipTexto = tipo === "resolvida"
            ? "Resolvida"
            : tipo === "whisper"
                ? "Whisper"
                : "Aberta";
        const subtitulo = tipo === "resolvida"
            ? `Resolvida em ${escapeHtml(dataLabel)}`
            : `Criada em ${escapeHtml(dataLabel)}`;
        const contextoBotao = referenciaId > 0
            ? `
                <button type="button" class="btn-mesa-acao" data-mesa-action="timeline-ref" data-ref-id="${referenciaId}">
                    <span class="material-symbols-rounded" aria-hidden="true">format_quote</span>
                    <span>Ver contexto</span>
                </button>
            `
            : "";
        const responderBotao = permitirResponder && mensagemId > 0
            ? `
                <button type="button" class="btn-mesa-acao" data-mesa-action="responder-item" data-msg-id="${mensagemId}">
                    <span class="material-symbols-rounded" aria-hidden="true">reply</span>
                    <span>Responder</span>
                </button>
            `
            : "";
        const botaoPendencia = mensagemId > 0 && tipo !== "whisper"
            ? `
                <button
                    type="button"
                    class="btn-mesa-acao"
                    data-mesa-action="alternar-pendencia"
                    data-msg-id="${mensagemId}"
                    data-proxima-lida="${tipo === "aberta" ? "true" : "false"}"
                >
                    <span class="material-symbols-rounded" aria-hidden="true">${tipo === "aberta" ? "task_alt" : "restart_alt"}</span>
                    <span>${tipo === "aberta" ? "Marcar resolvida" : "Reabrir"}</span>
                </button>
            `
            : "";

        return `
            <li class="mesa-operacao-item ${escapeHtml(tipo)}">
                <div class="mesa-operacao-item-topo">
                    <strong>${escapeHtml(titulo)}</strong>
                    <span class="mesa-operacao-chip ${escapeHtml(tipo)}">${escapeHtml(chipTexto)}</span>
                </div>
                <p>${escapeHtml(texto)}</p>
                ${renderizarAnexosMensagem(anexos)}
                <div class="mesa-operacao-meta">
                    <span>${subtitulo}</span>
                    ${referenciaId > 0 ? `<span>Ref. #${escapeHtml(String(referenciaId))}</span>` : "<span>Sem referência explícita</span>"}
                    ${tipo === "resolvida" && resolvedorNome ? `<span>Resolvida por ${escapeHtml(resolvedorNome)}</span>` : ""}
                </div>
                <div class="mesa-operacao-acoes">
                    <button type="button" class="btn-mesa-acao" data-mesa-action="timeline-msg" data-msg-id="${mensagemId}">
                        <span class="material-symbols-rounded" aria-hidden="true">forum</span>
                        <span>Ir para timeline</span>
                    </button>
                    ${contextoBotao}
                    ${botaoPendencia}
                    ${responderBotao}
                </div>
            </li>
        `;
    };

    const renderizarColunaOperacaoMesa = ({
        titulo,
        itens = [],
        tipo = "aberta",
        mensagemVazia,
        permitirResponder = false
    }) => {
        const lista = Array.isArray(itens) ? itens : [];
        const corpo = lista.length
            ? `
                <ul class="mesa-operacao-lista">
                    ${lista.slice(0, 5).map((item) => renderizarItemOperacaoMesa(item, { tipo, permitirResponder })).join("")}
                </ul>
            `
            : `<p class="mesa-operacao-vazio">${escapeHtml(mensagemVazia || "Sem registros no momento.")}</p>`;

        return `
            <section class="mesa-operacao-coluna">
                <header>
                    <h4>${escapeHtml(titulo)}</h4>
                    <span class="mesa-operacao-contagem">${escapeHtml(String(lista.length))}</span>
                </header>
                ${corpo}
            </section>
        `;
    };

    const obterResumoStatusOperacaoMesa = (pacote) => {
        const resumoPendencias = pacote?.resumo_pendencias || {};
        const abertas = Number(resumoPendencias.abertas || 0) || 0;
        const resolvidas = Number(resumoPendencias.resolvidas || 0) || 0;

        if (abertas > 0) {
            return {
                icone: "assignment_late",
                rotulo: abertas === 1 ? "1 pendência aberta" : `${abertas} pendências abertas`,
                descricao: "Há itens da mesa aguardando retorno do campo neste laudo.",
            };
        }

        if (resolvidas > 0) {
            return {
                icone: "task_alt",
                rotulo: "Fluxo com resoluções recentes",
                descricao: "A mesa já recebeu retorno do campo e não há pendências abertas agora.",
            };
        }

        return {
            icone: "hourglass_top",
            rotulo: "Canal em triagem",
            descricao: "Sem pendências abertas no momento. Acompanhe novas mensagens e whispers do laudo.",
        };
    };

    const renderizarPainelMesaOperacional = (pacote) => {
        if (!els.mesaOperacaoPainel || !els.mesaOperacaoConteudo) return;

        if (!pacote || typeof pacote !== "object") {
            els.mesaOperacaoPainel.hidden = true;
            els.mesaOperacaoConteudo.innerHTML = "";
            return;
        }

        const resumoPendencias = pacote.resumo_pendencias || {};
        const ultimaInteracao = formatarDataHora(pacote.ultima_interacao_em);
        const criadoEm = formatarDataHora(pacote.criado_em);
        const totalWhispers = Array.isArray(pacote.whispers_recentes) ? pacote.whispers_recentes.length : 0;
        const statusOperacional = obterResumoStatusOperacaoMesa(pacote);
        atualizarIndicadoresListaLaudo(state.laudoAtivoId, {
            pendenciasAbertas: Number(resumoPendencias.abertas || 0) || 0
        });

        els.mesaOperacaoConteudo.innerHTML = `
            <div class="mesa-operacao-topo">
                <div>
                    <h3>Operação da Mesa</h3>
                    <p>${escapeHtml(statusOperacional.descricao)}</p>
                </div>
                <span class="mesa-operacao-tag">
                    <span class="material-symbols-rounded" aria-hidden="true">${escapeHtml(statusOperacional.icone)}</span>
                    <span>${escapeHtml(statusOperacional.rotulo)}</span>
                </span>
            </div>

            <div class="mesa-operacao-resumo">
                <article class="mesa-operacao-kpi">
                    <span>Pendências abertas</span>
                    <strong>${escapeHtml(String(resumoPendencias.abertas || 0))}</strong>
                    <small>Mensagens da mesa ainda em aberto para o inspetor.</small>
                </article>
                <article class="mesa-operacao-kpi">
                    <span>Resolvidas</span>
                    <strong>${escapeHtml(String(resumoPendencias.resolvidas || 0))}</strong>
                    <small>Itens já encerrados pelo fluxo em campo.</small>
                </article>
                <article class="mesa-operacao-kpi">
                    <span>Última interação</span>
                    <strong>${escapeHtml(ultimaInteracao)}</strong>
                    <small>Laudo iniciado em ${escapeHtml(criadoEm)}.</small>
                </article>
                <article class="mesa-operacao-kpi">
                    <span>Tempo em campo</span>
                    <strong>${escapeHtml(String(pacote.tempo_em_campo_minutos || 0))} min</strong>
                    <small>${escapeHtml(String(totalWhispers))} whisper(s) recente(s) no canal.</small>
                </article>
            </div>

            <div class="mesa-operacao-grid">
                ${renderizarColunaOperacaoMesa({
                    titulo: "Pendências abertas",
                    itens: pacote.pendencias_abertas,
                    tipo: "aberta",
                    mensagemVazia: "Nenhuma pendência aberta neste momento.",
                    permitirResponder: true
                })}
                ${renderizarColunaOperacaoMesa({
                    titulo: "Resolvidas recentes",
                    itens: pacote.pendencias_resolvidas_recentes,
                    tipo: "resolvida",
                    mensagemVazia: "Ainda não há resoluções recentes para este laudo.",
                    permitirResponder: false
                })}
                ${renderizarColunaOperacaoMesa({
                    titulo: "Whispers recentes",
                    itens: pacote.whispers_recentes,
                    tipo: "whisper",
                    mensagemVazia: "Nenhum whisper recente registrado.",
                    permitirResponder: true
                })}
            </div>
        `;

        els.mesaOperacaoPainel.hidden = false;
    };

    const atualizarPendenciaMesaOperacional = async (mensagemId, lida) => {
        const laudoId = Number(state.laudoAtivoId || 0);
        const msgId = Number(mensagemId || 0);
        if (!Number.isFinite(laudoId) || laudoId <= 0 || !Number.isFinite(msgId) || msgId <= 0) {
            return;
        }

        try {
            const res = await fetch(`/revisao/api/laudo/${laudoId}/pendencias/${msgId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": tokenCsrf,
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: JSON.stringify({ lida: !!lida })
            });
            if (!res.ok) {
                throw new Error(`Falha HTTP ${res.status}`);
            }

            const payload = await res.json();
            atualizarIndicadoresListaLaudo(laudoId, {
                pendenciasAbertas: Number(payload?.pendencias_abertas || 0) || 0
            });
            await carregarPainelMesaOperacional({ forcar: true });
            showStatus(
                lida ? "Pendência marcada como resolvida." : "Pendência reaberta.",
                lida ? "task_alt" : "restart_alt"
            );
        } catch (erro) {
            showStatus("Erro ao atualizar pendência da mesa.", "error");
            console.error("[Tariel] Falha ao atualizar pendência da mesa:", erro);
        }
    };

    const carregarPainelMesaOperacional = async ({ forcar = false } = {}) => {
        if (!els.mesaOperacaoPainel || !els.mesaOperacaoConteudo || !state.laudoAtivoId) return;

        els.mesaOperacaoPainel.hidden = false;
        els.mesaOperacaoConteudo.innerHTML = `
            <div class="mesa-operacao-topo">
                <div>
                    <h3>Operação da Mesa</h3>
                    <p>Carregando pendências, resoluções e whispers do laudo...</p>
                </div>
            </div>
        `;

        try {
            const pacote = await obterPacoteMesaLaudo({ forcar });
            renderizarPainelMesaOperacional(pacote);
        } catch (erro) {
            els.mesaOperacaoConteudo.innerHTML = `
                <div class="mesa-operacao-topo">
                    <div>
                        <h3>Operação da Mesa</h3>
                        <p>Não foi possível carregar o pacote operacional da mesa agora.</p>
                    </div>
                </div>
            `;
            console.error("[Tariel] Falha ao renderizar painel operacional da mesa:", erro);
        }
    };

    const renderListaPacote = (itens, mensagemVazia) => {
        if (!Array.isArray(itens) || !itens.length) {
            return `<li>${escapeHtml(mensagemVazia || "Sem registros no momento.")}</li>`;
        }

        return itens.slice(0, 8).map((item) => {
            const anexos = Array.isArray(item?.anexos) ? item.anexos.map(normalizarAnexoMensagem).filter(Boolean) : [];
            const texto = resumoMensagem(item?.texto || (anexos.length ? "Anexo enviado" : ""));
            const data = formatarDataHora(item?.criado_em);
            const tipo = String(item?.tipo || "mensagem");
            const status = item?.resolvida_em
                ? `Resolvida em ${formatarDataHora(item.resolvida_em)}`
                : "Aberta";
            const infoAnexos = anexos.length
                ? `<span class="meta">Anexos: ${escapeHtml(anexos.map((anexo) => anexo.nome).join(", "))}</span>`
                : "";

            return `
                <li>
                    <strong>#${escapeHtml(String(item?.id || "-"))} · ${escapeHtml(tipo)}</strong><br>
                    ${escapeHtml(texto)}
                    <span class="meta">${escapeHtml(data)} · ${escapeHtml(status)}</span>
                    ${infoAnexos}
                </li>
            `;
        }).join("");
    };

    const renderizarModalPacote = (pacote) => {
        if (!pacote || typeof pacote !== "object") {
            els.modalPacoteConteudo.innerHTML = "<p>Pacote técnico indisponível para este laudo.</p>";
            return;
        }

        const resumoMensagens = pacote.resumo_mensagens || {};
        const resumoEvidencias = pacote.resumo_evidencias || {};
        const resumoPendencias = pacote.resumo_pendencias || {};
        const hashCurto = String(pacote.codigo_hash || "").slice(-6) || "-";

        els.modalPacoteConteudo.innerHTML = `
            <div class="pacote-meta">
                <strong>Laudo #${escapeHtml(hashCurto)}</strong> ·
                Template ${escapeHtml(String(pacote.tipo_template || "").toUpperCase())} ·
                Setor ${escapeHtml(String(pacote.setor_industrial || "-"))} ·
                Última interação: ${escapeHtml(formatarDataHora(pacote.ultima_interacao_em))}
            </div>

            <div class="pacote-grid">
                <section class="pacote-card">
                    <h4>Mensagens</h4>
                    <div class="pacote-kpi"><span>Total</span><strong>${escapeHtml(String(resumoMensagens.total || 0))}</strong></div>
                    <div class="pacote-kpi"><span>Inspetor</span><span>${escapeHtml(String(resumoMensagens.inspetor || 0))}</span></div>
                    <div class="pacote-kpi"><span>IA</span><span>${escapeHtml(String(resumoMensagens.ia || 0))}</span></div>
                    <div class="pacote-kpi"><span>Mesa</span><span>${escapeHtml(String(resumoMensagens.mesa || 0))}</span></div>
                </section>

                <section class="pacote-card">
                    <h4>Evidências</h4>
                    <div class="pacote-kpi"><span>Total</span><strong>${escapeHtml(String(resumoEvidencias.total || 0))}</strong></div>
                    <div class="pacote-kpi"><span>Textuais</span><span>${escapeHtml(String(resumoEvidencias.textuais || 0))}</span></div>
                    <div class="pacote-kpi"><span>Fotos</span><span>${escapeHtml(String(resumoEvidencias.fotos || 0))}</span></div>
                    <div class="pacote-kpi"><span>Documentos</span><span>${escapeHtml(String(resumoEvidencias.documentos || 0))}</span></div>
                </section>

                <section class="pacote-card">
                    <h4>Pendências</h4>
                    <div class="pacote-kpi"><span>Total</span><strong>${escapeHtml(String(resumoPendencias.total || 0))}</strong></div>
                    <div class="pacote-kpi"><span>Abertas</span><span>${escapeHtml(String(resumoPendencias.abertas || 0))}</span></div>
                    <div class="pacote-kpi"><span>Resolvidas</span><span>${escapeHtml(String(resumoPendencias.resolvidas || 0))}</span></div>
                    <div class="pacote-kpi"><span>Tempo em campo</span><span>${escapeHtml(String(pacote.tempo_em_campo_minutos || 0))} min</span></div>
                </section>
            </div>

            <h3 style="margin:0 0 10px; color:var(--cor-secundaria);">Pendências Abertas</h3>
            <ul class="pacote-lista">${renderListaPacote(pacote.pendencias_abertas, "Sem pendências abertas.")}</ul>

            <h3 style="margin:18px 0 10px; color:var(--cor-secundaria);">Whispers Recentes</h3>
            <ul class="pacote-lista">${renderListaPacote(pacote.whispers_recentes, "Sem whispers registrados.")}</ul>
        `;
    };

    const abrirResumoPacoteMesa = async () => {
        if (!state.laudoAtivoId) return;
        try {
            showStatus("Carregando pacote técnico...", "sync");
            const pacote = await obterPacoteMesaLaudo({ forcar: true });
            renderizarModalPacote(pacote);
            openModal(els.modalPacote, els.btnFecharPacote);
        } catch (erro) {
            showStatus("Erro ao carregar pacote técnico.", "error");
            console.error("[Tariel] Falha ao carregar pacote técnico:", erro);
        }
    };

    const baixarPacoteMesaJson = async () => {
        if (!state.laudoAtivoId) return;
        try {
            const pacote = await obterPacoteMesaLaudo({ forcar: false });
            if (!pacote) return;
            const hashCurto = String(pacote.codigo_hash || state.laudoAtivoId).slice(-6);
            downloadJson(`pacote_mesa_${hashCurto}.json`, pacote);
            showStatus("Pacote JSON baixado.", "download_done");
        } catch (erro) {
            showStatus("Erro ao baixar pacote JSON.", "error");
            console.error("[Tariel] Falha ao baixar pacote JSON:", erro);
        }
    };

    const baixarPacoteMesaPdf = () => {
        if (!state.laudoAtivoId) return;
        const url = `/revisao/api/laudo/${state.laudoAtivoId}/pacote/exportar-pdf`;
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
        showStatus("Gerando PDF do pacote...", "picture_as_pdf");
    };

    const renderizarModalRelatorio = () => {
        if (!state.jsonEstruturadoAtivo) {
            els.modalConteudo.innerHTML = "<p>Sem dados estruturados.</p>";
            return;
        }

        const data = state.jsonEstruturadoAtivo;
        let html = "";

        if (data.resumo_executivo) {
            html += `
                <div class="relatorio-resumo">
                    <strong>Resumo (IA):</strong><br>
                    ${nl2br(data.resumo_executivo)}
                </div>
            `;
        }

        const secoes = [
            { k: "seguranca_estrutural", t: "SEGURANÇA ESTRUTURAL" },
            { k: "cmar", t: "CMAR" }
        ];

        secoes.forEach((secao) => {
            const bloco = data[secao.k];
            if (!bloco) return;

            html += `<h3 style="color:var(--cor-secundaria); margin:20px 0 0;">${escapeHtml(secao.t)}</h3>`;
            html += `
                <table class="tabela-relatorio">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Cond</th>
                            <th>Obs</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            Object.entries(bloco).forEach(([chave, valor]) => {
                if (!valor || !valor.condicao) return;
                const cond = String(valor.condicao).toUpperCase();
                const klass = cond === "C" ? "cond-C" : cond === "NC" ? "cond-NC" : "";

                html += `
                    <tr>
                        <td>${escapeHtml(chave.replace(/_/g, " ").toUpperCase())}</td>
                        <td class="${klass}">${escapeHtml(valor.condicao)}</td>
                        <td>${escapeHtml(valor.observacao || "-")}</td>
                    </tr>
                `;
            });

            html += `</tbody></table>`;
        });

        els.modalConteudo.innerHTML = html || "<p>Sem conteúdo estruturado disponível.</p>";
    };

    Object.assign(NS, {
        renderizarItemOperacaoMesa,
        renderizarColunaOperacaoMesa,
        obterResumoStatusOperacaoMesa,
        renderizarPainelMesaOperacional,
        atualizarPendenciaMesaOperacional,
        carregarPainelMesaOperacional,
        renderListaPacote,
        renderizarModalPacote,
        abrirResumoPacoteMesa,
        baixarPacoteMesaJson,
        baixarPacoteMesaPdf,
        renderizarModalRelatorio
    });
})();
