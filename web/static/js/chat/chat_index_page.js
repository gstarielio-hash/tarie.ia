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
            texto: "Canal da mesa ativo",
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
        pendencia_aberta: {
            classe: "status-pendencia",
            icone: "assignment_late",
            texto: "Pendência aberta",
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
    const MAX_BYTES_ANEXO_MESA = 12 * 1024 * 1024;
    const MENSAGEM_MESA_EXIGE_INSPECAO =
        "A conversa com a mesa avaliadora só é permitida após iniciar uma nova inspeção.";
    const MIME_ANEXOS_MESA_PERMITIDOS = new Set([
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);

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
        mesaWidgetAnexoPendente: null,
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
        selectTemplateCustom: document.getElementById("select-template-custom"),
        btnSelectTemplateCustom: document.getElementById("btn-select-template-custom"),
        valorSelectTemplateCustom: document.getElementById("valor-select-template-custom"),
        painelSelectTemplateCustom: document.getElementById("painel-select-template-custom"),
        listaSelectTemplateCustom: document.getElementById("lista-select-template-custom"),
        inputClienteInspecao: document.getElementById("input-cliente-inspecao"),
        inputUnidadeInspecao: document.getElementById("input-unidade-inspecao"),
        textareaObjetivoInspecao: document.getElementById("textarea-objetivo-inspecao"),
        modalGateQualidade: document.getElementById("modal-gate-qualidade"),
        btnFecharModalGateQualidade: document.getElementById("btn-fechar-modal-gate-qualidade"),
        btnEntendiGateQualidade: document.getElementById("btn-entendi-gate-qualidade"),
        btnPreencherGateQualidade: document.getElementById("btn-gate-preencher-no-chat"),
        tituloTemplateGateQualidade: document.getElementById("titulo-gate-template"),
        textoGateQualidadeResumo: document.getElementById("texto-gate-qualidade-resumo"),
        blocoGateRoteiroTemplate: document.getElementById("bloco-gate-roteiro-template"),
        tituloGateRoteiroTemplate: document.getElementById("titulo-gate-roteiro-template"),
        textoGateRoteiroTemplate: document.getElementById("texto-gate-roteiro-template"),
        listaGateRoteiroTemplate: document.getElementById("lista-gate-roteiro-template"),
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
        mesaWidgetResumo: document.getElementById("mesa-widget-resumo"),
        mesaWidgetResumoTitulo: document.getElementById("mesa-widget-resumo-titulo"),
        mesaWidgetResumoTexto: document.getElementById("mesa-widget-resumo-texto"),
        mesaWidgetChipStatus: document.getElementById("mesa-widget-chip-status"),
        mesaWidgetChipPendencias: document.getElementById("mesa-widget-chip-pendencias"),
        mesaWidgetChipNaoLidas: document.getElementById("mesa-widget-chip-nao-lidas"),
        mesaWidgetLista: document.getElementById("mesa-widget-lista"),
        mesaWidgetPreviewAnexo: document.getElementById("mesa-widget-preview-anexo"),
        mesaWidgetInput: document.getElementById("mesa-widget-input"),
        mesaWidgetBtnAnexo: document.getElementById("mesa-widget-btn-anexo"),
        mesaWidgetInputAnexo: document.getElementById("mesa-widget-input-anexo"),
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

        if (estadoBruto === "ajustes" || estadoBruto === "aprovado") {
            return estadoBruto;
        }

        return estadoBruto || "sem_relatorio";
    }

    function estadoRelatorioPossuiContexto(valor) {
        return normalizarEstadoRelatorio(valor) !== "sem_relatorio";
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

    function formatarTamanhoBytes(totalBytes) {
        const valor = Number(totalBytes || 0);
        if (!Number.isFinite(valor) || valor <= 0) return "0 KB";
        if (valor >= 1024 * 1024) {
            return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
        }
        return `${Math.max(1, Math.round(valor / 1024))} KB`;
    }

    function normalizarAnexoMesa(payload = {}) {
        const id = Number(payload?.id || 0) || null;
        const nome = String(payload?.nome || "").trim();
        const mimeType = String(payload?.mime_type || "").trim().toLowerCase();
        const categoria = String(payload?.categoria || "").trim().toLowerCase();
        const url = String(payload?.url || "").trim();
        if (!id || !nome || !url) return null;
        return {
            id,
            nome,
            mime_type: mimeType,
            categoria,
            url,
            tamanho_bytes: Number(payload?.tamanho_bytes || 0) || 0,
            eh_imagem: !!payload?.eh_imagem,
        };
    }

    function renderizarLinksAnexosMesa(anexos = []) {
        const itens = Array.isArray(anexos) ? anexos.filter(Boolean) : [];
        if (!itens.length) return "";

        return `
            <div class="mesa-widget-anexos">
                ${itens.map((anexo) => `
                    <a
                        class="anexo-mesa-link ${anexo?.eh_imagem ? "imagem" : "documento"}"
                        href="${escaparHtml(anexo?.url || "#")}"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <span class="material-symbols-rounded" aria-hidden="true">${anexo?.eh_imagem ? "image" : "description"}</span>
                        <span class="anexo-mesa-link-texto">
                            <strong>${escaparHtml(anexo?.nome || "anexo")}</strong>
                            <small>${escaparHtml(formatarTamanhoBytes(anexo?.tamanho_bytes || 0))}</small>
                        </span>
                    </a>
                `).join("")}
            </div>
        `;
    }

    function limparAnexoMesaWidget() {
        estado.mesaWidgetAnexoPendente = null;
        if (el.mesaWidgetInputAnexo) {
            el.mesaWidgetInputAnexo.value = "";
        }
        if (el.mesaWidgetPreviewAnexo) {
            el.mesaWidgetPreviewAnexo.hidden = true;
            el.mesaWidgetPreviewAnexo.innerHTML = "";
        }
    }

    function renderizarPreviewAnexoMesaWidget() {
        if (!el.mesaWidgetPreviewAnexo) return;

        const anexo = estado.mesaWidgetAnexoPendente;
        if (!anexo?.arquivo) {
            el.mesaWidgetPreviewAnexo.hidden = true;
            el.mesaWidgetPreviewAnexo.innerHTML = "";
            return;
        }

        el.mesaWidgetPreviewAnexo.hidden = false;
        el.mesaWidgetPreviewAnexo.innerHTML = `
            <div class="mesa-widget-preview-item">
                <span class="material-symbols-rounded" aria-hidden="true">${anexo.ehImagem ? "image" : "description"}</span>
                <div class="mesa-widget-preview-item-texto">
                    <strong>${escaparHtml(anexo.nome)}</strong>
                    <small>${escaparHtml(formatarTamanhoBytes(anexo.tamanho))}</small>
                </div>
                <button type="button" class="mesa-widget-preview-remover" aria-label="Remover anexo da mesa">×</button>
            </div>
        `;
    }

    function selecionarAnexoMesaWidget(arquivo) {
        if (!arquivo) return;

        const mime = String(arquivo.type || "").trim().toLowerCase();
        if (!MIME_ANEXOS_MESA_PERMITIDOS.has(mime)) {
            mostrarToast("Use PNG, JPG, WebP, PDF ou DOCX no chat da mesa.", "aviso", 2400);
            return;
        }

        if (arquivo.size > MAX_BYTES_ANEXO_MESA) {
            mostrarToast("O anexo da mesa deve ter no máximo 12MB.", "aviso", 2400);
            return;
        }

        estado.mesaWidgetAnexoPendente = {
            arquivo,
            nome: String(arquivo.name || "anexo"),
            tamanho: Number(arquivo.size || 0) || 0,
            mime_type: mime,
            ehImagem: mime.startsWith("image/"),
        };
        renderizarPreviewAnexoMesaWidget();
    }

    function obterElementosFocaveis(container) {
        if (!container) return [];

        return Array.from(
            container.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
        ).filter((node) =>
            !node.disabled &&
            !node.hidden &&
            !node.classList?.contains("select-proxy-ativo") &&
            node.getClientRects().length > 0
        );
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
        if (status === "pendencia" || status === "pendencia_aberta") return "pendencia_aberta";

        return CONFIG_STATUS_MESA[status] ? status : "pronta";
    }

    function obterLaudoAtivo() {
        return Number(window.TarielAPI?.obterLaudoAtualId?.() || 0) || null;
    }

    function avisarMesaExigeInspecao() {
        mostrarToast(MENSAGEM_MESA_EXIGE_INSPECAO, "aviso", 3200);
    }

    function emitirSincronizacaoLaudo(payload = {}, { selecionar = false } = {}) {
        if (payload?.laudo_card?.id) {
            document.dispatchEvent(new CustomEvent("tariel:laudo-card-sincronizado", {
                detail: {
                    card: payload.laudo_card,
                    selecionar,
                },
                bubbles: true,
            }));
        }

        if (!payload?.estado) return;

        document.dispatchEvent(new CustomEvent("tariel:estado-relatorio", {
            detail: {
                estado: payload.estado,
                laudo_id: payload.laudo_id ?? payload.laudoId ?? payload?.laudo_card?.id ?? null,
                permite_reabrir: !!payload.permite_reabrir,
                permite_edicao: !!payload.permite_edicao,
                status_card: payload.status_card || payload?.laudo_card?.status_card || "",
            },
            bubbles: true,
        }));
    }

    function obterTokenCsrf() {
        return document.querySelector('meta[name="csrf-token"]')?.content || "";
    }

    function limparEstadoHomeNoCliente() {
        try {
            localStorage.removeItem("tariel_laudo_atual");
        } catch (_) {
            // silêncio intencional
        }

        try {
            const url = new URL(window.location.href);
            url.searchParams.delete("laudo");
            history.replaceState({ laudoId: null }, "", url.toString());
        } catch (_) {
            // silêncio intencional
        }

        document.body.dataset.laudoAtualId = "";
    }

    async function desativarContextoAtivoParaHome() {
        const laudoAtivo = obterLaudoAtivo();
        const estadoAtual = obterEstadoRelatorioAtualSeguro();

        if (!laudoAtivo && estadoAtual !== "relatorio_ativo") {
            return true;
        }

        try {
            const resposta = await fetch("/app/api/laudo/desativar", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json",
                    "X-CSRF-Token": obterTokenCsrf(),
                    "X-Requested-With": "XMLHttpRequest",
                },
            });

            return resposta.ok;
        } catch (_) {
            return false;
        }
    }

    function marcarForcaTelaInicial() {
        try {
            sessionStorage.setItem("tariel_force_home_landing", "1");
        } catch (_) {
            // silêncio intencional
        }
    }

    function homeForcadoAtivo() {
        return document.body.dataset.forceHomeLanding === "true";
    }

    async function navegarParaHome(destino = "/app/", { preservarContexto = true } = {}) {
        const homeDestino = String(destino || "/app/").trim() || "/app/";
        let desativou = true;

        if (!preservarContexto) {
            desativou = await desativarContextoAtivoParaHome();
        }

        if (!desativou && !preservarContexto) {
            mostrarToast(
                "Não foi possível limpar o contexto ativo. Recarregando a central.",
                "aviso",
                2400
            );
        }

        limparEstadoHomeNoCliente();
        if (preservarContexto) {
            marcarForcaTelaInicial();
        }
        window.location.assign(homeDestino);
    }

    async function processarCliqueHomeCabecalho() {
        navegarParaHome("/app/?home=1", { preservarContexto: true });
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

    function pluralizarMesa(total, singular, plural) {
        return Number(total || 0) === 1 ? singular : (plural || `${singular}s`);
    }

    function obterUltimaMensagemMesaOperacional() {
        const mensagens = Array.isArray(estado.mesaWidgetMensagens) ? estado.mesaWidgetMensagens : [];
        return mensagens.length ? mensagens[mensagens.length - 1] : null;
    }

    function resumirMensagemOperacionalMesa(mensagem) {
        if (!mensagem || typeof mensagem !== "object") return "";
        const texto = String(
            mensagem?.texto ||
            mensagem?.anexos?.[0]?.nome ||
            ""
        ).trim();
        return texto ? resumirTexto(texto, 92) : "";
    }

    function obterResumoOperacionalMesa() {
        const conexao = normalizarConexaoMesaWidget(estado.mesaWidgetConexao);
        const pendenciasAbertas = Number(estado.qtdPendenciasAbertas || 0) || 0;
        const naoLidas = Number(estado.mesaWidgetNaoLidas || 0) || 0;
        const widgetAberto = !!estado.mesaWidgetAberto;
        const ultimaMensagem = obterUltimaMensagemMesaOperacional();
        const ultimaMensagemEhMesa = ultimaMensagem?.tipo === "humano_eng";
        const ultimaMensagemEhCampo = ultimaMensagem?.tipo === "humano_insp";
        const ultimaMensagemResumo = resumirMensagemOperacionalMesa(ultimaMensagem);
        const ultimaMensagemData = String(ultimaMensagem?.data || "").trim();
        const sufixoData = ultimaMensagemData ? ` Última interação: ${ultimaMensagemData}.` : "";

        if (conexao === "offline") {
            return {
                status: "offline",
                titulo: "Mesa indisponível no momento",
                descricao: "O canal da mesa perdeu conexão. Aguarde a reconexão para retomar o fluxo.",
                chipStatus: "Offline",
                chipPendencias: pendenciasAbertas > 0 ? `${pendenciasAbertas} ${pluralizarMesa(pendenciasAbertas, "pendência aberta")}` : "",
                chipNaoLidas: naoLidas > 0 ? `${naoLidas} ${pluralizarMesa(naoLidas, "retorno novo", "retornos novos")}` : "",
            };
        }

        if (pendenciasAbertas > 0) {
            return {
                status: "pendencia_aberta",
                titulo: `${pendenciasAbertas} ${pluralizarMesa(pendenciasAbertas, "pendência aberta")} da mesa`,
                descricao: ultimaMensagemResumo
                    ? `Última solicitação: ${ultimaMensagemResumo}.${sufixoData}`
                    : `Há item(ns) da mesa aguardando retorno do campo.${sufixoData}`,
                chipStatus: "Pendência aberta",
                chipPendencias: `${pendenciasAbertas} ${pluralizarMesa(pendenciasAbertas, "pendência aberta")}`,
                chipNaoLidas: naoLidas > 0 ? `${naoLidas} ${pluralizarMesa(naoLidas, "retorno novo", "retornos novos")}` : "",
            };
        }

        if (naoLidas > 0) {
            return {
                status: "respondeu",
                titulo: `Mesa respondeu com ${naoLidas} ${pluralizarMesa(naoLidas, "retorno novo", "retornos novos")}`,
                descricao: ultimaMensagemResumo
                    ? `Novo retorno no canal: ${ultimaMensagemResumo}.${sufixoData}`
                    : `Há retorno novo da mesa aguardando leitura.${sufixoData}`,
                chipStatus: "Mesa respondeu",
                chipPendencias: "",
                chipNaoLidas: `${naoLidas} ${pluralizarMesa(naoLidas, "retorno novo", "retornos novos")}`,
            };
        }

        if (ultimaMensagemEhMesa) {
            return {
                status: "respondeu",
                titulo: "Último retorno veio da mesa",
                descricao: ultimaMensagemResumo
                    ? `Mensagem mais recente: ${ultimaMensagemResumo}.${sufixoData}`
                    : `A mesa respondeu por último neste laudo.${sufixoData}`,
                chipStatus: "Mesa respondeu",
                chipPendencias: "",
                chipNaoLidas: "",
            };
        }

        if (ultimaMensagemEhCampo) {
            return {
                status: "aguardando",
                titulo: "Aguardando resposta da mesa",
                descricao: ultimaMensagemResumo
                    ? `Último envio do campo: ${ultimaMensagemResumo}.${sufixoData}`
                    : `O último movimento veio do campo; a mesa ainda não respondeu.${sufixoData}`,
                chipStatus: "Aguardando mesa",
                chipPendencias: "",
                chipNaoLidas: "",
            };
        }

        if (widgetAberto) {
            return {
                status: "canal_ativo",
                titulo: "Canal da mesa aberto",
                descricao: "Use este espaço para alinhar dúvidas, anexos e pendências com a engenharia.",
                chipStatus: "Canal ativo",
                chipPendencias: "",
                chipNaoLidas: "",
            };
        }

        const reconectando = conexao === "reconectando";
        return {
            status: "pronta",
            titulo: reconectando ? "Mesa reconectando" : "Mesa pronta para alinhamento",
            descricao: reconectando
                ? "A conexão está sendo retomada. Você ainda pode acompanhar o último contexto do canal."
                : "Abra o canal para alinhar dúvidas, pendências e evidências com a engenharia.",
            chipStatus: reconectando ? "Reconectando" : "Canal disponível",
            chipPendencias: "",
            chipNaoLidas: "",
        };
    }

    function renderizarResumoOperacionalMesa() {
        const resumo = obterResumoOperacionalMesa();

        atualizarStatusMesa(resumo.status, resumo.descricao);

        if (el.mesaWidgetResumo) {
            el.mesaWidgetResumo.dataset.statusOperacional = resumo.status;
        }
        if (el.mesaWidgetResumoTitulo) {
            el.mesaWidgetResumoTitulo.textContent = resumo.titulo;
        }
        if (el.mesaWidgetResumoTexto) {
            el.mesaWidgetResumoTexto.textContent = resumo.descricao;
        }
        if (el.mesaWidgetChipStatus) {
            el.mesaWidgetChipStatus.textContent = resumo.chipStatus;
            el.mesaWidgetChipStatus.className = "mesa-widget-chip operacional";
        }
        if (el.mesaWidgetChipPendencias) {
            const visivel = !!resumo.chipPendencias;
            el.mesaWidgetChipPendencias.hidden = !visivel;
            el.mesaWidgetChipPendencias.textContent = visivel ? resumo.chipPendencias : "";
            el.mesaWidgetChipPendencias.className = "mesa-widget-chip pendencias";
        }
        if (el.mesaWidgetChipNaoLidas) {
            const visivel = !!resumo.chipNaoLidas;
            el.mesaWidgetChipNaoLidas.hidden = !visivel;
            el.mesaWidgetChipNaoLidas.textContent = visivel ? resumo.chipNaoLidas : "";
            el.mesaWidgetChipNaoLidas.className = "mesa-widget-chip nao-lidas";
        }
    }

    function atualizarEstadoVisualBotaoMesaWidget() {
        if (!el.btnMesaWidgetToggle) return;

        const naoLidas = Number(estado.mesaWidgetNaoLidas || 0);
        const pendenciasAbertas = Number(estado.qtdPendenciasAbertas || 0) || 0;
        const aberto = !!estado.mesaWidgetAberto;
        const conexao = normalizarConexaoMesaWidget(estado.mesaWidgetConexao);
        const resumo = obterResumoOperacionalMesa();
        const alerta = naoLidas > 0 || aberto;

        el.btnMesaWidgetToggle.classList.toggle("is-open", aberto);
        el.btnMesaWidgetToggle.classList.toggle("is-alert", alerta);
        el.btnMesaWidgetToggle.classList.toggle("is-reconnecting", conexao === "reconectando");
        el.btnMesaWidgetToggle.classList.toggle("is-offline", conexao === "offline");

        const partes = [aberto ? "Fechar chat da mesa avaliadora" : "Abrir chat da mesa avaliadora"];
        if (resumo?.titulo) {
            partes.push(resumo.titulo);
        }
        if (pendenciasAbertas > 0) {
            partes.push(`${pendenciasAbertas} ${pluralizarMesa(pendenciasAbertas, "pendência aberta")}`);
        }
        if (naoLidas > 0) {
            partes.push(`${Math.min(naoLidas, 99)} mensagem(ns) não lida(s)`);
        }
        if (conexao !== "conectado") {
            partes.push(CONFIG_CONEXAO_MESA_WIDGET[conexao] || "Conexão indisponível");
        }
        el.btnMesaWidgetToggle.setAttribute("aria-label", partes.join(". "));
    }

    function sincronizarClasseBodyMesaWidget() {
        document.body.classList.toggle("mesa-widget-aberto", !!estado.mesaWidgetAberto);
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
        renderizarResumoOperacionalMesa();
    }

    function atualizarBadgeMesaWidget() {
        if (!el.badgeMesaWidget) return;
        const total = Number(estado.mesaWidgetNaoLidas || 0);
        if (total <= 0) {
            el.badgeMesaWidget.hidden = true;
            el.badgeMesaWidget.textContent = "0";
            atualizarEstadoVisualBotaoMesaWidget();
            renderizarResumoOperacionalMesa();
            return;
        }
        el.badgeMesaWidget.hidden = false;
        el.badgeMesaWidget.textContent = total > 99 ? "99+" : String(total);
        atualizarEstadoVisualBotaoMesaWidget();
        renderizarResumoOperacionalMesa();
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
        const anexos = Array.isArray(payload?.anexos)
            ? payload.anexos.map(normalizarAnexoMesa).filter(Boolean)
            : [];
        const resolvidaEm = String(payload?.resolvida_em || "").trim();
        const resolvidaPorNome = String(payload?.resolvida_por_nome || "").trim();
        const resolvidaEmLabel = String(payload?.resolvida_em_label || "").trim();
        const lida = !!payload?.lida || !!resolvidaEm;

        return {
            id,
            laudo_id: Number(payload?.laudo_id || 0) || null,
            tipo,
            texto: String(payload?.texto || "").trim(),
            data: String(payload?.data || "").trim(),
            remetente_id: Number(payload?.remetente_id || 0) || null,
            referencia_mensagem_id: Number(payload?.referencia_mensagem_id || 0) || null,
            lida,
            resolvida_em: resolvidaEm,
            resolvida_em_label: resolvidaEmLabel,
            resolvida_por_nome: resolvidaPorNome,
            anexos,
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
            const pendenciaResolvida = entradaMesa && !!item.lida;
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

            const textoMensagem = String(item.texto || "").trim();
            const anexosHtml = renderizarLinksAnexosMesa(item.anexos || []);
            const pillOperacao = entradaMesa
                ? `
                    <span class="mesa-widget-pill-operacao ${pendenciaResolvida ? "pendencia-resolvida" : "pendencia-aberta"}">
                        ${pendenciaResolvida ? "Pendência resolvida" : "Pendência aberta"}
                    </span>
                `
                : `
                    <span class="mesa-widget-pill-operacao mensagem-enviada">
                        ${item.anexos?.length ? "Enviado com anexo" : "Mensagem enviada"}
                    </span>
                `;
            const resolucaoInfo = pendenciaResolvida
                ? `
                    <p class="mesa-widget-resolucao">
                        Resolvida por ${escaparHtml(item.resolvida_por_nome || "mesa")} ${item.resolvida_em_label ? `em ${escaparHtml(item.resolvida_em_label)}` : ""}.
                    </p>
                `
                : "";
            card.innerHTML = `
                <div class="meta">
                    <span>${entradaMesa ? "Mesa" : "Você"}</span>
                    <span>${escaparHtml(item.data || "")}</span>
                </div>
                <div class="mesa-widget-pills">
                    ${pillOperacao}
                </div>
                ${referenciaHtml}
                ${textoMensagem ? `<p class="texto">${escaparHtml(textoMensagem)}</p>` : ""}
                ${resolucaoInfo}
                ${anexosHtml}
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

            emitirSincronizacaoLaudo(payload, { selecionar: false });

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
            renderizarResumoOperacionalMesa();
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
        const anexoPendente = estado.mesaWidgetAnexoPendente?.arquivo || null;

        if (!laudoId) {
            avisarMesaExigeInspecao();
            return;
        }

        if (!texto && !anexoPendente) {
            mostrarToast("Digite uma mensagem ou selecione um anexo para a mesa avaliadora.", "aviso", 2200);
            return;
        }

        const referenciaId = Number(estado.mesaWidgetReferenciaAtiva?.id || 0) || null;

        el.mesaWidgetEnviar?.setAttribute("aria-busy", "true");
        if (el.mesaWidgetEnviar) {
            el.mesaWidgetEnviar.disabled = true;
        }

        try {
            let resposta;
            if (anexoPendente) {
                const form = new FormData();
                form.set("arquivo", anexoPendente);
                if (texto) {
                    form.set("texto", texto);
                }
                if (referenciaId) {
                    form.set("referencia_mensagem_id", String(referenciaId));
                }

                resposta = await fetch(`/app/api/laudo/${laudoId}/mesa/anexo`, {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Accept": "application/json",
                        "X-CSRF-Token": obterTokenCsrf(),
                        "X-Requested-With": "XMLHttpRequest",
                    },
                    body: form,
                });
            } else {
                resposta = await fetch(`/app/api/laudo/${laudoId}/mesa/mensagem`, {
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
            }

            if (!resposta.ok) {
                const detalhe = await extrairMensagemErroHTTP(
                    resposta,
                    `HTTP_${resposta.status}`
                );
                throw new Error(detalhe);
            }

            const dados = await resposta.json().catch(() => ({}));
            const payload = dados?.dados || dados || {};
            emitirSincronizacaoLaudo(payload, { selecionar: true });
            await window.TarielAPI?.sincronizarEstadoRelatorio?.();

            el.mesaWidgetInput.value = "";
            limparReferenciaMesaWidget();
            limparAnexoMesaWidget();

            await carregarMensagensMesaWidget({ silencioso: true });
        } catch (erro) {
            const detalhe = String(erro?.message || "").trim();
            mostrarToast(
                detalhe || "Falha ao enviar mensagem para a mesa.",
                "erro",
                2600
            );
        } finally {
            el.mesaWidgetEnviar?.removeAttribute("aria-busy");
            if (el.mesaWidgetEnviar) {
                el.mesaWidgetEnviar.disabled = false;
            }
            el.mesaWidgetInput?.focus();
        }
    }

    async function abrirMesaWidget() {
        const laudoId = obterLaudoAtivo();
        if (!laudoId) {
            avisarMesaExigeInspecao();
            return;
        }

        limparTimerFecharMesaWidget();
        estado.mesaWidgetAberto = true;
        estado.mesaWidgetNaoLidas = 0;
        sincronizarClasseBodyMesaWidget();
        atualizarBadgeMesaWidget();
        renderizarResumoOperacionalMesa();

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
        sincronizarClasseBodyMesaWidget();
        limparTimerFecharMesaWidget();
        renderizarResumoOperacionalMesa();
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
        if (!texto && typeof window.TarielAPI?.carregarLaudo === "function") {
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
            "status-pendencia",
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

        const linhas = ["Contexto inicial da inspeção:"];

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

    function normalizarRoteiroTemplate(payload = {}) {
        const detalhe = payload && typeof payload === "object" ? payload : {};
        return {
            titulo: textoItemGate(detalhe?.titulo, "Roteiro obrigatório do template"),
            descricao: textoItemGate(detalhe?.descricao, ""),
            itens: Array.isArray(detalhe?.itens) ? detalhe.itens : [],
        };
    }

    function normalizarItemRoteiroTemplate(item = {}) {
        return {
            id: textoItemGate(item?.id, ""),
            categoria: textoItemGate(item?.categoria, "coleta"),
            titulo: textoItemGate(item?.titulo, "Ponto obrigatório"),
            descricao: textoItemGate(item?.descricao, ""),
        };
    }

    function rotuloCategoriaRoteiro(categoria = "") {
        const valor = String(categoria || "").trim().toLowerCase();
        if (valor === "campo_critico") return "Campo crítico";
        if (valor === "evidencia") return "Evidência";
        if (valor === "foto") return "Foto";
        if (valor === "ia") return "IA";
        if (valor === "formulario") return "Formulário";
        if (valor === "norma") return "Norma";
        return "Coleta";
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

    function renderizarListaRoteiroTemplate(container, itens = [], textoVazio = "Roteiro indisponível.") {
        if (!container) return;

        const listaNormalizada = Array.isArray(itens) ? itens.map(normalizarItemRoteiroTemplate) : [];
        if (!listaNormalizada.length) {
            container.innerHTML = `<li class="item-gate-qualidade item-gate-vazio">${escaparHtml(textoVazio)}</li>`;
            return;
        }

        container.innerHTML = listaNormalizada
            .map((item) => {
                const descricao = String(item.descricao || "").trim();
                const categoria = rotuloCategoriaRoteiro(item.categoria);

                return `
                    <li class="item-gate-qualidade item-gate-roteiro">
                        <div class="item-gate-cabecalho">
                            <span class="material-symbols-rounded" aria-hidden="true">task_alt</span>
                            <strong>${escaparHtml(item.titulo)}</strong>
                            <span class="pill-gate-status pill-gate-status-roteiro">${escaparHtml(categoria)}</span>
                        </div>
                        ${descricao ? `<p class="item-gate-obs">${escaparHtml(descricao)}</p>` : ""}
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
        const roteiroTemplate = normalizarRoteiroTemplate(
            payload?.roteiro_template || payload?.roteiroTemplate || {}
        );

        if (el.blocoGateRoteiroTemplate) {
            el.blocoGateRoteiroTemplate.hidden = !roteiroTemplate.itens.length;
        }
        if (el.tituloGateRoteiroTemplate) {
            el.tituloGateRoteiroTemplate.textContent = roteiroTemplate.titulo;
        }
        if (el.textoGateRoteiroTemplate) {
            el.textoGateRoteiroTemplate.textContent = roteiroTemplate.descricao;
        }
        renderizarListaRoteiroTemplate(
            el.listaGateRoteiroTemplate,
            roteiroTemplate.itens,
            "O roteiro obrigatório deste template não foi informado."
        );

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

    async function extrairMensagemErroHTTP(resposta, fallback = "") {
        if (!resposta) return String(fallback || "").trim();

        try {
            const tipoConteudo = String(resposta.headers?.get("content-type") || "").toLowerCase();

            if (tipoConteudo.includes("application/json")) {
                const payload = await resposta.json();
                const detalhe =
                    payload?.detail ??
                    payload?.erro ??
                    payload?.mensagem ??
                    payload?.message ??
                    "";

                if (typeof detalhe === "string" && detalhe.trim()) {
                    return detalhe.trim();
                }

                if (Array.isArray(detalhe) && detalhe.length > 0) {
                    return String(
                        detalhe
                            .map((item) => String(item?.msg || item || "").trim())
                            .filter(Boolean)
                            .join(" | ")
                    ).trim();
                }
            } else {
                const bruto = String(await resposta.text()).trim();
                if (bruto) {
                    return bruto.slice(0, 240);
                }
            }
        } catch (_) {
            // Fallback silencioso.
        }

        return String(fallback || `Falha HTTP ${resposta.status || ""}`).trim();
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
        renderizarResumoOperacionalMesa();
    }

    function atualizarBadgePendencias(abertas = 0) {
        const total = Number(abertas || 0);
        estado.qtdPendenciasAbertas = total > 0 ? total : 0;

        if (!el.badgePendenciasMesa) {
            renderizarResumoOperacionalMesa();
            return;
        }

        if (estado.qtdPendenciasAbertas > 0) {
            el.badgePendenciasMesa.hidden = false;
            el.badgePendenciasMesa.textContent = String(estado.qtdPendenciasAbertas);
            renderizarResumoOperacionalMesa();
            return;
        }

        el.badgePendenciasMesa.hidden = true;
        el.badgePendenciasMesa.textContent = "0";
        renderizarResumoOperacionalMesa();
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
            const anexosHtml = renderizarLinksAnexosMesa(
                Array.isArray(item?.anexos)
                    ? item.anexos.map(normalizarAnexoMesa).filter(Boolean)
                    : []
            );

            li.className = `pendencia-item ${aberta ? "aberta" : "lida"}`;
            li.innerHTML = `
                ${String(item?.texto || "").trim() ? `<p class="pendencia-texto">${escaparHtml(item?.texto || "")}</p>` : ""}
                ${anexosHtml}
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

            renderizarResumoOperacionalMesa();

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

    function obterOpcaoSelecionadaTemplate() {
        if (!el.selectTemplate) return null;
        const indice = Number(el.selectTemplate.selectedIndex);
        if (Number.isInteger(indice) && indice >= 0) {
            return el.selectTemplate.options[indice] || null;
        }
        return el.selectTemplate.options?.[0] || null;
    }

    function selectTemplateCustomEstaAberto() {
        return !!el.selectTemplateCustom?.classList.contains("aberto");
    }

    function atualizarValorSelectTemplateCustom() {
        if (!el.valorSelectTemplateCustom) return;
        const opcaoSelecionada = obterOpcaoSelecionadaTemplate();
        el.valorSelectTemplateCustom.textContent =
            opcaoSelecionada?.textContent?.trim() || "Selecionar tipo de relatório";
    }

    function atualizarEstadoOpcoesSelectTemplateCustom() {
        if (!el.listaSelectTemplateCustom || !el.selectTemplate) return;
        const valorAtual = String(el.selectTemplate.value || "");

        el.listaSelectTemplateCustom
            .querySelectorAll(".modal-select-opcao")
            .forEach((botao) => {
                const selecionada = String(botao.dataset?.valor || "") === valorAtual;
                botao.setAttribute("aria-selected", String(selecionada));
            });
    }

    function renderizarOpcoesSelectTemplateCustom() {
        if (!el.selectTemplate || !el.listaSelectTemplateCustom) return;

        const fragmento = document.createDocumentFragment();
        el.listaSelectTemplateCustom.innerHTML = "";

        const adicionarOpcao = (opcao) => {
            const item = document.createElement("li");
            item.setAttribute("role", "presentation");

            const botao = document.createElement("button");
            botao.type = "button";
            botao.className = "modal-select-opcao";
            botao.setAttribute("role", "option");
            botao.dataset.valor = String(opcao.value || "");
            botao.setAttribute("aria-selected", String(!!opcao.selected));

            if (opcao.disabled) {
                botao.disabled = true;
            }

            const texto = document.createElement("span");
            texto.textContent = opcao.textContent?.trim() || opcao.value || "Sem rótulo";

            const icone = document.createElement("span");
            icone.className = "material-symbols-rounded";
            icone.setAttribute("aria-hidden", "true");
            icone.textContent = "check";

            botao.append(texto, icone);
            item.appendChild(botao);
            fragmento.appendChild(item);
        };

        Array.from(el.selectTemplate.children).forEach((node) => {
            const tag = String(node.tagName || "").toUpperCase();

            if (tag === "OPTGROUP") {
                const titulo = document.createElement("li");
                titulo.className = "modal-select-grupo-label";
                titulo.setAttribute("role", "presentation");
                titulo.textContent = String(node.label || "Categoria");
                fragmento.appendChild(titulo);

                Array.from(node.querySelectorAll("option")).forEach((opcao) => {
                    adicionarOpcao(opcao);
                });
                return;
            }

            if (tag === "OPTION") {
                adicionarOpcao(node);
            }
        });

        el.listaSelectTemplateCustom.appendChild(fragmento);
        atualizarEstadoOpcoesSelectTemplateCustom();
        atualizarValorSelectTemplateCustom();
    }

    function fecharSelectTemplateCustom({ devolverFoco = true } = {}) {
        if (!el.selectTemplateCustom || !el.painelSelectTemplateCustom || !el.btnSelectTemplateCustom) return;
        if (!selectTemplateCustomEstaAberto()) return;

        el.selectTemplateCustom.classList.remove("aberto");
        el.painelSelectTemplateCustom.hidden = true;
        el.btnSelectTemplateCustom.setAttribute("aria-expanded", "false");

        if (devolverFoco) {
            el.btnSelectTemplateCustom.focus();
        }
    }

    function abrirSelectTemplateCustom() {
        if (!el.selectTemplateCustom || !el.painelSelectTemplateCustom || !el.btnSelectTemplateCustom) return;
        if (selectTemplateCustomEstaAberto()) return;

        el.selectTemplateCustom.classList.add("aberto");
        el.painelSelectTemplateCustom.hidden = false;
        el.btnSelectTemplateCustom.setAttribute("aria-expanded", "true");

        const opcaoSelecionada = el.listaSelectTemplateCustom?.querySelector(
            '.modal-select-opcao[aria-selected="true"]:not(:disabled)'
        );
        const primeiraOpcao = el.listaSelectTemplateCustom?.querySelector(
            ".modal-select-opcao:not(:disabled)"
        );
        (opcaoSelecionada || primeiraOpcao)?.focus();
    }

    function selecionarValorSelectTemplateCustom(
        valor,
        { emitirEvento = true, fechar = true, devolverFoco = true } = {}
    ) {
        if (!el.selectTemplate) return;

        const valorLimpo = String(valor || "");
        const existe = Array.from(el.selectTemplate.options || []).some(
            (opcao) => String(opcao.value || "") === valorLimpo
        );

        if (!existe) return;

        const alterou = String(el.selectTemplate.value || "") !== valorLimpo;
        el.selectTemplate.value = valorLimpo;

        atualizarValorSelectTemplateCustom();
        atualizarEstadoOpcoesSelectTemplateCustom();

        if (emitirEvento && alterou) {
            el.selectTemplate.dispatchEvent(new Event("change", { bubbles: true }));
        }

        if (fechar) {
            fecharSelectTemplateCustom({ devolverFoco });
        }
    }

    function moverFocoOpcaoSelectTemplateCustom(direcao = 1, destinoFixo = "") {
        if (!el.listaSelectTemplateCustom) return;

        const opcoes = Array.from(
            el.listaSelectTemplateCustom.querySelectorAll(".modal-select-opcao:not(:disabled)")
        );
        if (!opcoes.length) return;

        if (destinoFixo === "inicio") {
            opcoes[0]?.focus();
            return;
        }

        if (destinoFixo === "fim") {
            opcoes[opcoes.length - 1]?.focus();
            return;
        }

        const atual = document.activeElement?.closest?.(".modal-select-opcao");
        const indiceAtual = opcoes.indexOf(atual);
        const proximoIndice =
            indiceAtual < 0
                ? 0
                : (indiceAtual + direcao + opcoes.length) % opcoes.length;

        opcoes[proximoIndice]?.focus();
    }

    function inicializarSelectTemplateCustom() {
        if (
            !el.selectTemplate ||
            !el.selectTemplateCustom ||
            !el.btnSelectTemplateCustom ||
            !el.painelSelectTemplateCustom ||
            !el.listaSelectTemplateCustom
        ) {
            return;
        }

        renderizarOpcoesSelectTemplateCustom();
        el.selectTemplateCustom.hidden = false;
        el.selectTemplate.classList.add("select-proxy-ativo");
        el.selectTemplate.setAttribute("tabindex", "-1");
        el.selectTemplate.setAttribute("aria-hidden", "true");
        el.painelSelectTemplateCustom.hidden = true;
        el.btnSelectTemplateCustom.setAttribute("aria-expanded", "false");

        el.selectTemplate.addEventListener("change", () => {
            atualizarValorSelectTemplateCustom();
            atualizarEstadoOpcoesSelectTemplateCustom();
        });

        el.btnSelectTemplateCustom.addEventListener("click", () => {
            if (selectTemplateCustomEstaAberto()) {
                fecharSelectTemplateCustom({ devolverFoco: false });
                return;
            }
            abrirSelectTemplateCustom();
        });

        el.btnSelectTemplateCustom.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && selectTemplateCustomEstaAberto()) {
                event.preventDefault();
                fecharSelectTemplateCustom();
                return;
            }

            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (!selectTemplateCustomEstaAberto()) {
                    abrirSelectTemplateCustom();
                    return;
                }
                moverFocoOpcaoSelectTemplateCustom(event.key === "ArrowDown" ? 1 : -1);
                return;
            }

            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (selectTemplateCustomEstaAberto()) {
                    fecharSelectTemplateCustom({ devolverFoco: false });
                } else {
                    abrirSelectTemplateCustom();
                }
            }
        });

        el.listaSelectTemplateCustom.addEventListener("click", (event) => {
            const botao = event.target?.closest?.(".modal-select-opcao");
            if (!botao || botao.disabled) return;
            selecionarValorSelectTemplateCustom(botao.dataset?.valor || "");
        });

        el.listaSelectTemplateCustom.addEventListener("keydown", (event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                moverFocoOpcaoSelectTemplateCustom(event.key === "ArrowDown" ? 1 : -1);
                return;
            }

            if (event.key === "Home") {
                event.preventDefault();
                moverFocoOpcaoSelectTemplateCustom(0, "inicio");
                return;
            }

            if (event.key === "End") {
                event.preventDefault();
                moverFocoOpcaoSelectTemplateCustom(0, "fim");
                return;
            }

            if (event.key === "Escape") {
                event.preventDefault();
                fecharSelectTemplateCustom();
                return;
            }

            if (event.key === "Tab") {
                fecharSelectTemplateCustom({ devolverFoco: false });
                return;
            }

            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                const botao = event.target?.closest?.(".modal-select-opcao");
                if (!botao || botao.disabled) return;
                selecionarValorSelectTemplateCustom(botao.dataset?.valor || "");
            }
        });

        document.addEventListener("pointerdown", (event) => {
            if (!selectTemplateCustomEstaAberto()) return;
            if (el.selectTemplateCustom.contains(event.target)) return;
            fecharSelectTemplateCustom({ devolverFoco: false });
        });
    }

    function abrirModalNovaInspecao() {
        if (!el.modal) return;

        estado.ultimoElementoFocado = document.activeElement;

        el.modal.hidden = false;
        el.modal.classList.add("ativo");
        el.modal.setAttribute("aria-hidden", "false");
        el.btnAbrirModal?.setAttribute("aria-expanded", "true");

        document.body.style.overflow = "hidden";

        window.setTimeout(() => {
            if (el.btnSelectTemplateCustom && !el.selectTemplateCustom?.hidden) {
                el.btnSelectTemplateCustom.focus();
                return;
            }
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
        fecharSelectTemplateCustom({ devolverFoco: false });
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
        renderizarResumoOperacionalMesa();
    }

    function resetarInterfaceInspecao() {
        el.barraStatusInspecao?.setAttribute("hidden", "");
        el.telaBoasVindas?.removeAttribute("hidden");
        renderizarResumoOperacionalMesa();
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
        renderizarResumoOperacionalMesa();

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

    function eventoEhAtualizacaoPendenciaMesa(dados) {
        return Boolean(
            dados?.texto &&
            (
                dados.tipo === "pendencia_mesa" ||
                dados.tipo === "pendencia_eng"
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
        };

        estado.fonteSSE.onmessage = (event) => {
            try {
                const dados = JSON.parse(event.data);

                if (eventoEhAtualizacaoPendenciaMesa(dados)) {
                    const laudoIdEvento = Number(dados?.laudo_id ?? dados?.laudoId ?? 0) || null;
                    carregarPendenciasMesa({ laudoId: laudoIdEvento, silencioso: true }).catch(() => {});
                    if (laudoIdEvento && estado.mesaWidgetAberto && laudoIdEvento === obterLaudoAtivoIdSeguro()) {
                        carregarMensagensMesaWidget({ silencioso: true }).catch(() => {});
                    }
                    mostrarToast(String(dados.texto || "").trim() || "Pendência da mesa atualizada.", "info", 2200);
                    return;
                }

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
            if (el.modal?.classList.contains("ativo") && selectTemplateCustomEstaAberto()) {
                fecharSelectTemplateCustom();
                return;
            }
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
        document.addEventListener("click", (event) => {
            const btnHomeCabecalho = event.target?.closest?.(".btn-home-cabecalho");
            if (btnHomeCabecalho) {
                // Mantém comportamento nativo de nova aba/janela.
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                    return;
                }

                event.preventDefault();
                processarCliqueHomeCabecalho();
                return;
            }

            const linkBreadcrumbHome = event.target?.closest?.(".thread-breadcrumb [data-bc='home']");
            if (!linkBreadcrumbHome) return;

            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                return;
            }

            event.preventDefault();
            const destino = linkBreadcrumbHome.getAttribute("href") || "/app/";
            const destinoNormalizado = destino.startsWith("/app")
                ? "/app/?home=1"
                : destino;
            navegarParaHome(destinoNormalizado, { preservarContexto: true });
        });

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
        el.mesaWidgetBtnAnexo?.addEventListener("click", () => {
            el.mesaWidgetInputAnexo?.click();
        });
        el.mesaWidgetInputAnexo?.addEventListener("change", (event) => {
            const arquivo = event.target?.files?.[0];
            if (arquivo) {
                selecionarAnexoMesaWidget(arquivo);
            }
        });
        el.mesaWidgetPreviewAnexo?.addEventListener("click", (event) => {
            const btnRemover = event.target?.closest?.(".mesa-widget-preview-remover");
            if (btnRemover) {
                limparAnexoMesaWidget();
            }
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
            document.body.dataset.forceHomeLanding = "false";
            exibirInterfaceInspecaoAtiva(
                obterTipoTemplateDoPayload(event?.detail || {})
            );
            carregarPendenciasMesa({ laudoId, silencioso: true }).catch(() => {});
            estado.mesaWidgetMensagens = [];
            estado.mesaWidgetCursor = null;
            estado.mesaWidgetTemMais = false;
            estado.mesaWidgetNaoLidas = 0;
            limparAnexoMesaWidget();
            atualizarBadgeMesaWidget();
            if (estado.mesaWidgetAberto) {
                carregarMensagensMesaWidget({ silencioso: true }).catch(() => {});
            }
        };

        const onRelatorioFinalizado = (event) => {
            const laudoId = Number(event?.detail?.laudoId ?? event?.detail?.laudo_id ?? 0) || null;
            fecharModalGateQualidade();
            exibirInterfaceInspecaoAtiva(obterTipoTemplateDoPayload(event?.detail || {}));
            carregarPendenciasMesa({ laudoId, silencioso: true }).catch(() => {});
            if (estado.mesaWidgetAberto) {
                carregarMensagensMesaWidget({ silencioso: true }).catch(() => {});
            }
        };

        const onRelatorioCancelado = () => {
            fecharModalGateQualidade();
            resetarInterfaceInspecao();
            estado.mesaWidgetMensagens = [];
            estado.mesaWidgetCursor = null;
            estado.mesaWidgetTemMais = false;
            estado.mesaWidgetNaoLidas = 0;
            limparAnexoMesaWidget();
            atualizarBadgeMesaWidget();
            limparReferenciaMesaWidget();
            fecharMesaWidget();
        };

        const onMesaAtivada = () => {
            renderizarResumoOperacionalMesa();
        };

        const onMesaStatus = (event) => {
            const status = normalizarStatusMesa(event?.detail?.status);
            const preview = String(event?.detail?.preview || "").trim();
            if (status === "respondeu" && preview) {
                mostrarBannerEngenharia(preview);
            } else {
                renderizarResumoOperacionalMesa();
            }

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

        const onEstadoRelatorio = (event) => {
            const detail = event?.detail || {};
            const estadoRelatorio = normalizarEstadoRelatorio(detail.estado);
            const laudoId = Number(detail?.laudo_id ?? detail?.laudoId ?? 0) || null;

            if (homeForcadoAtivo() && estadoRelatorio !== "sem_relatorio") {
                return;
            }

            if (estadoRelatorioPossuiContexto(estadoRelatorio)) {
                exibirInterfaceInspecaoAtiva(obterTipoTemplateDoPayload(detail));
                carregarPendenciasMesa({ laudoId, silencioso: true }).catch(() => {});
                return;
            }

            resetarInterfaceInspecao();
        };

        const onGateQualidadeFalhou = (event) => {
            abrirModalGateQualidade(event?.detail || {});
        };

        document.addEventListener("tariel:relatorio-iniciado", onRelatorioIniciado);
        document.addEventListener("tariel:relatorio-finalizado", onRelatorioFinalizado);
        document.addEventListener("tariel:cancelar-relatorio", onRelatorioCancelado);

        document.addEventListener("tarielrelatorio-iniciado", onRelatorioIniciado);
        document.addEventListener("tarielrelatorio-finalizado", onRelatorioFinalizado);
        document.addEventListener("tarielrelatorio-cancelado", onRelatorioCancelado);

        document.addEventListener("tariel:mesa-avaliadora-ativada", onMesaAtivada);
        document.addEventListener("tarielmesa-avaliadora-ativada", onMesaAtivada);
        document.addEventListener("tariel:mesa-status", onMesaStatus);
        document.addEventListener("tarielmesa-status", onMesaStatus);
        document.addEventListener("tariel:laudo-selecionado", onLaudoSelecionado);
        document.addEventListener("tariel:estado-relatorio", onEstadoRelatorio);
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
        if (el.btnMesaWidgetToggle && el.painelMesaWidget) {
            document.body.classList.add("pagina-chat-mesa");
        }

        inicializarSelectTemplateCustom();
        bindEventosModal();
        bindEventosPagina();
        bindEventosSistema();

        atualizarBotoesFiltroPendencias();
        atualizarBadgeMesaWidget();
        atualizarConexaoMesaWidget("conectado");
        sincronizarClasseBodyMesaWidget();
        aplicarHighlightComposer(el.campoMensagem?.value || "");
        atualizarVisualComposer(el.campoMensagem?.value || "");
        sincronizarScrollBackdrop();
        inicializarNotificacoesSSE();

        try {
            const dados = await window.TarielAPI?.sincronizarEstadoRelatorio?.();
            const estadoRelatorio = normalizarEstadoRelatorio(dados?.estado);

            if (estadoRelatorioPossuiContexto(estadoRelatorio)) {
                if (homeForcadoAtivo()) {
                    resetarInterfaceInspecao();
                    return;
                }
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

