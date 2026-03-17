// ==========================================
// TARIEL.IA — CHAT_PAINEL_CORE.JS
// Papel: núcleo compartilhado do chat.
// Responsável por:
// - namespace global do painel
// - estado central compartilhado
// - helpers DOM / URL / storage / CSRF
// - boot tasks
// - integração entre render e network
// - utilitários usados pelos módulos do chat
// ==========================================

(function () {
    "use strict";

    if (window.__TARIEL_CHAT_PAINEL_CORE_WIRED__) return;
    window.__TARIEL_CHAT_PAINEL_CORE_WIRED__ = true;

    const EM_PRODUCAO =
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1";

    const NS = window.TarielChatPainel || {};
    const BOOT_TASKS = [];
    let bootExecutado = false;

    const CONFIG = {
        EM_PRODUCAO,
        CSRF_TOKEN: document.querySelector('meta[name="csrf-token"]')?.content ?? "",
        KEY_LAUDO_ATUAL: "tariel_laudo_atual",
        ATALHO_MESA_AVALIADORA: "@insp ",
        BOOT_RETRIES_MAX: 40,
        BOOT_RETRY_MS: 100,
        FAILSAFE_FINALIZACAO_MS: 15000,
    };

    const STATE = {
        observerHistorico: null,
        timerFailsafeFinalizacao: null,

        laudoAtualId: null,
        estadoRelatorio: "sem_relatorio",
        historicoConversa: [],
        ultimoDiagnosticoBruto: "",
        iaRespondendo: false,

        arquivoPendente: null,
        imagemBase64Pendente: null,
        textoDocumentoPendente: null,
        nomeDocumentoPendente: null,
        controllerStream: null,

        modoAtual: "detalhado",

        instances: {
            render: null,
            api: null,
        },

        flags: {
            popStateBound: false,
            historicoActionsBound: false,
            mesaHooksBound: false,
            apiInicializada: false,
            renderInicializado: false,
        },
    };

    // =========================================================
    // LOG / HELPERS BÁSICOS
    // =========================================================

    function log(nivel, ...args) {
        if (CONFIG.EM_PRODUCAO && nivel !== "error") return;

        try {
            (console?.[nivel] ?? console?.log)?.call(
                console,
                "[Tariel ChatPainel]",
                ...args
            );
        } catch (_) {}
    }

    function qs(seletor, root = document) {
        return root.querySelector(seletor);
    }

    function qsa(seletor, root = document) {
        return Array.from(root.querySelectorAll(seletor));
    }

    function escapeSel(valor) {
        try {
            return CSS.escape(String(valor));
        } catch (_) {
            return String(valor).replace(/["\\]/g, "\\$&");
        }
    }

    function normalizarEstadoRelatorio(valor) {
        const estado = String(valor || "").trim().toLowerCase();

        if (estado === "relatorioativo" || estado === "relatorio_ativo") {
            return "relatorio_ativo";
        }

        if (estado === "semrelatorio" || estado === "sem_relatorio") {
            return "sem_relatorio";
        }

        if (estado === "aguardando" || estado === "aguardando_avaliacao") {
            return "aguardando";
        }

        return estado || "sem_relatorio";
    }

    function normalizarLaudoId(valor) {
        const id = Number(valor);
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    // =========================================================
    // DADOS GLOBAIS / USUÁRIO / EMPRESA
    // =========================================================

    function obterNomeUsuario() {
        return (
            window.TARIEL?.usuario ||
            qs("#nome-usuario")?.textContent?.trim() ||
            document.body.dataset.nomeUsuario ||
            "Inspetor"
        );
    }

    function obterNomeEmpresa() {
        return (
            window.TARIEL?.empresa ||
            qs(".info-usuario")?.textContent?.trim() ||
            document.body.dataset.nomeEmpresa ||
            "Sua empresa"
        );
    }

    function obterUltimaMensagemUsuario() {
        const historico = Array.isArray(STATE.historicoConversa)
            ? [...STATE.historicoConversa]
            : [];

        for (let i = historico.length - 1; i >= 0; i--) {
            const item = historico[i];
            if (String(item?.papel || "").toLowerCase() === "usuario") {
                return String(item?.texto || "");
            }
        }

        return "";
    }

    // =========================================================
    // URL / STORAGE / HISTÓRICO
    // =========================================================

    function obterLaudoIdDaURL() {
        try {
            return new URL(window.location.href).searchParams.get("laudo") || "";
        } catch (_) {
            return "";
        }
    }

    function obterLaudoPersistido() {
        try {
            return localStorage.getItem(CONFIG.KEY_LAUDO_ATUAL) || "";
        } catch (_) {
            return "";
        }
    }

    function persistirLaudoAtual(laudoId) {
        try {
            if (laudoId) {
                localStorage.setItem(CONFIG.KEY_LAUDO_ATUAL, String(laudoId));
            } else {
                localStorage.removeItem(CONFIG.KEY_LAUDO_ATUAL);
            }
        } catch (_) {}
    }

    function definirLaudoIdNaURL(laudoId, opts = {}) {
        const { replace = false } = opts;

        try {
            const url = new URL(window.location.href);
            const atual = url.searchParams.get("laudo") || "";
            const proximo = laudoId ? String(laudoId) : "";

            if (atual === proximo) return;

            if (proximo) {
                url.searchParams.set("laudo", proximo);
            } else {
                url.searchParams.delete("laudo");
            }

            const metodo = replace ? "replaceState" : "pushState";
            history[metodo]({ laudoId: proximo || null }, "", url.toString());
        } catch (erro) {
            log("warn", "Falha ao atualizar URL:", erro);
        }
    }

    function getItemHistoricoPorId(laudoId) {
        if (!laudoId) return null;

        return document.querySelector(
            `.item-historico[data-laudo-id="${escapeSel(laudoId)}"]`
        );
    }

    function obterTituloLaudo(laudoId) {
        const item = getItemHistoricoPorId(laudoId);
        if (!item) return "";

        const alvo =
            item.querySelector(".texto-laudo-historico span:first-child") ||
            item.querySelector(".texto-laudo-historico") ||
            item.querySelector(".nome-laudo") ||
            item;

        return (alvo.textContent || "").trim();
    }

    function limparSelecaoAtual() {
        qsa(".item-historico").forEach((el) => {
            el.classList.remove("ativo");
            el.removeAttribute("aria-current");
        });
    }

    // =========================================================
    // TOAST
    // =========================================================

    function toast(msg, tipo = "info", ms = 3000) {
        if (typeof window.exibirToast === "function") {
            return window.exibirToast(msg, tipo, ms);
        }

        if (typeof window.mostrarToast === "function") {
            return window.mostrarToast(msg, tipo, ms);
        }

        log("log", `[toast:${tipo}] ${msg}`);
    }

    // =========================================================
    // ELEMENTOS DA TELA
    // =========================================================

    function obterCampoMensagem() {
        return document.getElementById("campo-mensagem");
    }

    function obterBotaoEnviar() {
        return document.getElementById("btn-enviar");
    }

    function obterPreviewContainer() {
        return document.getElementById("preview-anexo");
    }

    function obterInputAnexo() {
        return document.getElementById("input-anexo");
    }

    function obterTelaBoasVindas() {
        return document.getElementById("tela-boas-vindas");
    }

    function obterSetorSelect() {
        return document.getElementById("setor-industrial");
    }

    function obterAreaMensagens() {
        return document.getElementById("area-mensagens");
    }

    function obterRodapeEntrada() {
        return document.querySelector(".rodape-entrada");
    }

    function obterIndicadorDigitando() {
        return document.getElementById("indicador-digitando");
    }

    function preencherCampoMensagem(texto = "", focar = true) {
        const campo = obterCampoMensagem();
        if (!campo) return;

        campo.value = String(texto || "");
        campo.dispatchEvent(new Event("input", { bubbles: true }));
        campo.dispatchEvent(new Event("change", { bubbles: true }));

        if (focar) {
            try {
                campo.focus({ preventScroll: true });
            } catch (_) {
                campo.focus();
            }

            const fim = campo.value.length;
            if (typeof campo.setSelectionRange === "function") {
                campo.setSelectionRange(fim, fim);
            }
        }
    }

    // =========================================================
    // RODAPÉ / FINALIZAÇÃO
    // =========================================================

    function setRodapeBloqueado(ativo) {
        const rodape = obterRodapeEntrada();
        if (!rodape) return;

        rodape.style.opacity = ativo ? "0.5" : "1";
        rodape.style.pointerEvents = ativo ? "none" : "all";
        rodape.setAttribute("aria-busy", String(!!ativo));
    }

    function limparFailsafeFinalizacao() {
        if (STATE.timerFailsafeFinalizacao) {
            clearTimeout(STATE.timerFailsafeFinalizacao);
            STATE.timerFailsafeFinalizacao = null;
        }
    }

    function agendarFailsafeFinalizacao() {
        limparFailsafeFinalizacao();

        STATE.timerFailsafeFinalizacao = setTimeout(() => {
            document.body.dataset.finalizandoLaudo = "false";
            setRodapeBloqueado(false);
        }, CONFIG.FAILSAFE_FINALIZACAO_MS);
    }

    // =========================================================
    // FETCH / CSRF / SANITIZAÇÃO
    // =========================================================

    async function fetchJSON(url, opts = {}) {
        const headers = new Headers(opts.headers || {});

        if (CONFIG.CSRF_TOKEN && !headers.has("X-CSRF-Token")) {
            headers.set("X-CSRF-Token", CONFIG.CSRF_TOKEN);
        }

        if (!headers.has("Accept")) {
            headers.set("Accept", "application/json");
        }

        const resp = await fetch(url, {
            credentials: "same-origin",
            ...opts,
            headers,
        });

        let dados = null;

        try {
            dados = await resp.json();
        } catch (_) {
            dados = null;
        }

        if (!resp.ok) {
            const detalhe =
                dados?.detail ||
                dados?.erro ||
                dados?.message ||
                `HTTP_${resp.status}`;

            throw new Error(detalhe);
        }

        return dados;
    }

    function escaparHTML(valor) {
        return String(valor ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function validarPrefixoBase64(valor) {
        const texto = String(valor || "").trim();
        if (!texto) return "";

        if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(texto)) {
            return texto;
        }

        return "";
    }

    function sanitizarSetor(valor) {
        const texto = String(valor || "").trim().toLowerCase();
        return texto || "geral";
    }

    function comCabecalhoCSRF(headers = {}) {
        const saida = { ...headers };

        if (CONFIG.CSRF_TOKEN && !saida["X-CSRF-Token"]) {
            saida["X-CSRF-Token"] = CONFIG.CSRF_TOKEN;
        }

        return saida;
    }

    function criarFormDataComCSRF() {
        const form = new FormData();

        if (CONFIG.CSRF_TOKEN) {
            form.append("csrf_token", CONFIG.CSRF_TOKEN);
        }

        return form;
    }

    // =========================================================
    // UI DE MENSAGENS
    // =========================================================

    function limparAreaMensagens() {
        const area = obterAreaMensagens();
        if (!area) return;

        qsa(
            [
                ".linha-mensagem",
                ".mensagem",
                ".skeleton-carregamento",
                ".bloco-texto-solto",
                ".mensagem-boas-vindas",
            ].join(", "),
            area
        ).forEach((el) => el.remove());
    }

    function limparHistoricoChat() {
        STATE.historicoConversa = [];
    }

    function mostrarDigitando() {
        const indicador = obterIndicadorDigitando();

        document.body.dataset.iaRespondendo = "true";

        if (indicador) {
            indicador.classList.add("visivel");
            indicador.setAttribute("aria-hidden", "false");
        }

        rolarParaBaixo();
    }

    function ocultarDigitando() {
        const indicador = obterIndicadorDigitando();

        document.body.dataset.iaRespondendo = "false";

        if (indicador) {
            indicador.classList.remove("visivel");
            indicador.setAttribute("aria-hidden", "true");
        }
    }

    function rolarParaBaixo() {
        const area = obterAreaMensagens();
        if (!area) return;

        area.scrollTop = area.scrollHeight;
    }

    function atualizarContadorChars() {
        const campo = obterCampoMensagem();
        const contador =
            document.getElementById("contador-chars") ||
            document.querySelector("[data-contador-chars]");

        if (!campo || !contador) return;

        const total = String(campo.value || "").length;
        contador.textContent = String(total);
        contador.classList.toggle("contador-alerta", total >= 7000);
    }

    function atualizarTiquesStatus(tmpId, status) {
        if (!tmpId) return;

        const alvo =
            document.querySelector(`[data-mensagem-id="${escapeSel(tmpId)}"]`) ||
            document.querySelector(`[data-tmp-id="${escapeSel(tmpId)}"]`);

        if (!alvo) return;

        const tiques = alvo.querySelector(".tiques-status");
        if (!tiques) return;

        tiques.classList.remove("status-enviado", "status-entregue", "status-lido");

        if (status) {
            tiques.classList.add(`status-${status}`);
            alvo.dataset.statusEntrega = String(status);
        }
    }

    function atualizarEstadoBotao() {
        const campo = obterCampoMensagem();
        const btn = obterBotaoEnviar();

        if (!btn) return;

        const temTexto = !!String(campo?.value || "").trim();
        const temArquivo = !!STATE.arquivoPendente;
        const temDocumento = !!String(STATE.textoDocumentoPendente || "").trim();
        const bloqueado = !!STATE.iaRespondendo;

        btn.disabled = bloqueado || (!temTexto && !temArquivo && !temDocumento);
        btn.classList.toggle("destaque", !btn.disabled);
    }

    function adicionarAoHistorico(papelEntrada, conteudo) {
        const papel =
            String(papelEntrada || "").trim().toLowerCase() === "assistente"
                ? "assistente"
                : "usuario";

        const texto = String(conteudo || "").trim();
        if (!texto) return;

        STATE.historicoConversa.push({ papel, texto });

        if (STATE.historicoConversa.length > 50) {
            STATE.historicoConversa = STATE.historicoConversa.slice(-50);
        }
    }

    function obterHistoricoNormalizado() {
        return Array.isArray(STATE.historicoConversa)
            ? STATE.historicoConversa.map((item) => ({
                  papel:
                      String(item?.papel || item?.role || "").trim().toLowerCase() === "assistente"
                          ? "assistente"
                          : "usuario",
                  texto: String(item?.texto || item?.content || ""),
              }))
            : [];
    }

    // =========================================================
    // BOOT TASKS / EVENTOS
    // =========================================================

    function registrarBootTask(nome, fn) {
        if (typeof fn !== "function") return;
        BOOT_TASKS.push({ nome, fn });
    }

    function executarBootTasks() {
        if (bootExecutado) return;
        bootExecutado = true;

        for (const task of BOOT_TASKS) {
            try {
                task.fn();
            } catch (erro) {
                log("error", `Falha no boot task "${task.nome}":`, erro);
            }
        }

        document.documentElement.dataset.chatPainelCore = "ready";
        log("info", "Core pronto.");
    }

    function onReady(fn) {
        if (typeof fn !== "function") return;

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn, { once: true });
        } else {
            fn();
        }
    }

    function emitir(nome, detail = {}) {
        document.dispatchEvent(
            new CustomEvent(nome, {
                detail,
                bubbles: true,
            })
        );
    }

    // =========================================================
    // INTEGRAÇÃO COM CHAT-RENDER
    // =========================================================

    function inicializarRenderChat() {
        if (STATE.flags.renderInicializado && STATE.instances.render) {
            return STATE.instances.render;
        }

        if (typeof window.TarielChatRender !== "function") {
            log("warn", "TarielChatRender ainda não está disponível.");
            return null;
        }

        const areaMensagens = obterAreaMensagens();
        if (!areaMensagens) {
            log("warn", "Área de mensagens não encontrada para inicializar render.");
            return null;
        }

        try {
            const render = window.TarielChatRender({
                areaMensagens,
                escapeHTML: escaparHTML,
                mostrarToast: toast,
                validarPrefixoBase64,
                rolarParaBaixo,
                getNomeUsuario: obterNomeUsuario,
                getNomeEmpresa: obterNomeEmpresa,
                getUltimoDiagnosticoBruto: () => STATE.ultimoDiagnosticoBruto,
                getHistoricoConversa: () => STATE.historicoConversa,
                getIaRespondendo: () => STATE.iaRespondendo,
                getEstadoRelatorio: () => STATE.estadoRelatorio,
                getSetorAtual: () => obterSetorSelect()?.value || "geral",
                getUltimaMensagemUsuario: obterUltimaMensagemUsuario,
                preencherCampoMensagem,
                enviarParaIA: (...args) => window.TarielAPI?.enviarParaIA?.(...args),
                finalizarRelatorio: (...args) =>
                    window.TarielAPI?.finalizarRelatorio?.(...args) ||
                    window.finalizarInspecaoCompleta?.(...args),
                enviarFeedback: (...args) => window.TarielAPI?.enviarFeedback?.(...args),
                gerarPDF: (...args) => window.TarielAPI?.gerarPDF?.(...args),
            });

            STATE.instances.render = render;
            STATE.flags.renderInicializado = true;

            log("info", "Render do chat inicializado com sucesso.");
            return render;
        } catch (erro) {
            log("error", "Falha ao inicializar TarielChatRender:", erro);
            return null;
        }
    }

    // =========================================================
    // INTEGRAÇÃO COM CHAT-NETWORK
    // =========================================================

    function inicializarApiChat() {
        if (STATE.flags.apiInicializada && STATE.instances.api) {
            return STATE.instances.api;
        }

        if (window.TarielAPI) {
            STATE.instances.api = window.TarielAPI;
            STATE.flags.apiInicializada = true;
            document.body.dataset.apiEvents = "wired";
            log("info", "TarielAPI conectada via bootstrap primário (api.js).");
            return window.TarielAPI;
        }

        log("warn", "TarielAPI ainda não disponível. Aguardando bootstrap primário (api.js).");
        return null;
    }

    function destruirInstanciasChat() {
        try {
            STATE.instances.render?.destruir?.();
        } catch (erro) {
            log("warn", "Falha ao destruir render:", erro);
        }

        try {
            STATE.instances.api?.destruir?.();
        } catch (erro) {
            log("warn", "Falha ao destruir API:", erro);
        }

        STATE.instances.render = null;
        STATE.instances.api = null;
        STATE.flags.renderInicializado = false;
        STATE.flags.apiInicializada = false;
    }

    // =========================================================
    // REGISTRO DE BOOT
    // =========================================================

    registrarBootTask("api-chat", inicializarApiChat);

    document.addEventListener("tariel:api-pronta", () => {
        inicializarApiChat();
    });

    // =========================================================
    // EXPORT DO NAMESPACE
    // =========================================================

    Object.assign(NS, {
        config: CONFIG,
        state: STATE,

        log,
        qs,
        qsa,
        escapeSel,
        normalizarEstadoRelatorio,

        obterNomeUsuario,
        obterNomeEmpresa,
        obterUltimaMensagemUsuario,

        obterLaudoIdDaURL,
        obterLaudoPersistido,
        persistirLaudoAtual,
        definirLaudoIdNaURL,
        getItemHistoricoPorId,
        obterTituloLaudo,

        toast,
        obterCampoMensagem,
        obterBotaoEnviar,
        obterPreviewContainer,
        obterInputAnexo,
        obterTelaBoasVindas,
        obterSetorSelect,
        obterAreaMensagens,
        obterRodapeEntrada,
        obterIndicadorDigitando,
        preencherCampoMensagem,

        setRodapeBloqueado,
        limparFailsafeFinalizacao,
        agendarFailsafeFinalizacao,

        fetchJSON,
        limparSelecaoAtual,

        registrarBootTask,
        executarBootTasks,
        onReady,
        emitir,

        escaparHTML,
        validarPrefixoBase64,
        sanitizarSetor,
        comCabecalhoCSRF,
        criarFormDataComCSRF,

        limparAreaMensagens,
        limparHistoricoChat,
        mostrarDigitando,
        ocultarDigitando,
        rolarParaBaixo,
        atualizarContadorChars,
        atualizarTiquesStatus,
        atualizarEstadoBotao,
        adicionarAoHistorico,
        obterHistoricoNormalizado,

        inicializarRenderChat,
        inicializarApiChat,
        destruirInstanciasChat,
    });

    window.TarielChatPainel = NS;
})();
