// ==========================================
// TARIEL CONTROL TOWER — CHAT_INDEX_PAGE.JS
// Página principal do chat.
// Responsável por:
// - modal de nova inspeção
// - barra de sessão ativa
// - ações rápidas
// - destaque visual do textarea
// - banner de resposta da engenharia
// - SSE de notificações da página
// ==========================================

(function () {
    "use strict";

    // Evita bind duplicado se o arquivo for carregado mais de uma vez.
    if (window.__TARIEL_CHAT_INDEX_PAGE_WIRED__) return;
    window.__TARIEL_CHAT_INDEX_PAGE_WIRED__ = true;

    // =========================================================
    // CONSTANTES
    // =========================================================
    const ROTA_SSE_NOTIFICACOES = "/app/api/notificacoes/sse";
    const TEMPO_BANNER_MS = 8000;
    const TEMPO_RECONEXAO_SSE_MS = 5000;

    const NOMES_TEMPLATES = {
        avcb: "Laudo AVCB (Projeto e Conformidade)",
        cbmgo: "Checklist Bombeiros GO (CMAR / Estrutura)",
        nr12maquinas: "Laudo de Adequação NR-12",
        nr13: "Inspeção NR-13 (Caldeiras e Vasos)",
        rti: "RTI - Instalações Elétricas",
        pie: "PIE - Prontuário Elétrico",
        spda: "Inspeção SPDA — NBR 5419",
        padrao: "Inspeção Geral",
    };

    const CONFIG_STATUS_MESA = {
        pronta: {
            classe: "status-pronta",
            icone: "support_agent",
            texto: "Mesa pronta",
        },
        canal_ativo: {
            classe: "status-canal",
            icone: "alternate_email",
            texto: "Canal @insp ativo",
        },
        aguardando: {
            classe: "status-aguardando",
            icone: "hourglass_top",
            texto: "Aguardando mesa",
        },
        respondeu: {
            classe: "status-respondeu",
            icone: "mark_chat_read",
            texto: "Mesa respondeu",
        },
        offline: {
            classe: "status-offline",
            icone: "wifi_off",
            texto: "Mesa indisponível",
        },
    };

    const CONFIG_CONEXAO_MESA_WIDGET = {
        conectado: "Conectado",
        reconectando: "Reconectando",
        offline: "Offline",
    };

    const LIMITE_RECONEXAO_SSE_OFFLINE = 3;

    // =========================================================
    // ESTADO LOCAL DA PÁGINA
    // =========================================================
    const estado = {
        tipoTemplateAtivo: "padrao",
        statusMesa: "pronta",
        carregandoPendencias: false,
        laudoPendenciasAtual: null,
        qtdPendenciasAbertas: 0,
        filtroPendencias: "abertas",
        paginaPendenciasAtual: 1,
        tamanhoPaginaPendencias: 25,
        totalPendenciasFiltradas: 0,
        totalPendenciasExibidas: 0,
        temMaisPendencias: false,
        fonteSSE: null,
        timerBanner: null,
        timerReconexaoSSE: null,
        ultimoElementoFocado: null,
        iniciandoInspecao: false,
        finalizandoInspecao: false,
        mesaWidgetAberto: false,
        mesaWidgetCarregando: false,
        mesaWidgetMensagens: [],
        mesaWidgetCursor: null,
        mesaWidgetTemMais: false,
        mesaWidgetReferenciaAtiva: null,
        mesaWidgetNaoLidas: 0,
        mesaWidgetConexao: "conectado",
        tentativasReconexaoSSE: 0,
        timerFecharMesaWidget: null,
    };

    // Compatibilidade com trechos legados do projeto.
    window.tipoTemplateAtivo = estado.tipoTemplateAtivo;

    // =========================================================
    // REFERÊNCIAS DOS ELEMENTOS DA PÁGINA
    // =========================================================
    const el = {
        modal: document.getElementById("modal-nova-inspecao"),
        btnAbrirModal: document.getElementById("btn-abrir-modal-novo"),
        btnFecharModal: document.querySelector(".btn-fechar-modal"),
        btnConfirmarInspecao: document.getElementById("btn-confirmar-inspecao"),
        selectTemplate: document.getElementById("select-template-inspecao"),
        inputClienteInspecao: document.getElementById("input-cliente-inspecao"),
        inputUnidadeInspecao: document.getElementById("input-unidade-inspecao"),
        textareaObjetivoInspecao: document.getElementById("textarea-objetivo-inspecao"),
        modalGateQualidade: document.getElementById("modal-gate-qualidade"),
        btnFecharModalGateQualidade: document.getElementById("btn-fechar-modal-gate-qualidade"),
        btnEntendiGateQualidade: document.getElementById("btn-entendi-gate-qualidade"),
        btnPreencherGateQualidade: document.getElementById("btn-gate-preencher-no-chat"),
        tituloTemplateGateQualidade: document.getElementById("titulo-gate-template"),
        textoGateQualidadeResumo: document.getElementById("texto-gate-qualidade-resumo"),
        listaGateFaltantes: document.getElementById("lista-gate-faltantes"),
        listaGateChecklist: document.getElementById("lista-gate-checklist"),

        telaBoasVindas: document.getElementById("tela-boas-vindas"),
        barraStatusInspecao: document.getElementById("barra-status-inspecao"),
        nomeTemplateAtivo: document.getElementById("nome-template-ativo"),
        pillStatusMesa: document.getElementById("pill-status-mesa"),
        iconeStatusMesa: document.getElementById("icone-status-mesa"),
        textoStatusMesa: document.getElementById("texto-status-mesa"),
        btnAbrirPendenciasMesa: document.getElementById("btn-abrir-pendencias-mesa"),
        badgePendenciasMesa: document.getElementById("badge-pendencias-mesa"),
        painelPendenciasMesa: document.getElementById("painel-pendencias-mesa"),
        listaPendenciasMesa: document.getElementById("lista-pendencias-mesa"),
        textoVazioPendenciasMesa: document.getElementById("texto-vazio-pendencias-mesa"),
        resumoPendenciasMesa: document.getElementById("resumo-pendencias-mesa"),
        btnExportarPendenciasPdf: document.getElementById("btn-exportar-pendencias-pdf"),
        btnCarregarMaisPendencias: document.getElementById("btn-carregar-mais-pendencias"),
        botoesFiltroPendencias: Array.from(document.querySelectorAll("[data-filtro-pendencias]")),
        btnMarcarPendenciasLidas: document.getElementById("btn-marcar-pendencias-lidas"),
        btnFecharPendenciasMesa: document.getElementById("btn-fechar-pendencias-mesa"),
        btnFinalizarInspecao: document.getElementById("btn-finalizar-inspecao"),

        campoMensagem: document.getElementById("campo-mensagem"),
        btnToggleHumano: document.getElementById("btn-toggle-humano"),
        backdropHighlight: document.getElementById("highlight-backdrop"),
        pilulaEntrada: document.querySelector(".pilula-entrada"),

        bannerEngenharia: document.getElementById("banner-notificacao-engenharia"),
        textoBannerEngenharia: document.getElementById("texto-previa-notificacao"),
        btnFecharBanner: document.querySelector(".btn-fechar-banner"),

        botoesAcoesRapidas: Array.from(document.querySelectorAll(".btn-acao-rapida")),

        btnMesaWidgetToggle: document.getElementById("btn-mesa-widget-toggle"),
        badgeMesaWidget: document.getElementById("badge-mesa-widget"),
        painelMesaWidget: document.getElementById("painel-mesa-widget"),
        btnFecharMesaWidget: document.getElementById("btn-fechar-mesa-widget"),
        statusConexaoMesaWidget: document.getElementById("status-conexao-mesa-widget"),
        textoConexaoMesaWidget: document.getElementById("texto-conexao-mesa-widget"),
        mesaWidgetLista: document.getElementById("mesa-widget-lista"),
        mesaWidgetInput: document.getElementById("mesa-widget-input"),
        mesaWidgetEnviar: document.getElementById("mesa-widget-enviar"),
        mesaWidgetCarregarMais: document.getElementById("mesa-widget-carregar-mais"),
        mesaWidgetRefAtiva: document.getElementById("mesa-widget-ref-ativa"),
        mesaWidgetRefTitulo: document.getElementById("mesa-widget-ref-titulo"),
        mesaWidgetRefTexto: document.getElementById("mesa-widget-ref-texto"),
        mesaWidgetRefLimpar: document.getElementById("mesa-widget-ref-limpar"),
    };

    // =========================================================
    // UTILITÁRIOS
    // =========================================================

    function mostrarToast(mensagem, tipo = "info", duracao = 3000) {
        if (typeof window.mostrarToast === "function") {
            window.mostrarToast(mensagem, tipo, duracao);
        }
    }

    function normalizarTipoTemplate(tipo) {
        const valor = String(tipo || "padrao").trim().toLowerCase();

        if (valor === "nr12" || valor === "nr12_maquinas") return "nr12maquinas";
        if (valor === "nr13_caldeira") return "nr13";
        if (valor === "nr10_rti") return "rti";
        return valor || "padrao";
    }

    function normalizarEstadoRelatorio(valor) {
        const estadoBruto = String(valor || "").trim().toLowerCase();

        if (estadoBruto === "relatorioativo" || estadoBruto === "relatorio_ativo") {
            return "relatorio_ativo";
        }

        if (estadoBruto === "semrelatorio" || estadoBruto === "sem_relatorio") {
            return "sem_relatorio";
        }

        if (estadoBruto === "aguardando" || estadoBruto === "aguardando_avaliacao") {
            return "aguardando";
        }

        return estadoBruto || "sem_relatorio";
    }

    function normalizarFiltroPendencias(valor) {
        const filtro = String(valor || "").trim().toLowerCase();
        if (filtro === "abertas" || filtro === "resolvidas" || filtro === "todas") {
            return filtro;
        }
        return "abertas";
    }

    function obterEstadoRelatorioAtualSeguro() {
        return normalizarEstadoRelatorio(
            window.TarielAPI?.obterEstadoRelatorioNormalizado?.() ||
            window.TarielAPI?.obterEstadoRelatorio?.() ||
            "sem_relatorio"
        );
    }

    function escaparHtml(texto = "") {
        return String(texto)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function obterElementosFocaveis(container) {
        if (!container) return [];

        return Array.from(
            container.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
        ).filter((node) => !node.disabled && !node.hidden);
    }

    function limparTimerBanner() {
        if (!estado.timerBanner) return;
        window.clearTimeout(estado.timerBanner);
        estado.timerBanner = null;
    }

    function limparTimerReconexaoSSE() {
        if (!estado.timerReconexaoSSE) return;
        window.clearTimeout(estado.timerReconexaoSSE);
        estado.timerReconexaoSSE = null;
    }

    function limparTimerFecharMesaWidget() {
        if (!estado.timerFecharMesaWidget) return;
        window.clearTimeout(estado.timerFecharMesaWidget);
        estado.timerFecharMesaWidget = null;
    }

    function fecharSSE() {
        if (!estado.fonteSSE) return;

        try {
            estado.fonteSSE.close();
        } catch (_) {
            // silêncio intencional
        }

        estado.fonteSSE = null;
    }

    function definirBotaoIniciarCarregando(ativo) {
        if (!el.btnConfirmarInspecao) return;

        el.btnConfirmarInspecao.disabled = !!ativo;
        el.btnConfirmarInspecao.setAttribute("aria-busy", String(!!ativo));
    }

    function definirBotaoFinalizarCarregando(ativo) {
        if (!el.btnFinalizarInspecao) return;

        el.btnFinalizarInspecao.disabled = !!ativo;
        el.btnFinalizarInspecao.setAttribute("aria-busy", String(!!ativo));
    }

    function normalizarStatusMesa(valor) {
        const status = String(valor || "").trim().toLowerCase();

        if (!status) return "pronta";
        if (status === "canal" || status === "ativo") return "canal_ativo";

        return CONFIG_STATUS_MESA[status] ? status : "pronta";
    }

    function obterLaudoAtivo() {
        return Number(window.TarielAPI?.obterLaudoAtualId?.() || 0) || null;
    }

    function obterTokenCsrf() {
        return document.querySelector('meta[name="csrf-token"]')?.content || "";
    }

    function resumirTexto(texto, limite = 140) {
        const base = String(texto || "").replace(/\s+/g, " ").trim();
        if (!base) return "Mensagem sem conteúdo";
        return base.length > limite ? `${base.slice(0, limite)}...` : base;
    }

    function normalizarConexaoMesaWidget(valor) {
        const status = String(valor || "").trim().toLowerCase();
        if (status === "reconectando") return "reconectando";
        if (status === "offline") return "offline";
        return "conectado";
    }

    function atualizarEstadoVisualBotaoMesaWidget() {
        if (!el.btnMesaWidgetToggle) return;

        const naoLidas = Number(estado.mesaWidgetNaoLidas || 0);
        const aberto = !!estado.mesaWidgetAberto;
        const conexao = normalizarConexaoMesaWidget(estado.mesaWidgetConexao);
        const alerta = naoLidas > 0 || aberto;

        el.btnMesaWidgetToggle.classList.toggle("is-open", aberto);
        el.btnMesaWidgetToggle.classList.toggle("is-alert", alerta);
        el.btnMesaWidgetToggle.classList.toggle("is-reconnecting", conexao === "reconectando");
        el.btnMesaWidgetToggle.classList.toggle("is-offline", conexao === "offline");

        const partes = [aberto ? "Fechar chat da mesa avaliadora" : "Abrir chat da mesa avaliadora"];
        if (naoLidas > 0) {
            partes.push(`${Math.min(naoLidas, 99)} mensagem(ns) não lida(s)`);
        }
        if (conexao !== "conectado") {
            partes.push(CONFIG_CONEXAO_MESA_WIDGET[conexao] || "Conexão indisponível");
        }
        el.btnMesaWidgetToggle.setAttribute("aria-label", partes.join(". "));
    }

    function atualizarConexaoMesaWidget(status = "conectado", detalhe = "") {
        const conexao = normalizarConexaoMesaWidget(status);
        estado.mesaWidgetConexao = conexao;

        if (el.statusConexaoMesaWidget) {
            el.statusConexaoMesaWidget.dataset.conexao = conexao;
            const textoEstado = CONFIG_CONEXAO_MESA_WIDGET[conexao] || CONFIG_CONEXAO_MESA_WIDGET.conectado;
            const detalheLimpo = String(detalhe || "").trim();
            el.statusConexaoMesaWidget.title = detalheLimpo
                ? `${textoEstado} — ${detalheLimpo.slice(0, 120)}`
                : textoEstado;
        }

        if (el.textoConexaoMesaWidget) {
            el.textoConexaoMesaWidget.textContent =
                CONFIG_CONEXAO_MESA_WIDGET[conexao] || CONFIG_CONEXAO_MESA_WIDGET.conectado;
        }

        atualizarEstadoVisualBotaoMesaWidget();
    }

    function atualizarBadgeMesaWidget() {
        if (!el.badgeMesaWidget) return;
        const total = Number(estado.mesaWidgetNaoLidas || 0);
        if (total <= 0) {
            el.badgeMesaWidget.hidden = true;
            el.badgeMesaWidget.textContent = "0";
            atualizarEstadoVisualBotaoMesaWidget();
            return;
        }
        el.badgeMesaWidget.hidden = false;
        el.badgeMesaWidget.textContent = total > 99 ? "99+" : String(total);
        atualizarEstadoVisualBotaoMesaWidget();
    }

    function limparReferenciaMesaWidget() {
        estado.mesaWidgetReferenciaAtiva = null;
        if (el.mesaWidgetRefAtiva) {
            el.mesaWidgetRefAtiva.hidden = true;
        }
        if (el.mesaWidgetRefTexto) {
            el.mesaWidgetRefTexto.textContent = "";
        }
    }

    function definirReferenciaMesaWidget(mensagem) {
        const referenciaId = Number(mensagem?.id || 0) || null;
        if (!referenciaId) {
            limparReferenciaMesaWidget();
            return;
        }

        const preview = resumirTexto(mensagem?.texto || "");
        estado.mesaWidgetReferenciaAtiva = { id: referenciaId, texto: preview };

        if (el.mesaWidgetRefTitulo) {
            el.mesaWidgetRefTitulo.textContent = `Respondendo #${referenciaId}`;
        }
        if (el.mesaWidgetRefTexto) {
            el.mesaWidgetRefTexto.textContent = preview;
        }
        if (el.mesaWidgetRefAtiva) {
            el.mesaWidgetRefAtiva.hidden = false;
        }
        el.mesaWidgetInput?.focus();
    }

    function normalizarMensagemMesa(payload) {
        const tipo = String(payload?.tipo || "").toLowerCase();
        const id = Number(payload?.id || 0) || null;
        if (!id) return null;

        return {
            id,
            laudo_id: Number(payload?.laudo_id || 0) || null,
            tipo,
            texto: String(payload?.texto || "").trim(),
            data: String(payload?.data || "").trim(),
            remetente_id: Number(payload?.remetente_id || 0) || null,
            referencia_mensagem_id: Number(payload?.referencia_mensagem_id || 0) || null,
        };
    }

    function obterMensagemMesaPorId(mensagemId) {
        const alvo = Number(mensagemId || 0) || null;
        if (!alvo) return null;
        return (estado.mesaWidgetMensagens || []).find((item) => Number(item?.id) === alvo) || null;
    }

    async function irParaMensagemPrincipal(mensagemId) {
        const alvo = Number(mensagemId || 0) || null;
        if (!alvo) return false;

        const seletor = `.linha-mensagem[data-mensagem-id="${alvo}"]`;
        let elemento = document.querySelector(seletor);

        if (!elemento) {
            const laudoId = obterLaudoAtivo();
            if (laudoId && typeof window.TarielAPI?.carregarLaudo === "function") {
                try {
                    await window.TarielAPI.carregarLaudo(laudoId, { forcar: true, silencioso: true });
                } catch (_) {}
                elemento = document.querySelector(seletor);
            }
        }

        if (!elemento) {
            mostrarToast("Mensagem de referência não está visível no histórico atual.", "aviso", 2300);
            return false;
        }

        elemento.scrollIntoView({ behavior: "smooth", block: "center" });
        elemento.classList.add("destacar-referencia");
        window.setTimeout(() => elemento.classList.remove("destacar-referencia"), 1400);
        return true;
    }

    function renderizarListaMesaWidget() {
        if (!el.mesaWidgetLista) return;

        const mensagens = Array.isArray(estado.mesaWidgetMensagens)
            ? estado.mesaWidgetMensagens
            : [];

        el.mesaWidgetLista.innerHTML = "";
        if (!mensagens.length) {
            const vazio = document.createElement("p");
            vazio.className = "texto-vazio-pendencias";
            vazio.textContent = "Sem mensagens da mesa neste laudo.";
            el.mesaWidgetLista.appendChild(vazio);
            return;
        }

        for (const item of mensagens) {
            const entradaMesa = item.tipo === "humano_eng";
            const card = document.createElement("article");
            card.className = `mesa-widget-item ${entradaMesa ? "entrada" : "saida"}`;
            card.dataset.mensagemId = String(item.id);

            const referenciaId = Number(item.referencia_mensagem_id || 0) || null;
            const referenciaMsg = referenciaId ? obterMensagemMesaPorId(referenciaId) : null;
            const referenciaPreview = resumirTexto(referenciaMsg?.texto || `Mensagem #${referenciaId || ""}`);
            const referenciaHtml = referenciaId
                ? `
                    <button type="button" class="mesa-widget-ref-link" data-ir-mensagem-id="${referenciaId}">
                        <strong>Referência #${referenciaId}</strong>
                        <span>${escaparHtml(referenciaPreview)}</span>
                    </button>
                `
                : "";

            card.innerHTML = `
                <div class="meta">
                    <span>${entradaMesa ? "Mesa" : "Você"}</span>
                    <span>${escaparHtml(item.data || "")}</span>
                </div>
                ${referenciaHtml}
                <p class="texto">${escaparHtml(item.texto || "")}</p>
                <div class="acoes">
                    <button type="button" data-responder-mensagem-id="${item.id}">Responder</button>
                </div>
            `;

            el.mesaWidgetLista.appendChild(card);
        }

        el.mesaWidgetLista.scrollTop = el.mesaWidgetLista.scrollHeight;
    }

    async function carregarMensagensMesaWidget({ append = false, silencioso = false } = {}) {
        const laudoId = obterLaudoAtivo();
        if (!laudoId || estado.mesaWidgetCarregando) return;

        estado.mesaWidgetCarregando = true;
        if (el.mesaWidgetCarregarMais) {
            el.mesaWidgetCarregarMais.disabled = true;
        }

        try {
            const params = new URLSearchParams();
            params.set("limite", "40");
            if (append && Number(estado.mesaWidgetCursor || 0) > 0) {
                params.set("cursor", String(estado.mesaWidgetCursor));
            }

            const resposta = await fetch(`/app/api/laudo/${laudoId}/mesa/mensagens?${params.toString()}`, {
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                },
            });

            if (!resposta.ok) {
                throw new Error(`HTTP_${resposta.status}`);
            }

            const dados = await resposta.json();
            const payload = dados?.dados || dados || {};
            const itens = Array.isArray(payload?.itens) ? payload.itens : [];
            const normalizados = itens
                .map(normalizarMensagemMesa)
                .filter(Boolean);

            if (append) {
                estado.mesaWidgetMensagens = [...normalizados, ...estado.mesaWidgetMensagens];
            } else {
                estado.mesaWidgetMensagens = [...normalizados];
            }

            estado.mesaWidgetCursor = Number(payload?.cursor_proximo || 0) || null;
            estado.mesaWidgetTemMais = !!payload?.tem_mais;

            if (el.mesaWidgetCarregarMais) {
                el.mesaWidgetCarregarMais.hidden = !estado.mesaWidgetTemMais;
            }

            renderizarListaMesaWidget();
        } catch (erro) {
            if (!silencioso) {
                mostrarToast("Não foi possível carregar o chat da mesa.", "aviso", 2400);
            }
        } finally {
            estado.mesaWidgetCarregando = false;
            if (el.mesaWidgetCarregarMais) {
                el.mesaWidgetCarregarMais.disabled = false;
            }
        }
    }

    async function enviarMensagemMesaWidget() {
        const laudoId = obterLaudoAtivo();
        const texto = String(el.mesaWidgetInput?.value || "").trim();
        if (!laudoId || !texto) return;

        const referenciaId = Number(estado.mesaWidgetReferenciaAtiva?.id || 0) || null;

        el.mesaWidgetEnviar?.setAttribute("aria-busy", "true");
        if (el.mesaWidgetEnviar) {
            el.mesaWidgetEnviar.disabled = true;
        }

        try {
            const resposta = await fetch(`/app/api/laudo/${laudoId}/mesa/mensagem`, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "X-CSRF-Token": obterTokenCsrf(),
                    "X-Requested-With": "XMLHttpRequest",
                },
                body: JSON.stringify({
                    texto,
                    referencia_mensagem_id: referenciaId || null,
                }),
            });

            if (!resposta.ok) {
                throw new Error(`HTTP_${resposta.status}`);
            }

            el.mesaWidgetInput.value = "";
            limparReferenciaMesaWidget();

            await carregarMensagensMesaWidget({ silencioso: true });
            atualizarStatusMesa("aguardando", texto.slice(0, 120));
        } catch (erro) {
            mostrarToast("Falha ao enviar mensagem para a mesa.", "erro", 2400);
        } finally {
            el.mesaWidgetEnviar?.removeAttribute("aria-busy");
            if (el.mesaWidgetEnviar) {
                el.mesaWidgetEnviar.disabled = false;
            }
            el.mesaWidgetInput?.focus();
        }
    }

    async function abrirMesaWidget() {
        limparTimerFecharMesaWidget();
        estado.mesaWidgetAberto = true;
        estado.mesaWidgetNaoLidas = 0;
        atualizarBadgeMesaWidget();

        if (el.painelMesaWidget) {
            el.painelMesaWidget.hidden = false;
            el.painelMesaWidget.classList.remove("fechando");
            requestAnimationFrame(() => {
                el.painelMesaWidget?.classList.add("aberto");
            });
        }
        if (el.btnMesaWidgetToggle) {
            el.btnMesaWidgetToggle.setAttribute("aria-expanded", "true");
        }
        atualizarEstadoVisualBotaoMesaWidget();

        await carregarMensagensMesaWidget({ silencioso: true });
        el.mesaWidgetInput?.focus();
    }

    function fecharMesaWidget() {
        estado.mesaWidgetAberto = false;
        limparTimerFecharMesaWidget();
        if (el.painelMesaWidget) {
            el.painelMesaWidget.classList.remove("aberto");
            el.painelMesaWidget.classList.add("fechando");
            estado.timerFecharMesaWidget = window.setTimeout(() => {
                if (el.painelMesaWidget) {
                    el.painelMesaWidget.hidden = true;
                    el.painelMesaWidget.classList.remove("fechando");
                }
                estado.timerFecharMesaWidget = null;
            }, 220);
        }
        if (el.btnMesaWidgetToggle) {
            el.btnMesaWidgetToggle.setAttribute("aria-expanded", "false");
        }
        atualizarEstadoVisualBotaoMesaWidget();
    }

    async function toggleMesaWidget() {
        if (estado.mesaWidgetAberto) {
            fecharMesaWidget();
            return;
        }
        await abrirMesaWidget();
    }

    async function atualizarChatAoVivoComMesa(dadosEvento) {
        const laudoEvento = Number(dadosEvento?.laudo_id ?? dadosEvento?.laudoId ?? 0) || null;
        const laudoAtivo = obterLaudoAtivo();
        if (!laudoEvento || !laudoAtivo || laudoEvento !== laudoAtivo) {
            return;
        }

        const texto = String(dadosEvento?.texto || "").trim();
        const mensagemId = Number(dadosEvento?.mensagem_id ?? dadosEvento?.id ?? 0) || null;
        const referenciaMensagemId = Number(dadosEvento?.referencia_mensagem_id ?? 0) || null;

        const mensagemJaRenderizada = mensagemId
            ? !!document.querySelector(`.linha-mensagem[data-mensagem-id="${mensagemId}"]`)
            : false;

        if (
            texto &&
            !mensagemJaRenderizada &&
            typeof window.adicionarMensagemNaUI === "function"
        ) {
            window.adicionarMensagemNaUI("engenharia", texto, "humano_eng", {
                mensagemId,
                referenciaMensagemId,
            });
            try {
                window.TarielChatPainel?.adicionarAoHistorico?.("assistente", texto);
            } catch (_) {}
        } else if (!texto && typeof window.TarielAPI?.carregarLaudo === "function") {
            try {
                await window.TarielAPI.carregarLaudo(laudoEvento, { forcar: true, silencioso: true });
            } catch (_) {}
        }

        await carregarMensagensMesaWidget({ silencioso: true });
    }

    function atualizarStatusMesa(status = "pronta", detalhe = "") {
        const statusNormalizado = normalizarStatusMesa(status);
        const config = CONFIG_STATUS_MESA[statusNormalizado] || CONFIG_STATUS_MESA.pronta;

        estado.statusMesa = statusNormalizado;

        if (!el.pillStatusMesa || !el.textoStatusMesa || !el.iconeStatusMesa) {
            return;
        }

        el.pillStatusMesa.dataset.mesaStatus = statusNormalizado;
        el.pillStatusMesa.classList.remove(
            "status-pronta",
            "status-canal",
            "status-aguardando",
            "status-respondeu",
            "status-offline"
        );
        el.pillStatusMesa.classList.add(config.classe);

        el.iconeStatusMesa.textContent = config.icone;
        el.textoStatusMesa.textContent = config.texto;

        const detalheLimpo = String(detalhe || "").trim();
        el.pillStatusMesa.title = detalheLimpo
            ? `${config.texto} — ${detalheLimpo.slice(0, 120)}`
            : config.texto;
    }

    function atualizarStatusMesaPorComposer(modoMarcador) {
        if (modoMarcador === "insp") {
            if (estado.statusMesa !== "aguardando" && estado.statusMesa !== "respondeu") {
                atualizarStatusMesa("canal_ativo");
            }
            return;
        }

        if (estado.statusMesa === "canal_ativo") {
            atualizarStatusMesa("pronta");
        }
    }

    function obterTipoTemplateDoPayload(dados = {}) {
        return normalizarTipoTemplate(
            dados?.tipoTemplate ||
            dados?.tipo_template ||
            dados?.template ||
            estado.tipoTemplateAtivo
        );
    }

    function inserirTextoNoComposer(texto) {
        const textoLimpo = String(texto || "").trim();

        if (!el.campoMensagem || !textoLimpo) {
            return false;
        }

        const valorAtual = String(el.campoMensagem.value || "").trim();
        el.campoMensagem.value = valorAtual ? `${valorAtual}\n${textoLimpo}` : textoLimpo;

        el.campoMensagem.dispatchEvent(new Event("input", { bubbles: true }));
        el.campoMensagem.dispatchEvent(new Event("change", { bubbles: true }));
        el.campoMensagem.focus();

        if (typeof el.campoMensagem.setSelectionRange === "function") {
            const fim = el.campoMensagem.value.length;
            el.campoMensagem.setSelectionRange(fim, fim);
        }

        return true;
    }

    function aplicarPrePromptDaAcaoRapida(botao) {
        const texto = String(botao?.dataset?.preprompt || "").trim();
        return inserirTextoNoComposer(texto);
    }

    function montarResumoContextoModal() {
        const empresa = String(el.inputClienteInspecao?.value || "").trim();
        const setor = String(el.inputUnidadeInspecao?.value || "").trim();
        const objetivo = String(el.textareaObjetivoInspecao?.value || "").trim();

        if (!empresa && !setor && !objetivo) {
            return "";
        }

        const linhas = ["Contexto inicial da inspeção WF:"];

        if (empresa) linhas.push(`- Empresa/Planta: ${empresa}`);
        if (setor) linhas.push(`- Setor/Linha: ${setor}`);
        if (objetivo) linhas.push(`- Objetivo: ${objetivo}`);

        linhas.push(
            "Com base nesse contexto, estruture checklist técnico, não conformidades, riscos e plano de ação."
        );

        return linhas.join("\n");
    }

    function resetarCamposContextoModal() {
        if (el.inputClienteInspecao) el.inputClienteInspecao.value = "";
        if (el.inputUnidadeInspecao) el.inputUnidadeInspecao.value = "";
        if (el.textareaObjetivoInspecao) el.textareaObjetivoInspecao.value = "";
    }

    function valorNumericoSeguro(valor, fallback = 0) {
        const numero = Number(valor);
        return Number.isFinite(numero) ? numero : fallback;
    }

    function textoItemGate(valor, fallback = "—") {
        if (valor === null || valor === undefined) return fallback;
        const texto = String(valor).trim();
        return texto ? texto : fallback;
    }

    function normalizarItemGateQualidade(item = {}) {
        const status = String(item?.status || "").trim().toLowerCase() === "ok" ? "ok" : "faltante";
        return {
            id: textoItemGate(item?.id, ""),
            categoria: textoItemGate(item?.categoria, "campo_critico"),
            titulo: textoItemGate(item?.titulo, "Item de qualidade"),
            status,
            atual: item?.atual,
            minimo: item?.minimo,
            observacao: textoItemGate(item?.observacao, ""),
        };
    }

    function montarMetaItemGate(item) {
        const atual = textoItemGate(item?.atual);
        const minimo = textoItemGate(item?.minimo);

        if (atual === "—" && minimo === "—") return "";
        if (minimo === "—") return `Atual: ${atual}`;
        return `Atual: ${atual} · Mínimo: ${minimo}`;
    }

    function resumoGateQualidade(payload = {}) {
        const resumo = payload?.resumo && typeof payload.resumo === "object" ? payload.resumo : {};
        const textosCampo = valorNumericoSeguro(resumo?.textos_campo);
        const fotos = valorNumericoSeguro(resumo?.fotos);
        const evidencias = valorNumericoSeguro(resumo?.evidencias);
        const respostasIA = valorNumericoSeguro(resumo?.mensagens_ia);
        const mensagem = String(payload?.mensagem || "").trim();

        const linhaResumo = `Coleta atual: ${textosCampo} texto(s), ${fotos} foto(s), ${evidencias} evidência(s), ${respostasIA} resposta(s) da IA.`;
        return mensagem ? `${mensagem} ${linhaResumo}` : linhaResumo;
    }

    function renderizarListaGateQualidade(container, itens = [], textoVazio = "Nenhum item.") {
        if (!container) return;

        const listaNormalizada = Array.isArray(itens) ? itens.map(normalizarItemGateQualidade) : [];
        if (!listaNormalizada.length) {
            container.innerHTML = `<li class="item-gate-qualidade item-gate-vazio">${escaparHtml(textoVazio)}</li>`;
            return;
        }

        container.innerHTML = listaNormalizada
            .map((item) => {
                const statusOk = item.status === "ok";
                const icone = statusOk ? "check_circle" : "error";
                const statusTexto = statusOk ? "OK" : "Pendente";
                const meta = montarMetaItemGate(item);
                const observacao = String(item.observacao || "").trim();

                return `
                    <li class="item-gate-qualidade ${statusOk ? "item-gate-ok" : "item-gate-faltante"}">
                        <div class="item-gate-cabecalho">
                            <span class="material-symbols-rounded" aria-hidden="true">${icone}</span>
                            <strong>${escaparHtml(item.titulo)}</strong>
                            <span class="pill-gate-status">${statusTexto}</span>
                        </div>
                        ${meta ? `<p class="item-gate-meta">${escaparHtml(meta)}</p>` : ""}
                        ${observacao ? `<p class="item-gate-obs">${escaparHtml(observacao)}</p>` : ""}
                    </li>
                `;
            })
            .join("");
    }

    function abrirModalGateQualidade(payload = {}) {
        if (!el.modalGateQualidade) return;

        const tipoTemplate = normalizarTipoTemplate(payload?.tipo_template || estado.tipoTemplateAtivo);
        const nomeTemplate = String(
            payload?.template_nome ||
            NOMES_TEMPLATES[tipoTemplate] ||
            NOMES_TEMPLATES.padrao
        );

        if (el.tituloTemplateGateQualidade) {
            el.tituloTemplateGateQualidade.textContent = nomeTemplate;
        }
        if (el.textoGateQualidadeResumo) {
            el.textoGateQualidadeResumo.textContent = resumoGateQualidade(payload);
        }

        const faltantes = Array.isArray(payload?.faltantes) ? payload.faltantes : [];
        const checklist = Array.isArray(payload?.itens) ? payload.itens : [];

        renderizarListaGateQualidade(
            el.listaGateFaltantes,
            faltantes,
            "Nenhum item pendente foi informado pelo servidor."
        );
        renderizarListaGateQualidade(
            el.listaGateChecklist,
            checklist,
            "Checklist indisponível neste momento."
        );

        estado.ultimoElementoFocado = document.activeElement;

        el.modalGateQualidade.hidden = false;
        el.modalGateQualidade.classList.add("ativo");
        el.modalGateQualidade.setAttribute("aria-hidden", "false");

        document.body.style.overflow = "hidden";

        window.setTimeout(() => {
            el.btnEntendiGateQualidade?.focus();
        }, 0);
    }

    function fecharModalGateQualidade() {
        if (!el.modalGateQualidade) return;

        el.modalGateQualidade.classList.remove("ativo");
        el.modalGateQualidade.setAttribute("aria-hidden", "true");
        el.modalGateQualidade.hidden = true;

        if (!el.modal?.classList.contains("ativo")) {
            document.body.style.overflow = "";
        }

        estado.ultimoElementoFocado?.focus?.();
    }

    function tratarTrapFocoModalGate(event) {
        if (event.key !== "Tab" || !el.modalGateQualidade?.classList.contains("ativo")) return;

        const focaveis = obterElementosFocaveis(el.modalGateQualidade);
        if (!focaveis.length) return;

        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];

        if (event.shiftKey && document.activeElement === primeiro) {
            event.preventDefault();
            ultimo.focus();
            return;
        }

        if (!event.shiftKey && document.activeElement === ultimo) {
            event.preventDefault();
            primeiro.focus();
        }
    }

    function inserirComandoPendenciasNoChat() {
        const aplicado = inserirTextoNoComposer("/pendencias");
        if (aplicado) {
            mostrarToast("Comando /pendencias inserido no chat.", "info", 1800);
            fecharModalGateQualidade();
        }
    }

    function obterLaudoAtivoIdSeguro() {
        const laudoId = Number(
            window.TarielAPI?.obterLaudoAtualId?.() ||
            window.TarielAPI?.obterLaudoAtualId ||
            0
        );
        return Number.isFinite(laudoId) && laudoId > 0 ? laudoId : null;
    }

    function obterHeadersComCSRF(extra = {}) {
        const base = { Accept: "application/json", ...extra };

        if (window.TarielCore?.comCabecalhoCSRF) {
            return window.TarielCore.comCabecalhoCSRF(base);
        }

        const tokenMeta = document.querySelector('meta[name="csrf-token"]')?.content?.trim() || "";
        return tokenMeta ? { ...base, "X-CSRF-Token": tokenMeta } : base;
    }

    function formatarDataPendencia(dataIso = "", fallback = "") {
        if (!dataIso) return fallback || "";

        const data = new Date(dataIso);
        if (Number.isNaN(data.getTime())) return fallback || dataIso;

        return data.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function obterTextoVazioPendencias(filtro = "abertas") {
        const filtroNormalizado = normalizarFiltroPendencias(filtro);
        if (filtroNormalizado === "resolvidas") {
            return "Nenhuma pendência resolvida neste laudo.";
        }
        if (filtroNormalizado === "todas") {
            return "Nenhuma pendência enviada pela mesa avaliadora neste laudo.";
        }
        return "Nenhuma pendência aberta neste laudo.";
    }

    function atualizarBotoesFiltroPendencias() {
        const filtroAtivo = normalizarFiltroPendencias(estado.filtroPendencias);
        el.botoesFiltroPendencias.forEach((botao) => {
            const filtroBotao = normalizarFiltroPendencias(botao.dataset?.filtroPendencias);
            const ativo = filtroBotao === filtroAtivo;
            botao.classList.toggle("ativo", ativo);
            botao.setAttribute("aria-pressed", String(ativo));
        });

        if (el.textoVazioPendenciasMesa) {
            el.textoVazioPendenciasMesa.textContent = obterTextoVazioPendencias(filtroAtivo);
        }
    }

    function atualizarResumoPendencias(totalExibidas = 0, totalFiltrado = 0) {
        if (!el.resumoPendenciasMesa) return;

        const exibidas = Math.max(0, Number(totalExibidas || 0));
        const filtradas = Math.max(0, Number(totalFiltrado || 0));

        if (filtradas <= 0) {
            el.resumoPendenciasMesa.hidden = true;
            el.resumoPendenciasMesa.textContent = "";
            return;
        }

        el.resumoPendenciasMesa.hidden = false;
        el.resumoPendenciasMesa.textContent = `Exibindo ${exibidas} de ${filtradas} pendências no filtro atual.`;
    }

    function atualizarControlesPaginacaoPendencias() {
        const mostrarMais = !!estado.temMaisPendencias && !!estado.laudoPendenciasAtual;

        if (el.btnCarregarMaisPendencias) {
            el.btnCarregarMaisPendencias.hidden = !mostrarMais;
            el.btnCarregarMaisPendencias.disabled = estado.carregandoPendencias;
            el.btnCarregarMaisPendencias.setAttribute("aria-busy", String(estado.carregandoPendencias));
        }
    }

    function limparPainelPendencias() {
        estado.laudoPendenciasAtual = null;
        estado.qtdPendenciasAbertas = 0;
        estado.filtroPendencias = "abertas";
        estado.paginaPendenciasAtual = 1;
        estado.totalPendenciasFiltradas = 0;
        estado.totalPendenciasExibidas = 0;
        estado.temMaisPendencias = false;

        if (el.btnAbrirPendenciasMesa) {
            el.btnAbrirPendenciasMesa.hidden = true;
            el.btnAbrirPendenciasMesa.setAttribute("aria-expanded", "false");
        }

        if (el.badgePendenciasMesa) {
            el.badgePendenciasMesa.hidden = true;
            el.badgePendenciasMesa.textContent = "0";
        }

        if (el.listaPendenciasMesa) {
            el.listaPendenciasMesa.innerHTML = "";
        }

        if (el.textoVazioPendenciasMesa) {
            el.textoVazioPendenciasMesa.textContent = obterTextoVazioPendencias(estado.filtroPendencias);
            el.textoVazioPendenciasMesa.hidden = true;
        }

        if (el.painelPendenciasMesa) {
            el.painelPendenciasMesa.hidden = true;
        }

        atualizarResumoPendencias(0, 0);
        atualizarControlesPaginacaoPendencias();
        atualizarBotoesFiltroPendencias();
    }

    function atualizarBadgePendencias(abertas = 0) {
        const total = Number(abertas || 0);
        estado.qtdPendenciasAbertas = total > 0 ? total : 0;

        if (!el.badgePendenciasMesa) return;

        if (estado.qtdPendenciasAbertas > 0) {
            el.badgePendenciasMesa.hidden = false;
            el.badgePendenciasMesa.textContent = String(estado.qtdPendenciasAbertas);
            return;
        }

        el.badgePendenciasMesa.hidden = true;
        el.badgePendenciasMesa.textContent = "0";
    }

    function renderizarListaPendencias(pendencias = [], append = false) {
        if (!el.listaPendenciasMesa || !el.textoVazioPendenciasMesa) return;

        if (!append) {
            el.listaPendenciasMesa.innerHTML = "";
        }

        if (!pendencias.length) {
            if (!append) {
                el.textoVazioPendenciasMesa.textContent = obterTextoVazioPendencias(estado.filtroPendencias);
                el.textoVazioPendenciasMesa.hidden = false;
            }
            return;
        }

        el.textoVazioPendenciasMesa.hidden = true;

        pendencias.forEach((item) => {
            const li = document.createElement("li");
            const aberta = !item?.lida;
            const statusTexto = aberta ? "Aberta" : "Lida";
            const statusClasse = aberta ? "aberta" : "lida";
            const dataLabel = String(item?.data_label || "").trim() || formatarDataPendencia(item?.data || "", "");
            const resolvidaPor = String(item?.resolvida_por_nome || "").trim();
            const resolvidaEm = String(item?.resolvida_em_label || "").trim()
                || formatarDataPendencia(item?.resolvida_em || "", "");
            const infoResolucao = !aberta && (resolvidaPor || resolvidaEm)
                ? `Resolvida por ${escaparHtml(resolvidaPor || "mesa")} ${resolvidaEm ? `em ${escaparHtml(resolvidaEm)}` : ""}`.trim()
                : "";
            const proximaLida = aberta ? "true" : "false";
            const textoAcao = aberta ? "Resolver" : "Reabrir";

            li.className = `pendencia-item ${aberta ? "aberta" : "lida"}`;
            li.innerHTML = `
                <p class="pendencia-texto">${escaparHtml(item?.texto || "")}</p>
                <div class="pendencia-meta">
                    <span>#${Number(item?.id || 0) || "-"}</span>
                    <span>${escaparHtml(dataLabel || "")}</span>
                    <span class="pendencia-status ${statusClasse}">${statusTexto}</span>
                    ${infoResolucao ? `<span>${infoResolucao}</span>` : ""}
                </div>
                <div class="pendencia-acoes">
                    <button
                        type="button"
                        class="btn-pendencia-item"
                        data-pendencia-id="${Number(item?.id || 0) || 0}"
                        data-proxima-lida="${proximaLida}"
                    >${textoAcao}</button>
                </div>
            `;
            el.listaPendenciasMesa.appendChild(li);
        });
    }

    function togglePainelPendencias(abrirForcado = null) {
        if (!el.painelPendenciasMesa || !el.btnAbrirPendenciasMesa || el.btnAbrirPendenciasMesa.hidden) {
            return;
        }

        const abrir = abrirForcado === null ? el.painelPendenciasMesa.hidden : !!abrirForcado;
        el.painelPendenciasMesa.hidden = !abrir;
        el.btnAbrirPendenciasMesa.setAttribute("aria-expanded", String(abrir));
    }

    async function carregarPendenciasMesa(opcoes = {}) {
        const {
            laudoId = null,
            silencioso = false,
            filtro = null,
            append = false,
            pagina = null,
        } = opcoes;
        const alvo = Number(laudoId || obterLaudoAtivoIdSeguro() || 0) || null;
        const filtroAplicado = normalizarFiltroPendencias(filtro || estado.filtroPendencias);
        const paginaSolicitada = Number(
            pagina
            || (append ? (estado.paginaPendenciasAtual + 1) : 1)
            || 1
        ) || 1;
        const tamanhoSolicitado = Number(estado.tamanhoPaginaPendencias || 25) || 25;

        if (!alvo) {
            limparPainelPendencias();
            return null;
        }

        if (append && !estado.temMaisPendencias) {
            return null;
        }

        if (estado.carregandoPendencias) return null;
        estado.carregandoPendencias = true;
        atualizarControlesPaginacaoPendencias();

        if (el.btnAbrirPendenciasMesa) {
            el.btnAbrirPendenciasMesa.hidden = false;
        }

        try {
            const endpoint = new URL(`/app/api/laudo/${alvo}/pendencias`, window.location.origin);
            endpoint.searchParams.set("filtro", filtroAplicado);
            endpoint.searchParams.set("pagina", String(paginaSolicitada));
            endpoint.searchParams.set("tamanho", String(tamanhoSolicitado));

            const response = await fetch(endpoint.toString(), {
                method: "GET",
                credentials: "same-origin",
                headers: obterHeadersComCSRF(),
            });

            if (!response.ok) {
                throw new Error(`HTTP_${response.status}`);
            }

            const dados = await response.json();
            estado.laudoPendenciasAtual = alvo;
            estado.filtroPendencias = normalizarFiltroPendencias(dados?.filtro || filtroAplicado);
            estado.paginaPendenciasAtual = Number(dados?.pagina || paginaSolicitada) || 1;
            estado.tamanhoPaginaPendencias = Number(dados?.tamanho || tamanhoSolicitado) || 25;
            estado.totalPendenciasFiltradas = Number(dados?.total_filtrado || 0) || 0;
            estado.temMaisPendencias = !!dados?.tem_mais;
            atualizarBotoesFiltroPendencias();

            atualizarBadgePendencias(dados?.abertas || 0);
            const pendencias = Array.isArray(dados?.pendencias) ? dados.pendencias : [];
            renderizarListaPendencias(pendencias, append);

            if (append) {
                estado.totalPendenciasExibidas += pendencias.length;
            } else {
                estado.totalPendenciasExibidas = pendencias.length;
            }

            atualizarResumoPendencias(estado.totalPendenciasExibidas, estado.totalPendenciasFiltradas);
            atualizarControlesPaginacaoPendencias();

            if (estado.qtdPendenciasAbertas > 0) {
                atualizarStatusMesa("aguardando");
            }

            return dados;
        } catch (erro) {
            if (!silencioso) {
                mostrarToast(
                    append
                        ? "Não foi possível carregar mais pendências."
                        : "Não foi possível carregar as pendências da mesa.",
                    "erro",
                    2500
                );
            }
            return null;
        } finally {
            estado.carregandoPendencias = false;
            atualizarControlesPaginacaoPendencias();
        }
    }

    async function marcarPendenciasComoLidas() {
        const laudoId = Number(estado.laudoPendenciasAtual || obterLaudoAtivoIdSeguro() || 0) || null;
        if (!laudoId || !el.btnMarcarPendenciasLidas) return;

        el.btnMarcarPendenciasLidas.disabled = true;
        el.btnMarcarPendenciasLidas.setAttribute("aria-busy", "true");

        try {
            const response = await fetch(`/app/api/laudo/${laudoId}/pendencias/marcar-lidas`, {
                method: "POST",
                credentials: "same-origin",
                headers: obterHeadersComCSRF(),
            });

            if (!response.ok) {
                throw new Error(`HTTP_${response.status}`);
            }

            await carregarPendenciasMesa({
                laudoId,
                silencioso: true,
                filtro: estado.filtroPendencias,
            });
            mostrarToast("Pendências marcadas como lidas.", "sucesso", 1800);
            atualizarStatusMesa("pronta");
        } catch (_) {
            mostrarToast("Falha ao marcar pendências como lidas.", "erro", 2500);
        } finally {
            el.btnMarcarPendenciasLidas.disabled = false;
            el.btnMarcarPendenciasLidas.setAttribute("aria-busy", "false");
        }
    }

    async function atualizarPendenciaIndividual(mensagemId, lida) {
        const laudoId = Number(estado.laudoPendenciasAtual || obterLaudoAtivoIdSeguro() || 0) || null;
        const msgId = Number(mensagemId || 0) || null;

        if (!laudoId || !msgId) return;

        try {
            const response = await fetch(`/app/api/laudo/${laudoId}/pendencias/${msgId}`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: obterHeadersComCSRF({ "Content-Type": "application/json" }),
                body: JSON.stringify({ lida: !!lida }),
            });

            if (!response.ok) {
                throw new Error(`HTTP_${response.status}`);
            }

            await carregarPendenciasMesa({
                laudoId,
                silencioso: true,
                filtro: estado.filtroPendencias,
            });
            mostrarToast(lida ? "Pendência marcada como resolvida." : "Pendência reaberta.", "sucesso", 1800);

            if (estado.qtdPendenciasAbertas <= 0) {
                atualizarStatusMesa("pronta");
            } else if (lida) {
                atualizarStatusMesa("aguardando");
            }
        } catch (_) {
            mostrarToast("Falha ao atualizar pendência.", "erro", 2500);
        }
    }

    function extrairNomeArquivoContentDisposition(headerValor, fallback = "pendencias.pdf") {
        const valor = String(headerValor || "");
        const matchUtf8 = valor.match(/filename\*=UTF-8''([^;]+)/i);
        if (matchUtf8?.[1]) {
            try {
                return decodeURIComponent(matchUtf8[1]);
            } catch (_) {
                return matchUtf8[1];
            }
        }

        const matchSimples = valor.match(/filename="?([^"]+)"?/i);
        if (matchSimples?.[1]) {
            return matchSimples[1];
        }

        return fallback;
    }

    async function exportarPendenciasPdf() {
        const laudoId = Number(estado.laudoPendenciasAtual || obterLaudoAtivoIdSeguro() || 0) || null;
        if (!laudoId || !el.btnExportarPendenciasPdf) return;

        const filtro = normalizarFiltroPendencias(estado.filtroPendencias);
        const endpoint = new URL(`/app/api/laudo/${laudoId}/pendencias/exportar-pdf`, window.location.origin);
        endpoint.searchParams.set("filtro", filtro);

        el.btnExportarPendenciasPdf.disabled = true;
        el.btnExportarPendenciasPdf.setAttribute("aria-busy", "true");

        try {
            const response = await fetch(endpoint.toString(), {
                method: "GET",
                credentials: "same-origin",
                headers: obterHeadersComCSRF(),
            });

            if (!response.ok) {
                throw new Error(`HTTP_${response.status}`);
            }

            const contentType = String(response.headers.get("content-type") || "").toLowerCase();
            if (!contentType.includes("application/pdf")) {
                throw new Error("INVALID_CONTENT_TYPE");
            }

            const arquivo = await response.blob();
            const nomeArquivo = extrairNomeArquivoContentDisposition(
                response.headers.get("content-disposition"),
                `pendencias_laudo_${laudoId}_${filtro}.pdf`
            );

            const urlTemporaria = URL.createObjectURL(arquivo);
            const link = document.createElement("a");
            link.href = urlTemporaria;
            link.download = nomeArquivo;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(urlTemporaria);

            mostrarToast("PDF de pendências exportado.", "sucesso", 1800);
        } catch (_) {
            mostrarToast("Falha ao exportar PDF de pendências.", "erro", 2500);
        } finally {
            el.btnExportarPendenciasPdf.disabled = false;
            el.btnExportarPendenciasPdf.setAttribute("aria-busy", "false");
        }
    }

    // =========================================================
    // MODAL DE NOVA INSPEÇÃO
    // =========================================================

    function abrirModalNovaInspecao() {
        if (!el.modal) return;

        estado.ultimoElementoFocado = document.activeElement;

        el.modal.hidden = false;
        el.modal.classList.add("ativo");
        el.modal.setAttribute("aria-hidden", "false");
        el.btnAbrirModal?.setAttribute("aria-expanded", "true");

        document.body.style.overflow = "hidden";

        window.setTimeout(() => {
            el.selectTemplate?.focus();
        }, 0);
    }

    function fecharModalNovaInspecao() {
        if (!el.modal) return;

        el.modal.classList.remove("ativo");
        el.modal.setAttribute("aria-hidden", "true");
        el.modal.hidden = true;
        el.btnAbrirModal?.setAttribute("aria-expanded", "false");

        document.body.style.overflow = "";
        estado.ultimoElementoFocado?.focus?.();
    }

    function tratarTrapFocoModal(event) {
        if (event.key !== "Tab" || !el.modal?.classList.contains("ativo")) return;

        const focaveis = obterElementosFocaveis(el.modal);
        if (!focaveis.length) return;

        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];

        if (event.shiftKey && document.activeElement === primeiro) {
            event.preventDefault();
            ultimo.focus();
            return;
        }

        if (!event.shiftKey && document.activeElement === ultimo) {
            event.preventDefault();
            primeiro.focus();
        }
    }

    // =========================================================
    // ESTADO VISUAL DA INSPEÇÃO
    // =========================================================

    function atualizarNomeTemplateAtivo(tipo) {
        const tipoNormalizado = normalizarTipoTemplate(tipo);

        estado.tipoTemplateAtivo = tipoNormalizado;
        window.tipoTemplateAtivo = tipoNormalizado;

        if (el.nomeTemplateAtivo) {
            el.nomeTemplateAtivo.textContent =
                NOMES_TEMPLATES[tipoNormalizado] || NOMES_TEMPLATES.padrao;
        }
    }

    function exibirInterfaceInspecaoAtiva(tipo) {
        atualizarNomeTemplateAtivo(tipo);
        el.telaBoasVindas?.setAttribute("hidden", "");
        el.barraStatusInspecao?.removeAttribute("hidden");
        if (estado.statusMesa !== "offline") {
            atualizarStatusMesa("pronta");
        }
    }

    function resetarInterfaceInspecao() {
        el.barraStatusInspecao?.setAttribute("hidden", "");
        el.telaBoasVindas?.removeAttribute("hidden");
        atualizarStatusMesa("pronta");
        limparPainelPendencias();
    }

    async function iniciarInspecao(tipo) {
        if (estado.iniciandoInspecao) return null;

        const tipoNormalizado = normalizarTipoTemplate(tipo);

        if (!window.TarielAPI?.iniciarRelatorio) {
            mostrarToast("A API do chat ainda não está pronta.", "erro", 3000);
            return null;
        }

        estado.iniciandoInspecao = true;
        definirBotaoIniciarCarregando(true);

        try {
            const resposta = await window.TarielAPI.iniciarRelatorio(tipoNormalizado);

            if (!resposta) {
                return null;
            }

            exibirInterfaceInspecaoAtiva(tipoNormalizado);
            fecharModalNovaInspecao();
            resetarCamposContextoModal();
            return resposta;
        } finally {
            estado.iniciandoInspecao = false;
            definirBotaoIniciarCarregando(false);
        }
    }

    async function finalizarInspecao() {
        if (estado.finalizandoInspecao) return null;

        const confirmou = window.confirm(
            "Deseja encerrar a coleta? O laudo será gerado e enviado para a mesa avaliadora."
        );

        if (!confirmou) return null;

        estado.finalizandoInspecao = true;
        definirBotaoFinalizarCarregando(true);

        try {
            if (typeof window.finalizarInspecaoCompleta === "function") {
                return await window.finalizarInspecaoCompleta();
            }

            if (window.TarielAPI?.finalizarRelatorio) {
                return await window.TarielAPI.finalizarRelatorio();
            }

            mostrarToast("A finalização do relatório não está disponível.", "erro", 3000);
            return null;
        } finally {
            estado.finalizandoInspecao = false;
            definirBotaoFinalizarCarregando(false);
        }
    }

    // =========================================================
    // HIGHLIGHT / ESTADO VISUAL DO COMPOSER
    // =========================================================

    function obterModoMarcador(texto = "") {
        const valor = String(texto || "").trimStart();

        if (/^@insp\b/i.test(valor)) return "insp";
        if (/^eng\b/i.test(valor) || /^@eng\b/i.test(valor)) return "eng";

        return "";
    }

    function atualizarVisualComposer(texto = "") {
        const modo = obterModoMarcador(texto);

        el.campoMensagem?.classList.toggle("modo-humano-ativo", modo === "insp");
        el.campoMensagem?.classList.toggle("modo-eng-ativo", modo === "eng");

        el.pilulaEntrada?.classList.toggle("estado-insp", modo === "insp");
        el.pilulaEntrada?.classList.toggle("estado-eng", modo === "eng");

        atualizarStatusMesaPorComposer(modo);
    }

    function aplicarHighlightComposer(texto = "") {
        if (!el.backdropHighlight) {
            atualizarVisualComposer(texto);
            return;
        }

        const seguro = escaparHtml(texto);

        el.backdropHighlight.innerHTML = seguro
            .replace(/@insp\b/gi, '<span class="highlight-tag-insp">$&</span>')
            .replace(/(^|\s)(@?eng)\b/gi, (_, espaco, tag) => {
                return `${espaco}<span class="highlight-tag-eng">${tag}</span>`;
            });

        atualizarVisualComposer(texto);
    }

    function sincronizarScrollBackdrop() {
        if (!el.backdropHighlight || !el.campoMensagem) return;

        el.backdropHighlight.scrollTop = el.campoMensagem.scrollTop;
        el.backdropHighlight.scrollLeft = el.campoMensagem.scrollLeft;
    }

    // =========================================================
    // BANNER TEMPORÁRIO DA ENGENHARIA
    // =========================================================

    function mostrarBannerEngenharia(texto = "") {
        if (!el.bannerEngenharia || !el.textoBannerEngenharia) return;

        limparTimerBanner();

        const textoLimpo = String(texto || "").trim() || "Nova mensagem recebida...";
        el.textoBannerEngenharia.textContent =
            textoLimpo.length > 60 ? `${textoLimpo.slice(0, 60)}…` : textoLimpo;
        atualizarStatusMesa("respondeu", textoLimpo);

        el.bannerEngenharia.hidden = false;

        requestAnimationFrame(() => {
            el.bannerEngenharia.classList.add("mostrar");
        });

        estado.timerBanner = window.setTimeout(() => {
            fecharBannerEngenharia();
        }, TEMPO_BANNER_MS);
    }

    function fecharBannerEngenharia() {
        if (!el.bannerEngenharia) return;

        el.bannerEngenharia.classList.remove("mostrar");
        limparTimerBanner();

        window.setTimeout(() => {
            if (el.bannerEngenharia) {
                el.bannerEngenharia.hidden = true;
            }
        }, 350);
    }

    // =========================================================
    // SSE DE NOTIFICAÇÕES
    // =========================================================

    function eventoEhMensagemEngenharia(dados) {
        return Boolean(
            dados?.texto &&
            (
                dados.tipo === "nova_mensagem_eng" ||
                dados.tipo === "mensagem_eng" ||
                dados.tipo === "whisper_eng"
            )
        );
    }

    function inicializarNotificacoesSSE() {
        if (!("EventSource" in window)) {
            atualizarConexaoMesaWidget("offline", "Navegador sem suporte a SSE");
            return;
        }

        fecharSSE();
        atualizarConexaoMesaWidget(
            estado.tentativasReconexaoSSE > 0 ? "reconectando" : "conectado"
        );

        estado.fonteSSE = new EventSource(ROTA_SSE_NOTIFICACOES);

        estado.fonteSSE.onopen = () => {
            estado.tentativasReconexaoSSE = 0;
            atualizarConexaoMesaWidget("conectado");
            if (estado.statusMesa === "offline") {
                atualizarStatusMesa("pronta");
            }
        };

        estado.fonteSSE.onmessage = (event) => {
            try {
                const dados = JSON.parse(event.data);

                if (eventoEhMensagemEngenharia(dados)) {
                    mostrarBannerEngenharia(dados.texto);
                    const laudoIdEvento = Number(dados?.laudo_id ?? dados?.laudoId ?? 0) || null;
                    carregarPendenciasMesa({ laudoId: laudoIdEvento, silencioso: true }).catch(() => {});
                    atualizarChatAoVivoComMesa(dados).catch(() => {});
                    if (!estado.mesaWidgetAberto) {
                        estado.mesaWidgetNaoLidas += 1;
                        atualizarBadgeMesaWidget();
                    }
                    return;
                }

                if (dados?.tipo === "conectado") {
                    estado.tentativasReconexaoSSE = 0;
                    atualizarConexaoMesaWidget("conectado");
                    if (estado.statusMesa === "offline") {
                        atualizarStatusMesa("pronta");
                    }
                }
            } catch (erro) {
                console.error("[TARIEL][CHAT_INDEX_PAGE] Falha ao decodificar SSE:", erro);
            }
        };

        estado.fonteSSE.onerror = () => {
            fecharSSE();
            limparTimerReconexaoSSE();

            estado.tentativasReconexaoSSE += 1;
            const excedeuLimite = estado.tentativasReconexaoSSE > LIMITE_RECONEXAO_SSE_OFFLINE;

            if (excedeuLimite) {
                atualizarConexaoMesaWidget("offline");
                atualizarStatusMesa("offline");
            } else {
                atualizarConexaoMesaWidget("reconectando");
            }

            if (document.visibilityState === "hidden") {
                return;
            }

            estado.timerReconexaoSSE = window.setTimeout(() => {
                inicializarNotificacoesSSE();
            }, TEMPO_RECONEXAO_SSE_MS);
        };
    }

    // =========================================================
    // EVENTOS DA INTERFACE
    // =========================================================

    function bindEventosModal() {
        el.btnAbrirModal?.addEventListener("click", abrirModalNovaInspecao);
        el.btnFecharModal?.addEventListener("click", fecharModalNovaInspecao);
        el.btnFecharModalGateQualidade?.addEventListener("click", fecharModalGateQualidade);
        el.btnEntendiGateQualidade?.addEventListener("click", fecharModalGateQualidade);
        el.btnPreencherGateQualidade?.addEventListener("click", inserirComandoPendenciasNoChat);

        el.btnConfirmarInspecao?.addEventListener("click", async () => {
            const tipo = el.selectTemplate?.value || "padrao";
            const resposta = await iniciarInspecao(tipo);
            if (!resposta) return;

            const contexto = montarResumoContextoModal();
            if (contexto && inserirTextoNoComposer(contexto)) {
                mostrarToast("Contexto da inspeção pronto no campo de mensagem.", "info", 2200);
            }
        });

        el.modal?.addEventListener("click", (event) => {
            if (event.target === el.modal) {
                fecharModalNovaInspecao();
            }
        });
        el.modalGateQualidade?.addEventListener("click", (event) => {
            if (event.target === el.modalGateQualidade) {
                fecharModalGateQualidade();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;
            if (el.modalGateQualidade?.classList.contains("ativo")) {
                fecharModalGateQualidade();
                return;
            }
            if (el.modal?.classList.contains("ativo")) {
                fecharModalNovaInspecao();
            }
        });

        el.modal?.addEventListener("keydown", tratarTrapFocoModal);
        el.modalGateQualidade?.addEventListener("keydown", tratarTrapFocoModalGate);
    }

    function bindEventosPagina() {
        el.btnFinalizarInspecao?.addEventListener("click", finalizarInspecao);
        el.btnFecharBanner?.addEventListener("click", fecharBannerEngenharia);
        el.btnAbrirPendenciasMesa?.addEventListener("click", async () => {
            const abrir = !!el.painelPendenciasMesa?.hidden;
            togglePainelPendencias(abrir);
            if (abrir) {
                await carregarPendenciasMesa({
                    silencioso: true,
                    filtro: estado.filtroPendencias,
                });
            }
        });
        el.btnFecharPendenciasMesa?.addEventListener("click", () => {
            togglePainelPendencias(false);
        });
        el.btnExportarPendenciasPdf?.addEventListener("click", exportarPendenciasPdf);
        el.btnCarregarMaisPendencias?.addEventListener("click", async () => {
            await carregarPendenciasMesa({
                silencioso: false,
                filtro: estado.filtroPendencias,
                append: true,
            });
        });
        el.btnMarcarPendenciasLidas?.addEventListener("click", marcarPendenciasComoLidas);
        el.botoesFiltroPendencias.forEach((botao) => {
            botao.addEventListener("click", async () => {
                const filtro = normalizarFiltroPendencias(botao.dataset?.filtroPendencias);
                if (filtro === estado.filtroPendencias) return;

                estado.filtroPendencias = filtro;
                atualizarBotoesFiltroPendencias();
                await carregarPendenciasMesa({
                    silencioso: true,
                    filtro: estado.filtroPendencias,
                });
            });
        });
        el.listaPendenciasMesa?.addEventListener("click", async (event) => {
            const alvo = event.target?.closest?.(".btn-pendencia-item");
            if (!alvo) return;

            const mensagemId = Number(alvo.dataset?.pendenciaId || 0) || null;
            const proximaLida = String(alvo.dataset?.proximaLida || "").toLowerCase() === "true";
            if (!mensagemId) return;

            await atualizarPendenciaIndividual(mensagemId, proximaLida);
        });

        el.campoMensagem?.addEventListener("input", () => {
            aplicarHighlightComposer(el.campoMensagem.value);
            sincronizarScrollBackdrop();
        });

        el.campoMensagem?.addEventListener("scroll", sincronizarScrollBackdrop);

        el.botoesAcoesRapidas.forEach((botao) => {
            botao.addEventListener("click", async () => {
                const tipo = botao.dataset.tipo;
                if (!tipo) return;

                const prePromptAplicado = aplicarPrePromptDaAcaoRapida(botao);
                const estadoRelatorio = obterEstadoRelatorioAtualSeguro();

                if (estadoRelatorio !== "relatorio_ativo") {
                    await iniciarInspecao(tipo);
                }

                if (prePromptAplicado) {
                    mostrarToast("Pré-prompt aplicado no campo de mensagem.", "sucesso", 1800);
                }
            });
        });

        el.btnMesaWidgetToggle?.addEventListener("click", () => {
            toggleMesaWidget();
        });
        el.btnFecharMesaWidget?.addEventListener("click", () => {
            fecharMesaWidget();
        });
        el.btnToggleHumano?.addEventListener("click", () => {
            abrirMesaWidget();
        });
        el.mesaWidgetRefLimpar?.addEventListener("click", () => {
            limparReferenciaMesaWidget();
        });
        el.mesaWidgetCarregarMais?.addEventListener("click", async () => {
            await carregarMensagensMesaWidget({ append: true, silencioso: true });
        });
        el.mesaWidgetEnviar?.addEventListener("click", () => {
            enviarMensagemMesaWidget();
        });
        el.mesaWidgetInput?.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                enviarMensagemMesaWidget();
            }
        });
        el.mesaWidgetLista?.addEventListener("click", async (event) => {
            const botaoResponder = event.target?.closest?.("[data-responder-mensagem-id]");
            if (botaoResponder) {
                const mensagemId = Number(botaoResponder.dataset.responderMensagemId || 0) || null;
                if (!mensagemId) return;
                const msg = obterMensagemMesaPorId(mensagemId);
                if (msg) {
                    definirReferenciaMesaWidget(msg);
                }
                return;
            }

            const botaoRef = event.target?.closest?.("[data-ir-mensagem-id]");
            if (botaoRef) {
                const referenciaId = Number(botaoRef.dataset.irMensagemId || 0) || null;
                if (referenciaId) {
                    await irParaMensagemPrincipal(referenciaId);
                }
            }
        });

        document.addEventListener("click", async (event) => {
            const alvoReferencia = event.target?.closest?.(".bloco-referencia-chat[data-ref-id]");
            if (!alvoReferencia) return;
            const referenciaId = Number(alvoReferencia.dataset.refId || 0) || null;
            if (referenciaId) {
                await irParaMensagemPrincipal(referenciaId);
            }
        });
    }

    function bindEventosSistema() {
        const onRelatorioIniciado = (event) => {
            const laudoId = Number(event?.detail?.laudoId ?? event?.detail?.laudo_id ?? 0) || null;
            exibirInterfaceInspecaoAtiva(
                obterTipoTemplateDoPayload(event?.detail || {})
            );
            carregarPendenciasMesa({ laudoId, silencioso: true }).catch(() => {});
            estado.mesaWidgetMensagens = [];
            estado.mesaWidgetCursor = null;
            estado.mesaWidgetTemMais = false;
            estado.mesaWidgetNaoLidas = 0;
            atualizarBadgeMesaWidget();
            if (estado.mesaWidgetAberto) {
                carregarMensagensMesaWidget({ silencioso: true }).catch(() => {});
            }
        };

        const onRelatorioFinalizadoOuCancelado = () => {
            fecharModalGateQualidade();
            resetarInterfaceInspecao();
            estado.mesaWidgetMensagens = [];
            estado.mesaWidgetCursor = null;
            estado.mesaWidgetTemMais = false;
            estado.mesaWidgetNaoLidas = 0;
            atualizarBadgeMesaWidget();
            limparReferenciaMesaWidget();
            fecharMesaWidget();
        };

        const onMesaAtivada = () => {
            if (estado.statusMesa !== "aguardando" && estado.statusMesa !== "respondeu") {
                atualizarStatusMesa("canal_ativo");
            }
        };

        const onMesaStatus = (event) => {
            const status = normalizarStatusMesa(event?.detail?.status);
            const preview = String(event?.detail?.preview || "").trim();
            atualizarStatusMesa(status, preview);

            if (status === "respondeu" || status === "aguardando") {
                carregarPendenciasMesa({ silencioso: true }).catch(() => {});
                if (estado.mesaWidgetAberto) {
                    carregarMensagensMesaWidget({ silencioso: true }).catch(() => {});
                }
            }
        };

        const onLaudoSelecionado = (event) => {
            const laudoId = Number(event?.detail?.laudoId ?? event?.detail?.laudo_id ?? 0) || null;
            if (!laudoId) return;
            carregarPendenciasMesa({ laudoId, silencioso: true }).catch(() => {});
            estado.mesaWidgetMensagens = [];
            estado.mesaWidgetCursor = null;
            estado.mesaWidgetTemMais = false;
            estado.mesaWidgetNaoLidas = 0;
            atualizarBadgeMesaWidget();
            if (estado.mesaWidgetAberto) {
                carregarMensagensMesaWidget({ silencioso: true }).catch(() => {});
            }
        };

        const onGateQualidadeFalhou = (event) => {
            abrirModalGateQualidade(event?.detail || {});
        };

        document.addEventListener("tariel:relatorio-iniciado", onRelatorioIniciado);
        document.addEventListener("tariel:relatorio-finalizado", onRelatorioFinalizadoOuCancelado);
        document.addEventListener("tariel:cancelar-relatorio", onRelatorioFinalizadoOuCancelado);

        document.addEventListener("tarielrelatorio-iniciado", onRelatorioIniciado);
        document.addEventListener("tarielrelatorio-finalizado", onRelatorioFinalizadoOuCancelado);
        document.addEventListener("tarielrelatorio-cancelado", onRelatorioFinalizadoOuCancelado);

        document.addEventListener("tariel:mesa-avaliadora-ativada", onMesaAtivada);
        document.addEventListener("tarielmesa-avaliadora-ativada", onMesaAtivada);
        document.addEventListener("tariel:mesa-status", onMesaStatus);
        document.addEventListener("tarielmesa-status", onMesaStatus);
        document.addEventListener("tariel:laudo-selecionado", onLaudoSelecionado);
        document.addEventListener("tariel:gate-qualidade-falhou", onGateQualidadeFalhou);
        document.addEventListener("tarielgate-qualidade-falhou", onGateQualidadeFalhou);

        window.addEventListener("pagehide", () => {
            fecharSSE();
            limparTimerReconexaoSSE();
            limparTimerFecharMesaWidget();
            limparTimerBanner();
            atualizarConexaoMesaWidget("offline");
        });

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && !estado.fonteSSE) {
                limparTimerReconexaoSSE();
                inicializarNotificacoesSSE();
            }
        });
    }

    // =========================================================
    // BOOT
    // =========================================================

    async function boot() {
        bindEventosModal();
        bindEventosPagina();
        bindEventosSistema();

        atualizarStatusMesa("pronta");
        atualizarBotoesFiltroPendencias();
        atualizarBadgeMesaWidget();
        atualizarConexaoMesaWidget("conectado");
        aplicarHighlightComposer(el.campoMensagem?.value || "");
        atualizarVisualComposer(el.campoMensagem?.value || "");
        sincronizarScrollBackdrop();
        inicializarNotificacoesSSE();

        try {
            const dados = await window.TarielAPI?.sincronizarEstadoRelatorio?.();
            const estadoRelatorio = normalizarEstadoRelatorio(dados?.estado);

            if (estadoRelatorio === "relatorio_ativo") {
                exibirInterfaceInspecaoAtiva(obterTipoTemplateDoPayload(dados));
                const laudoId = Number(dados?.laudo_id ?? dados?.laudoId ?? 0) || null;
                await carregarPendenciasMesa({ laudoId, silencioso: true });
                if (estado.mesaWidgetAberto) {
                    await carregarMensagensMesaWidget({ silencioso: true });
                }
                return;
            }

            if (estadoRelatorio === "sem_relatorio") {
                resetarInterfaceInspecao();
            }
        } catch (_) {
            // silêncio intencional: a página continua funcional
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
