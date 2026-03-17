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
        sortTemplates: document.getElementById("sort-templates"),
        filtroAtivo: document.getElementById("flt-ativo"),
        filtroRascunho: document.getElementById("flt-rascunho"),
        btnRefresh: document.getElementById("btn-refresh"),
        btnLimparFiltros: document.getElementById("btn-limpar-filtros"),
        metricTotal: document.getElementById("metric-total"),
        metricWord: document.getElementById("metric-word"),
        metricAtivo: document.getElementById("metric-ativo"),
        metricRecente: document.getElementById("metric-recente"),
    };

    if (!els.lista) return;

    const state = {
        itens: [],
        busca: "",
        modo: "todos",
        ordenacao: "recentes",
        incluirAtivos: true,
        incluirRascunhos: true,
        renderToken: 0,
        thumbCache: new Map(),
    };

    const html = (v) => String(v || "")
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

    const erroHttp = async (res) => {
        try {
            const j = await res.json();
            return j.detail || j.erro || `HTTP ${res.status}`;
        } catch (_) {
            return `HTTP ${res.status}`;
        }
    };

    const modoTemplate = (item) => (item.is_editor_rico ? "word" : "pdf");
    const statusTemplate = (item) => (item.ativo ? "ativo" : "rascunho");
    const dataAtualizacao = (item) => String(item.atualizado_em || item.criado_em || "");

    const _dataComparable = (item) => {
        const atualizado = Date.parse(String(item.atualizado_em || ""));
        if (Number.isFinite(atualizado)) return atualizado;
        const criado = Date.parse(String(item.criado_em || ""));
        if (Number.isFinite(criado)) return criado;
        return Number(item.id || 0);
    };

    const filtrar = () => {
        const filtrados = state.itens.filter((item) => {
            const textoBusca = `${item.nome || ""} ${item.codigo_template || ""}`.toLowerCase();
            if (state.busca && !textoBusca.includes(state.busca)) return false;

            if (state.modo !== "todos" && modoTemplate(item) !== state.modo) return false;

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

    const formatarDataPtBr = (iso) => {
        const data = new Date(String(iso || ""));
        if (!Number.isFinite(data.getTime())) return "-";
        return data.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    };

    const atualizarMetricas = () => {
        const total = state.itens.length;
        const totalWord = state.itens.filter((x) => x.is_editor_rico).length;
        const totalAtivo = state.itens.filter((x) => x.ativo).length;
        const maisRecente = [...state.itens].sort((a, b) => _dataComparable(b) - _dataComparable(a))[0];

        if (els.metricTotal) els.metricTotal.textContent = String(total);
        if (els.metricWord) els.metricWord.textContent = String(totalWord);
        if (els.metricAtivo) els.metricAtivo.textContent = String(totalAtivo);
        if (els.metricRecente) els.metricRecente.textContent = maisRecente ? formatarDataPtBr(dataAtualizacao(maisRecente)) : "-";
    };

    const render = () => {
        const itens = filtrar();
        if (!itens.length) {
            els.lista.innerHTML = `
                <div class="empty-state">
                    Nenhum template encontrado com os filtros atuais.
                </div>
            `;
            return;
        }

        els.lista.innerHTML = itens.map((item, idx) => {
            const id = Number(item.id);
            const modo = modoTemplate(item);
            const st = statusTemplate(item);
            return `
                <article class="template-card" data-id="${id}" style="--card-index:${idx};">
                    <div class="template-preview">
                        <div class="template-overlay-meta">
                            <span class="preview-chip ${modo}">${modo === "word" ? "Word" : "PDF"}</span>
                        </div>
                        <div class="thumb-frame">
                            <canvas class="thumb-canvas" data-template-id="${id}"></canvas>
                        </div>
                        <div class="thumb-loading" data-template-loading="${id}">Carregando miniatura...</div>
                    </div>
                    <div class="template-body">
                        <h3 class="template-title">${html(item.nome || "Sem nome")}</h3>
                        <p class="template-meta">${html(item.codigo_template || "")} • v${Number(item.versao || 1)}</p>
                        <p class="template-updated">Atualizado em ${formatarDataPtBr(dataAtualizacao(item))}</p>
                        <div class="template-badges">
                            <span class="badge ${modo}">${modo === "word" ? "WORD" : "PDF BASE"}</span>
                            <span class="badge ${st}">${st === "ativo" ? "ATIVO" : "RASCUNHO"}</span>
                        </div>
                        <div class="template-actions">
                            <a class="btn ghost" href="/revisao/templates-laudo/editor?template_id=${id}">Editar</a>
                            <button class="btn ghost js-usar" data-id="${id}" ${item.ativo ? "disabled" : ""}>${item.ativo ? "Em uso" : "Usar template"}</button>
                            <button class="btn ghost js-abrir-base" data-id="${id}">Abrir base</button>
                            <button class="btn ghost js-excluir" data-id="${id}">Excluir</button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");
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
            atualizarMetricas();
            render();
            status(`${state.itens.length} template(s) na biblioteca.`, "ok");
            renderizarMiniaturasVisiveis().catch(() => {});
        } catch (e) {
            els.lista.innerHTML = `<div class="empty-state">Falha ao carregar templates.</div>`;
            status(`Erro: ${e.message}`, "err");
        }
    };

    const usarTemplate = async (id) => {
        const item = state.itens.find((x) => Number(x.id) === Number(id));
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
        const item = state.itens.find((x) => Number(x.id) === Number(id));
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
            status("Template excluído.", "ok");
            await carregar();
        } catch (e) {
            status(`Erro ao excluir: ${e.message}`, "err");
        }
    };

    const abrirBase = (id) => {
        window.open(`/revisao/api/templates-laudo/${Number(id)}/arquivo-base`, "_blank", "noopener,noreferrer");
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

        els.btnLimparFiltros?.addEventListener("click", () => {
            state.busca = "";
            state.modo = "todos";
            state.ordenacao = "recentes";
            state.incluirAtivos = true;
            state.incluirRascunhos = true;
            if (els.search) els.search.value = "";
            if (els.filtroModo) els.filtroModo.value = "todos";
            if (els.sortTemplates) els.sortTemplates.value = "recentes";
            if (els.filtroAtivo) els.filtroAtivo.checked = true;
            if (els.filtroRascunho) els.filtroRascunho.checked = true;
            render();
            renderizarMiniaturasVisiveis().catch(() => {});
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
            }
        });
    };

    bind();
    carregar();
})();
