// ==========================================
// TARIEL CONTROL TOWER — CHAT-NETWORK-UTILS.JS
// Utilitarios de estado/rede/eventos para chat-network.js
// ==========================================

(function () {
    "use strict";

    if (window.TarielChatNetworkUtilsFactory) return;

    window.TarielChatNetworkUtilsFactory = function TarielChatNetworkUtilsFactory(config = {}) {
        const {
            EVENTOS = {},
            comCabecalhoCSRF = (headers = {}) => headers,
            criarFormDataComCSRF = () => new FormData(),
            getEstadoRelatorio = () => "sem_relatorio",
            getModoAtual = () => "detalhado",
            getControllerStream = () => null,
            setControllerStream = () => {},
            getLaudoAtualId = () => null,
            setLaudoAtualId = () => {},
            setHistoricoConversa = () => {},
            setUltimoDiagnosticoBruto = () => {},
            setArquivoPendente = () => {},
            setImagemBase64Pendente = () => {},
            setTextoDocumentoPendente = () => {},
            setNomeDocumentoPendente = () => {},
            setIaRespondendo = () => {},
            ocultarDigitando = () => {},
            atualizarEstadoBotao = () => {},
            previewContainer = null,
            inputAnexo = null,
            documentRef = document,
            customEventCtor = window.CustomEvent,
        } = config;

        function limparTimeoutSeguro(timerId) {
            if (timerId) {
                clearTimeout(timerId);
            }
        }

        function obterDataAtualBR() {
            return new Date().toLocaleDateString("pt-BR");
        }

        function nomeArquivoLaudo(extensao) {
            return `LaudoTarielia-${obterDataAtualBR().replace(/\//g, "-")}.${extensao}`;
        }

        function remetenteEhEngenharia(remetente) {
            const valor = String(remetente || "").toLowerCase();
            return (
                valor.includes("engenh") ||
                valor.includes("mesa") ||
                valor.includes("revisor")
            );
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

            if (estado === "ajustes") {
                return "ajustes";
            }

            if (estado === "aprovado") {
                return "aprovado";
            }

            return estado || "sem_relatorio";
        }

        function estadoRelatorioAtivo(valor = getEstadoRelatorio()) {
            return normalizarEstadoRelatorio(valor) === "relatorio_ativo";
        }

        function estadoRelatorioLegacy(valor = getEstadoRelatorio()) {
            const estado = normalizarEstadoRelatorio(valor);
            if (estado === "relatorio_ativo") return "relatorioativo";
            if (estado === "sem_relatorio") return "semrelatorio";
            return estado;
        }

        function obterModoAtualSeguro() {
            const modo = String(getModoAtual?.() || "detalhado").trim().toLowerCase();

            if (
                modo === "curto" ||
                modo === "deepresearch" ||
                modo === "deep_research" ||
                modo === "detalhado"
            ) {
                return modo === "deep_research" ? "deepresearch" : modo;
            }

            return "detalhado";
        }

        function criarHeadersJSON(extra = {}) {
            return comCabecalhoCSRF({
                "Content-Type": "application/json",
                Accept: "application/json",
                ...extra,
            });
        }

        function criarHeadersSSE() {
            return comCabecalhoCSRF({
                "Content-Type": "application/json",
                Accept: "text/event-stream, application/json",
            });
        }

        function criarHeadersSemContentType(extra = {}) {
            return comCabecalhoCSRF({
                Accept: "application/json",
                ...extra,
            });
        }

        function criarFormDataSeguro() {
            try {
                return criarFormDataComCSRF();
            } catch (_) {
                return new FormData();
            }
        }

        function extrairPayloadErroJSON(dados) {
            if (dados == null) return null;
            if (dados?.detail !== undefined) return dados.detail;
            return dados;
        }

        function normalizarDetalheGateQualidade(payload, extras = {}) {
            const detalhe = payload && typeof payload === "object" ? payload : {};

            return {
                codigo: String(detalhe.codigo || "GATE_QUALIDADE_REPROVADO"),
                aprovado: false,
                mensagem: String(
                    detalhe.mensagem ||
                        "Finalize bloqueado: faltam itens obrigatorios no checklist de qualidade."
                ),
                tipo_template: String(detalhe.tipo_template || detalhe.tipoTemplate || "padrao"),
                template_nome: String(detalhe.template_nome || detalhe.templateNome || ""),
                resumo: detalhe.resumo && typeof detalhe.resumo === "object" ? detalhe.resumo : {},
                itens: Array.isArray(detalhe.itens) ? detalhe.itens : [],
                faltantes: Array.isArray(detalhe.faltantes) ? detalhe.faltantes : [],
                roteiro_template:
                    detalhe.roteiro_template && typeof detalhe.roteiro_template === "object"
                        ? detalhe.roteiro_template
                        : {},
                ...extras,
            };
        }

        async function extrairErroHTTPDetalhado(response) {
            const fallback = `HTTP_${response.status}`;

            try {
                const dados = await response.clone().json();
                const payload = extrairPayloadErroJSON(dados);

                let mensagem = fallback;
                if (typeof payload === "string" && payload.trim()) {
                    mensagem = payload.trim();
                } else if (payload && typeof payload === "object") {
                    mensagem = String(payload.mensagem || dados?.message || dados?.erro || fallback);
                } else if (typeof dados?.message === "string" && dados.message.trim()) {
                    mensagem = dados.message.trim();
                } else if (typeof dados?.erro === "string" && dados.erro.trim()) {
                    mensagem = dados.erro.trim();
                }

                const gateQualidade =
                    payload &&
                    typeof payload === "object" &&
                    String(payload.codigo || "").toUpperCase() === "GATE_QUALIDADE_REPROVADO"
                        ? normalizarDetalheGateQualidade(payload)
                        : null;

                return {
                    status: response.status,
                    mensagem,
                    payload,
                    gateQualidade,
                };
            } catch (_) {
                let texto = "";
                try {
                    texto = (await response.text()).trim();
                } catch (_) {
                    texto = "";
                }

                return {
                    status: response.status,
                    mensagem: texto || fallback,
                    payload: texto || null,
                    gateQualidade: null,
                };
            }
        }

        function emitirEvento(nomes, detail = {}) {
            const lista = Array.isArray(nomes) ? nomes : [nomes];

            lista.forEach((nome) => {
                documentRef.dispatchEvent(
                    new customEventCtor(nome, {
                        detail,
                        bubbles: true,
                    })
                );
            });
        }

        function emitirGateQualidadeFalhou(detail = {}) {
            emitirEvento(EVENTOS.GATE_QUALIDADE_FALHOU, detail);
        }

        function criarErroHttp(detalheErro) {
            const erro = new Error(String(detalheErro?.mensagem || "Falha HTTP"));
            erro.httpStatus = Number(detalheErro?.status || 0) || null;
            erro.httpPayload = detalheErro?.payload ?? null;
            erro.gateQualidade = detalheErro?.gateQualidade ?? null;
            return erro;
        }

        async function extrairMensagemErroHTTP(response) {
            const detalhe = await extrairErroHTTPDetalhado(response);
            return detalhe.mensagem;
        }

        function tratarGateQualidadeErroHTTP(detalheErro, extras = {}) {
            if (!detalheErro?.gateQualidade) return false;
            emitirGateQualidadeFalhou(normalizarDetalheGateQualidade(detalheErro.gateQualidade, extras));
            return true;
        }

        function emitirLaudoCriado(laudoId) {
            if (!laudoId) return;
            emitirEvento(EVENTOS.LAUDO_CRIADO, { laudoId: Number(laudoId) });
        }

        function emitirRelatorioIniciado(laudoId, tipoTemplate) {
            if (!laudoId) return;
            emitirEvento(EVENTOS.RELATORIO_INICIADO, {
                laudoId: Number(laudoId),
                tipoTemplate: String(tipoTemplate || "padrao"),
            });
        }

        function emitirRelatorioFinalizado(laudoId) {
            if (!laudoId) return;
            emitirEvento(EVENTOS.RELATORIO_FINALIZADO, { laudoId: Number(laudoId) });
        }

        function emitirRelatorioCancelado(laudoId = null) {
            emitirEvento(EVENTOS.RELATORIO_CANCELADO, {
                laudoId: laudoId ? Number(laudoId) : null,
            });
        }

        function emitirStatusMesa(status, detail = {}) {
            emitirEvento(EVENTOS.MESA_STATUS, {
                status: String(status || "").trim().toLowerCase() || "pronta",
                ...detail,
            });
        }

        function abortarStreamAtivo() {
            const controller = getControllerStream?.();
            if (!controller) return;

            try {
                controller.abort();
            } catch (_) {}

            setControllerStream(null);
        }

        function notificarLaudoCriadoSeMudou(novoId) {
            const atual = getLaudoAtualId?.();
            const anterior = atual == null ? null : Number(atual);
            const proximo = novoId == null ? null : Number(novoId);

            if (!proximo) return;

            setLaudoAtualId(proximo);

            if (String(anterior || "") !== String(proximo)) {
                emitirLaudoCriado(proximo);
            }
        }

        function limparPreview() {
            setArquivoPendente(null);
            setImagemBase64Pendente(null);
            setTextoDocumentoPendente(null);
            setNomeDocumentoPendente(null);

            if (previewContainer) previewContainer.innerHTML = "";
            if (inputAnexo) inputAnexo.value = "";

            atualizarEstadoBotao();
        }

        function limparEstadoConversa(opcoes = {}) {
            const { limparLaudoAtual = false } = opcoes;

            abortarStreamAtivo();

            setHistoricoConversa([]);
            setUltimoDiagnosticoBruto("");
            setArquivoPendente(null);
            setImagemBase64Pendente(null);
            setTextoDocumentoPendente(null);
            setNomeDocumentoPendente(null);
            setIaRespondendo(false);

            if (limparLaudoAtual) {
                setLaudoAtualId(null);
            }

            if (previewContainer) previewContainer.innerHTML = "";
            if (inputAnexo) inputAnexo.value = "";

            ocultarDigitando();
            atualizarEstadoBotao();
        }

        function exibirBoasVindas() {
            const alvo = config.telaBoasVindas;
            if (alvo) {
                alvo.style.removeProperty("display");
            }
        }

        function ocultarBoasVindas() {
            const alvo = config.telaBoasVindas;
            if (alvo) {
                alvo.style.display = "none";
            }
        }

        return {
            limparTimeoutSeguro,
            obterDataAtualBR,
            nomeArquivoLaudo,
            remetenteEhEngenharia,
            normalizarEstadoRelatorio,
            estadoRelatorioAtivo,
            estadoRelatorioLegacy,
            obterModoAtualSeguro,
            criarHeadersJSON,
            criarHeadersSSE,
            criarHeadersSemContentType,
            criarFormDataSeguro,
            extrairErroHTTPDetalhado,
            extrairMensagemErroHTTP,
            criarErroHttp,
            tratarGateQualidadeErroHTTP,
            emitirEvento,
            emitirLaudoCriado,
            emitirRelatorioIniciado,
            emitirRelatorioFinalizado,
            emitirRelatorioCancelado,
            emitirStatusMesa,
            abortarStreamAtivo,
            notificarLaudoCriadoSeMudou,
            limparPreview,
            limparEstadoConversa,
            exibirBoasVindas,
            ocultarBoasVindas,
        };
    };
})();
