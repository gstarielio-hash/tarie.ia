(() => {
    "use strict";

    const config = window.__TARIEL_TEMPLATE_CONFIG__ || {};
    const csrf = String(
        config.csrfToken ||
        document.querySelector('meta[name="csrf-token"]')?.content ||
        "",
    );

    const els = {
        lista: document.getElementById("lista"),
        statusLista: document.getElementById("status-lista"),
        search: document.getElementById("search-templates"),
        filtroModo: document.getElementById("filter-modo"),
        filtroStatusTemplate: document.getElementById("filter-status-template"),
        sortTemplates: document.getElementById("sort-templates"),
        filtroAtivo: document.getElementById("flt-ativo"),
        filtroRascunho: document.getElementById("flt-rascunho"),
        btnRefresh: document.getElementById("btn-refresh"),
        btnLimparFiltros: document.getElementById("btn-limpar-filtros"),
        metricTotal: document.getElementById("metric-total"),
        metricWord: document.getElementById("metric-word"),
        metricAtivo: document.getElementById("metric-ativo"),
        metricTesting: document.getElementById("metric-testing"),
        metricUsage: document.getElementById("metric-usage"),
        metricLastUse: document.getElementById("metric-last-use") || document.querySelector("[data-metric-last-use]"),
        auditList: document.getElementById("template-audit-list"),
        auditStatus: document.getElementById("status-auditoria"),
        btnRefreshAudit: document.getElementById("btn-refresh-audit"),
        selectionToolbar: document.getElementById("selection-toolbar"),
        selectionCount: document.getElementById("selection-count"),
        selectionHint: document.getElementById("selection-hint"),
        btnCompareSelected: document.getElementById("btn-compare-selected"),
        btnBatchTesting: document.getElementById("btn-batch-testing"),
        btnBatchLegacy: document.getElementById("btn-batch-legacy"),
        btnBatchArchive: document.getElementById("btn-batch-archive"),
        btnBatchDelete: document.getElementById("btn-batch-delete"),
        btnClearSelection: document.getElementById("btn-clear-selection"),
        diffModal: document.getElementById("template-diff-modal"),
        diffTitle: document.getElementById("template-diff-title"),
        diffSubtitle: document.getElementById("template-diff-subtitle"),
        diffSummaryFields: document.getElementById("template-diff-summary-fields"),
        diffSummaryAdded: document.getElementById("template-diff-summary-added"),
        diffSummaryRemoved: document.getElementById("template-diff-summary-removed"),
        diffSummaryHidden: document.getElementById("template-diff-summary-hidden"),
        diffBaseCard: document.getElementById("template-diff-base-card"),
        diffCompCard: document.getElementById("template-diff-comp-card"),
        diffFields: document.getElementById("template-diff-fields"),
        diffLines: document.getElementById("template-diff-lines"),
        btnCloseDiff: document.getElementById("btn-close-template-diff"),
    };

    if (!els.lista) return;

    const state = {
        itens: [],
        busca: "",
        modo: "todos",
        statusTemplate: "todos",
        ordenacao: "recentes",
        incluirAtivos: true,
        incluirRascunhos: true,
        renderToken: 0,
        thumbCache: new Map(),
        selectedIds: new Set(),
        auditoria: [],
    };

    const html = (valor) => String(valor || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");

    const status = (msg = "", tipo = "") => {
        if (!els.statusLista) return;
        els.statusLista.textContent = msg;
        els.statusLista.classList.remove("ok", "err");
        if (tipo === "ok") els.statusLista.classList.add("ok");
        if (tipo === "err") els.statusLista.classList.add("err");
    };

    const statusAuditoria = (msg = "", tipo = "") => {
        if (!els.auditStatus) return;
        els.auditStatus.textContent = msg;
        els.auditStatus.classList.remove("ok", "err");
        if (tipo === "ok") els.auditStatus.classList.add("ok");
        if (tipo === "err") els.auditStatus.classList.add("err");
    };

    const erroHttp = async (res) => {
        try {
            const payload = await res.json();
            return payload.detail || payload.erro || `HTTP ${res.status}`;
        } catch (_) {
            return `HTTP ${res.status}`;
        }
    };

    const modoTemplate = (item) => (item.is_editor_rico ? "word" : "pdf");
    const statusTemplate = (item) => String(item.status_template || (item.ativo ? "ativo" : "rascunho"));
    const dataAtualizacao = (item) => String(item.atualizado_em || item.criado_em || "");
    const dataUltimoUso = (item) => String(item.ultima_utilizacao_em || "");
    const labelStatusTemplate = (item) => String(item.status_template_label || statusTemplate(item));
    const codigoTemplate = (item) => String(item.codigo_template || "").trim();
    const origemBaseRecomendada = (item) => String(item?.base_recomendada_origem || item?.grupo_base_recomendada_origem || "").trim().toLowerCase();
    const baseRecomendadaManual = (item) => origemBaseRecomendada(item) === "manual";

    const obterItemPorId = (id) => state.itens.find((item) => Number(item.id) === Number(id)) || null;

    const _dataComparable = (item) => {
        const atualizado = Date.parse(String(item.atualizado_em || ""));
        if (Number.isFinite(atualizado)) return atualizado;
        const criado = Date.parse(String(item.criado_em || ""));
        if (Number.isFinite(criado)) return criado;
        return Number(item.id || 0);
    };

    const formatarDataPtBr = (iso) => {
        const data = new Date(String(iso || ""));
        if (!Number.isFinite(data.getTime())) return "-";
        return data.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    };

    const formatarDataHoraPtBr = (iso) => {
        const data = new Date(String(iso || ""));
        if (!Number.isFinite(data.getTime())) return "-";
        return data.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const reconciliarSelecao = () => {
        const idsValidos = new Set(state.itens.map((item) => Number(item.id)));
        state.selectedIds = new Set([...state.selectedIds].filter((id) => idsValidos.has(Number(id))));
    };

    const obterItensSelecionados = () => state.itens.filter((item) => state.selectedIds.has(Number(item.id)));

    const obterParComparacaoSelecionado = () => {
        const selecionados = obterItensSelecionados();
        if (selecionados.length !== 2) {
            return { erro: "Selecione exatamente duas versões para comparar." };
        }
        const [a, b] = selecionados;
        if (codigoTemplate(a) !== codigoTemplate(b)) {
            return { erro: "A comparação em lote exige duas versões do mesmo código de template." };
        }
        const ordenados = [...selecionados].sort((primeiro, segundo) => {
            const versaoDiff = Number(primeiro.versao || 0) - Number(segundo.versao || 0);
            if (versaoDiff !== 0) return versaoDiff;
            return Number(primeiro.id || 0) - Number(segundo.id || 0);
        });
        return { base: ordenados[0], comparado: ordenados[1] };
    };

    const atualizarBarraSelecao = () => {
        const selecionados = obterItensSelecionados();
        const total = selecionados.length;
        if (els.selectionToolbar) {
            els.selectionToolbar.hidden = total === 0;
        }
        if (els.selectionCount) {
            els.selectionCount.textContent = `${total} selecionado${total === 1 ? "" : "s"}`;
        }

        if (els.selectionHint) {
            if (total === 0) {
                els.selectionHint.textContent = "Selecione versões do mesmo código para comparar.";
            } else if (total === 1) {
                els.selectionHint.textContent = "Escolha mais uma versão do mesmo código para abrir o diff.";
            } else {
                const par = obterParComparacaoSelecionado();
                els.selectionHint.textContent = par.erro || `Comparação pronta para ${codigoTemplate(par.base)}.`;
            }
        }

        if (els.btnCompareSelected) {
            const par = obterParComparacaoSelecionado();
            els.btnCompareSelected.disabled = Boolean(par.erro);
        }
    };

    const fecharModalDiff = () => {
        if (els.diffModal) {
            els.diffModal.hidden = true;
        }
    };

    const abrirModalDiff = () => {
        if (els.diffModal) {
            els.diffModal.hidden = false;
        }
    };

    const atualizarMetricas = () => {
        const total = state.itens.length;
        const totalWord = state.itens.filter((x) => x.is_editor_rico).length;
        const totalAtivo = state.itens.filter((x) => x.ativo).length;
        const totalTesting = state.itens.filter((x) => statusTemplate(x) === "em_teste").length;
        const grupos = construirGrupos(state.itens);
        const totalUso = grupos.reduce((acc, grupo) => acc + (Number(grupo.totalUso || 0) || 0), 0);
        const ultimoUso = [...grupos]
            .filter((grupo) => !!grupo.ultimoUso)
            .sort((a, b) => Date.parse(String(b.ultimoUso || "")) - Date.parse(String(a.ultimoUso || "")))[0];

        if (els.metricTotal) els.metricTotal.textContent = String(total);
        if (els.metricWord) els.metricWord.textContent = String(totalWord);
        if (els.metricAtivo) els.metricAtivo.textContent = String(totalAtivo);
        if (els.metricTesting) els.metricTesting.textContent = String(totalTesting);
        if (els.metricUsage) els.metricUsage.textContent = String(totalUso);
        if (els.metricLastUse) els.metricLastUse.textContent = ultimoUso?.ultimoUso ? formatarDataPtBr(ultimoUso.ultimoUso) : "-";
    };

    const filtrar = () => {
        const filtrados = state.itens.filter((item) => {
            const textoBusca = `${item.nome || ""} ${item.codigo_template || ""}`.toLowerCase();
            if (state.busca && !textoBusca.includes(state.busca)) return false;
            if (state.modo !== "todos" && modoTemplate(item) !== state.modo) return false;
            if (state.statusTemplate !== "todos" && statusTemplate(item) !== state.statusTemplate) return false;

            const st = statusTemplate(item);
            if (!state.incluirAtivos && st === "ativo") return false;
            if (!state.incluirRascunhos && st === "rascunho") return false;
            return true;
        });

        if (state.ordenacao === "nome") {
            filtrados.sort((a, b) =>
                String(a.nome || a.codigo_template || "").localeCompare(
                    String(b.nome || b.codigo_template || ""),
                    "pt-BR",
                    { sensitivity: "base" },
                ));
            return filtrados;
        }

        if (state.ordenacao === "ativos") {
            filtrados.sort((a, b) => {
                const ativoA = a.ativo ? 1 : 0;
                const ativoB = b.ativo ? 1 : 0;
                if (ativoA !== ativoB) return ativoB - ativoA;
                return _dataComparable(b) - _dataComparable(a);
            });
            return filtrados;
        }

        filtrados.sort((a, b) => _dataComparable(b) - _dataComparable(a));
        return filtrados;
    };

    const atualizarStatusTemplate = async (id, novoStatus) => {
        const res = await fetch(`/revisao/api/templates-laudo/${Number(id)}/status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrf,
                "X-Requested-With": "XMLHttpRequest",
            },
            body: JSON.stringify({ status_template: novoStatus }),
        });
        if (!res.ok) throw new Error(await erroHttp(res));
        return res.json();
    };

    const atualizarStatusTemplateEmLote = async (ids, novoStatus) => {
        const res = await fetch("/revisao/api/templates-laudo/lote/status", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrf,
                "X-Requested-With": "XMLHttpRequest",
            },
            body: JSON.stringify({ template_ids: ids, status_template: novoStatus }),
        });
        if (!res.ok) throw new Error(await erroHttp(res));
        return res.json();
    };

    const excluirTemplatesEmLote = async (ids) => {
        const res = await fetch("/revisao/api/templates-laudo/lote/excluir", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrf,
                "X-Requested-With": "XMLHttpRequest",
            },
            body: JSON.stringify({ template_ids: ids }),
        });
        if (!res.ok) throw new Error(await erroHttp(res));
        return res.json();
    };

    const clonarTemplate = async (id) => {
        const res = await fetch(`/revisao/api/templates-laudo/${Number(id)}/clonar`, {
            method: "POST",
            headers: {
                "X-CSRF-Token": csrf,
                "X-Requested-With": "XMLHttpRequest",
            },
        });
        if (!res.ok) throw new Error(await erroHttp(res));
        return res.json();
    };

    const promoverBaseRecomendada = async (id) => {
        const res = await fetch(`/revisao/api/templates-laudo/${Number(id)}/base-recomendada`, {
            method: "POST",
            headers: {
                "X-CSRF-Token": csrf,
                "X-Requested-With": "XMLHttpRequest",
            },
        });
        if (!res.ok) throw new Error(await erroHttp(res));
        return res.json();
    };

    const restaurarBaseRecomendadaAutomatica = async (id) => {
        const res = await fetch(`/revisao/api/templates-laudo/${Number(id)}/base-recomendada`, {
            method: "DELETE",
            headers: {
                "X-CSRF-Token": csrf,
                "X-Requested-With": "XMLHttpRequest",
            },
        });
        if (!res.ok) throw new Error(await erroHttp(res));
        return res.json();
    };

    const obterDiffTemplates = async (baseId, comparadoId) => {
        const params = new URLSearchParams({
            base_id: String(Number(baseId)),
            comparado_id: String(Number(comparadoId)),
        });
        const res = await fetch(`/revisao/api/templates-laudo/diff?${params.toString()}`, {
            headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        if (!res.ok) throw new Error(await erroHttp(res));
        return res.json();
    };

    const renderDiffModal = (payload) => {
        if (!els.diffModal) return;
        const base = payload.base || {};
        const comparado = payload.comparado || {};
        const resumo = payload.resumo || {};
        const campos = Array.isArray(payload.comparacao_campos) ? payload.comparacao_campos : [];
        const linhas = Array.isArray(payload.diff_linhas) ? payload.diff_linhas : [];

        if (els.diffTitle) {
            els.diffTitle.textContent = `${html(base.codigo_template || comparado.codigo_template || "Template")} · v${Number(base.versao || 1)} x v${Number(comparado.versao || 1)}`;
        }
        if (els.diffSubtitle) {
            els.diffSubtitle.textContent = `Comparando ${base.nome || "Base"} com ${comparado.nome || "Comparado"} na mesa documental.`;
        }
        if (els.diffSummaryFields) els.diffSummaryFields.textContent = String(Number(resumo.campos_alterados || 0));
        if (els.diffSummaryAdded) els.diffSummaryAdded.textContent = String(Number(resumo.linhas_adicionadas || 0));
        if (els.diffSummaryRemoved) els.diffSummaryRemoved.textContent = String(Number(resumo.linhas_removidas || 0));
        if (els.diffSummaryHidden) els.diffSummaryHidden.textContent = String(Number(resumo.linhas_ocultas || 0));

        if (els.diffBaseCard) {
            els.diffBaseCard.innerHTML = `
                <span class="badge ${html(String(base.status_template || "rascunho"))}">${html(String(base.status_template_label || base.status_template || "Rascunho"))}</span>
                <strong>${html(String(base.nome || "Versão base"))}</strong>
                <small>${html(String(base.codigo_template || ""))} · v${Number(base.versao || 1)}</small>
                <small>${base.ativo ? "Ativo em operação" : "Versão não ativa"}</small>
            `;
        }
        if (els.diffCompCard) {
            els.diffCompCard.innerHTML = `
                <span class="badge ${html(String(comparado.status_template || "rascunho"))}">${html(String(comparado.status_template_label || comparado.status_template || "Rascunho"))}</span>
                <strong>${html(String(comparado.nome || "Versão comparada"))}</strong>
                <small>${html(String(comparado.codigo_template || ""))} · v${Number(comparado.versao || 1)}</small>
                <small>${comparado.ativo ? "Ativo em operação" : "Versão não ativa"}</small>
            `;
        }
        if (els.diffFields) {
            els.diffFields.innerHTML = campos.map((campo) => `
                <div class="template-diff-field ${campo.mudou ? "changed" : ""}">
                    <strong>${html(String(campo.campo || ""))}</strong>
                    <div class="template-diff-field-values">
                        <span>${html(String(campo.base || "-"))}</span>
                        <span>${html(String(campo.comparado || "-"))}</span>
                    </div>
                </div>
            `).join("");
        }
        if (els.diffLines) {
            els.diffLines.innerHTML = linhas.map((linha) => `
                <div class="template-diff-line ${html(String(linha.tipo || "contexto"))}">
                    <span class="template-diff-line-marker">${linha.tipo === "adicionado" ? "+" : linha.tipo === "removido" ? "-" : "·"}</span>
                    <code>${html(String(linha.texto || ""))}</code>
                </div>
            `).join("") || '<div class="template-diff-empty">Nenhuma diferença textual relevante foi detectada.</div>';
        }
        abrirModalDiff();
    };

    const obterAuditoriaTemplates = async (limite = 12) => {
        const params = new URLSearchParams({ limite: String(Number(limite || 12)) });
        const res = await fetch(`/revisao/api/templates-laudo/auditoria?${params.toString()}`, {
            headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        if (!res.ok) throw new Error(await erroHttp(res));
        return res.json();
    };

    const labelAcaoAuditoria = (item) => {
        const acao = String(item?.acao || "").trim().toLowerCase();
        const mapa = {
            template_criado_word: "Template Word criado",
            template_importado_pdf: "PDF base importado",
            template_publicado: "Versão publicada",
            template_base_recomendada_promovida: "Base recomendada promovida",
            template_base_recomendada_automatica_restaurada: "Base automática restaurada",
            template_status_alterado: "Ciclo atualizado",
            template_status_lote_alterado: "Ciclo atualizado em lote",
            template_excluido: "Template excluído",
            template_excluido_lote: "Exclusão em lote",
            template_clonado: "Nova versão clonada",
        };
        return mapa[acao] || acao.replaceAll("_", " ") || "Evento";
    };

    const tomAcaoAuditoria = (item) => {
        const acao = String(item?.acao || "").trim().toLowerCase();
        if (acao.includes("excluido")) return "danger";
        if (acao.includes("publicado")) return "success";
        if (acao.includes("clonado")) return "info";
        if (acao.includes("base_recomendada")) return "accent";
        const destino = String(item?.payload?.status_destino || item?.payload?.template_depois?.status_template || item?.payload?.status_template || "").trim().toLowerCase();
        if (destino === "arquivado") return "neutral";
        if (destino === "legado") return "warning";
        if (destino === "em_teste") return "accent";
        if (destino === "ativo") return "success";
        return "default";
    };

    const detalheAuditoria = (item) => {
        const detalhe = String(item?.detalhe || "").trim();
        if (detalhe) return detalhe;
        const payload = item?.payload || {};
        const total = Number(payload.total || 0);
        if (total > 1) return `${total} template(s) impactado(s) nesta ação.`;
        const template = payload.base_recomendada_atual || payload.template_recomendado || payload.template_clone || payload.template_depois || payload.template_antes || payload;
        if (template?.codigo_template) return `${template.codigo_template} • v${Number(template.versao || 1)}`;
        return "Ação registrada na biblioteca de templates.";
    };

    const renderAuditoria = () => {
        if (!els.auditList) return;
        const itens = Array.isArray(state.auditoria) ? state.auditoria : [];
        if (!itens.length) {
            els.auditList.innerHTML = `
                <div class="audit-empty">
                    <strong>Nenhuma atividade registrada ainda</strong>
                    <p>Publicações, alterações de ciclo, clonagens e exclusões passam a aparecer aqui conforme a biblioteca for sendo operada.</p>
                </div>
            `;
            return;
        }

        els.auditList.innerHTML = itens.map((item) => `
            <article class="audit-item">
                <div class="audit-item-head">
                    <div class="audit-item-copy">
                        <strong>${html(String(item.resumo || "Ação registrada"))}</strong>
                        <span class="audit-item-meta">Por ${html(String(item.ator_nome || "Sistema"))} • ${html(String(item.criado_em_label || "Agora"))}</span>
                    </div>
                    <span class="audit-pill ${html(tomAcaoAuditoria(item))}">${html(labelAcaoAuditoria(item))}</span>
                </div>
                <p class="audit-item-detail">${html(detalheAuditoria(item))}</p>
            </article>
        `).join("");
    };

    const prioridadeBaseRecomendada = (item) => {
        const prioridadeStatus = {
            ativo: 50,
            em_teste: 40,
            rascunho: 30,
            legado: 20,
            arquivado: 10,
        };
        return {
            prioridade: Number(prioridadeStatus[statusTemplate(item)] || 0),
            versao: Number(item?.versao || 0),
            modo: item?.is_editor_rico ? 1 : 0,
            id: Number(item?.id || 0),
        };
    };

    const compararPrioridadeBase = (a, b) => {
        const prioridadeA = prioridadeBaseRecomendada(a);
        const prioridadeB = prioridadeBaseRecomendada(b);
        if (prioridadeA.prioridade !== prioridadeB.prioridade) return prioridadeB.prioridade - prioridadeA.prioridade;
        if (prioridadeA.versao !== prioridadeB.versao) return prioridadeB.versao - prioridadeA.versao;
        if (prioridadeA.modo !== prioridadeB.modo) return prioridadeB.modo - prioridadeA.modo;
        return prioridadeB.id - prioridadeA.id;
    };

    const motivoBaseRecomendada = (item) => {
        const motivo = String(item?.base_recomendada_motivo || "").trim();
        if (motivo) return motivo;
        if (baseRecomendadaManual(item)) return "Base promovida manualmente pela mesa";
        const st = statusTemplate(item);
        if (st === "ativo") return "Versão ativa em operação";
        if (st === "em_teste") return "Versão em teste mais madura";
        if (st === "rascunho") return "Rascunho mais recente do grupo";
        if (st === "legado") return "Legado mais recente para referência";
        return "Última versão arquivada disponível";
    };

    const construirGrupos = (itens) => {
        const grupos = new Map();
        itens.forEach((item) => {
            const codigo = codigoTemplate(item);
            if (!codigo) return;
            if (!grupos.has(codigo)) grupos.set(codigo, []);
            grupos.get(codigo).push(item);
        });

        const listaGrupos = [...grupos.entries()].map(([codigo, itensGrupo]) => {
            const versoes = [...itensGrupo].sort((a, b) => {
                const diffVersao = Number(b.versao || 0) - Number(a.versao || 0);
                if (diffVersao !== 0) return diffVersao;
                return Number(b.id || 0) - Number(a.id || 0);
            });
            const recomendada = versoes.find((item) => !!item.is_base_recomendada) || [...versoes].sort(compararPrioridadeBase)[0] || versoes[0];
            const ativa = versoes.find((item) => !!item.ativo) || null;
            const contratoGrupo = recomendada || versoes[0] || {};
            const ultimaAtualizacao = versoes
                .map((item) => Date.parse(dataAtualizacao(item)))
                .filter((valor) => Number.isFinite(valor))
                .sort((a, b) => b - a)[0] || 0;
            const ultimoUsoValido = versoes
                .map((item) => dataUltimoUso(item))
                .filter((valor) => !!valor)
                .sort((a, b) => Date.parse(String(b || "")) - Date.parse(String(a || "")))[0] || "";
            const totalWord = Number(contratoGrupo.grupo_total_word ?? versoes.filter((item) => item.is_editor_rico).length);
            const totalVersoes = Number(contratoGrupo.grupo_total_versoes ?? versoes.length);
            const totalPdf = Number(contratoGrupo.grupo_total_pdf ?? Math.max(0, totalVersoes - totalWord));
            const totalUso = Number(recomendada?.uso_total || versoes[0]?.uso_total || 0) || 0;

            return {
                codigo,
                itens: versoes,
                recomendada,
                ativa,
                totalVersoes,
                versoesVisiveis: versoes.length,
                totalWord,
                totalPdf,
                totalUso,
                ultimaAtualizacao,
                ultimoUso: ultimoUsoValido,
                versaoMaisRecente: Number(contratoGrupo.grupo_versao_mais_recente || versoes[0]?.versao || 0),
            };
        });

        listaGrupos.sort((a, b) => {
            if (state.ordenacao === "nome") {
                return String(a.codigo || "").localeCompare(String(b.codigo || ""), "pt-BR", { sensitivity: "base" });
            }
            if (state.ordenacao === "ativos") {
                const ativoA = a.ativa ? 1 : 0;
                const ativoB = b.ativa ? 1 : 0;
                if (ativoA !== ativoB) return ativoB - ativoA;
                return b.ultimaAtualizacao - a.ultimaAtualizacao;
            }
            return b.ultimaAtualizacao - a.ultimaAtualizacao;
        });

        return listaGrupos;
    };

    const renderAcoesTemplate = (item, { compact = false } = {}) => `
        <div class="${compact ? "template-version-actions" : "template-actions"}">
            <a class="btn ghost ${compact ? "btn-inline" : ""}" href="/revisao/templates-laudo/editor?template_id=${Number(item.id)}">Editar</a>
            <button class="btn ghost ${compact ? "btn-inline" : ""} js-clonar" data-id="${Number(item.id)}">Clonar</button>
            <button class="btn ghost ${compact ? "btn-inline" : ""} js-usar" data-id="${Number(item.id)}" ${item.ativo ? "disabled" : ""}>${item.ativo ? "Em uso" : "Ativar"}</button>
            <button class="btn ghost ${compact ? "btn-inline" : ""} js-promover-base" data-id="${Number(item.id)}" data-base-mode="${(item.is_base_recomendada && baseRecomendadaManual(item)) ? "automatico" : "promover"}">${(item.is_base_recomendada && baseRecomendadaManual(item)) ? "Voltar ao automático" : "Promover base"}</button>
            <button class="btn ghost ${compact ? "btn-inline" : ""} js-compare-single" data-id="${Number(item.id)}">Comparar</button>
            <button class="btn ghost ${compact ? "btn-inline" : ""} js-abrir-base" data-id="${Number(item.id)}">Base</button>
            <button class="btn ghost ${compact ? "btn-inline" : ""} js-excluir" data-id="${Number(item.id)}">Excluir</button>
        </div>
    `;

    const renderAcoesStatusTemplate = (item, { compact = false } = {}) => `
        <div class="${compact ? "template-version-status-actions" : "template-status-actions"}">
            <button class="btn ghost ${compact ? "btn-inline" : ""} js-status-template" data-id="${Number(item.id)}" data-status="em_teste">Em teste</button>
            <button class="btn ghost ${compact ? "btn-inline" : ""} js-status-template" data-id="${Number(item.id)}" data-status="legado">Legado</button>
            <button class="btn ghost ${compact ? "btn-inline" : ""} js-status-template" data-id="${Number(item.id)}" data-status="arquivado">Arquivar</button>
        </div>
    `;

    const renderLinhaVersao = (item, grupo) => {
        const id = Number(item.id);
        const modo = modoTemplate(item);
        const st = statusTemplate(item);
        const selecionado = state.selectedIds.has(id);
        const recomendado = Number(item.id) === Number(grupo.recomendada?.id || 0);
        const recomendadoManual = recomendado && baseRecomendadaManual(item);
        return `
            <article
                class="template-version-row ${selecionado ? "is-selected" : ""} ${recomendado ? "is-recommended" : ""}"
                data-template-version-id="${id}"
                data-id="${id}"
                data-codigo-template="${html(codigoTemplate(item))}"
                data-versao="${Number(item.versao || 1)}"
            >
                <div class="template-version-rail" aria-hidden="true">
                    <span class="template-version-dot"></span>
                </div>
                <div class="template-version-body">
                    <div class="template-version-head">
                        <div class="template-version-copy">
                            <div class="template-version-head-top">
                                <label class="template-select-toggle">
                                    <input class="js-select-template" type="checkbox" data-id="${id}" ${selecionado ? "checked" : ""}>
                                    <span>Selecionar</span>
                                </label>
                                ${recomendado ? '<span class="badge recommended">Base recomendada</span>' : ""}
                                ${recomendadoManual ? '<span class="badge manual_marker">Fixada pela mesa</span>' : ""}
                            </div>
                            <strong>${html(item.nome || "Sem nome")}</strong>
                            <small>v${Number(item.versao || 1)} • atualizado em ${formatarDataPtBr(dataAtualizacao(item))} • ${item.ativo ? "ativo em operação" : "versão histórica"}</small>
                        </div>
                    </div>
                    <div class="template-badges">
                        <span class="badge ${modo}">${modo === "word" ? "WORD" : "PDF BASE"}</span>
                        <span class="badge ${st}">${html(labelStatusTemplate(item))}</span>
                        ${item.ativo ? '<span class="badge active_marker">ATIVA</span>' : ""}
                        ${(Number(item.uso_em_campo || 0) || 0) > 0 ? `<span class="badge usage">EM CAMPO ${Number(item.uso_em_campo || 0) || 0}</span>` : ""}
                    </div>
                    ${renderAcoesTemplate(item, { compact: true })}
                    ${renderAcoesStatusTemplate(item, { compact: true })}
                </div>
            </article>
        `;
    };

    const render = () => {
        const itens = filtrar();
        const grupos = construirGrupos(itens);
        if (!grupos.length) {
            els.lista.innerHTML = `
                <div class="empty-state">
                    Nenhum template encontrado com os filtros atuais.
                </div>
            `;
            atualizarBarraSelecao();
            return;
        }

        els.lista.innerHTML = grupos.map((grupo, idx) => {
            const recomendada = grupo.recomendada;
            const modo = modoTemplate(recomendada);
            const st = statusTemplate(recomendada);
            const recomendadaManual = baseRecomendadaManual(recomendada);
            const resumoVersoes = grupo.versoesVisiveis === grupo.totalVersoes
                ? `${grupo.totalVersoes} versão${grupo.totalVersoes === 1 ? "" : "ões"}`
                : `${grupo.versoesVisiveis} de ${grupo.totalVersoes} versões visíveis`;
            return `
                <section
                    class="template-group-card"
                    data-codigo-template="${html(grupo.codigo)}"
                    style="--card-index:${idx};"
                >
                    <header class="template-group-head">
                        <div class="template-group-copy">
                            <span class="template-group-code">${html(grupo.codigo)}</span>
                            <h3 class="template-group-title">Árvore de versões • ${resumoVersoes}</h3>
                            <p class="template-group-meta">
                                Mais recente v${grupo.versaoMaisRecente}
                                ${grupo.ativa ? ` • ativa v${Number(grupo.ativa.versao || 1)}` : " • sem versão ativa"}
                                • uso total ${Number(grupo.totalUso || 0)}
                                ${grupo.ultimoUso ? ` • último uso ${formatarDataPtBr(grupo.ultimoUso)}` : ""}
                            </p>
                        </div>
                        <div class="template-group-summary">
                            <span class="badge recommended">${recomendadaManual ? "Base fixa" : "Base recomendada"} v${Number(recomendada?.versao || 1)}</span>
                            ${recomendadaManual ? '<span class="badge manual_marker">Mesa</span>' : ""}
                            <span class="badge word">${grupo.totalWord} WORD</span>
                            <span class="badge pdf">${grupo.totalPdf} PDF</span>
                            ${grupo.ativa ? '<span class="badge active_marker">ATIVA</span>' : '<span class="badge arquivado">SEM ATIVA</span>'}
                        </div>
                    </header>

                    <div class="template-group-featured">
                        <div class="template-preview template-preview-featured">
                            <div class="template-overlay-meta">
                                <span class="preview-chip ${modo}">${modo === "word" ? "Word" : "PDF"}</span>
                                <span class="preview-chip recommended">${recomendadaManual ? "Base fixa" : "Base recomendada"}</span>
                            </div>
                            <div class="thumb-frame thumb-frame-featured">
                                <canvas class="thumb-canvas" data-template-id="${Number(recomendada.id)}"></canvas>
                            </div>
                            <div class="thumb-loading" data-template-loading="${Number(recomendada.id)}">Carregando miniatura...</div>
                        </div>
                        <div class="template-featured-body">
                            <div>
                                <h3 class="template-title">${html(recomendada.nome || "Sem nome")}</h3>
                                <p class="template-meta">${html(recomendada.codigo_template || "")} • v${Number(recomendada.versao || 1)}</p>
                            </div>
                            <p class="template-recommended-copy">${html(motivoBaseRecomendada(recomendada))}</p>
                            <p class="template-updated">Atualizado em ${formatarDataPtBr(dataAtualizacao(recomendada))} • Uso total ${Number(recomendada.uso_total || 0) || 0}</p>
                            <div class="template-badges">
                                <span class="badge recommended">${recomendadaManual ? "Base fixa" : "Base recomendada"}</span>
                                ${recomendadaManual ? '<span class="badge manual_marker">Fixada pela mesa</span>' : ""}
                                <span class="badge ${modo}">${modo === "word" ? "WORD" : "PDF BASE"}</span>
                                <span class="badge ${st}">${html(labelStatusTemplate(recomendada))}</span>
                                ${recomendada.ativo ? '<span class="badge active_marker">ATIVA</span>' : ""}
                            </div>
                            ${renderAcoesTemplate(recomendada)}
                            ${renderAcoesStatusTemplate(recomendada)}
                        </div>
                    </div>

                    <div class="template-version-tree">
                        <div class="template-version-tree-head">
                            <strong>Versões do código ${html(grupo.codigo)}</strong>
                            <small>Use a seleção por versão para comparar duas revisões do mesmo grupo.</small>
                        </div>
                        <div class="template-version-list">
                            ${grupo.itens.map((item) => renderLinhaVersao(item, grupo)).join("")}
                        </div>
                    </div>
                </section>
            `;
        }).join("");
        atualizarBarraSelecao();
    };

    const garantirPdfJs = () => {
        if (!window.pdfjsLib) {
            throw new Error("PDF.js não carregado.");
        }
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = String(
                config.pdfWorkerUrl || "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
            );
        }
    };

    const dimensoesThumb = (canvas) => {
        const frame = canvas.closest(".thumb-frame");
        const largura = Math.max(140, Math.floor(frame?.clientWidth || 160));
        const altura = Math.max(198, Math.floor(largura * (297 / 210)));
        return { largura, altura };
    };

    const desenharDataUrlNoCanvas = async (canvas, dataUrl) => {
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = dataUrl;
        });
        const { largura, altura } = dimensoesThumb(canvas);
        canvas.width = largura;
        canvas.height = altura;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, largura, altura);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, largura, altura);

        const escala = Math.min(largura / Math.max(1, img.width), altura / Math.max(1, img.height));
        const destinoW = Math.floor(img.width * escala);
        const destinoH = Math.floor(img.height * escala);
        const x = Math.floor((largura - destinoW) / 2);
        const y = Math.floor((altura - destinoH) / 2);
        ctx.drawImage(img, x, y, destinoW, destinoH);
        canvas.classList.add("ready");
    };

    const renderizarThumbTemplate = async (templateId, canvas, loadingEl) => {
        const id = Number(templateId || 0);
        if (!id || !canvas) return;

        const cache = state.thumbCache.get(id);
        if (typeof cache === "string" && cache.startsWith("data:image/")) {
            await desenharDataUrlNoCanvas(canvas, cache);
            if (loadingEl) loadingEl.style.display = "none";
            return;
        }

        try {
            garantirPdfJs();
            const res = await fetch(`/revisao/api/templates-laudo/${id}/arquivo-base`, {
                headers: { "X-Requested-With": "XMLHttpRequest" },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const bytes = await res.arrayBuffer();
            const tarefa = window.pdfjsLib.getDocument({ data: bytes });
            const pdf = await tarefa.promise;
            const pagina = await pdf.getPage(1);

            const { largura, altura } = dimensoesThumb(canvas);
            const viewportBase = pagina.getViewport({ scale: 1 });
            const escala = Math.max(0.1, largura / Math.max(1, viewportBase.width));
            const viewport = pagina.getViewport({ scale });

            const canvasTemp = document.createElement("canvas");
            canvasTemp.width = Math.floor(viewport.width);
            canvasTemp.height = Math.floor(viewport.height);
            const ctxTemp = canvasTemp.getContext("2d", { alpha: false });
            if (!ctxTemp) throw new Error("Canvas temporário indisponível.");
            await pagina.render({ canvasContext: ctxTemp, viewport }).promise;

            canvas.width = largura;
            canvas.height = altura;
            const ctx = canvas.getContext("2d", { alpha: false });
            if (!ctx) throw new Error("Canvas context indisponível.");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, largura, altura);

            const escalaFit = Math.min(
                largura / Math.max(1, canvasTemp.width),
                altura / Math.max(1, canvasTemp.height),
            );
            const destinoW = Math.floor(canvasTemp.width * escalaFit);
            const destinoH = Math.floor(canvasTemp.height * escalaFit);
            const x = Math.floor((largura - destinoW) / 2);
            const y = Math.floor((altura - destinoH) / 2);
            ctx.drawImage(canvasTemp, x, y, destinoW, destinoH);

            canvas.classList.add("ready");
            state.thumbCache.set(id, canvas.toDataURL("image/jpeg", 0.85));
            if (loadingEl) loadingEl.style.display = "none";
        } catch (e) {
            if (loadingEl) {
                loadingEl.classList.add("error");
                loadingEl.textContent = "Sem miniatura";
            }
            state.thumbCache.set(id, "erro");
            console.warn("[Tariel] Falha ao gerar miniatura do template:", id, e);
        }
    };

    const renderizarMiniaturasVisiveis = async () => {
        const tokenAtual = ++state.renderToken;
        const canvases = [...els.lista.querySelectorAll(".thumb-canvas[data-template-id]")];
        if (!canvases.length) return;

        const fila = canvases.map((canvas) => ({
            canvas,
            templateId: Number(canvas.dataset.templateId || 0),
            loadingEl: els.lista.querySelector(`[data-template-loading="${canvas.dataset.templateId}"]`),
        }));

        const worker = async () => {
            while (fila.length > 0) {
                if (tokenAtual !== state.renderToken) return;
                const item = fila.shift();
                if (!item) return;
                await renderizarThumbTemplate(item.templateId, item.canvas, item.loadingEl);
            }
        };

        const concorrencia = Math.min(4, fila.length);
        await Promise.all(Array.from({ length: Math.max(1, concorrencia) }, () => worker()));
    };

    const carregar = async () => {
        status("Carregando templates...");
        try {
            const res = await fetch("/revisao/api/templates-laudo", {
                headers: { "X-Requested-With": "XMLHttpRequest" },
            });
            if (!res.ok) throw new Error(await erroHttp(res));
            const data = await res.json();
            state.itens = Array.isArray(data.itens) ? data.itens : [];
            reconciliarSelecao();
            atualizarMetricas();
            render();
            status(`${state.itens.length} template(s) na biblioteca.`, "ok");
            renderizarMiniaturasVisiveis().catch(() => {});
        } catch (e) {
            els.lista.innerHTML = `<div class="empty-state">Falha ao carregar templates.</div>`;
            status(`Erro: ${e.message}`, "err");
        } finally {
            carregarAuditoria({ silencioso: true }).catch(() => {});
        }
    };

    const carregarAuditoria = async ({ silencioso = false } = {}) => {
        if (!silencioso) statusAuditoria("Carregando histórico...");
        try {
            const data = await obterAuditoriaTemplates(12);
            state.auditoria = Array.isArray(data.itens) ? data.itens : [];
            renderAuditoria();
            statusAuditoria(`${state.auditoria.length} evento(s) recentes carregados.`, "ok");
        } catch (e) {
            state.auditoria = [];
            renderAuditoria();
            statusAuditoria(`Erro ao carregar histórico: ${e.message}`, "err");
        }
    };

    const usarTemplate = async (id) => {
        const item = obterItemPorId(id);
        if (!item) return;
        status("Aplicando template como ativo...");
        try {
            const fd = new FormData();
            fd.set("csrf_token", csrf);
            const endpoint = item.is_editor_rico
                ? `/revisao/api/templates-laudo/editor/${Number(id)}/publicar`
                : `/revisao/api/templates-laudo/${Number(id)}/publicar`;
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "X-CSRF-Token": csrf },
                body: fd,
            });
            if (!res.ok) throw new Error(await erroHttp(res));
            state.thumbCache.delete(Number(id));
            status("Template ativo para uso com sucesso.", "ok");
            await carregar();
        } catch (e) {
            status(`Erro ao usar template: ${e.message}`, "err");
        }
    };

    const excluir = async (id) => {
        const item = obterItemPorId(id);
        if (!item) return;
        const confirma = window.confirm(`Excluir template "${item.nome}"? Essa ação não pode ser desfeita.`);
        if (!confirma) return;

        status("Excluindo template...");
        try {
            const res = await fetch(`/revisao/api/templates-laudo/${Number(id)}`, {
                method: "DELETE",
                headers: { "X-CSRF-Token": csrf },
            });
            if (!res.ok) throw new Error(await erroHttp(res));
            state.thumbCache.delete(Number(id));
            state.selectedIds.delete(Number(id));
            status("Template excluído.", "ok");
            await carregar();
        } catch (e) {
            status(`Erro ao excluir: ${e.message}`, "err");
        }
    };

    const abrirBase = (id) => {
        window.open(`/revisao/api/templates-laudo/${Number(id)}/arquivo-base`, "_blank", "noopener,noreferrer");
    };

    const alternarSelecaoTemplate = (id, marcado) => {
        const templateId = Number(id || 0);
        if (!templateId) return;
        if (marcado) {
            state.selectedIds.add(templateId);
        } else {
            state.selectedIds.delete(templateId);
        }
        const card = els.lista.querySelector(`.template-version-row[data-template-version-id="${templateId}"]`);
        if (card) {
            card.classList.toggle("is-selected", marcado);
        }
        atualizarBarraSelecao();
    };

    const limparSelecao = () => {
        state.selectedIds.clear();
        els.lista.querySelectorAll(".js-select-template").forEach((input) => {
            input.checked = false;
        });
        els.lista.querySelectorAll(".template-version-row.is-selected").forEach((card) => {
            card.classList.remove("is-selected");
        });
        atualizarBarraSelecao();
    };

    const compararSelecionados = async () => {
        const par = obterParComparacaoSelecionado();
        if (par.erro) {
            status(par.erro, "err");
            return;
        }
        status("Comparando versões selecionadas...");
        try {
            const payload = await obterDiffTemplates(par.base.id, par.comparado.id);
            renderDiffModal(payload);
            status("Diff carregado para a mesa.", "ok");
        } catch (e) {
            status(`Erro ao comparar versões: ${e.message}`, "err");
        }
    };

    const compararComAnterior = async (templateId) => {
        const alvo = obterItemPorId(templateId);
        if (!alvo) return;
        const candidatos = state.itens
            .filter((item) => codigoTemplate(item) === codigoTemplate(alvo) && Number(item.id) !== Number(alvo.id))
            .sort((a, b) => Number(a.versao || 0) - Number(b.versao || 0));
        if (!candidatos.length) {
            status("Esse template ainda não tem outra versão para comparar.", "err");
            return;
        }
        const anterior = [...candidatos]
            .filter((item) => Number(item.versao || 0) < Number(alvo.versao || 0))
            .sort((a, b) => Number(b.versao || 0) - Number(a.versao || 0))[0]
            || candidatos[candidatos.length - 1];

        const base = Number(anterior.versao || 0) <= Number(alvo.versao || 0) ? anterior : alvo;
        const comparado = Number(base.id) === Number(alvo.id) ? anterior : alvo;
        status("Comparando versões do template...");
        try {
            const payload = await obterDiffTemplates(base.id, comparado.id);
            renderDiffModal(payload);
            status("Diff carregado para a mesa.", "ok");
        } catch (e) {
            status(`Erro ao comparar versões: ${e.message}`, "err");
        }
    };

    const executarAcaoLoteStatus = async (statusAlvo, labelAcao) => {
        const ids = obterItensSelecionados().map((item) => Number(item.id));
        if (!ids.length) {
            status("Selecione pelo menos um template para a ação em lote.", "err");
            return;
        }
        status(`${labelAcao} em lote...`);
        try {
            await atualizarStatusTemplateEmLote(ids, statusAlvo);
            limparSelecao();
            status(`Templates movidos para ${labelAcao.toLowerCase()}.`, "ok");
            await carregar();
        } catch (e) {
            status(`Erro na ação em lote: ${e.message}`, "err");
        }
    };

    const executarExclusaoLote = async () => {
        const ids = obterItensSelecionados().map((item) => Number(item.id));
        if (!ids.length) {
            status("Selecione pelo menos um template para excluir.", "err");
            return;
        }
        const confirma = window.confirm(`Excluir ${ids.length} template(s) selecionado(s)? Essa ação não pode ser desfeita.`);
        if (!confirma) return;
        status("Excluindo templates selecionados...");
        try {
            await excluirTemplatesEmLote(ids);
            ids.forEach((id) => state.thumbCache.delete(id));
            limparSelecao();
            status("Templates excluídos em lote.", "ok");
            await carregar();
        } catch (e) {
            status(`Erro ao excluir em lote: ${e.message}`, "err");
        }
    };

    const bind = () => {
        els.search?.addEventListener("input", () => {
            state.busca = String(els.search.value || "").trim().toLowerCase();
            render();
            renderizarMiniaturasVisiveis().catch(() => {});
        });

        els.filtroModo?.addEventListener("change", () => {
            state.modo = String(els.filtroModo.value || "todos");
            render();
            renderizarMiniaturasVisiveis().catch(() => {});
        });

        els.filtroStatusTemplate?.addEventListener("change", () => {
            state.statusTemplate = String(els.filtroStatusTemplate.value || "todos");
            render();
            renderizarMiniaturasVisiveis().catch(() => {});
        });

        els.sortTemplates?.addEventListener("change", () => {
            state.ordenacao = String(els.sortTemplates.value || "recentes");
            render();
            renderizarMiniaturasVisiveis().catch(() => {});
        });

        els.filtroAtivo?.addEventListener("change", () => {
            state.incluirAtivos = !!els.filtroAtivo.checked;
            render();
            renderizarMiniaturasVisiveis().catch(() => {});
        });

        els.filtroRascunho?.addEventListener("change", () => {
            state.incluirRascunhos = !!els.filtroRascunho.checked;
            render();
            renderizarMiniaturasVisiveis().catch(() => {});
        });

        els.btnRefresh?.addEventListener("click", carregar);
        els.btnRefreshAudit?.addEventListener("click", () => carregarAuditoria({ silencioso: false }));

        els.btnLimparFiltros?.addEventListener("click", () => {
            state.busca = "";
            state.modo = "todos";
            state.statusTemplate = "todos";
            state.ordenacao = "recentes";
            state.incluirAtivos = true;
            state.incluirRascunhos = true;
            if (els.search) els.search.value = "";
            if (els.filtroModo) els.filtroModo.value = "todos";
            if (els.filtroStatusTemplate) els.filtroStatusTemplate.value = "todos";
            if (els.sortTemplates) els.sortTemplates.value = "recentes";
            if (els.filtroAtivo) els.filtroAtivo.checked = true;
            if (els.filtroRascunho) els.filtroRascunho.checked = true;
            render();
            renderizarMiniaturasVisiveis().catch(() => {});
        });

        els.btnCompareSelected?.addEventListener("click", compararSelecionados);
        els.btnBatchTesting?.addEventListener("click", () => executarAcaoLoteStatus("em_teste", "Em teste"));
        els.btnBatchLegacy?.addEventListener("click", () => executarAcaoLoteStatus("legado", "Legado"));
        els.btnBatchArchive?.addEventListener("click", () => executarAcaoLoteStatus("arquivado", "Arquivado"));
        els.btnBatchDelete?.addEventListener("click", executarExclusaoLote);
        els.btnClearSelection?.addEventListener("click", limparSelecao);

        els.btnCloseDiff?.addEventListener("click", fecharModalDiff);
        els.diffModal?.addEventListener("click", (ev) => {
            if (ev.target === els.diffModal) {
                fecharModalDiff();
            }
        });

        document.addEventListener("keydown", (ev) => {
            if (ev.key === "Escape" && els.diffModal && !els.diffModal.hidden) {
                fecharModalDiff();
            }
        });

        els.lista.addEventListener("change", (ev) => {
            const inputSelecao = ev.target.closest(".js-select-template");
            if (inputSelecao) {
                alternarSelecaoTemplate(inputSelecao.dataset.id, !!inputSelecao.checked);
            }
        });

        els.lista.addEventListener("click", (ev) => {
            const btnUsar = ev.target.closest(".js-usar");
            if (btnUsar) {
                usarTemplate(btnUsar.dataset.id);
                return;
            }

            const btnExcluir = ev.target.closest(".js-excluir");
            if (btnExcluir) {
                excluir(btnExcluir.dataset.id);
                return;
            }

            const btnBase = ev.target.closest(".js-abrir-base");
            if (btnBase) {
                abrirBase(btnBase.dataset.id);
                return;
            }

            const btnClonar = ev.target.closest(".js-clonar");
            if (btnClonar) {
                status("Clonando template...");
                clonarTemplate(btnClonar.dataset.id)
                    .then(() => carregar())
                    .then(() => status("Nova versão clonada com sucesso.", "ok"))
                    .catch((erro) => status(`Erro ao clonar: ${erro.message}`, "err"));
                return;
            }

            const btnPromoverBase = ev.target.closest(".js-promover-base");
            if (btnPromoverBase) {
                const modoBase = String(btnPromoverBase.dataset.baseMode || "promover");
                const acaoBase = modoBase === "automatico" ? restaurarBaseRecomendadaAutomatica : promoverBaseRecomendada;
                status(modoBase === "automatico" ? "Restaurando modo automático da base..." : "Promovendo base recomendada...");
                acaoBase(btnPromoverBase.dataset.id)
                    .then(() => carregar())
                    .then(() => status(modoBase === "automatico" ? "Base recomendada voltou ao modo automático." : "Base recomendada atualizada.", "ok"))
                    .catch((erro) => status(`Erro ao atualizar base recomendada: ${erro.message}`, "err"));
                return;
            }

            const btnStatus = ev.target.closest(".js-status-template");
            if (btnStatus) {
                const novoStatus = String(btnStatus.dataset.status || "");
                status("Atualizando ciclo do template...");
                atualizarStatusTemplate(btnStatus.dataset.id, novoStatus)
                    .then(() => carregar())
                    .then(() => status("Ciclo do template atualizado.", "ok"))
                    .catch((erro) => status(`Erro ao atualizar ciclo: ${erro.message}`, "err"));
                return;
            }

            const btnCompareSingle = ev.target.closest(".js-compare-single");
            if (btnCompareSingle) {
                compararComAnterior(btnCompareSingle.dataset.id);
            }
        });
    };

    bind();
    renderAuditoria();
    carregar();
})();
