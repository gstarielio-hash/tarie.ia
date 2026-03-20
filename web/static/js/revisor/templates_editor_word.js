(() => {
    "use strict";

    const config = window.__TARIEL_TEMPLATE_CONFIG__ || {};
    const csrf = String(config.csrfToken || document.querySelector('meta[name="csrf-token"]')?.content || "");

    const q = (id) => document.getElementById(id);
    const els = {
        btnOpenEditorA4: q("btn-open-editor-a4"),
        btnOpenEditorLegacy: q("btn-open-editor-legacy"),
        statusCreateWord: q("status-create-word"),
        presetButtons: [...document.querySelectorAll(".js-apply-preset")],
        cardEditorWord: q("card-editor-word"),
        editorTemplateSelect: q("editor-template-select"),
        btnEditorLoad: q("btn-editor-load"),
        editorNome: q("editor-nome"),
        editorCodigo: q("editor-codigo"),
        editorVersao: q("editor-versao"),
        editorObs: q("editor-obs"),
        editorHeader: q("editor-header"),
        editorFooter: q("editor-footer"),
        editorMarginTop: q("editor-margin-top"),
        editorMarginRight: q("editor-margin-right"),
        editorMarginBottom: q("editor-margin-bottom"),
        editorMarginLeft: q("editor-margin-left"),
        editorWatermark: q("editor-watermark"),
        editorWatermarkOpacity: q("editor-watermark-opacity"),
        editorPreviewDados: q("editor-preview-dados"),
        editorImageFile: q("editor-image-file"),
        btnUploadImage: q("btn-ed-upload-image"),
        btnSave: q("btn-editor-save"),
        btnPreview: q("btn-editor-preview"),
        btnPublish: q("btn-editor-publish"),
        statusEditorWord: q("status-editor-word"),
        statusEditorCompare: q("status-editor-compare"),
        frameEditorPreview: q("frame-editor-preview"),
        editorSurface: q("editor-word-surface"),
        wordTabs: [...document.querySelectorAll(".word-tab[data-tab]")],
        inspectorPanels: [...document.querySelectorAll(".word-inspector-panel[data-panel]")],
        wordStage: q("word-stage"),
        btnToggleSide: q("btn-word-toggle-side"),
        saveIndicator: q("word-save-indicator"),
        editorCompareSelect: q("editor-compare-template-select"),
        btnCompare: q("btn-editor-compare"),
        btnCompareClear: q("btn-editor-compare-clear"),
        compareSummary: q("editor-compare-summary"),
        compareSummaryChanged: q("editor-compare-summary-changed"),
        compareSummaryAdded: q("editor-compare-summary-added"),
        compareSummaryRemoved: q("editor-compare-summary-removed"),
        compareSummaryUnchanged: q("editor-compare-summary-unchanged"),
        compareBlocks: q("editor-compare-blocks"),
        pageHeaderGhost: q("page-header-ghost"),
        pageFooterGhost: q("page-footer-ghost"),
        pageWatermarkGhost: q("page-watermark-ghost"),
        btnBold: q("btn-ed-bold"),
        btnItalic: q("btn-ed-italic"),
        btnUnderline: q("btn-ed-underline"),
        btnH2: q("btn-ed-h2"),
        btnStyleNormal: q("btn-ed-style-normal"),
        btnStyleTitle1: q("btn-ed-style-title1"),
        btnStyleTitle2: q("btn-ed-style-title2"),
        btnUl: q("btn-ed-ul"),
        btnOl: q("btn-ed-ol"),
        btnAlignLeft: q("btn-ed-align-left"),
        btnAlignCenter: q("btn-ed-align-center"),
        btnAlignRight: q("btn-ed-align-right"),
        btnTable: q("btn-ed-table"),
        btnUndo: q("btn-ed-undo"),
        btnRedo: q("btn-ed-redo"),
        btnPlaceholderJson: q("btn-ed-placeholder-json"),
        btnPlaceholderToken: q("btn-ed-placeholder-token"),
        blockButtons: [...document.querySelectorAll(".js-insert-block")],
        quickPlaceholderButtons: [...document.querySelectorAll(".js-insert-placeholder-quick")],
    };
    if (!els.editorSurface || !els.btnOpenEditorA4) return;

    const state = {
        templateId: null,
        templates: [],
        editor: null,
        blob: "",
        autosaveTimer: null,
        depsCarregadas: false,
        carregandoTemplate: false,
        painelLateralOculto: false,
    };

    const PRESETS = {
        inspecao_geral: {
            nome: "Template Inspeção Geral Tariel.ia",
            observacoes: "Modelo padrão para inspeções iniciais e periódicas.",
            header: "Tariel.ia • {{token:cliente_nome}}",
            footer: "Documento técnico interno • Página {{token:pagina_atual}}",
            watermark: "RASCUNHO",
            doc: {
                type: "doc",
                content: [
                    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Relatório Técnico de Inspeção" }] },
                    {
                        type: "paragraph",
                        content: [
                            { type: "text", text: "Cliente: " },
                            { type: "placeholder", attrs: { mode: "token", key: "cliente_nome", raw: "token:cliente_nome" } },
                            { type: "text", text: " • Unidade: " },
                            { type: "placeholder", attrs: { mode: "json_path", key: "informacoes_gerais.local_inspecao", raw: "json_path:informacoes_gerais.local_inspecao" } },
                        ],
                    },
                    {
                        type: "paragraph",
                        content: [
                            { type: "text", text: "Responsável pela inspeção: " },
                            { type: "placeholder", attrs: { mode: "json_path", key: "informacoes_gerais.responsavel_pela_inspecao", raw: "json_path:informacoes_gerais.responsavel_pela_inspecao" } },
                            { type: "text", text: " • Data: " },
                            { type: "placeholder", attrs: { mode: "json_path", key: "informacoes_gerais.data_inspecao", raw: "json_path:informacoes_gerais.data_inspecao" } },
                        ],
                    },
                    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "1. Escopo e Objetivo" }] },
                    {
                        type: "paragraph",
                        content: [
                            { type: "text", text: "Descreva o escopo avaliado, áreas vistoriadas e objetivo da inspeção realizada no cliente." },
                        ],
                    },
                    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "2. Achados Técnicos" }] },
                    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Achado 1" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Achado 2" }] }] }] },
                    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "3. Plano de Ação" }] },
                    { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Ação corretiva 1" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Ação corretiva 2" }] }] }] },
                    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "4. Conclusão Técnica" }] },
                    { type: "paragraph", content: [{ type: "placeholder", attrs: { mode: "json_path", key: "resumo_executivo", raw: "json_path:resumo_executivo" } }] },
                ],
            },
        },
        nr12_maquinas: {
            nome: "Template NR-12 Máquinas Tariel.ia",
            observacoes: "Modelo orientado para adequação NR-12 em máquinas e equipamentos.",
            header: "Tariel.ia NR-12 • {{token:cliente_nome}} • {{token:setor}}",
            footer: "Conformidade NR-12 • Revisão {{token:revisao_template}}",
            watermark: "TARIEL NR12",
            doc: {
                type: "doc",
                content: [
                    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Relatório NR-12 - Máquinas e Equipamentos" }] },
                    { type: "paragraph", content: [{ type: "text", text: "Máquina avaliada: " }, { type: "placeholder", attrs: { mode: "token", key: "maquina_nome", raw: "token:maquina_nome" } }] },
                    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Checklist de Segurança" }] },
                    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Proteções fixas e móveis" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Dispositivos de parada de emergência" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Sinalização e bloqueio de energia" }] }] }] },
                    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Não Conformidades" }] },
                    { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "NC-01 - Descrição da não conformidade" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "NC-02 - Descrição da não conformidade" }] }] }] },
                    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Recomendações de Adequação" }] },
                    { type: "paragraph", content: [{ type: "text", text: "Inserir recomendações técnicas com prioridade e prazo sugerido." }] },
                ],
            },
        },
        rti_eletrica: {
            nome: "Template RTI Elétrica Tariel.ia",
            observacoes: "Modelo para relatório técnico de instalações elétricas.",
            header: "Tariel.ia RTI Elétrica • {{token:cliente_nome}}",
            footer: "Documento com ART • Uso interno",
            watermark: "ELETRICA",
            doc: {
                type: "doc",
                content: [
                    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "RTI - Relatório Técnico de Instalações Elétricas" }] },
                    { type: "paragraph", content: [{ type: "text", text: "Data da inspeção: " }, { type: "placeholder", attrs: { mode: "json_path", key: "informacoes_gerais.data_inspecao", raw: "json_path:informacoes_gerais.data_inspecao" } }] },
                    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "1. Diagnóstico Geral" }] },
                    { type: "paragraph", content: [{ type: "text", text: "Condições observadas nos quadros, circuitos e dispositivos de proteção." }] },
                    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "2. Itens Críticos" }] },
                    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Aterramento e equipotencialização" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Disjuntores e coordenação de proteção" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "SPDA e inspeção visual" }] }] }] },
                    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "3. Conclusão" }] },
                    { type: "paragraph", content: [{ type: "placeholder", attrs: { mode: "json_path", key: "resumo_executivo", raw: "json_path:resumo_executivo" } }] },
                ],
            },
        },
        avcb_bombeiros: {
            nome: "Template AVCB Bombeiros Tariel.ia",
            observacoes: "Modelo para projeto e conformidade AVCB.",
            header: "Tariel.ia AVCB • {{token:cliente_nome}}",
            footer: "Conformidade contra incêndio • Revisão técnica",
            watermark: "AVCB",
            doc: {
                type: "doc",
                content: [
                    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Relatório AVCB - Projeto e Conformidade" }] },
                    { type: "paragraph", content: [{ type: "text", text: "Edificação: " }, { type: "placeholder", attrs: { mode: "token", key: "edificacao_nome", raw: "token:edificacao_nome" } }] },
                    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Sistemas Avaliados" }] },
                    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Hidrantes e mangotinhos" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Sinalização e iluminação de emergência" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Rotas de fuga e portas corta-fogo" }] }] }] },
                    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Pendências para Regularização" }] },
                    { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Pendência 1" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Pendência 2" }] }] }] },
                ],
            },
        },
    };

    const BLOCKS = {
        escopo_objetivo: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Escopo e Objetivo" }] },
            { type: "paragraph", content: [{ type: "text", text: "Descreva as áreas avaliadas, limites da inspeção e objetivo técnico desta entrega." }] },
        ],
        quadro_conformidade: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Quadro de Conformidade" }] },
            { type: "table", content: [
                { type: "tableRow", content: [
                    { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }] },
                    { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Critério / Norma" }] }] },
                    { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Resultado" }] }] },
                ]},
                { type: "tableRow", content: [
                    { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Ponto avaliado" }] }] },
                    { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "NR / requisito" }] }] },
                    { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Conforme / NC" }] }] },
                ]},
            ]},
        ],
        evidencias_fotograficas: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Evidências Fotográficas" }] },
            { type: "paragraph", content: [{ type: "text", text: "Foto 1: descrição da evidência, local e relação com o item vistoriado." }] },
            { type: "paragraph", content: [{ type: "text", text: "Foto 2: descrição da evidência, local e relação com o item vistoriado." }] },
        ],
        achados_recomendacoes: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Achados e Recomendações" }] },
            { type: "bulletList", content: [
                { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Achado técnico 1 com recomendação objetiva." }] }] },
                { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Achado técnico 2 com impacto operacional." }] }] },
            ]},
        ],
        plano_acao: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Plano de Ação" }] },
            { type: "table", content: [
                { type: "tableRow", content: [
                    { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Ação" }] }] },
                    { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Responsável" }] }] },
                    { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Prazo" }] }] },
                ]},
                { type: "tableRow", content: [
                    { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Ação corretiva" }] }] },
                    { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "placeholder", attrs: { mode: "token", key: "responsavel_acao", raw: "token:responsavel_acao" } }] }] },
                    { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "dd/mm/aaaa" }] }] },
                ]},
            ]},
        ],
        assinatura_art: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Assinatura Técnica" }] },
            { type: "paragraph", content: [{ type: "text", text: "Engenheiro responsável: " }, { type: "placeholder", attrs: { mode: "token", key: "engenheiro_responsavel", raw: "token:engenheiro_responsavel" } }] },
            { type: "paragraph", content: [{ type: "text", text: "CREA / ART: " }, { type: "placeholder", attrs: { mode: "token", key: "crea_art", raw: "token:crea_art" } }] },
            { type: "paragraph", content: [{ type: "text", text: "Data de emissão: " }, { type: "placeholder", attrs: { mode: "json_path", key: "informacoes_gerais.data_inspecao", raw: "json_path:informacoes_gerais.data_inspecao" } }] },
        ],
    };

    const html = (v) => String(v || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const htmlMultiline = (v) => html(v).replace(/\n/g, "<br>");
    const status = (el, msg = "", tipo = "") => {
        if (!el) return;
        el.textContent = msg;
        el.classList.remove("ok", "err");
        if (tipo) el.classList.add(tipo);
    };
    const statusSave = (tipo, txt) => {
        if (!els.saveIndicator) return;
        els.saveIndicator.textContent = txt || "";
        els.saveIndicator.classList.remove("pending", "saving", "saved", "error");
        if (tipo) els.saveIndicator.classList.add(tipo);
    };
    const erroHttp = async (res) => {
        try {
            const j = await res.json();
            return j.detail || j.erro || `HTTP ${res.status}`;
        } catch (_) {
            return `HTTP ${res.status}`;
        }
    };
    const n = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
    const slug = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
    const gerarCodigoPadrao = () => {
        const base = slug(els.editorNome?.value || "template_word_tariel") || "template_word_tariel";
        const sufixo = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "");
        return `${base}_${sufixo}`.slice(0, 80);
    };
    const hora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const margens = () => ({
        top: Math.max(5, Math.min(40, Math.floor(n(els.editorMarginTop?.value, 18)))),
        right: Math.max(5, Math.min(40, Math.floor(n(els.editorMarginRight?.value, 14)))),
        bottom: Math.max(5, Math.min(40, Math.floor(n(els.editorMarginBottom?.value, 18)))),
        left: Math.max(5, Math.min(40, Math.floor(n(els.editorMarginLeft?.value, 14)))),
    });

    const syncLayout = () => {
        const m = margens();
        const h = String(els.editorHeader?.value || "").trim();
        const f = String(els.editorFooter?.value || "").trim();
        const w = String(els.editorWatermark?.value || "").trim();
        const o = Math.max(0.02, Math.min(0.35, Number(els.editorWatermarkOpacity?.value || 0.08)));
        els.editorSurface?.style.setProperty("--editor-margin-top", `${m.top}mm`);
        els.editorSurface?.style.setProperty("--editor-margin-right", `${m.right}mm`);
        els.editorSurface?.style.setProperty("--editor-margin-bottom", `${m.bottom}mm`);
        els.editorSurface?.style.setProperty("--editor-margin-left", `${m.left}mm`);
        if (els.pageHeaderGhost) {
            els.pageHeaderGhost.textContent = h;
            els.pageHeaderGhost.style.setProperty("--editor-margin-left", `${m.left}mm`);
            els.pageHeaderGhost.style.setProperty("--editor-margin-right", `${m.right}mm`);
        }
        if (els.pageFooterGhost) {
            els.pageFooterGhost.textContent = f;
            els.pageFooterGhost.style.setProperty("--editor-margin-left", `${m.left}mm`);
            els.pageFooterGhost.style.setProperty("--editor-margin-right", `${m.right}mm`);
        }
        if (els.pageWatermarkGhost) {
            els.pageWatermarkGhost.textContent = w;
            els.pageWatermarkGhost.style.opacity = w ? String(o) : "0";
        }
    };

    const obterEstiloPayload = () => {
        const m = margens();
        return {
            pagina: { size: "A4", orientation: "portrait", margens_mm: m },
            tipografia: { font_family: "'Calibri', 'Segoe UI', Arial, sans-serif", font_size_px: 12, line_height: 1.45 },
            cabecalho_texto: String(els.editorHeader?.value || "").trim(),
            rodape_texto: String(els.editorFooter?.value || "").trim(),
            marca_dagua: { texto: String(els.editorWatermark?.value || "").trim(), opacity: Math.max(0.02, Math.min(0.35, Number(els.editorWatermarkOpacity?.value || 0.08))), font_size_px: 72, rotate_deg: -32 },
        };
    };

    const preencherEstilo = (estilo) => {
        const mg = (estilo?.pagina || {}).margens_mm || {};
        if (els.editorHeader) els.editorHeader.value = String(estilo?.cabecalho_texto || "");
        if (els.editorFooter) els.editorFooter.value = String(estilo?.rodape_texto || "");
        if (els.editorMarginTop) els.editorMarginTop.value = String(n(mg.top, 18));
        if (els.editorMarginRight) els.editorMarginRight.value = String(n(mg.right, 14));
        if (els.editorMarginBottom) els.editorMarginBottom.value = String(n(mg.bottom, 18));
        if (els.editorMarginLeft) els.editorMarginLeft.value = String(n(mg.left, 14));
        if (els.editorWatermark) els.editorWatermark.value = String(estilo?.marca_dagua?.texto || "");
        if (els.editorWatermarkOpacity) els.editorWatermarkOpacity.value = String(Number(estilo?.marca_dagua?.opacity || 0.08));
        syncLayout();
    };
    const preencherMeta = (t) => {
        if (els.editorNome) els.editorNome.value = String(t?.nome || "");
        if (els.editorCodigo) els.editorCodigo.value = String(t?.codigo_template || "");
        if (els.editorVersao) els.editorVersao.value = String(n(t?.versao, 1));
        if (els.editorObs) els.editorObs.value = String(t?.observacoes || "");
        preencherEstilo(t?.estilo_json || {});
    };

    const toggleActive = (b, a) => b?.classList.toggle("is-active", !!a);
    const updateToolbarState = () => {
        const ed = state.editor;
        if (!ed) return;
        toggleActive(els.btnBold, ed.isActive("bold"));
        toggleActive(els.btnItalic, ed.isActive("italic"));
        toggleActive(els.btnUnderline, ed.isActive("underline"));
        toggleActive(els.btnUl, ed.isActive("bulletList"));
        toggleActive(els.btnOl, ed.isActive("orderedList"));
        toggleActive(els.btnAlignLeft, ed.isActive({ textAlign: "left" }));
        toggleActive(els.btnAlignCenter, ed.isActive({ textAlign: "center" }));
        toggleActive(els.btnAlignRight, ed.isActive({ textAlign: "right" }));
        toggleActive(els.btnStyleNormal, ed.isActive("paragraph"));
        toggleActive(els.btnStyleTitle1, ed.isActive("heading", { level: 1 }));
        toggleActive(els.btnStyleTitle2, ed.isActive("heading", { level: 2 }));
        toggleActive(els.btnH2, ed.isActive("heading", { level: 3 }));
    };

    const defineTab = (tab) => {
        const target = String(tab || "documento").trim().toLowerCase() || "documento";
        els.wordTabs.forEach((btn) => {
            const on = btn.dataset.tab === target;
            btn.classList.toggle("active", on);
            btn.setAttribute("aria-selected", on ? "true" : "false");
        });
        els.inspectorPanels.forEach((panel) => {
            panel.hidden = panel.dataset.panel !== target;
        });
    };

    const atualizarEstadoInspector = () => {
        els.wordStage?.classList.toggle("is-side-hidden", state.painelLateralOculto);
        if (els.btnToggleSide) els.btnToggleSide.textContent = state.painelLateralOculto ? "Mostrar inspector" : "Ocultar inspector";
    };
    const toggleSide = () => {
        state.painelLateralOculto = !state.painelLateralOculto;
        atualizarEstadoInspector();
    };
    const mostrarInspector = () => {
        if (!state.painelLateralOculto) return;
        state.painelLateralOculto = false;
        atualizarEstadoInspector();
    };

    const carregarDependenciasEditor = async () => {
        if (state.depsCarregadas) return;
        const [core, starterKitMod, underlineMod, tableMod, tableRowMod, tableHeaderMod, tableCellMod, imageMod, textAlignMod] = await Promise.all([
            import("https://cdn.jsdelivr.net/npm/@tiptap/core@2.11.5/+esm"),
            import("https://cdn.jsdelivr.net/npm/@tiptap/starter-kit@2.11.5/+esm"),
            import("https://cdn.jsdelivr.net/npm/@tiptap/extension-underline@2.11.5/+esm"),
            import("https://cdn.jsdelivr.net/npm/@tiptap/extension-table@2.11.5/+esm"),
            import("https://cdn.jsdelivr.net/npm/@tiptap/extension-table-row@2.11.5/+esm"),
            import("https://cdn.jsdelivr.net/npm/@tiptap/extension-table-header@2.11.5/+esm"),
            import("https://cdn.jsdelivr.net/npm/@tiptap/extension-table-cell@2.11.5/+esm"),
            import("https://cdn.jsdelivr.net/npm/@tiptap/extension-image@2.11.5/+esm"),
            import("https://cdn.jsdelivr.net/npm/@tiptap/extension-text-align@2.11.5/+esm"),
        ]);
        const { Editor, Node } = core;
        const PlaceholderNode = Node.create({
            name: "placeholder", group: "inline", inline: true, atom: true, selectable: true,
            addAttributes() { return { mode: { default: "token" }, key: { default: "" }, raw: { default: "" } }; },
            parseHTML() { return [{ tag: "span[data-placeholder-node]" }]; },
            renderHTML({ HTMLAttributes }) {
                const raw = String(HTMLAttributes.raw || `${HTMLAttributes.mode || "token"}:${HTMLAttributes.key || ""}`);
                return ["span", { "data-placeholder-node": "1", class: "tpl-placeholder-chip" }, `{{${raw}}}`];
            },
        });
        const AssetImage = imageMod.default.extend({
            addAttributes() {
                return { ...this.parent?.(), asset_id: { default: null, parseHTML: (el) => el.getAttribute("data-asset-id") || null, renderHTML: (attrs) => (attrs.asset_id ? { "data-asset-id": String(attrs.asset_id) } : {}) } };
            },
        });
        state.editor = new Editor({
            element: els.editorSurface,
            extensions: [starterKitMod.default.configure({ heading: { levels: [1, 2, 3] } }), underlineMod.default, AssetImage, tableMod.default.configure({ resizable: true }), tableRowMod.default, tableHeaderMod.default, tableCellMod.default, textAlignMod.default.configure({ types: ["heading", "paragraph"] }), PlaceholderNode],
            content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Novo template técnico Tariel.ia" }] }] },
            onUpdate: () => { if (state.carregandoTemplate) return; updateToolbarState(); agendarAutosave(); },
            onSelectionUpdate: () => updateToolbarState(),
            onCreate: () => updateToolbarState(),
        });
        state.depsCarregadas = true;
    };

    const renderSelectEditor = () => {
        const ricos = state.templates.filter((i) => !!i.is_editor_rico);
        const opts = ricos.map((i) => {
            const sel = Number(i.id) === Number(state.templateId) ? "selected" : "";
            return `<option value="${Number(i.id)}" ${sel}>${html(i.nome)} • ${html(i.codigo_template)} v${Number(i.versao || 1)}</option>`;
        }).join("");
        if (els.editorTemplateSelect) els.editorTemplateSelect.innerHTML = `<option value="">Selecione...</option>${opts}`;
        renderCompareSelect();
    };

    const templateAtual = () => state.templates.find((item) => Number(item.id) === Number(state.templateId)) || null;

    const templatesComparaveis = () => {
        const atual = templateAtual();
        const codigo = String(atual?.codigo_template || "").trim();
        if (!codigo) return [];
        return state.templates
            .filter((item) => String(item.codigo_template || "").trim() === codigo && Number(item.id) !== Number(state.templateId))
            .sort((a, b) => Number(b.versao || 0) - Number(a.versao || 0));
    };

    const mensagemEstadoComparacao = () => {
        if (!state.templateId) return "Abra um template Word para comparar versões.";
        if (!templatesComparaveis().length) return "Nenhuma outra versão do mesmo código está disponível para comparação.";
        return "Selecione outra versão do mesmo código para visualizar o diff por bloco.";
    };

    const renderEstadoVazioComparacao = (mensagem) => {
        if (!els.compareBlocks) return;
        els.compareBlocks.innerHTML = `<div class="word-compare-empty">${html(mensagem || mensagemEstadoComparacao())}</div>`;
    };

    const limparComparacaoEditor = ({ mensagemStatus = "", tipoStatus = "" } = {}) => {
        if (els.compareSummary) els.compareSummary.hidden = true;
        if (els.compareSummaryChanged) els.compareSummaryChanged.textContent = "0";
        if (els.compareSummaryAdded) els.compareSummaryAdded.textContent = "0";
        if (els.compareSummaryRemoved) els.compareSummaryRemoved.textContent = "0";
        if (els.compareSummaryUnchanged) els.compareSummaryUnchanged.textContent = "0";
        renderEstadoVazioComparacao();
        status(els.statusEditorCompare, mensagemStatus, tipoStatus);
    };

    const renderCompareSelect = () => {
        if (!els.editorCompareSelect) return;
        const opcoes = templatesComparaveis();
        const valorAnterior = String(els.editorCompareSelect.value || "");

        if (!state.templateId) {
            els.editorCompareSelect.disabled = true;
            els.editorCompareSelect.innerHTML = '<option value="">Abra um template para comparar...</option>';
            return;
        }

        if (!opcoes.length) {
            els.editorCompareSelect.disabled = true;
            els.editorCompareSelect.innerHTML = '<option value="">Nenhuma outra versão comparável</option>';
            return;
        }

        els.editorCompareSelect.disabled = false;
        els.editorCompareSelect.innerHTML = `<option value="">Selecione outra versão...</option>${opcoes.map((item) => {
            const modo = item.is_editor_rico ? "Word" : "PDF";
            return `<option value="${Number(item.id)}">${html(item.nome)} • v${Number(item.versao || 1)} • ${modo}</option>`;
        }).join("")}`;

        const valorPadrao = opcoes.some((item) => String(Number(item.id)) === valorAnterior) ? valorAnterior : String(Number(opcoes[0].id));
        els.editorCompareSelect.value = valorPadrao;
    };

    const rotuloStatusBloco = (valor) => {
        const blocoStatus = String(valor || "").trim().toLowerCase();
        if (blocoStatus === "alterado") return "Alterado";
        if (blocoStatus === "adicionado") return "Adicionado";
        if (blocoStatus === "removido") return "Removido";
        return "Sem mudança";
    };

    const renderCardBlocoComparacao = (tituloLado, bloco) => {
        if (!bloco) {
            return `
                <article class="word-compare-card is-empty">
                    <span class="word-compare-side">${html(tituloLado)}</span>
                    <strong>Sem bloco correspondente</strong>
                    <small>Este lado não possui um bloco equivalente nesta comparação.</small>
                </article>
            `;
        }

        const placeholders = Array.isArray(bloco.placeholders) ? bloco.placeholders.filter(Boolean) : [];
        const texto = String(bloco.texto || "").trim();
        return `
            <article class="word-compare-card">
                <div class="word-compare-card-top">
                    <div class="word-compare-card-copy">
                        <span class="word-compare-side">${html(tituloLado)}</span>
                        <strong>${html(bloco.preview || bloco.tipo_label || "Bloco")}</strong>
                        <small>${html(bloco.estrutura || "")}</small>
                    </div>
                    <span class="word-compare-block-kind">${html(bloco.tipo_label || "Bloco")}</span>
                </div>
                ${placeholders.length ? `<div class="word-compare-placeholder-list">${placeholders.map((item) => `<span class="word-compare-placeholder-chip">${html(item)}</span>`).join("")}</div>` : ""}
                ${texto ? `<div class="word-compare-block-text">${htmlMultiline(texto)}</div>` : ""}
            </article>
        `;
    };

    const renderComparacaoEditor = (payload) => {
        const resumoBlocos = payload?.resumo_blocos || {};
        const diffBlocos = Array.isArray(payload?.diff_blocos) ? payload.diff_blocos : [];
        const resumoLinhas = payload?.resumo || {};

        if (els.compareSummary) els.compareSummary.hidden = false;
        if (els.compareSummaryChanged) els.compareSummaryChanged.textContent = String(Number(resumoBlocos.alterados || 0));
        if (els.compareSummaryAdded) els.compareSummaryAdded.textContent = String(Number(resumoBlocos.adicionados || 0));
        if (els.compareSummaryRemoved) els.compareSummaryRemoved.textContent = String(Number(resumoBlocos.removidos || 0));
        if (els.compareSummaryUnchanged) els.compareSummaryUnchanged.textContent = String(Number(resumoBlocos.inalterados || 0));

        if (!diffBlocos.length) {
            renderEstadoVazioComparacao("Nenhuma diferença estrutural relevante foi detectada entre as versões selecionadas.");
        } else if (els.compareBlocks) {
            els.compareBlocks.innerHTML = diffBlocos.map((item) => {
                const blocoStatus = String(item.status || "inalterado").toLowerCase();
                const meta = [];
                if (Number(item.ordem_base || 0) > 0) meta.push(`Base #${Number(item.ordem_base)}`);
                if (Number(item.ordem_comparado || 0) > 0) meta.push(`Comparado #${Number(item.ordem_comparado)}`);
                const mudancas = Array.isArray(item.mudancas) ? item.mudancas.filter(Boolean) : [];
                return `
                    <article class="word-compare-row ${html(blocoStatus)}">
                        <div class="word-compare-row-head">
                            <span class="word-compare-status ${html(blocoStatus)}">${rotuloStatusBloco(blocoStatus)}</span>
                            ${meta.length ? `<span class="word-compare-row-meta">${html(meta.join(" • "))}</span>` : ""}
                        </div>
                        ${mudancas.length ? `<div class="word-compare-reasons">${mudancas.map((mudanca) => `<span class="word-compare-reason-chip">${html(mudanca)}</span>`).join("")}</div>` : ""}
                        <div class="word-compare-row-grid">
                            ${renderCardBlocoComparacao("Versão base", item.base)}
                            ${renderCardBlocoComparacao("Versão comparada", item.comparado)}
                        </div>
                    </article>
                `;
            }).join("");
        }

        const mensagens = [];
        if (Number(resumoLinhas.campos_alterados || 0) > 0) mensagens.push(`${Number(resumoLinhas.campos_alterados)} campo(s) auxiliares alterados`);
        if (Number(resumoBlocos.ocultos || 0) > 0) mensagens.push(`${Number(resumoBlocos.ocultos)} bloco(s) adicionais ocultos`);
        status(els.statusEditorCompare, mensagens.join(" • ") || "Comparação estrutural atualizada.", "ok");
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

    const carregarTemplates = async () => {
        try {
            const res = await fetch("/revisao/api/templates-laudo", { headers: { "X-Requested-With": "XMLHttpRequest" } });
            if (!res.ok) throw new Error(await erroHttp(res));
            const data = await res.json();
            state.templates = Array.isArray(data.itens) ? data.itens : [];
            renderSelectEditor();
        } catch (e) { status(els.statusEditorWord, `Erro ao listar templates: ${e.message}`, "err"); }
    };

    const carregarTemplateEditor = async (templateId) => {
        const id = Number(templateId || 0); if (!id) return;
        await carregarDependenciasEditor();
        state.carregandoTemplate = true;
        status(els.statusEditorWord, "Carregando template...");
        statusSave("saving", "Abrindo template...");
        try {
            const res = await fetch(`/revisao/api/templates-laudo/editor/${id}`, { headers: { "X-Requested-With": "XMLHttpRequest" } });
            if (!res.ok) throw new Error(await erroHttp(res));
            const template = await res.json();
            state.templateId = Number(template.id);
            preencherMeta(template);
            const doc = template?.documento_editor_json?.doc || { type: "doc", content: [{ type: "paragraph", content: [] }] };
            state.editor.commands.setContent(doc, false);
            updateToolbarState();
            if (els.editorTemplateSelect) els.editorTemplateSelect.value = String(state.templateId);
            renderCompareSelect();
            limparComparacaoEditor();
            status(els.statusEditorWord, "Template Word carregado.", "ok");
            statusSave("saved", `Aberto às ${hora()}`);
            els.cardEditorWord?.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (e) {
            status(els.statusEditorWord, `Erro ao abrir template Word: ${e.message}`, "err");
            statusSave("error", "Falha ao abrir");
        } finally { state.carregandoTemplate = false; }
    };

    const criarTemplateEditorA4 = async () => {
        await carregarDependenciasEditor();
        const nome = String(els.editorNome?.value || "").trim() || "Novo Template Word Tariel.ia";
        const codigoDigitado = String(els.editorCodigo?.value || "").trim();
        const versao = Math.max(1, Math.floor(n(els.editorVersao?.value, 1)));
        const observacoes = String(els.editorObs?.value || "").trim();
        const base = codigoDigitado || `${slug(nome) || "template_word_wf"}_${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "")}`.slice(0, 80);
        if (!codigoDigitado && els.editorCodigo) els.editorCodigo.value = base;
        status(els.statusCreateWord, "Criando template Word...");
        try {
            const criar = async (codigo) => fetch("/revisao/api/templates-laudo/editor", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ nome, codigo_template: codigo, versao, observacoes, origem_modo: "a4", ativo: false }) });
            let codigo = base, res = await criar(codigo);
            if (res.status === 409 && !codigoDigitado) {
                codigo = `${base}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 80);
                if (els.editorCodigo) els.editorCodigo.value = codigo;
                res = await criar(codigo);
            }
            if (!res.ok) throw new Error(await erroHttp(res));
            const novo = await res.json();
            status(els.statusCreateWord, "Template Word criado.", "ok");
            await carregarTemplates();
            await carregarTemplateEditor(novo.id);
        } catch (e) { status(els.statusCreateWord, `Erro ao criar template Word: ${e.message}`, "err"); }
    };

    const aplicarPresetNoEditor = (preset) => {
        if (!preset || !state.editor) return;
        if (els.editorNome) els.editorNome.value = String(preset.nome || els.editorNome.value || "");
        if (els.editorObs) els.editorObs.value = String(preset.observacoes || els.editorObs.value || "");
        if (els.editorHeader) els.editorHeader.value = String(preset.header || "");
        if (els.editorFooter) els.editorFooter.value = String(preset.footer || "");
        if (els.editorWatermark) els.editorWatermark.value = String(preset.watermark || "");
        syncLayout();
        state.editor.commands.setContent(preset.doc || { type: "doc", content: [{ type: "paragraph", content: [] }] }, false);
        updateToolbarState();
        defineTab("documento");
    };

    const aplicarPreset = async (presetId) => {
        const preset = PRESETS[String(presetId || "")];
        if (!preset) return;

        if (!state.templateId) {
            if (els.editorNome) els.editorNome.value = String(preset.nome || "Novo Template Word Tariel.ia");
            if (els.editorObs) els.editorObs.value = String(preset.observacoes || "");
            if (els.editorCodigo) els.editorCodigo.value = "";
            await criarTemplateEditorA4();
        }
        if (!state.templateId) return;

        aplicarPresetNoEditor(preset);
        status(els.statusEditorWord, `Modelo "${preset.nome}" aplicado.`, "ok");
        agendarAutosave();
        els.cardEditorWord?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const inserirBloco = (blockId) => {
        if (!state.editor) return;
        const bloco = BLOCKS[String(blockId || "")];
        if (!Array.isArray(bloco) || !bloco.length) return;
        state.editor.chain().focus().insertContent(bloco).run();
        status(els.statusEditorWord, "Bloco Tariel inserido.", "ok");
        agendarAutosave();
    };

    const payloadSalvarEditor = () => {
        if (!state.editor) throw new Error("Editor não inicializado.");
        const nome = String(els.editorNome?.value || "").trim();
        if (!nome) throw new Error("Informe o nome do template.");
        return { nome, observacoes: String(els.editorObs?.value || "").trim(), documento_editor_json: { version: 1, doc: state.editor.getJSON() }, estilo_json: obterEstiloPayload() };
    };

    const salvarEditor = async ({ silencioso = false } = {}) => {
        if (!state.templateId) { if (!silencioso) status(els.statusEditorWord, "Crie ou abra um template Word primeiro.", "err"); return; }
        try {
            statusSave("saving", "Salvando...");
            const res = await fetch(`/revisao/api/templates-laudo/editor/${state.templateId}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(payloadSalvarEditor()) });
            if (!res.ok) throw new Error(await erroHttp(res));
            if (!silencioso) status(els.statusEditorWord, "Template Word salvo.", "ok");
            statusSave("saved", `Salvo às ${hora()}`);
            await carregarTemplates();
        } catch (e) {
            status(els.statusEditorWord, `Erro ao salvar: ${e.message}`, "err");
            statusSave("error", "Erro ao salvar");
        }
    };

    const agendarAutosave = () => {
        clearTimeout(state.autosaveTimer);
        statusSave("pending", "Alterações pendentes...");
        state.autosaveTimer = setTimeout(() => salvarEditor({ silencioso: true }), 950);
    };

    const gerarPreviewEditor = async () => {
        if (!state.templateId) { status(els.statusEditorWord, "Crie ou abra um template Word primeiro.", "err"); return; }
        mostrarInspector();
        defineTab("preview");
        await salvarEditor({ silencioso: true });
        let dados = {};
        try { dados = JSON.parse(String(els.editorPreviewDados?.value || "{}")); }
        catch (_) { status(els.statusEditorWord, "JSON de preview inválido.", "err"); return; }
        status(els.statusEditorWord, "Gerando preview do editor...");
        try {
            const res = await fetch(`/revisao/api/templates-laudo/editor/${state.templateId}/preview`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ dados_formulario: dados }) });
            if (!res.ok) throw new Error(await erroHttp(res));
            const blob = await res.blob();
            if (state.blob) URL.revokeObjectURL(state.blob);
            state.blob = URL.createObjectURL(blob);
            if (els.frameEditorPreview) els.frameEditorPreview.src = state.blob;
            status(els.statusEditorWord, "Preview Word atualizado.", "ok");
            els.frameEditorPreview?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (e) { status(els.statusEditorWord, `Erro no preview Word: ${e.message}`, "err"); }
    };

    const publicarTemplateEditor = async () => {
        if (!state.templateId) { status(els.statusEditorWord, "Crie ou abra um template Word primeiro.", "err"); return; }
        await salvarEditor({ silencioso: true });
        status(els.statusEditorWord, "Publicando template Word...");
        try {
            const fd = new FormData(); fd.set("csrf_token", csrf);
            const res = await fetch(`/revisao/api/templates-laudo/editor/${state.templateId}/publicar`, { method: "POST", headers: { "X-CSRF-Token": csrf }, body: fd });
            if (!res.ok) throw new Error(await erroHttp(res));
            status(els.statusEditorWord, "Template Word publicado.", "ok");
            statusSave("saved", `Publicado às ${hora()}`);
            await carregarTemplates();
        } catch (e) {
            status(els.statusEditorWord, `Erro ao publicar: ${e.message}`, "err");
            statusSave("error", "Erro na publicação");
        }
    };

    const uploadInserirImagem = async () => {
        if (!state.templateId) { status(els.statusEditorWord, "Abra um template Word antes de enviar imagem.", "err"); return; }
        const arquivo = els.editorImageFile?.files?.[0];
        if (!arquivo) { status(els.statusEditorWord, "Selecione uma imagem.", "err"); return; }
        const fd = new FormData(); fd.set("csrf_token", csrf); fd.set("arquivo", arquivo);
        status(els.statusEditorWord, "Enviando imagem...");
        try {
            const res = await fetch(`/revisao/api/templates-laudo/editor/${state.templateId}/assets`, { method: "POST", headers: { "X-CSRF-Token": csrf }, body: fd });
            if (!res.ok) throw new Error(await erroHttp(res));
            const asset = (await res.json())?.asset || {};
            if (!asset.id || !state.editor) throw new Error("Asset inválido.");
            state.editor.chain().focus().setImage({ src: String(asset.src || `asset://${asset.id}`), asset_id: String(asset.id), alt: String(asset.filename || "imagem") }).run();
            status(els.statusEditorWord, "Imagem inserida no editor.", "ok");
            agendarAutosave();
        } catch (e) { status(els.statusEditorWord, `Erro ao enviar imagem: ${e.message}`, "err"); }
    };

    const inserirPlaceholder = (modo) => {
        if (!state.editor) return;
        const raw = window.prompt(modo === "json_path" ? "Informe o JSON path (ex: informacoes_gerais.cnpj):" : "Informe o token (ex: cliente_nome):", "");
        const key = String(raw || "").trim();
        if (!key) return;
        state.editor.chain().focus().insertContent({ type: "placeholder", attrs: { mode, key, raw: `${modo}:${key}` } }).run();
        agendarAutosave();
    };

    const inserirPlaceholderRapido = (modo, key) => {
        if (!state.editor) return;
        const chave = String(key || "").trim();
        if (!chave) return;
        state.editor.chain().focus().insertContent({ type: "placeholder", attrs: { mode, key: chave, raw: `${modo}:${chave}` } }).run();
        status(els.statusEditorWord, "Campo rápido inserido.", "ok");
        agendarAutosave();
    };

    const compararTemplateEditor = async () => {
        if (!state.templateId) {
            status(els.statusEditorCompare, "Abra um template Word antes de comparar versões.", "err");
            return;
        }
        const comparadoId = Number(els.editorCompareSelect?.value || 0);
        if (!comparadoId) {
            status(els.statusEditorCompare, "Selecione outra versão do mesmo código para comparar.", "err");
            return;
        }
        if (comparadoId === Number(state.templateId)) {
            status(els.statusEditorCompare, "Selecione uma versão diferente da atualmente aberta.", "err");
            return;
        }

        mostrarInspector();
        defineTab("comparar");
        await salvarEditor({ silencioso: true });
        status(els.statusEditorCompare, "Comparando estrutura por bloco...");
        try {
            const payload = await obterDiffTemplates(state.templateId, comparadoId);
            renderComparacaoEditor(payload);
            els.compareBlocks?.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (e) {
            status(els.statusEditorCompare, `Erro ao comparar versões: ${e.message}`, "err");
        }
    };

    const runCommand = (fn) => { if (!state.editor) return; fn(state.editor); updateToolbarState(); };
    const bindToolbar = () => {
        els.btnBold?.addEventListener("click", () => runCommand((ed) => ed.chain().focus().toggleBold().run()));
        els.btnItalic?.addEventListener("click", () => runCommand((ed) => ed.chain().focus().toggleItalic().run()));
        els.btnUnderline?.addEventListener("click", () => runCommand((ed) => ed.chain().focus().toggleUnderline().run()));
        els.btnH2?.addEventListener("click", () => runCommand((ed) => ed.chain().focus().toggleHeading({ level: 3 }).run()));
        els.btnStyleNormal?.addEventListener("click", () => runCommand((ed) => ed.chain().focus().setParagraph().run()));
        els.btnStyleTitle1?.addEventListener("click", () => runCommand((ed) => ed.chain().focus().setHeading({ level: 1 }).run()));
        els.btnStyleTitle2?.addEventListener("click", () => runCommand((ed) => ed.chain().focus().setHeading({ level: 2 }).run()));
        els.btnUndo?.addEventListener("click", () => runCommand((ed) => ed.chain().focus().undo().run()));
        els.btnRedo?.addEventListener("click", () => runCommand((ed) => ed.chain().focus().redo().run()));
        els.btnUl?.addEventListener("click", () => runCommand((ed) => ed.chain().focus().toggleBulletList().run()));
        els.btnOl?.addEventListener("click", () => runCommand((ed) => ed.chain().focus().toggleOrderedList().run()));
        els.btnAlignLeft?.addEventListener("click", () => runCommand((ed) => ed.chain().focus().setTextAlign("left").run()));
        els.btnAlignCenter?.addEventListener("click", () => runCommand((ed) => ed.chain().focus().setTextAlign("center").run()));
        els.btnAlignRight?.addEventListener("click", () => runCommand((ed) => ed.chain().focus().setTextAlign("right").run()));
        els.btnTable?.addEventListener("click", () => runCommand((ed) => ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()));
        els.btnPlaceholderJson?.addEventListener("click", () => inserirPlaceholder("json_path"));
        els.btnPlaceholderToken?.addEventListener("click", () => inserirPlaceholder("token"));
    };

    const bindLayout = () => [els.editorHeader, els.editorFooter, els.editorMarginTop, els.editorMarginRight, els.editorMarginBottom, els.editorMarginLeft, els.editorWatermark, els.editorWatermarkOpacity]
        .forEach((i) => i?.addEventListener("input", () => { syncLayout(); agendarAutosave(); }));

    const dentroDeEntrada = (target) => {
        const el = target instanceof HTMLElement ? target : null;
        if (!el) return false;
        if (el.closest(".ProseMirror")) return false;
        return !!el.closest("input, textarea, select");
    };

    const bindAtalhos = () => {
        document.addEventListener("keydown", (ev) => {
            const meta = ev.ctrlKey || ev.metaKey;
            if (!meta) return;
            const key = String(ev.key || "").toLowerCase();

            if (key === "s") {
                ev.preventDefault();
                salvarEditor({ silencioso: false });
                return;
            }

            if (dentroDeEntrada(ev.target)) return;
            if (!state.editor) return;

            if (key === "b") {
                ev.preventDefault();
                runCommand((ed) => ed.chain().focus().toggleBold().run());
                return;
            }
            if (key === "i") {
                ev.preventDefault();
                runCommand((ed) => ed.chain().focus().toggleItalic().run());
                return;
            }
            if (key === "u") {
                ev.preventDefault();
                runCommand((ed) => ed.chain().focus().toggleUnderline().run());
                return;
            }
            if (key === "z" && !ev.shiftKey) {
                ev.preventDefault();
                runCommand((ed) => ed.chain().focus().undo().run());
                return;
            }
            if (key === "y" || (key === "z" && ev.shiftKey)) {
                ev.preventDefault();
                runCommand((ed) => ed.chain().focus().redo().run());
            }
        });
    };

    const iniciar = async () => {
        const query = new URLSearchParams(window.location.search || "");
        const queryTemplateId = Number(query.get("template_id") || 0);
        const queryNovo = query.get("novo") === "1";

        if (els.editorPreviewDados && !els.editorPreviewDados.value.trim()) els.editorPreviewDados.value = String(config.dadosPreviewExemploJson || "{}");
        if (els.editorNome && !String(els.editorNome.value || "").trim()) els.editorNome.value = "Novo Template Word Tariel.ia";
        if (els.editorCodigo && !String(els.editorCodigo.value || "").trim()) els.editorCodigo.value = gerarCodigoPadrao();

        syncLayout();
        defineTab("documento");
        atualizarEstadoInspector();
        statusSave("", "Sem alterações");
        limparComparacaoEditor();

        await carregarDependenciasEditor();
        bindToolbar();
        bindLayout();
        bindAtalhos();
        els.wordTabs.forEach((btn) => btn.addEventListener("click", () => defineTab(btn.dataset.tab)));
        els.btnOpenEditorA4?.addEventListener("click", criarTemplateEditorA4);
        els.btnOpenEditorLegacy?.addEventListener("click", () => { window.location.href = "/revisao/templates-laudo"; });
        els.btnEditorLoad?.addEventListener("click", () => carregarTemplateEditor(els.editorTemplateSelect?.value));
        els.btnSave?.addEventListener("click", () => salvarEditor({ silencioso: false }));
        els.btnPreview?.addEventListener("click", gerarPreviewEditor);
        els.btnPublish?.addEventListener("click", publicarTemplateEditor);
        els.btnUploadImage?.addEventListener("click", uploadInserirImagem);
        els.btnToggleSide?.addEventListener("click", toggleSide);
        els.btnCompare?.addEventListener("click", compararTemplateEditor);
        els.btnCompareClear?.addEventListener("click", () => {
            if (els.editorCompareSelect) els.editorCompareSelect.value = "";
            limparComparacaoEditor();
        });
        els.presetButtons.forEach((btn) => {
            btn.addEventListener("click", () => aplicarPreset(btn.dataset.preset));
        });
        els.blockButtons.forEach((btn) => {
            btn.addEventListener("click", () => inserirBloco(btn.dataset.block));
        });
        els.quickPlaceholderButtons.forEach((btn) => {
            btn.addEventListener("click", () => inserirPlaceholderRapido(btn.dataset.mode, btn.dataset.key));
        });
        [els.editorNome, els.editorCodigo, els.editorVersao, els.editorObs].forEach((i) => i?.addEventListener("input", () => agendarAutosave()));
        document.addEventListener("click", (ev) => {
            const btn = ev.target.closest(".js-open-editor");
            if (!btn) return;
            ev.preventDefault();
            const id = Number(btn.dataset.id || 0);
            if (id) carregarTemplateEditor(id);
        });
        await carregarTemplates();

        if (queryTemplateId > 0) await carregarTemplateEditor(queryTemplateId);
        else if (queryNovo) {
            status(els.statusCreateWord, "Pronto para criar um novo modelo Word.", "ok");
            els.cardEditorWord?.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        window.addEventListener("beforeunload", () => { if (state.blob) URL.revokeObjectURL(state.blob); });
    };

    iniciar().catch((erro) => {
        status(els.statusEditorWord, `Falha ao iniciar editor Word: ${erro.message}`, "err");
        statusSave("error", "Falha ao inicializar");
        console.error("[Tariel] Falha no editor Word:", erro);
    });
})();
