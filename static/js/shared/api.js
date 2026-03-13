// ==========================================
// TARIEL CONTROL TOWER — API.JS
// Versão modular: depende de
// - api-core.js
// - chat-render.js
// - chat-network.js
// ==========================================

(function () {
    "use strict";

    if (window.__TARIEL_API_WIRED__) return;
    window.__TARIEL_API_WIRED__ = true;

    // =========================================================================
    // BASE COMPARTILHADA
    // =========================================================================

    const Core = window.TarielCore;
    if (!Core) {
        console.error("[Tariel] window.TarielCore não encontrado. Carregue api-core.js antes de api.js.");
        return;
    }

    const ChatRenderFactory = window.TarielChatRender;
    if (!ChatRenderFactory) {
        console.error("[Tariel] window.TarielChatRender não encontrado. Carregue chat-render.js antes de api.js.");
        return;
    }

    const ChatNetworkFactory = window.TarielChatNetwork;
    if (!ChatNetworkFactory) {
        console.error("[Tariel] window.TarielChatNetwork não encontrado. Carregue chat-network.js antes de api.js.");
        return;
    }

    const {
        log,
        escapeHTML,
        mostrarToast,
        validarPrefixoBase64,
        sanitizarSetor,
        comCabecalhoCSRF,
        criarFormDataComCSRF,
    } = Core;

    const CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]')?.content ?? "";
    const LIMITE_CHARS = 8000;
    const MAX_HISTORICO_LOCAL = 40;
    const LIMITE_PAGINA_HISTORICO = 80;

    // =========================================================================
    // REFERÊNCIAS DOM
    // =========================================================================

    const campoMensagem = document.getElementById("campo-mensagem");
    const btnEnviar = document.getElementById("btn-enviar");
    const areaMensagens = document.getElementById("area-mensagens");
    const telaBoasVindas = document.getElementById("tela-boas-vindas");
    const previewContainer = document.getElementById("preview-anexo");
    const camadaArraste = document.getElementById("camada-arraste");
    const btnAnexo = document.getElementById("btn-anexo");
    const inputAnexo = document.getElementById("input-anexo");
    const setorSelect = document.getElementById("setor-industrial");
    const indicadorDigitando = document.getElementById("indicador-digitando");
    const listaHistorico = document.getElementById("lista-historico");
    const btnIrFimChat = document.getElementById("btn-ir-fim-chat");

    const NOME_USUARIO = String(window.TARIEL?.usuario || "Inspetor");
    const NOME_EMPRESA = String(window.TARIEL?.empresa || "Sua empresa");

    if (!campoMensagem || !btnEnviar || !areaMensagens) {
        log("error", "Elementos DOM críticos não encontrados. API.js não inicializado.");
        return;
    }

    if (inputAnexo) {
        inputAnexo.accept =
            "image/png,image/jpeg,image/jpg,image/webp,"
            + "application/pdf,"
            + "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function normalizarEstadoRelatorio(valor) {
        const estado = String(valor || "").trim().toLowerCase();

        if (estado === "relatorio_ativo" || estado === "relatorioativo") return "relatorio_ativo";
        if (estado === "sem_relatorio" || estado === "semrelatorio") return "sem_relatorio";
        if (estado === "aguardando" || estado === "aguardando_aval" || estado === "aguardando_avaliacao") {
            return "aguardando";
        }
        if (estado === "ajustes") return "ajustes";
        if (estado === "aprovado") return "aprovado";

        return estado || "sem_relatorio";
    }

    function estadoParaLegado(valor) {
        const estado = normalizarEstadoRelatorio(valor);
        if (estado === "relatorio_ativo") return "relatorioativo";
        if (estado === "sem_relatorio") return "semrelatorio";
        return estado;
    }

    function estadoRelatorioAtivo(valor = _estadoRelatorio) {
        return normalizarEstadoRelatorio(valor) === "relatorio_ativo";
    }

    function obterModoAtualSeguro() {
        return (
            window.TarielUI?.obterModo?.()
            ?? localStorage.getItem("tariel_modo_resposta")
            ?? "detalhado"
        );
    }

    function obterHeadersJSON(extra = {}) {
        const headers = { Accept: "application/json", ...extra };
        if (CSRF_TOKEN) headers["X-CSRF-Token"] = CSRF_TOKEN;
        return headers;
    }

    function emitirEvento(nome, detail = {}) {
        document.dispatchEvent(
            new CustomEvent(nome, {
                detail,
                bubbles: true,
            })
        );
    }

    function emitirEventos(nomes, detail = {}) {
        const lista = Array.isArray(nomes) ? nomes : [nomes];
        const unicos = [...new Set(lista.filter(Boolean))];

        unicos.forEach((nome) => emitirEvento(nome, detail));
    }

    function normalizarNumero(valor) {
        if (valor == null || valor === "") return null;
        const n = Number(valor);
        return Number.isFinite(n) ? n : null;
    }

    function montarPayloadEstado(payload = {}) {
        const estadoNormalizado = normalizarEstadoRelatorio(
            payload.estado_normalizado
            ?? payload.estado
            ?? payload.state
            ?? _estadoRelatorio
        );

        const laudoIdNormalizado = normalizarNumero(
            payload.laudo_id
            ?? payload.laudoId
            ?? payload.laudoid
            ?? laudoAtualId
        );

        return {
            ...payload,
            estado: estadoParaLegado(estadoNormalizado),
            estado_normalizado: estadoNormalizado,
            state: estadoNormalizado,
            laudo_id: laudoIdNormalizado,
            laudoId: laudoIdNormalizado,
            laudoid: laudoIdNormalizado,
        };
    }

    function emitirEstadoRelatorio(payload = {}) {
        const compat = montarPayloadEstado(payload);
        _estadoRelatorio = compat.estado_normalizado;

        emitirEventos(
            ["tariel:estado-relatorio", "tarielestado-relatorio"],
            compat
        );

        return compat;
    }

    function emitirCardLaudo(payload = {}, { selecionar = false } = {}) {
        const card = payload?.laudo_card || payload?.laudoCard || payload?.card || null;
        if (!card?.id) return null;

        emitirEventos(
            ["tariel:laudo-card-sincronizado"],
            {
                card,
                selecionar: !!selecionar,
            }
        );

        return card;
    }

    function limparBackdropEntrada() {
        const backdrop = document.getElementById("highlight-backdrop");
        if (backdrop) backdrop.innerHTML = "";
    }

    function dispararInputCampo() {
        campoMensagem.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function resetarEstadoLocal({
        limparLaudoAtual = false,
        limparEntrada = true,
        limparMensagensVisuais = false,
    } = {}) {
        if (controllerStream) {
            controllerStream.abort();
            controllerStream = null;
        }

        historicoConversa = [];
        historicoLaudoPaginado = [];
        cursorHistoricoProximo = null;
        temMaisHistorico = false;
        carregandoHistoricoAntigo = false;
        botaoCarregarHistoricoAntigo = null;
        ultimoDiagnosticoBruto = "";
        arquivoPendente = null;
        imagemBase64Pendente = null;
        textoDocumentoPendente = null;
        nomeDocumentoPendente = null;
        iaRespondendo = false;

        if (limparLaudoAtual) {
            laudoAtualId = null;
            _estadoRelatorio = "sem_relatorio";
        }

        if (previewContainer) previewContainer.innerHTML = "";
        if (inputAnexo) inputAnexo.value = "";

        if (limparEntrada) {
            campoMensagem.value = "";
            campoMensagem.style.height = "auto";
            limparBackdropEntrada();
            dispararInputCampo();
        }

        if (limparMensagensVisuais) {
            _limparAreaMensagens();
        }

        _ocultarDigitando();
        atualizarEstadoBotao();
        atualizarContadorChars();
    }

    // =========================================================================
    // ESTADO DA CONVERSA
    // =========================================================================

    let arquivoPendente = null;
    let imagemBase64Pendente = null;
    let textoDocumentoPendente = null;
    let nomeDocumentoPendente = null;
    let ultimoDiagnosticoBruto = "";
    let iaRespondendo = false;
    let contadorArraste = 0;
    let controllerStream = null;
    let laudoAtualId = normalizarNumero(window.TARIEL?.laudoAtivoId ?? null);
    let historicoConversa = [];
    let historicoLaudoPaginado = [];
    let cursorHistoricoProximo = null;
    let temMaisHistorico = false;
    let carregandoHistoricoAntigo = false;
    let botaoCarregarHistoricoAntigo = null;

    function adicionarAoHistorico(papel, texto) {
        historicoConversa.push({ papel, texto });

        if (historicoConversa.length > MAX_HISTORICO_LOCAL) {
            historicoConversa = historicoConversa.slice(-MAX_HISTORICO_LOCAL);
        }
    }

    // =========================================================================
    // ESTADO DO RELATÓRIO
    // =========================================================================

    let _estadoRelatorio = normalizarEstadoRelatorio(window.TARIEL?.estadoRelatorio ?? "sem_relatorio");
    if (!_estadoRelatorio) {
        _estadoRelatorio = "sem_relatorio";
    }

    // =========================================================================
    // ÁREA DE MENSAGENS E SCROLL
    // =========================================================================

    function _limparAreaMensagens() {
        if (!areaMensagens) return;

        areaMensagens
            .querySelectorAll(
                ".linha-mensagem, .thread-nav, .skeleton-carregamento, .controle-historico-antigo"
            )
            .forEach((el) => el.remove());
    }

    function _mostrarDigitando() {
        if (!indicadorDigitando) return;
        indicadorDigitando.setAttribute("aria-hidden", "false");
        indicadorDigitando.classList.add("visivel");
        rolarParaBaixo();
    }

    function _ocultarDigitando() {
        if (!indicadorDigitando) return;
        indicadorDigitando.setAttribute("aria-hidden", "true");
        indicadorDigitando.classList.remove("visivel");
    }

    const LIMIAR_SCROLL_FIM_PX = 112;
    let _rolarPendente = false;
    let _autoScrollAtivo = true;

    function distanciaDoFim() {
        if (!areaMensagens) return 0;
        return Math.max(
            0,
            areaMensagens.scrollHeight - areaMensagens.clientHeight - areaMensagens.scrollTop
        );
    }

    function chatEstaProximoDoFim() {
        return distanciaDoFim() <= LIMIAR_SCROLL_FIM_PX;
    }

    function atualizarVisibilidadeBotaoIrFim() {
        if (!btnIrFimChat || !areaMensagens) return;

        const chatTemOverflow = areaMensagens.scrollHeight > areaMensagens.clientHeight + 16;
        const mostrar = chatTemOverflow && !chatEstaProximoDoFim();

        btnIrFimChat.classList.toggle("visivel", mostrar);
        btnIrFimChat.setAttribute("aria-hidden", String(!mostrar));
    }

    function rolarParaBaixo({ suave = false, forcar = false } = {}) {
        if (!areaMensagens) return;
        if (_rolarPendente) return;
        if (!forcar && !_autoScrollAtivo) {
            atualizarVisibilidadeBotaoIrFim();
            return;
        }

        _rolarPendente = true;
        requestAnimationFrame(() => {
            areaMensagens.scrollTo({
                top: areaMensagens.scrollHeight,
                behavior: suave ? "smooth" : "auto",
            });

            _rolarPendente = false;
            _autoScrollAtivo = true;
            atualizarVisibilidadeBotaoIrFim();
        });
    }

    function atualizarTiquesStatus(idMensagem, novoStatus) {
        if (!idMensagem) return;

        const tiques = areaMensagens?.querySelector(
            `[data-mensagem-id="${CSS.escape(String(idMensagem))}"] .tiques-status`
        );

        if (!tiques) return;

        tiques.className = `tiques-status status-${novoStatus}`;
        tiques.style.opacity = "0";

        requestAnimationFrame(() => {
            tiques.style.opacity = "1";
        });
    }

    // =========================================================================
    // BUSCA NO HISTÓRICO DA SIDEBAR
    // =========================================================================

    function inicializarBuscaHistorico() {
        if (!listaHistorico) return;
        if (document.getElementById("busca-historico-input")) return;

        const wrapper = document.createElement("div");
        wrapper.className = "busca-historico";
        wrapper.innerHTML = `
            <span class="material-symbols-rounded" aria-hidden="true">search</span>
            <input
                type="search"
                id="busca-historico-input"
                placeholder="Buscar laudos..."
                aria-label="Buscar no histórico"
                autocomplete="off"
                spellcheck="false"
                maxlength="80"
            >
        `;

        const semResultados = document.createElement("p");
        semResultados.className = "sem-resultados-busca";
        semResultados.textContent = "Nenhum laudo encontrado.";

        listaHistorico.parentElement?.insertBefore(wrapper, listaHistorico);
        listaHistorico.parentElement?.insertBefore(semResultados, listaHistorico);

        const input = wrapper.querySelector("input");
        if (!input) return;

        let debounceTimer = null;

        input.addEventListener("input", () => {
            clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(() => {
                _filtrarHistorico(input.value.trim(), semResultados);
            }, 200);
        });

        input.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                input.value = "";
                _filtrarHistorico("", semResultados);
            }
        });
    }

    function _filtrarHistorico(termo, elSemResultados) {
        if (!listaHistorico) return;

        const itens = listaHistorico.querySelectorAll(".item-historico:not(.inativo)");
        const termoLow = termo.toLowerCase();
        let visiveis = 0;

        itens.forEach((item) => {
            const textoOriginal = item.getAttribute("data-texto-original") ?? item.textContent;

            if (!item.hasAttribute("data-texto-original")) {
                item.setAttribute("data-texto-original", item.textContent);
            }

            if (!termo) {
                item.style.display = "";
                const span = item.querySelector(".texto-laudo-historico span:first-child");
                if (span?.dataset.textoOriginal) {
                    span.textContent = span.dataset.textoOriginal;
                }
                visiveis++;
                return;
            }

            const match = textoOriginal.toLowerCase().includes(termoLow);
            item.style.display = match ? "" : "none";

            if (!match) return;

            visiveis++;

            const span = item.querySelector(".texto-laudo-historico span:first-child");
            if (!span) return;

            if (!span.dataset.textoOriginal) {
                span.dataset.textoOriginal = span.textContent;
            }

            const textoSpan = span.dataset.textoOriginal;
            const idx = textoSpan.toLowerCase().indexOf(termoLow);

            if (idx >= 0) {
                span.innerHTML =
                    escapeHTML(textoSpan.slice(0, idx))
                    + `<mark>${escapeHTML(textoSpan.slice(idx, idx + termo.length))}</mark>`
                    + escapeHTML(textoSpan.slice(idx + termo.length));
            }
        });

        listaHistorico.querySelectorAll(".grupo-data").forEach((grupo) => {
            const temVisivel = [...grupo.querySelectorAll(".item-historico:not(.inativo)")]
                .some((el) => el.style.display !== "none");
            grupo.style.display = temVisivel ? "" : "none";
        });

        const secaoPinados = listaHistorico.querySelector(".secao-pinados");
        if (secaoPinados) {
            const temPinadoVisivel = [...secaoPinados.querySelectorAll(".item-historico:not(.inativo)")]
                .some((el) => el.style.display !== "none");
            secaoPinados.style.display = temPinadoVisivel ? "" : "none";
        }

        if (elSemResultados) {
            elSemResultados.classList.toggle("visivel", termo !== "" && visiveis === 0);
        }
    }

    // =========================================================================
    // UI BÁSICA
    // =========================================================================

    function atualizarEstadoBotao() {
        const temConteudo = campoMensagem.value.trim() !== "" || arquivoPendente !== null;
        const habilitado = temConteudo && !iaRespondendo;

        btnEnviar.disabled = !habilitado;
        btnEnviar.classList.toggle("destaque", habilitado);
        btnEnviar.setAttribute("aria-busy", String(iaRespondendo));
    }

    function atualizarContadorChars() {
        const contador = document.getElementById("contador-chars");
        if (!contador) return;

        const restantes = LIMITE_CHARS - campoMensagem.value.length;
        contador.textContent = restantes < 200 ? String(restantes) : "";
        contador.classList.toggle("contador-alerta", restantes < 100);
    }

    function preencherCampoMensagem(texto) {
        if (typeof texto !== "string") return;
        campoMensagem.value = texto.slice(0, LIMITE_CHARS);
        dispararInputCampo();
        campoMensagem.focus();
        campoMensagem.setSelectionRange(campoMensagem.value.length, campoMensagem.value.length);
    }

    // =========================================================================
    // RENDER
    // =========================================================================

    let ChatNetwork = null;

    const ChatRender = ChatRenderFactory({
        areaMensagens,
        escapeHTML,
        mostrarToast,
        validarPrefixoBase64,
        rolarParaBaixo,
        getNomeUsuario: () => NOME_USUARIO,
        getNomeEmpresa: () => NOME_EMPRESA,
        getUltimoDiagnosticoBruto: () => ultimoDiagnosticoBruto,
        getHistoricoConversa: () => historicoConversa,
        getIaRespondendo: () => iaRespondendo,
        getEstadoRelatorio: () => _estadoRelatorio,
        getSetorAtual: () => setorSelect?.value || "geral",
        getUltimaMensagemUsuario: () =>
            [...historicoConversa].reverse().find((h) => h.papel === "usuario")?.texto || "",
        enviarParaIA: (
            mensagem,
            dadosImagem = null,
            setor = "geral",
            textoDocumento = null,
            nomeDocumento = null,
            tmpId = null,
            invisivel = false
        ) => ChatNetwork?.enviarParaIA(
            mensagem,
            dadosImagem,
            setor,
            textoDocumento,
            nomeDocumento,
            tmpId,
            invisivel
        ),
        finalizarRelatorio: () => finalizarRelatorioWrapper(),
        preencherCampoMensagem,
        enviarFeedback: (tipo, textoBolha) => ChatNetwork?.enviarFeedback(tipo, textoBolha),
        gerarPDF: () => ChatNetwork?.gerarPDF(),
    });

    if (!ChatRender) {
        log("error", "Falha ao iniciar TarielChatRender.");
        return;
    }

    const {
        adicionarMensagemInspetor,
        criarBolhaIA,
        mostrarAcoesPosResposta,
        renderizarConfiancaIA,
        renderizarCitacoes: _renderizarCitacoes,
        renderizarMarkdown,
    } = ChatRender;

    // =========================================================================
    // NETWORK
    // =========================================================================

    ChatNetwork = ChatNetworkFactory({
        log,
        escapeHTML,
        mostrarToast,
        validarPrefixoBase64,
        sanitizarSetor,
        comCabecalhoCSRF,
        criarFormDataComCSRF,

        // Bootstrap primário do composer fica neste arquivo (api.js).
        // Evita bind duplicado de eventos internos do chat-network.
        campoMensagem: null,
        btnEnviar: null,
        previewContainer,
        inputAnexo,
        telaBoasVindas,
        setorSelect,

        getNomeUsuario: () => NOME_USUARIO,
        getNomeEmpresa: () => NOME_EMPRESA,

        getLaudoAtualId: () => laudoAtualId,
        setLaudoAtualId: (v) => {
            laudoAtualId = normalizarNumero(v);
        },

        getEstadoRelatorio: () => _estadoRelatorio,
        setEstadoRelatorio: (v) => {
            _estadoRelatorio = normalizarEstadoRelatorio(v);
        },

        getHistoricoConversa: () => historicoConversa,
        setHistoricoConversa: (v) => {
            historicoConversa = Array.isArray(v) ? v : [];
        },
        adicionarAoHistorico,

        getUltimoDiagnosticoBruto: () => ultimoDiagnosticoBruto,
        setUltimoDiagnosticoBruto: (v) => {
            ultimoDiagnosticoBruto = String(v || "");
        },

        getIaRespondendo: () => iaRespondendo,
        setIaRespondendo: (v) => {
            iaRespondendo = !!v;
        },

        getArquivoPendente: () => arquivoPendente,
        setArquivoPendente: (v) => {
            arquivoPendente = v;
        },

        getImagemBase64Pendente: () => imagemBase64Pendente,
        setImagemBase64Pendente: (v) => {
            imagemBase64Pendente = v;
        },

        getTextoDocumentoPendente: () => textoDocumentoPendente,
        setTextoDocumentoPendente: (v) => {
            textoDocumentoPendente = v;
        },

        getNomeDocumentoPendente: () => nomeDocumentoPendente,
        setNomeDocumentoPendente: (v) => {
            nomeDocumentoPendente = v;
        },

        getControllerStream: () => controllerStream,
        setControllerStream: (v) => {
            controllerStream = v;
        },

        limparHistoricoChat: () => window.TarielAPI?.limparHistoricoChat?.(),
        limparAreaMensagens: _limparAreaMensagens,
        mostrarDigitando: _mostrarDigitando,
        ocultarDigitando: _ocultarDigitando,
        rolarParaBaixo,
        atualizarEstadoBotao,
        atualizarContadorChars,
        atualizarTiquesStatus,

        criarBolhaIA,
        mostrarAcoesPosResposta,
        renderizarMarkdown,
        renderizarCitacoes: _renderizarCitacoes,
        renderizarConfiancaIA,

        getModoAtual: obterModoAtualSeguro,
    });

    if (!ChatNetwork) {
        log("error", "Falha ao iniciar TarielChatNetwork.");
        return;
    }

    // =========================================================================
    // WRAPPERS DE EVENTOS
    // =========================================================================

    async function sincronizarEstadoRelatorioWrapper(...args) {
        const dados = await ChatNetwork.sincronizarEstadoRelatorio(...args);
        emitirCardLaudo(dados, { selecionar: false });
        const compat = emitirEstadoRelatorio(
            dados || {
                estado_normalizado: _estadoRelatorio,
                laudo_id: laudoAtualId,
            }
        );
        return compat;
    }

    async function iniciarRelatorioWrapper(...args) {
        const dados = await ChatNetwork.iniciarRelatorio(...args);
        if (!dados) return dados;

        const laudoId = normalizarNumero(dados.laudo_id ?? dados.laudoid ?? laudoAtualId);
        const compat = emitirEstadoRelatorio({
            ...dados,
            estado_normalizado: dados.estado ?? "sem_relatorio",
            laudo_id: laudoId,
        });

        if (compat.laudo_id) {
            laudoAtualId = compat.laudo_id;
        }

        if (compat.estado_normalizado === "relatorio_ativo") {
            emitirEventos(
                ["tariel:relatorio-iniciado", "tarielrelatorio-iniciado"],
                {
                    laudoId: compat.laudo_id,
                    laudo_id: compat.laudo_id,
                    tipoTemplate: args[0] ?? null,
                    estado: compat.estado,
                    estado_normalizado: compat.estado_normalizado,
                }
            );
        } else {
            emitirEventos(
                ["tariel:laudo-criado", "tariellaudo-criado"],
                {
                    laudoId: compat.laudo_id,
                    laudo_id: compat.laudo_id,
                    tipoTemplate: args[0] ?? null,
                    estado: compat.estado,
                    estado_normalizado: compat.estado_normalizado,
                }
            );
        }

        return compat;
    }

    async function finalizarRelatorioWrapper(...args) {
        const dados = await ChatNetwork.finalizarRelatorio(...args);
        if (!dados) return dados;
        const laudoIdFinal = normalizarNumero(dados.laudo_id ?? dados.laudoid ?? laudoAtualId);
        if (laudoIdFinal) {
            laudoAtualId = laudoIdFinal;
        }
        emitirCardLaudo(dados, { selecionar: true });

        const compat = emitirEstadoRelatorio({
            ...dados,
            estado_normalizado: dados.estado ?? "aguardando",
            laudo_id: laudoIdFinal,
        });

        emitirEventos(
            ["tariel:relatorio-finalizado", "tarielrelatorio-finalizado"],
            {
                laudoId: laudoIdFinal,
                laudo_id: laudoIdFinal,
                estado: compat.estado,
                estado_normalizado: compat.estado_normalizado,
            }
        );

        return compat;
    }

    async function cancelarRelatorioWrapper(...args) {
        const dados = await ChatNetwork.cancelarRelatorio(...args);
        if (dados === false) return dados;

        laudoAtualId = null;

        const compat = emitirEstadoRelatorio({
            ...(dados || {}),
            estado_normalizado: "sem_relatorio",
            laudo_id: null,
        });

        emitirEventos(
            ["tariel:relatorio-finalizado", "tarielrelatorio-finalizado"],
            {
                laudoId: null,
                laudo_id: null,
                estado: compat.estado,
                estado_normalizado: compat.estado_normalizado,
            }
        );

        return compat;
    }

    async function reabrirLaudoWrapper(laudoId) {
        const alvo = normalizarNumero(laudoId ?? laudoAtualId);
        if (!alvo) return null;

        const resposta = await fetch(`/app/api/laudo/${alvo}/reabrir`, {
            method: "POST",
            credentials: "same-origin",
            headers: comCabecalhoCSRF({
                Accept: "application/json",
                "X-Requested-With": "XMLHttpRequest",
            }),
        });

        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) {
            throw new Error(String(dados?.detail || dados?.erro || "Falha ao reabrir laudo."));
        }

        laudoAtualId = alvo;
        emitirCardLaudo(dados, { selecionar: true });
        return emitirEstadoRelatorio({
            ...dados,
            estado_normalizado: dados.estado ?? "relatorio_ativo",
            laudo_id: alvo,
        });
    }

    // =========================================================================
    // API PÚBLICA
    // =========================================================================

    window.TarielAPI = {
        limparHistoricoChat() {
            resetarEstadoLocal({
                limparLaudoAtual: true,
                limparEntrada: true,
                limparMensagensVisuais: true,
            });

            if (telaBoasVindas) {
                telaBoasVindas.style.removeProperty("display");
            }

            emitirEstadoRelatorio({
                estado_normalizado: "sem_relatorio",
                laudo_id: null,
            });
        },

        preencherEntrada: preencherCampoMensagem,

        prepararArquivoParaEnvio: (...args) => ChatNetwork.prepararArquivoParaEnvio(...args),
        limparPreview: (...args) => ChatNetwork.limparPreview(...args),
        iniciarRelatorio: (...args) => iniciarRelatorioWrapper(...args),
        finalizarRelatorio: (...args) => finalizarRelatorioWrapper(...args),
        cancelarRelatorio: (...args) => cancelarRelatorioWrapper(...args),
        reabrirLaudo: (...args) => reabrirLaudoWrapper(...args),
        sincronizarEstadoRelatorio: (...args) => sincronizarEstadoRelatorioWrapper(...args),

        obterLaudoAtualId: () => laudoAtualId,
        obterEstadoRelatorio: () => estadoParaLegado(_estadoRelatorio),
        obterEstadoRelatorioNormalizado: () => _estadoRelatorio,
        carregarLaudo: (laudoId, opts = {}) => carregarLaudoPorId(laudoId, opts),
    };

    window.preencherEntrada = window.TarielAPI.preencherEntrada;
    window.limparHistoricoChat = window.TarielAPI.limparHistoricoChat;
    window.limparPreview = window.TarielAPI.limparPreview;
    window.prepararArquivoParaEnvio = window.TarielAPI.prepararArquivoParaEnvio;
    window.iniciarRelatorio = window.TarielAPI.iniciarRelatorio;
    window.finalizarRelatorio = window.TarielAPI.finalizarRelatorio;
    window.cancelarRelatorio = window.TarielAPI.cancelarRelatorio;
    window.finalizarInspecaoCompleta = window.TarielAPI.finalizarRelatorio;

    document.documentElement.dataset.chatBootstrapOwner = "api.js";
    document.dispatchEvent(
        new CustomEvent("tariel:api-pronta", {
            detail: { origem: "api.js" },
            bubbles: true,
        })
    );

    // =========================================================================
    // EVENTO DE FINALIZAÇÃO SILENCIOSA
    // =========================================================================

    async function tratarDisparoComandoSistema(detail = {}) {
        const { comando, tipo, laudoId } = detail;
        if (comando !== "FINALIZAR_LAUDO_AGORA") return;

        const laudoIdAntes = normalizarNumero(laudoId || laudoAtualId);
        const tipoFinal = String(tipo || "padrao").trim().toLowerCase();

        try {
            const mensagemOculta = `[COMANDO_SISTEMA]: FINALIZAR_LAUDO_AGORA | TIPO: ${tipoFinal}`;

            await ChatNetwork.enviarParaIA(
                mensagemOculta,
                null,
                "geral",
                null,
                null,
                null,
                true
            );

            await finalizarRelatorioWrapper();
        } catch (err) {
            log("error", "Falha na finalização silenciosa:", err);

            emitirEventos(
                ["tariel:relatorio-finalizacao-falhou", "tarielrelatorio-finalizacao-falhou"],
                { laudoId: laudoIdAntes }
            );

            mostrarToast("Erro ao finalizar o laudo.", "erro");
        }
    }

    document.addEventListener("tariel:disparar-comando-sistema", (e) => {
        tratarDisparoComandoSistema(e.detail || {});
    });

    document.addEventListener("tarieldisparar-comando-sistema", (e) => {
        tratarDisparoComandoSistema(e.detail || {});
    });

    function normalizarPaginaHistorico(payload) {
        if (Array.isArray(payload)) {
            return {
                itens: payload,
                cursor_proximo: null,
                tem_mais: false,
            };
        }

        const itens = Array.isArray(payload?.itens) ? payload.itens : [];
        const cursor = normalizarNumero(payload?.cursor_proximo ?? payload?.cursorProximo);
        return {
            itens,
            cursor_proximo: cursor,
            tem_mais: !!payload?.tem_mais,
        };
    }

    async function buscarPaginaHistoricoLaudo(laudoId, { cursor = null } = {}) {
        const qs = new URLSearchParams();
        qs.set("limite", String(LIMITE_PAGINA_HISTORICO));
        if (normalizarNumero(cursor)) {
            qs.set("cursor", String(cursor));
        }

        const resposta = await fetch(`/app/api/laudo/${laudoId}/mensagens?${qs.toString()}`, {
            credentials: "same-origin",
            headers: obterHeadersJSON(),
        });

        if (!resposta.ok) {
            throw new Error(`HTTP_${resposta.status}`);
        }

        const dados = await resposta.json();
        return normalizarPaginaHistorico(dados);
    }

    function removerControleHistoricoAntigo() {
        if (botaoCarregarHistoricoAntigo?.isConnected) {
            botaoCarregarHistoricoAntigo.remove();
        }
        botaoCarregarHistoricoAntigo = null;
    }

    function atualizarControleHistoricoAntigo() {
        if (!areaMensagens) return;

        if (!temMaisHistorico) {
            removerControleHistoricoAntigo();
            return;
        }

        if (!botaoCarregarHistoricoAntigo) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "controle-historico-antigo btn-pendencias-acao";
            btn.addEventListener("click", () => {
                carregarMensagensAntigasLaudoAtual();
            });
            botaoCarregarHistoricoAntigo = btn;
        }

        botaoCarregarHistoricoAntigo.disabled = carregandoHistoricoAntigo;
        botaoCarregarHistoricoAntigo.setAttribute("aria-busy", String(carregandoHistoricoAntigo));
        botaoCarregarHistoricoAntigo.textContent = carregandoHistoricoAntigo
            ? "Carregando mensagens antigas..."
            : "Carregar mensagens antigas";

        areaMensagens.prepend(botaoCarregarHistoricoAntigo);
    }

    function renderizarHistoricoCarregado({ rolarAoFinal = true } = {}) {
        _limparAreaMensagens();

        if (!Array.isArray(historicoLaudoPaginado) || historicoLaudoPaginado.length === 0) {
            atualizarControleHistoricoAntigo();
            return;
        }

        historicoConversa = [];
        let ultimaLinhaIA = null;
        let ultimoTextoIA = "";

        for (const msg of historicoLaudoPaginado) {
            const papel = String(msg?.papel || "").toLowerCase();
            const tipoNormalizado = String(msg?.tipo || "").toLowerCase();

            // Chat da mesa é exibido no widget dedicado.
            if (
                tipoNormalizado === "humano_insp" ||
                tipoNormalizado === "humano_eng" ||
                tipoNormalizado === "humanoeng"
            ) {
                continue;
            }

            if (papel === "assistente") {
                const elIA = criarBolhaIA(msg.modo || "detalhado");
                const elTexto = elIA.querySelector(".texto-msg");
                elIA.querySelector(".cursor-piscando")?.remove();
                const mensagemId = Number(msg?.id ?? 0);
                if (Number.isFinite(mensagemId) && mensagemId > 0) {
                    elIA.dataset.mensagemId = String(mensagemId);
                }

                if (elTexto) {
                    elTexto.innerHTML = renderizarMarkdown(msg.texto || "");
                }

                if (Array.isArray(msg.citacoes) && msg.citacoes.length) {
                    _renderizarCitacoes(elIA, msg.citacoes);
                }
                if (msg.confianca_ia && typeof msg.confianca_ia === "object") {
                    renderizarConfiancaIA(elIA, msg.confianca_ia);
                }

                ultimaLinhaIA = elIA;
                ultimoTextoIA = String(msg.texto || "");
                adicionarAoHistorico("assistente", ultimoTextoIA);
                continue;
            }

            if (papel === "engenheiro") {
                continue;
            }

            const linhaInspetor = adicionarMensagemInspetor(
                String(msg.texto || ""),
                null,
                null,
                null,
                {
                    mensagemId: Number(msg?.id ?? 0) || null,
                    referenciaMensagemId: Number(msg?.referencia_mensagem_id ?? 0) || null,
                    omitirStatusEntrega: true,
                }
            );
            if (linhaInspetor && Number(msg?.id || 0) > 0) {
                linhaInspetor.dataset.mensagemId = String(Number(msg.id));
            }
            adicionarAoHistorico("usuario", String(msg.texto || ""));
        }

        if (ultimaLinhaIA && ultimoTextoIA) {
            ultimoDiagnosticoBruto = ultimoTextoIA;
            mostrarAcoesPosResposta(ultimaLinhaIA, ultimoTextoIA);
        }

        atualizarControleHistoricoAntigo();

        if (rolarAoFinal) {
            rolarParaBaixo({ forcar: true });
        }
    }

    async function carregarMensagensAntigasLaudoAtual() {
        if (!laudoAtualId || !temMaisHistorico || carregandoHistoricoAntigo) return;

        carregandoHistoricoAntigo = true;
        atualizarControleHistoricoAntigo();

        const topoAntes = areaMensagens?.scrollTop ?? 0;
        const alturaAntes = areaMensagens?.scrollHeight ?? 0;

        try {
            const pagina = await buscarPaginaHistoricoLaudo(laudoAtualId, {
                cursor: cursorHistoricoProximo,
            });

            if (Array.isArray(pagina.itens) && pagina.itens.length > 0) {
                historicoLaudoPaginado = [...pagina.itens, ...historicoLaudoPaginado];
            }

            cursorHistoricoProximo = pagina.cursor_proximo;
            temMaisHistorico = !!pagina.tem_mais;

            renderizarHistoricoCarregado({ rolarAoFinal: false });

            if (areaMensagens) {
                const alturaDepois = areaMensagens.scrollHeight;
                areaMensagens.scrollTop = Math.max(
                    0,
                    topoAntes + (alturaDepois - alturaAntes)
                );
            }
        } catch (err) {
            log("warn", "Falha ao carregar mensagens antigas:", err);
            mostrarToast("Não foi possível carregar mensagens mais antigas.", "aviso");
        } finally {
            carregandoHistoricoAntigo = false;
            atualizarControleHistoricoAntigo();
        }
    }

    // =========================================================================
    // CARREGAMENTO DE LAUDO
    // =========================================================================

    async function carregarLaudoPorId(laudoId, opts = {}) {
        const { silencioso = false, forcar = false } = opts;

        const alvo = Number(laudoId);
        if (!Number.isFinite(alvo) || alvo <= 0) return false;

        if (iaRespondendo) {
            if (!silencioso) {
                mostrarToast("Aguarde a IA terminar antes de trocar de laudo.", "aviso");
            }
            return false;
        }

        if (!forcar && laudoAtualId != null && Number(laudoAtualId) === alvo) {
            return true;
        }

        const skeletonId = `skeleton-${Date.now()}`;

        try {
            resetarEstadoLocal({
                limparLaudoAtual: false,
                limparEntrada: true,
                limparMensagensVisuais: false,
            });

            _limparAreaMensagens();

            if (telaBoasVindas) {
                telaBoasVindas.style.display = "none";
            }

            const skeleton = document.createElement("div");
            skeleton.id = skeletonId;
            skeleton.className = "skeleton-carregamento";
            skeleton.setAttribute("aria-label", "Carregando conversa...");
            skeleton.innerHTML = `
                <div class="skeleton-linha"></div>
                <div class="skeleton-linha sk-curta"></div>
                <div class="skeleton-linha"></div>
                <div class="skeleton-linha sk-media"></div>
            `;
            areaMensagens?.appendChild(skeleton);
            _autoScrollAtivo = true;
            rolarParaBaixo({ forcar: true });

            const pagina = await buscarPaginaHistoricoLaudo(alvo);
            document.getElementById(skeletonId)?.remove();

            laudoAtualId = alvo;
            historicoConversa = [];
            historicoLaudoPaginado = Array.isArray(pagina.itens) ? pagina.itens : [];
            cursorHistoricoProximo = pagina.cursor_proximo;
            temMaisHistorico = !!pagina.tem_mais;
            carregandoHistoricoAntigo = false;
            ultimoDiagnosticoBruto = "";
            arquivoPendente = null;
            imagemBase64Pendente = null;
            textoDocumentoPendente = null;
            nomeDocumentoPendente = null;
            emitirCardLaudo(pagina, { selecionar: false });
            emitirEstadoRelatorio({
                estado_normalizado: pagina?.estado ?? _estadoRelatorio,
                laudo_id: alvo,
                status_card: pagina?.status_card,
                permite_edicao: !!pagina?.permite_edicao,
                permite_reabrir: !!pagina?.permite_reabrir,
            });

            renderizarHistoricoCarregado({ rolarAoFinal: true });
            campoMensagem?.focus();
            return true;
        } catch (err) {
            document.getElementById(skeletonId)?.remove();
            log("error", `Erro ao carregar laudo ${alvo}:`, err);

            if (telaBoasVindas) {
                telaBoasVindas.style.removeProperty("display");
            }

            if (!silencioso) {
                if (String(err.message).includes("HTTP_404")) {
                    mostrarToast("Laudo não encontrado ou já removido.", "aviso");
                } else {
                    mostrarToast("Não foi possível carregar o histórico deste laudo.", "erro");
                }
            }

            return false;
        }
    }

    document.addEventListener("tariel:laudo-selecionado", async (e) => {
        const laudoId = e.detail?.laudoId;
        if (!laudoId) return;
        await carregarLaudoPorId(laudoId);
    });

    // =========================================================================
    // PROCESSAMENTO DE ENVIO
    // =========================================================================

    async function processarEnvio() {
        const texto = campoMensagem.value.trim();

        if (!texto && !arquivoPendente) return;
        if (iaRespondendo) return;

        if (texto.length > LIMITE_CHARS) {
            mostrarToast(`Mensagem muito longa. Máximo ${LIMITE_CHARS} caracteres.`, "aviso");
            return;
        }

        const setor = setorSelect?.value || "geral";

        if (telaBoasVindas) {
            telaBoasVindas.style.display = "none";
        }

        const sugestoesRapidas = document.getElementById("sugestoes-rapidas");
        if (sugestoesRapidas) {
            sugestoesRapidas.style.removeProperty("display");
        }

        const textoDocParaEnviar = textoDocumentoPendente;
        const nomeDocParaEnviar = nomeDocumentoPendente;
        const tmpId = `tmp-${Date.now()}`;

        adicionarMensagemInspetor(texto, imagemBase64Pendente, nomeDocParaEnviar, tmpId);

        const textoHistorico = texto || (nomeDocParaEnviar ? `[Documento: ${nomeDocParaEnviar}]` : "");
        if (textoHistorico) {
            adicionarAoHistorico("usuario", textoHistorico);
        }

        const imagemParaEnviar = imagemBase64Pendente;

        campoMensagem.value = "";
        campoMensagem.style.height = "auto";
        limparBackdropEntrada();
        dispararInputCampo();

        ChatNetwork.limparPreview();
        atualizarContadorChars();
        atualizarEstadoBotao();

        await ChatNetwork.enviarParaIA(
            texto,
            imagemParaEnviar,
            setor,
            textoDocParaEnviar,
            nomeDocParaEnviar,
            tmpId,
            false
        );
    }

    // =========================================================================
    // INTERAÇÃO DO USUÁRIO
    // =========================================================================

    campoMensagem.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = `${Math.min(this.scrollHeight, 200)}px`;
        atualizarEstadoBotao();
        atualizarContadorChars();
    });

    campoMensagem.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey && !iaRespondendo) {
            e.preventDefault();
            processarEnvio();
        }
    });

    btnEnviar.addEventListener("click", () => {
        if (!iaRespondendo) {
            processarEnvio();
        }
    });

    areaMensagens?.addEventListener(
        "scroll",
        () => {
            _autoScrollAtivo = chatEstaProximoDoFim();
            atualizarVisibilidadeBotaoIrFim();
        },
        { passive: true }
    );

    btnIrFimChat?.addEventListener("click", () => {
        _autoScrollAtivo = true;
        rolarParaBaixo({ suave: true, forcar: true });

        try {
            campoMensagem?.focus({ preventScroll: true });
        } catch (_) {
            campoMensagem?.focus();
        }
    });

    // =========================================================================
    // DRAG & DROP / ANEXOS / PASTE
    // =========================================================================

    function temArquivosNoDrag(e) {
        try {
            const types = e.dataTransfer?.types;
            if (!types) return false;
            return Array.from(types).includes("Files");
        } catch (_) {
            return false;
        }
    }

    window.addEventListener("dragenter", (e) => {
        if (!temArquivosNoDrag(e)) return;
        e.preventDefault();
        contadorArraste++;
        camadaArraste?.classList.add("ativo");
    });

    window.addEventListener("dragleave", () => {
        contadorArraste = Math.max(0, contadorArraste - 1);
        if (contadorArraste === 0) {
            camadaArraste?.classList.remove("ativo");
        }
    });

    window.addEventListener("dragover", (e) => {
        e.preventDefault();
    });

    window.addEventListener("drop", (e) => {
        e.preventDefault();
        contadorArraste = 0;
        camadaArraste?.classList.remove("ativo");

        const arquivo = e.dataTransfer?.files?.[0];
        if (arquivo) {
            ChatNetwork.prepararArquivoParaEnvio(arquivo);
        }
    });

    let ultimoCliqueSeletorAnexoTs = 0;
    let timeoutResetSeletorAnexo = 0;

    function resetarBloqueioSeletorAnexo() {
        ultimoCliqueSeletorAnexoTs = 0;

        if (timeoutResetSeletorAnexo) {
            window.clearTimeout(timeoutResetSeletorAnexo);
            timeoutResetSeletorAnexo = 0;
        }
    }

    function programarResetSeletorAnexo() {
        if (timeoutResetSeletorAnexo) {
            window.clearTimeout(timeoutResetSeletorAnexo);
        }

        timeoutResetSeletorAnexo = window.setTimeout(() => {
            resetarBloqueioSeletorAnexo();
        }, 1200);
    }

    window.addEventListener("focus", () => {
        resetarBloqueioSeletorAnexo();
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            resetarBloqueioSeletorAnexo();
        }
    });

    if (btnAnexo && !btnAnexo.dataset.anexoBindSource) {
        btnAnexo.dataset.anexoBindSource = "api";
        btnAnexo.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            const agora = Date.now();
            if ((agora - ultimoCliqueSeletorAnexoTs) < 700) {
                return;
            }

            ultimoCliqueSeletorAnexoTs = agora;
            programarResetSeletorAnexo();
            inputAnexo?.click();
        });
    }

    if (inputAnexo && !inputAnexo.dataset.anexoBindSource) {
        inputAnexo.dataset.anexoBindSource = "api";
        inputAnexo.addEventListener("change", function () {
            resetarBloqueioSeletorAnexo();
            if (this.files?.[0]) {
                ChatNetwork.prepararArquivoParaEnvio(this.files[0]);
            }
            this.value = "";
        });
    }

    document.addEventListener("paste", (e) => {
        const itens = e.clipboardData?.items;
        if (!itens) return;

        for (const item of itens) {
            if (item.type.startsWith("image/")) {
                e.preventDefault();
                const arquivo = item.getAsFile();
                if (arquivo) {
                    ChatNetwork.prepararArquivoParaEnvio(arquivo);
                }
                campoMensagem.focus();
                break;
            }
        }
    });

    // =========================================================================
    // CICLO DE VIDA
    // =========================================================================

    window.addEventListener("pagehide", () => {
        controllerStream?.abort();
        controllerStream = null;
    });

    // =========================================================================
    // INICIALIZAÇÃO
    // =========================================================================

    inicializarBuscaHistorico();
    atualizarEstadoBotao();
    atualizarContadorChars();
    _autoScrollAtivo = chatEstaProximoDoFim();
    atualizarVisibilidadeBotaoIrFim();

    sincronizarEstadoRelatorioWrapper().catch((err) => {
        log("warn", "Falha ao sincronizar estado inicial do relatório.", err);
    });

    document.body.dataset.apiEvents = "wired";
})();
