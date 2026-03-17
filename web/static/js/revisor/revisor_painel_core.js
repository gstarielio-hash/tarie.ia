// ==========================================
// TARIEL.IA — REVISOR_PAINEL_CORE.JS
// Papel: núcleo compartilhado do painel do revisor.
// Responsável por:
// - namespace global do painel
// - referências de DOM e estado compartilhado
// - helpers base, anexos, badges e modais
// - utilitários usados pelos módulos da mesa e histórico
// ==========================================

(function () {
    "use strict";

    if (window.__TARIEL_REVISOR_PAINEL_CORE_WIRED__) return;
    window.__TARIEL_REVISOR_PAINEL_CORE_WIRED__ = true;

    const NS = window.TarielRevisorPainel || {};
    window.TarielRevisorPainel = NS;

const tokenCsrf = document.getElementById("global-csrf")?.value || "";
    const els = {
        body: document.body,
        listaLaudos: document.getElementById("lista-laudos"),
        listaWhispers: document.getElementById("lista-whispers"),
        containerWhispers: document.getElementById("container-whispers"),
        estadoVazio: document.getElementById("estado-vazio"),
        viewContent: document.getElementById("view-content"),
        viewHash: document.getElementById("view-hash"),
        viewMeta: document.getElementById("view-meta"),
        viewAcoes: document.getElementById("view-acoes"),
        mesaOperacaoPainel: document.getElementById("mesa-operacao-painel"),
        mesaOperacaoConteudo: document.getElementById("mesa-operacao-conteudo"),
        timeline: document.getElementById("view-timeline"),
        boxResposta: document.getElementById("box-resposta"),
        refAtivaResposta: document.getElementById("ref-ativa-resposta"),
        refAtivaTitulo: document.getElementById("ref-ativa-titulo"),
        refAtivaTexto: document.getElementById("ref-ativa-texto"),
        btnLimparRefAtiva: document.getElementById("btn-limpar-ref-ativa"),
        previewRespostaAnexo: document.getElementById("preview-resposta-anexo"),
        btnAnexoResposta: document.getElementById("btn-anexo-resposta"),
        inputAnexoResposta: document.getElementById("input-anexo-resposta"),
        inputResposta: document.getElementById("input-resposta"),
        btnEnviarMsg: document.getElementById("btn-enviar-msg"),
        modalRelatorio: document.getElementById("modal-relatorio"),
        btnFecharRelatorio: document.getElementById("btn-fechar-relatorio"),
        modalConteudo: document.getElementById("modal-conteudo"),
        modalPacote: document.getElementById("modal-pacote"),
        btnFecharPacote: document.getElementById("btn-fechar-pacote"),
        modalPacoteConteudo: document.getElementById("modal-pacote-conteudo"),
        dialogMotivo: document.getElementById("dialog-motivo"),
        inputMotivo: document.getElementById("input-motivo"),
        btnCancelarMotivo: document.getElementById("btn-cancelar-motivo"),
        btnConfirmarMotivo: document.getElementById("btn-confirmar-motivo"),
        statusFlutuante: document.getElementById("status-flutuante")
    };

    const state = {
        laudoAtivoId: null,
        jsonEstruturadoAtivo: null,
        pacoteMesaAtivo: null,
        socketWhisper: null,
        wsReconnectTimer: null,
        lastFocusedElement: null,
        pendingSend: false,
        referenciaMensagemAtiva: null,
        respostaAnexoPendente: null,
        historicoMensagens: [],
        historicoCursorProximo: null,
        historicoTemMais: false,
        carregandoHistoricoAntigo: false
    };

    const LIMITE_PAGINA_HISTORICO = 60;
    const MAX_BYTES_ANEXO_MESA = 12 * 1024 * 1024;
    const MIME_ANEXOS_MESA_PERMITIDOS = new Set([
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]);

    const focusableSelector = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(",");

    const escapeHtml = (unsafe) =>
        (unsafe || "")
            .toString()
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    const nl2br = (text) => escapeHtml(text).replace(/\n/g, "<br>");

    const formatarTamanhoBytes = (totalBytes) => {
        const valor = Number(totalBytes || 0);
        if (!Number.isFinite(valor) || valor <= 0) return "0 KB";
        if (valor >= 1024 * 1024) {
            return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
        }
        return `${Math.max(1, Math.round(valor / 1024))} KB`;
    };

    const normalizarAnexoMensagem = (payload = {}) => {
        const id = Number(payload?.id || 0) || null;
        const nome = String(payload?.nome || "").trim();
        const url = String(payload?.url || "").trim();
        if (!id || !nome || !url) return null;
        return {
            id,
            nome,
            url,
            mime_type: String(payload?.mime_type || "").trim().toLowerCase(),
            categoria: String(payload?.categoria || "").trim().toLowerCase(),
            tamanho_bytes: Number(payload?.tamanho_bytes || 0) || 0,
            eh_imagem: !!payload?.eh_imagem
        };
    };

    const renderizarAnexosMensagem = (anexos = []) => {
        const itens = Array.isArray(anexos) ? anexos.filter(Boolean) : [];
        if (!itens.length) return "";

        return `
            <div class="anexos-mensagem">
                ${itens.map((anexo) => `
                    <a
                        class="anexo-mensagem-link"
                        href="${escapeHtml(anexo?.url || "#")}"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <span class="material-symbols-rounded" aria-hidden="true">${anexo?.eh_imagem ? "image" : "description"}</span>
                        <span class="anexo-mensagem-info">
                            <strong>${escapeHtml(anexo?.nome || "anexo")}</strong>
                            <small>${escapeHtml(formatarTamanhoBytes(anexo?.tamanho_bytes || 0))}</small>
                        </span>
                    </a>
                `).join("")}
            </div>
        `;
    };

    const limparAnexoResposta = () => {
        state.respostaAnexoPendente = null;
        if (els.inputAnexoResposta) {
            els.inputAnexoResposta.value = "";
        }
        if (els.previewRespostaAnexo) {
            els.previewRespostaAnexo.hidden = true;
            els.previewRespostaAnexo.innerHTML = "";
        }
    };

    const renderizarPreviewAnexoResposta = () => {
        const anexo = state.respostaAnexoPendente;
        if (!els.previewRespostaAnexo) return;

        if (!anexo?.arquivo) {
            els.previewRespostaAnexo.hidden = true;
            els.previewRespostaAnexo.innerHTML = "";
            return;
        }

        els.previewRespostaAnexo.hidden = false;
        els.previewRespostaAnexo.innerHTML = `
            <span class="material-symbols-rounded" aria-hidden="true">${anexo.ehImagem ? "image" : "description"}</span>
            <div class="reply-attachment-info">
                <strong>${escapeHtml(anexo.nome)}</strong>
                <small>${escapeHtml(formatarTamanhoBytes(anexo.tamanho))}</small>
            </div>
            <button type="button" class="btn-remover-anexo-chat" aria-label="Remover anexo">×</button>
        `;
    };

    const selecionarAnexoResposta = (arquivo) => {
        if (!arquivo) return;

        const mime = String(arquivo.type || "").trim().toLowerCase();
        if (!MIME_ANEXOS_MESA_PERMITIDOS.has(mime)) {
            showStatus("Use PNG, JPG, WebP, PDF ou DOCX no canal da mesa.", "error");
            return;
        }

        if (arquivo.size > MAX_BYTES_ANEXO_MESA) {
            showStatus("O anexo da mesa deve ter no máximo 12MB.", "error");
            return;
        }

        state.respostaAnexoPendente = {
            arquivo,
            nome: String(arquivo.name || "anexo"),
            tamanho: Number(arquivo.size || 0) || 0,
            mime_type: mime,
            ehImagem: mime.startsWith("image/")
        };
        renderizarPreviewAnexoResposta();
    };

    const showStatus = (texto, icone = "info") => {
        if (!els.statusFlutuante) return;
        els.statusFlutuante.innerHTML =
            `<span class="material-symbols-rounded" aria-hidden="true">${icone}</span><span>${escapeHtml(texto)}</span>`;
        els.statusFlutuante.classList.add("mostrar");
        clearTimeout(showStatus._timer);
        showStatus._timer = setTimeout(() => {
            els.statusFlutuante.classList.remove("mostrar");
        }, 3200);
    };

    const resumoMensagem = (texto) => {
        const base = String(texto || "").replace(/\s+/g, " ").trim();
        if (!base) return "Mensagem sem conteúdo";
        return base.length > 140 ? `${base.slice(0, 140)}...` : base;
    };

    const formatarDataHora = (valor) => {
        if (!valor) return "-";
        try {
            const data = new Date(valor);
            if (Number.isNaN(data.getTime())) return "-";
            return data.toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            });
        } catch (_) {
            return "-";
        }
    };

    const downloadJson = (nomeArquivo, payload) => {
        const nomeSeguro = (nomeArquivo || "pacote_mesa_laudo.json")
            .replace(/[^\w.\-]/g, "_")
            .slice(0, 120);
        const conteudo = JSON.stringify(payload || {}, null, 2);
        const blob = new Blob([conteudo], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = nomeSeguro;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const obterPacoteMesaLaudo = async ({ forcar = false } = {}) => {
        if (!state.laudoAtivoId) return null;
        if (!forcar && state.pacoteMesaAtivo) return state.pacoteMesaAtivo;

        const res = await fetch(`/revisao/api/laudo/${state.laudoAtivoId}/pacote`, {
            headers: { "X-Requested-With": "XMLHttpRequest" }
        });
        if (!res.ok) {
            throw new Error(`Falha HTTP ${res.status}`);
        }

        const pacote = await res.json();
        state.pacoteMesaAtivo = pacote;
        return pacote;
    };

    const limparReferenciaMensagemAtiva = () => {
        state.referenciaMensagemAtiva = null;
        if (els.refAtivaResposta) {
            els.refAtivaResposta.hidden = true;
        }
        if (els.refAtivaTexto) {
            els.refAtivaTexto.textContent = "";
        }
    };

    const definirReferenciaMensagemAtiva = (msg) => {
        if (!msg || !Number.isFinite(Number(msg.id))) {
            limparReferenciaMensagemAtiva();
            return;
        }

        const referenciaId = Number(msg.id);
        const referenciaTexto = resumoMensagem(msg.texto);
        state.referenciaMensagemAtiva = {
            id: referenciaId,
            texto: referenciaTexto
        };

        if (els.refAtivaTitulo) {
            els.refAtivaTitulo.textContent = `Respondendo #${referenciaId}`;
        }
        if (els.refAtivaTexto) {
            els.refAtivaTexto.textContent = referenciaTexto;
        }
        if (els.refAtivaResposta) {
            els.refAtivaResposta.hidden = false;
        }
        els.inputResposta?.focus();
    };

    const setActiveItem = (id) => {
        document.querySelectorAll(".item-lista.ativo").forEach((el) => el.classList.remove("ativo"));
        document.querySelectorAll(`.js-item-laudo[data-id="${CSS.escape(String(id))}"]`)
            .forEach((el) => el.classList.add("ativo"));
    };

    const textoBadgeWhisper = (total) => {
        const valor = Math.max(0, Number(total || 0) || 0);
        if (valor <= 0) return "0 whispers";
        return valor > 99 ? "99+ whispers" : `${valor} whisper${valor === 1 ? "" : "s"}`;
    };

    const textoBadgePendencia = (total) => {
        const valor = Math.max(0, Number(total || 0) || 0);
        if (valor <= 0) return "0 pend.";
        return valor > 99 ? "99+ pend." : `${valor} pend.`;
    };

    const atualizarIndicadoresListaLaudo = (laudoId, {
        whispersNaoLidos = null,
        pendenciasAbertas = null
    } = {}) => {
        const alvo = Number(laudoId || 0);
        if (!Number.isFinite(alvo) || alvo <= 0) return;

        document.querySelectorAll(`.js-item-laudo[data-id="${CSS.escape(String(alvo))}"]`).forEach((itemEl) => {
            if (whispersNaoLidos !== null && whispersNaoLidos !== undefined) {
                const totalWhispers = Math.max(0, Number(whispersNaoLidos || 0) || 0);
                itemEl.dataset.whispersNaoLidos = String(totalWhispers);
                const badgeWhisper = itemEl.querySelector(".js-indicador-whispers");
                if (badgeWhisper) {
                    badgeWhisper.hidden = totalWhispers <= 0;
                    badgeWhisper.textContent = textoBadgeWhisper(totalWhispers);
                }
            }

            if (pendenciasAbertas !== null && pendenciasAbertas !== undefined) {
                const totalPendencias = Math.max(0, Number(pendenciasAbertas || 0) || 0);
                itemEl.dataset.pendenciasAbertas = String(totalPendencias);
                const badgePendencia = itemEl.querySelector(".js-indicador-pendencias");
                if (badgePendencia) {
                    badgePendencia.hidden = totalPendencias <= 0;
                    badgePendencia.textContent = textoBadgePendencia(totalPendencias);
                }
            }
        });
    };

    const ocultarContainerWhispersSeVazio = () => {
        const possuiItens = !!els.listaWhispers?.querySelector?.(".js-item-laudo");
        if (els.containerWhispers) {
            els.containerWhispers.hidden = !possuiItens;
        }
    };

    const removerWhispersDaListaPorLaudo = (laudoId) => {
        const alvo = Number(laudoId || 0);
        if (!Number.isFinite(alvo) || alvo <= 0 || !els.listaWhispers) return;

        els.listaWhispers
            .querySelectorAll(`.js-item-laudo[data-id="${CSS.escape(String(alvo))}"]`)
            .forEach((item) => item.remove());
        ocultarContainerWhispersSeVazio();
    };

    const marcarWhispersComoLidosLaudo = async (laudoId, { silencioso = true } = {}) => {
        const alvo = Number(laudoId || 0);
        if (!Number.isFinite(alvo) || alvo <= 0) return false;

        try {
            const res = await fetch(`/revisao/api/laudo/${alvo}/marcar-whispers-lidos`, {
                method: "POST",
                headers: {
                    "X-CSRF-Token": tokenCsrf,
                    "X-Requested-With": "XMLHttpRequest"
                }
            });
            if (!res.ok) {
                throw new Error(`Falha HTTP ${res.status}`);
            }

            removerWhispersDaListaPorLaudo(alvo);
            atualizarIndicadoresListaLaudo(alvo, { whispersNaoLidos: 0 });
            return true;
        } catch (erro) {
            if (!silencioso) {
                showStatus("Não foi possível marcar whispers como lidos.", "error");
            }
            console.error("[Tariel] Falha ao marcar whispers como lidos:", erro);
            return false;
        }
    };

    const irParaMensagemTimeline = (mensagemId) => {
        const alvo = els.timeline?.querySelector?.(`[data-msg-id="${CSS.escape(String(mensagemId))}"]`);
        if (!alvo) return;

        alvo.scrollIntoView({ behavior: "smooth", block: "center" });
        alvo.classList.add("destacada");
        setTimeout(() => alvo.classList.remove("destacada"), 1200);
    };

    const setViewLoading = (texto = "Carregando...") => {
        els.estadoVazio.style.display = "none";
        els.viewContent.hidden = false;
        if (els.mesaOperacaoPainel) {
            els.mesaOperacaoPainel.hidden = true;
        }
        if (els.mesaOperacaoConteudo) {
            els.mesaOperacaoConteudo.innerHTML = "";
        }
        els.timeline.innerHTML = `<div class="timeline-status">${escapeHtml(texto)}</div>`;
    };

    const encontrarMensagemPorId = (mensagemId) => {
        const alvo = Number(mensagemId);
        if (!Number.isFinite(alvo) || alvo <= 0) return null;

        const grupos = [
            state.historicoMensagens,
            state.pacoteMesaAtivo?.pendencias_abertas,
            state.pacoteMesaAtivo?.pendencias_resolvidas_recentes,
            state.pacoteMesaAtivo?.whispers_recentes
        ];

        for (const grupo of grupos) {
            if (!Array.isArray(grupo)) continue;
            const encontrado = grupo.find((item) => Number(item?.id) === alvo);
            if (encontrado) return encontrado;
        }

        return null;
    };

const openModal = (overlay, focusEl = null) => {
        if (!overlay) return;
        state.lastFocusedElement = document.activeElement;
        overlay.classList.add("ativo");
        overlay.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        setTimeout(() => (focusEl || overlay.querySelector(focusableSelector))?.focus(), 0);
    };

    const closeModal = (overlay) => {
        if (!overlay) return;
        overlay.classList.remove("ativo");
        overlay.setAttribute("aria-hidden", "true");

        if (![els.modalRelatorio, els.modalPacote, els.dialogMotivo].some((el) => el.classList.contains("ativo"))) {
            document.body.style.overflow = "";
        }

        state.lastFocusedElement?.focus?.();
    };

    const trapFocus = (overlay, event) => {
        if (event.key !== "Tab" || !overlay.classList.contains("ativo")) return;
        const focaveis = [...overlay.querySelectorAll(focusableSelector)];
        if (!focaveis.length) return;

        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];

        if (event.shiftKey && document.activeElement === primeiro) {
            event.preventDefault();
            ultimo.focus();
        } else if (!event.shiftKey && document.activeElement === ultimo) {
            event.preventDefault();
            primeiro.focus();
        }
    };

Object.assign(NS, {
    tokenCsrf,
    els,
    state,
    LIMITE_PAGINA_HISTORICO,
    MAX_BYTES_ANEXO_MESA,
    MIME_ANEXOS_MESA_PERMITIDOS,
    focusableSelector,
    escapeHtml,
    nl2br,
    formatarTamanhoBytes,
    normalizarAnexoMensagem,
    renderizarAnexosMensagem,
    limparAnexoResposta,
    renderizarPreviewAnexoResposta,
    selecionarAnexoResposta,
    showStatus,
    resumoMensagem,
    formatarDataHora,
    downloadJson,
    obterPacoteMesaLaudo,
    limparReferenciaMensagemAtiva,
    definirReferenciaMensagemAtiva,
    setActiveItem,
    textoBadgeWhisper,
    textoBadgePendencia,
    atualizarIndicadoresListaLaudo,
    ocultarContainerWhispersSeVazio,
    removerWhispersDaListaPorLaudo,
    marcarWhispersComoLidosLaudo,
    irParaMensagemTimeline,
    setViewLoading,
    encontrarMensagemPorId,
    openModal,
    closeModal,
    trapFocus
});
})();
