// ==========================================
// TARIEL.IA — CHAT-NETWORK.JS
// Camada de rede e orquestração do chat.
// Responsável por:
// - estado do relatório
// - SSE / stream de respostas
// - upload de imagem e documento
// - geração de PDF
// - envio de feedback
// - compatibilidade com legado
// ==========================================

(function () {
    "use strict";

    if (window.TarielChatNetwork) return;

    window.TarielChatNetwork = function TarielChatNetworkFactory(config = {}) {
        // =========================================================
        // CONFIGURAÇÃO INJETADA
        // =========================================================
        const {
            log = (...args) => console.log(...args),
            escapeHTML = (valor) => String(valor ?? ""),
            mostrarToast = () => {},
            validarPrefixoBase64 = (valor) => valor,
            sanitizarSetor = (valor) => valor || "geral",
            comCabecalhoCSRF = (headers = {}) => headers,
            criarFormDataComCSRF = () => new FormData(),

            campoMensagem = null,
            btnEnviar = null,
            previewContainer = null,
            inputAnexo = null,
            telaBoasVindas = null,
            setorSelect = null,

            getNomeUsuario = () => "Inspetor",
            getNomeEmpresa = () => "Sua empresa",

            getLaudoAtualId = () => null,
            setLaudoAtualId = () => {},

            getEstadoRelatorio = () => "sem_relatorio",
            setEstadoRelatorio = () => {},

            getHistoricoConversa = () => [],
            setHistoricoConversa = () => {},
            adicionarAoHistorico = () => {},

            getUltimoDiagnosticoBruto = () => "",
            setUltimoDiagnosticoBruto = () => {},

            getIaRespondendo = () => false,
            setIaRespondendo = () => {},

            getArquivoPendente = () => null,
            setArquivoPendente = () => {},

            getImagemBase64Pendente = () => null,
            setImagemBase64Pendente = () => {},

            getTextoDocumentoPendente = () => null,
            setTextoDocumentoPendente = () => {},

            getNomeDocumentoPendente = () => null,
            setNomeDocumentoPendente = () => {},

            getControllerStream = () => null,
            setControllerStream = () => {},

            limparHistoricoChat = () => {},
            limparAreaMensagens = () => {},
            mostrarDigitando = () => {},
            ocultarDigitando = () => {},
            rolarParaBaixo = () => {},
            atualizarEstadoBotao = () => {},
            atualizarContadorChars = () => {},
            atualizarTiquesStatus = () => {},

            criarBolhaIA = () => null,
            mostrarAcoesPosResposta = () => {},
            renderizarMarkdown = (texto) => escapeHTML(texto),
            renderizarCitacoes = () => {},
            renderizarConfiancaIA = () => {},

            getModoAtual = () => "detalhado",
        } = config;

        // =========================================================
        // CONSTANTES
        // =========================================================
        const MIME_DOCUMENTOS = new Set([
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ]);

        const MIME_IMAGENS = new Set([
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/gif",
        ]);

        const ROTAS = {
            CHAT: "/app/api/chat",
            STATUS_LAUDO: "/app/api/laudo/status",
            INICIAR_LAUDO: "/app/api/laudo/iniciar",
            CANCELAR_LAUDO: "/app/api/laudo/cancelar",
            UPLOAD_DOC: "/app/api/upload_doc",
            GERAR_PDF: "/app/api/gerar_pdf",
            FEEDBACK: "/app/api/feedback",
        };

        const EVENTOS = {
            LAUDO_CRIADO: ["tariel:laudo-criado", "tariellaudo-criado"],
            RELATORIO_INICIADO: ["tariel:relatorio-iniciado", "tarielrelatorio-iniciado"],
            RELATORIO_FINALIZADO: ["tariel:relatorio-finalizado", "tarielrelatorio-finalizado"],
            RELATORIO_CANCELADO: ["tariel:cancelar-relatorio", "tarielrelatorio-cancelado"],
            ESTADO_RELATORIO: ["tariel:estado-relatorio"],
            CMD_SISTEMA: ["tarieldisparar-comando-sistema", "tariel:disparar-comando-sistema"],
            MESA_STATUS: ["tariel:mesa-status", "tarielmesa-status"],
            GATE_QUALIDADE_FALHOU: [
                "tariel:gate-qualidade-falhou",
                "tarielgate-qualidade-falhou",
            ],
        };

        const LIMITE_DOC_BYTES = 15 * 1024 * 1024;
        const LIMITE_IMG_BYTES = 10 * 1024 * 1024;
        const TIMEOUT_STREAM_MS = 120000;
        const TIMEOUT_DOC_MS = 60000;
        const TIMEOUT_PDF_MS = 30000;

        // =========================================================
        // ESTADO INTERNO
        // =========================================================
        const estadoInterno = {
            comandoSistemaEmExecucao: false,
        };

        // =========================================================
        // HELPERS COMPARTILHADOS (UTIL MODULE)
        // =========================================================
        const criarUtils = window.TarielChatNetworkUtilsFactory;
        if (typeof criarUtils !== "function") {
            throw new Error("chat-network-utils.js nao carregado antes de chat-network.js");
        }

        const utils = criarUtils({
            EVENTOS,
            comCabecalhoCSRF,
            criarFormDataComCSRF,
            getEstadoRelatorio,
            getModoAtual,
            getControllerStream,
            setControllerStream,
            getLaudoAtualId,
            setLaudoAtualId,
            setHistoricoConversa,
            setUltimoDiagnosticoBruto,
            setArquivoPendente,
            setImagemBase64Pendente,
            setTextoDocumentoPendente,
            setNomeDocumentoPendente,
            setIaRespondendo,
            ocultarDigitando,
            atualizarEstadoBotao,
            previewContainer,
            inputAnexo,
            telaBoasVindas,
        });

        const {
            limparTimeoutSeguro,
            obterDataAtualBR,
            nomeArquivoLaudo,
            remetenteEhEngenharia,
            normalizarEstadoRelatorio,
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
        } = utils;

        // =========================================================
        // CHIP / PREVIEW DE DOCUMENTO
        // =========================================================
        function criarChipDocumento(id, nome, estado = "carregando") {
            const chip = document.createElement("div");
            chip.id = id;
            chip.className = "preview-item chip-documento-preview chip-doc-estado";
            chip.setAttribute("aria-label", `Documento ${nome}`);

            const icone = estado === "carregando" ? "hourglass_top" : "description";

            chip.innerHTML = `
                <span class="material-symbols-rounded chip-doc-icone" aria-hidden="true">${icone}</span>
                <span class="chip-doc-nome">${escapeHTML(nome)}</span>
                ${
                    estado === "carregando"
                        ? `<span class="chip-doc-status" aria-live="polite">Extraindo texto...</span>`
                        : `<button class="btn-remover-preview" aria-label="Remover documento" type="button">×</button>`
                }
            `;

            if (estado === "pronto") {
                chip.querySelector(".btn-remover-preview")?.addEventListener("click", limparPreview);
            }

            return chip;
        }

        function atualizarChipDocumento(chipId, nome, estado) {
            const antigo = document.getElementById(chipId);
            if (!antigo) return;

            antigo.replaceWith(criarChipDocumento(chipId, nome, estado));
        }

        // =========================================================
        // UPLOAD DE DOCUMENTO
        // =========================================================
        async function carregarDocumento(arquivo) {
            if (!arquivo) return null;

            limparPreview();

            const chipId = `doc-chip-${Date.now()}`;
            const chip = criarChipDocumento(chipId, arquivo.name, "carregando");

            previewContainer?.appendChild(chip);
            atualizarEstadoBotao();

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TIMEOUT_DOC_MS);

            try {
                const formData = criarFormDataSeguro();
                formData.append("arquivo", arquivo);

                const response = await fetch(ROTAS.UPLOAD_DOC, {
                    method: "POST",
                    signal: controller.signal,
                    credentials: "same-origin",
                    headers: criarHeadersSemContentType(),
                    body: formData,
                });

                limparTimeoutSeguro(timeout);

                if (!response.ok) {
                    throw new Error(await extrairMensagemErroHTTP(response));
                }

                const dados = await response.json();
                const textoExtraido = String(dados?.texto || "");

                if (!textoExtraido.trim()) {
                    throw new Error("Documento sem texto extraível.");
                }

                setTextoDocumentoPendente(textoExtraido);
                setNomeDocumentoPendente(arquivo.name);
                setArquivoPendente(arquivo);
                setImagemBase64Pendente(null);

                atualizarChipDocumento(chipId, arquivo.name, "pronto");
                atualizarEstadoBotao();
                campoMensagem?.focus();

                mostrarToast(
                    `${arquivo.name} carregado. ${dados?.chars ?? textoExtraido.length} caracteres extraídos.`,
                    "sucesso",
                    3000
                );

                return dados;
            } catch (erro) {
                limparTimeoutSeguro(timeout);
                chip.remove();

                setTextoDocumentoPendente(null);
                setNomeDocumentoPendente(null);
                setArquivoPendente(null);
                atualizarEstadoBotao();

                if (erro?.name === "AbortError") {
                    mostrarToast("Tempo esgotado ao carregar o documento.", "aviso");
                } else {
                    mostrarToast(`Falha ao carregar documento: ${erro.message}`, "erro");
                }

                log("error", "Erro no upload de documento:", erro);
                return null;
            }
        }

        function prepararArquivoParaEnvio(arquivo) {
            if (!arquivo) return;

            if (MIME_DOCUMENTOS.has(arquivo.type)) {
                if (arquivo.size > LIMITE_DOC_BYTES) {
                    mostrarToast("Documento muito grande, máx. 15 MB.", "aviso");
                    return;
                }

                carregarDocumento(arquivo);
                return;
            }

            if (!MIME_IMAGENS.has(arquivo.type)) {
                mostrarToast(
                    "Suporte a imagens PNG, JPG, WebP e documentos PDF, DOCX.",
                    "aviso"
                );
                return;
            }

            if (arquivo.size > LIMITE_IMG_BYTES) {
                mostrarToast("Imagem muito grande, máx. 10 MB.", "aviso");
                return;
            }

            limparPreview();

            const leitor = new FileReader();

            leitor.onload = (event) => {
                const resultado = event.target?.result;
                const base64Validado = validarPrefixoBase64(resultado);

                if (!base64Validado) {
                    mostrarToast("Arquivo inválido. Tente uma imagem diferente.", "erro");
                    return;
                }

                setArquivoPendente(arquivo);
                setImagemBase64Pendente(base64Validado);
                setTextoDocumentoPendente(null);
                setNomeDocumentoPendente(null);

                if (!previewContainer) {
                    atualizarEstadoBotao();
                    campoMensagem?.focus();
                    return;
                }

                previewContainer.innerHTML = "";

                const item = document.createElement("div");
                item.className = "preview-item";

                const thumb = document.createElement("img");
                thumb.src = base64Validado;
                thumb.alt = "Preview da evidência";
                thumb.className = "preview-thumb";

                const btnRemover = document.createElement("button");
                btnRemover.type = "button";
                btnRemover.className = "btn-remover-preview";
                btnRemover.setAttribute("aria-label", "Remover imagem");
                btnRemover.textContent = "×";
                btnRemover.addEventListener("click", limparPreview);

                item.appendChild(thumb);
                item.appendChild(btnRemover);
                previewContainer.appendChild(item);

                atualizarEstadoBotao();
                campoMensagem?.focus();
            };

            leitor.onerror = () => {
                mostrarToast("Erro ao ler o arquivo. Tente novamente.", "erro");
                log("error", "FileReader falhou ao processar imagem.");
            };

            leitor.readAsDataURL(arquivo);
        }

        // =========================================================
        // ESTADO DO RELATÓRIO
        // =========================================================
        async function sincronizarEstadoRelatorio() {
            try {
                const response = await fetch(ROTAS.STATUS_LAUDO, {
                    credentials: "same-origin",
                    headers: criarHeadersSemContentType(),
                });

                if (!response.ok) return null;

                const dados = await response.json();
                const estado = normalizarEstadoRelatorio(dados?.estado);
                const laudoIdSessao =
                    dados?.laudo_id ?? dados?.laudoId ?? dados?.laudoid ?? null;

                setEstadoRelatorio(estado);

                if (laudoIdSessao) {
                    setLaudoAtualId(Number(laudoIdSessao));
                } else if (estado === "sem_relatorio") {
                    setLaudoAtualId(null);
                }

                emitirEvento(EVENTOS.ESTADO_RELATORIO, {
                    ...dados,
                    estado,
                    laudoId: laudoIdSessao ? Number(laudoIdSessao) : null,
                });
                if (dados?.laudo_card?.id) {
                    emitirEvento("tariel:laudo-card-sincronizado", {
                        card: dados.laudo_card,
                        selecionar: false,
                    });
                }

                return {
                    ...dados,
                    estado,
                    laudo_id: laudoIdSessao ? Number(laudoIdSessao) : null,
                };
            } catch (erro) {
                log("warn", "Falha ao sincronizar estado do relatório:", erro);
                return null;
            }
        }

        async function consultarStatusRelatorioAtual() {
            try {
                const response = await fetch(ROTAS.STATUS_LAUDO, {
                    credentials: "same-origin",
                    headers: criarHeadersSemContentType(),
                });

                if (!response.ok) {
                    return {
                        estado: normalizarEstadoRelatorio(getEstadoRelatorio?.()),
                        laudoId: Number(getLaudoAtualId?.() || 0) || null,
                    };
                }

                const dados = await response.json();
                return {
                    estado: normalizarEstadoRelatorio(dados?.estado),
                    laudoId: Number(dados?.laudo_id ?? dados?.laudoId ?? dados?.laudoid ?? 0) || null,
                    permiteEdicao: !!dados?.permite_edicao,
                    permiteReabrir: !!dados?.permite_reabrir,
                };
            } catch (_) {
                return {
                    estado: normalizarEstadoRelatorio(getEstadoRelatorio?.()),
                    laudoId: Number(getLaudoAtualId?.() || 0) || null,
                    permiteEdicao: normalizarEstadoRelatorio(getEstadoRelatorio?.()) === "relatorio_ativo",
                    permiteReabrir: false,
                };
            }
        }

        async function iniciarRelatorio(tipoTemplate) {
            if (!tipoTemplate) return null;

            const form = criarFormDataSeguro();
            form.append("tipo_template", tipoTemplate);
            form.append("tipotemplate", tipoTemplate);

            try {
                const response = await fetch(ROTAS.INICIAR_LAUDO, {
                    method: "POST",
                    credentials: "same-origin",
                    headers: criarHeadersSemContentType(),
                    body: form,
                });

                if (!response.ok) {
                    throw new Error(await extrairMensagemErroHTTP(response));
                }

                const dados = await response.json();
                const laudoId =
                    Number(dados?.laudo_id ?? dados?.laudoId ?? dados?.laudoid ?? 0) || null;

                limparEstadoConversa({ limparLaudoAtual: false });
                limparAreaMensagens();
                ocultarBoasVindas();

                const estadoResposta = normalizarEstadoRelatorio(dados?.estado || "sem_relatorio");
                setEstadoRelatorio(estadoResposta);
                setLaudoAtualId(laudoId);

                if (estadoResposta === "relatorio_ativo") {
                    emitirRelatorioIniciado(laudoId, tipoTemplate);
                } else {
                    emitirLaudoCriado(laudoId);
                }

                mostrarToast(dados?.message ?? "Relatório iniciado!", "sucesso", 4000);
                log("info", `Relatório iniciado. tipo=${tipoTemplate} laudoId=${laudoId}`);

                return {
                    ...dados,
                    estado: estadoResposta,
                    laudo_id: laudoId,
                };
            } catch (erro) {
                mostrarToast(`Falha ao iniciar relatório: ${erro.message}`, "erro");
                log("error", "iniciarRelatorio:", erro);
                return null;
            }
        }

        async function finalizarRelatorioDireto() {
            const laudoId = Number(getLaudoAtualId?.() || 0) || null;

            if (!laudoId) {
                mostrarToast("Nenhum relatório ativo para finalizar.", "aviso");
                return null;
            }

            if (getIaRespondendo?.()) {
                mostrarToast("Aguarde a IA terminar antes de finalizar.", "aviso");
                return null;
            }

            const form = criarFormDataSeguro();

            try {
                const response = await fetch(`/app/api/laudo/${laudoId}/finalizar`, {
                    method: "POST",
                    credentials: "same-origin",
                    headers: criarHeadersSemContentType(),
                    body: form,
                });

                if (!response.ok) {
                    const detalheErro = await extrairErroHTTPDetalhado(response);
                    tratarGateQualidadeErroHTTP(detalheErro, {
                        origem: "finalizar-direto",
                        laudo_id: laudoId,
                    });
                    throw criarErroHttp(detalheErro);
                }

                const dados = await response.json();
                const estadoResposta = normalizarEstadoRelatorio(dados?.estado || "aguardando");
                setEstadoRelatorio(estadoResposta);
                setLaudoAtualId(laudoId);
                if (dados?.laudo_card?.id) {
                    emitirEvento("tariel:laudo-card-sincronizado", {
                        card: dados.laudo_card,
                        selecionar: true,
                    });
                }
                emitirRelatorioFinalizado(laudoId);

                mostrarToast(
                    dados?.message ?? "Relatório enviado para engenharia!",
                    "sucesso",
                    5000
                );

                return dados;
            } catch (erro) {
                mostrarToast(`Falha ao finalizar: ${erro.message}`, "erro");
                log("error", "finalizarRelatorioDireto:", erro);
                return null;
            }
        }

        async function finalizarViaComandoSistema(tipoTemplate = "padrao") {
            const laudoId = Number(getLaudoAtualId?.() || 0) || null;

            if (!laudoId) {
                mostrarToast("Nenhum relatório ativo para finalizar.", "aviso");
                return null;
            }

            if (getIaRespondendo?.()) {
                mostrarToast("Aguarde a IA terminar antes de finalizar.", "aviso");
                return null;
            }

            const comando = `COMANDO_SISTEMA FINALIZARLAUDOAGORA TIPO ${String(
                tipoTemplate || "padrao"
            ).trim().toLowerCase()}`;

            const resposta = await enviarParaIA(
                comando,
                null,
                "geral",
                null,
                null,
                null,
                true
            );

            if (!resposta?.ok) return null;
            await sincronizarEstadoRelatorio();
            emitirRelatorioFinalizado(laudoId);

            mostrarToast("Relatório enviado para engenharia!", "sucesso", 5000);

            return resposta;
        }

        async function finalizarRelatorio(opcoes = {}) {
            const tipoTemplate = opcoes?.tipoTemplate || window.tipoTemplateAtivo || "padrao";

            if (opcoes?.direto === true) {
                return finalizarRelatorioDireto();
            }

            return finalizarViaComandoSistema(tipoTemplate);
        }

        async function cancelarRelatorio() {
            const laudoIdAtual = Number(getLaudoAtualId?.() || 0) || null;
            const form = criarFormDataSeguro();

            try {
                const response = await fetch(ROTAS.CANCELAR_LAUDO, {
                    method: "POST",
                    credentials: "same-origin",
                    headers: criarHeadersSemContentType(),
                    body: form,
                });

                if (!response.ok) {
                    throw new Error(await extrairMensagemErroHTTP(response));
                }

                const dados = await response.json();

                setEstadoRelatorio("sem_relatorio");
                limparEstadoConversa({ limparLaudoAtual: true });
                limparAreaMensagens();
                exibirBoasVindas();
                emitirRelatorioCancelado(laudoIdAtual);

                mostrarToast(dados?.message ?? "Relatório cancelado.", "aviso", 3000);
                return dados;
            } catch (erro) {
                log("warn", "cancelarRelatorio:", erro);
                mostrarToast(`Falha ao cancelar relatório: ${erro.message}`, "erro", 3500);
                return null;
            }
        }

        // =========================================================
        // FEEDBACK E PDF
        // =========================================================
        async function enviarFeedback(tipo, textoBolha) {
            try {
                await fetch(ROTAS.FEEDBACK, {
                    method: "POST",
                    credentials: "same-origin",
                    headers: criarHeadersJSON(),
                    body: JSON.stringify({
                        tipo,
                        trecho: String(textoBolha || "").slice(0, 500),
                    }),
                });
            } catch (_) {}
        }

        function dispararDownload(blob, tipo, nomeArquivo) {
            const arquivo = blob instanceof Blob ? blob : new Blob([blob], { type: tipo });
            const url = URL.createObjectURL(arquivo);

            const link = document.createElement("a");
            link.href = url;
            link.download = nomeArquivo;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setTimeout(() => URL.revokeObjectURL(url), 10000);
        }

        async function gerarPDF() {
            const diagnostico = String(getUltimoDiagnosticoBruto?.() || "").trim();
            if (!diagnostico) return;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TIMEOUT_PDF_MS);

            try {
                const response = await fetch(ROTAS.GERAR_PDF, {
                    method: "POST",
                    signal: controller.signal,
                    credentials: "same-origin",
                    headers: criarHeadersJSON({
                        Accept: "application/pdf",
                    }),
                    body: JSON.stringify({
                        diagnostico,
                        inspetor: getNomeUsuario(),
                        empresa: getNomeEmpresa(),
                        setor: sanitizarSetor(setorSelect?.value || "geral"),
                        data: obterDataAtualBR(),
                        laudo_id: Number(getLaudoAtualId?.() || 0) || null,
                        tipo_template: String(window.tipoTemplateAtivo || "padrao").trim().toLowerCase(),
                    }),
                });

                limparTimeoutSeguro(timeout);

                if (!response.ok) {
                    throw new Error(await extrairMensagemErroHTTP(response));
                }

                const contentType = response.headers.get("content-type") || "";
                if (!contentType.includes("application/pdf")) {
                    throw new Error("RESPOSTA_NAO_PDF");
                }

                const blob = await response.blob();

                dispararDownload(blob, "application/pdf", nomeArquivoLaudo("pdf"));
            } catch (erro) {
                limparTimeoutSeguro(timeout);

                if (erro?.name === "AbortError") {
                    mostrarToast("A geração do PDF demorou muito. Tente novamente.", "aviso");
                    return;
                }

                log("warn", `PDF backend falhou (${erro.message}). Usando fallback TXT.`);

                const conteudo = [
                    "LAUDO TÉCNICO — TARIEL.IA",
                    `Inspetor: ${getNomeUsuario()}`,
                    `Empresa: ${getNomeEmpresa()}`,
                    `Setor: ${String(sanitizarSetor(setorSelect?.value || "geral")).toUpperCase()}`,
                    `Data: ${obterDataAtualBR()}`,
                    "-".repeat(60),
                    "",
                    diagnostico,
                ].join("\n");

                dispararDownload(
                    new Blob([conteudo], { type: "text/plain;charset=utf-8" }),
                    "text/plain",
                    nomeArquivoLaudo("txt")
                );

                mostrarToast("PDF indisponível. Laudo exportado como .txt.", "aviso", 5000);
            }
        }

        // =========================================================
        // RENDERIZAÇÃO DE ERRO
        // =========================================================
        function criarBolhaErro(mensagem, titulo = "Erro de conexão") {
            const bolha = criarBolhaIA(obterModoAtualSeguro());
            const texto = bolha?.querySelector(".texto-msg");
            const cursor = bolha?.querySelector(".cursor-piscando");

            cursor?.remove();

            if (texto) {
                texto.innerHTML = renderizarMarkdown(`**${titulo}**\n\n${mensagem}`);
            }

            return bolha;
        }

        function classificarErroChat(erro) {
            const textoErro = String(erro?.message || "").trim();
            const ehCodigoHttpCru = /^HTTP_\d+$/i.test(textoErro);

            let titulo = "Erro de conexão";
            let mensagem = "Não foi possível contactar o servidor. Tente novamente.";

            if (erro?.name === "AbortError") {
                return {
                    titulo: "Tempo limite",
                    mensagem: "Conexão encerrada. O tempo limite foi atingido.",
                };
            }

            if (textoErro && !ehCodigoHttpCru) {
                mensagem = textoErro;
            }

            const textoNormalizado = mensagem.toLowerCase();

            if (
                textoNormalizado.includes("use apenas o relatório ativo") ||
                textoNormalizado.includes("não pode receber novas mensagens") ||
                textoNormalizado.includes("não pode ser editado") ||
                textoNormalizado.includes("não pode ser excluído")
            ) {
                titulo = "Ação bloqueada";
            } else if (textoNormalizado.includes("csrf")) {
                titulo = "Sessão expirada";
            } else if (textoNormalizado.includes("acesso negado")) {
                titulo = "Permissão insuficiente";
            }

            return { titulo, mensagem };
        }

        function consumirObjetoHumano(objeto, tmpId, invisivel) {
            if (tmpId) atualizarTiquesStatus(tmpId, "lido");
            if (invisivel) return true;

            const remetente = String(objeto?.remetente || "").toLowerCase();
            const texto = String(objeto?.texto || "");
            const laudoId = Number(objeto?.laudo_id ?? objeto?.laudoId ?? getLaudoAtualId?.() ?? 0) || null;

            if (remetenteEhEngenharia(remetente) && typeof window.adicionarMensagemNaUI === "function") {
                window.adicionarMensagemNaUI(
                    "engenharia",
                    texto,
                    objeto?.tipo || "humanoeng",
                    {
                        mensagemId: Number(objeto?.mensagem_id ?? objeto?.id ?? 0) || null,
                        referenciaMensagemId: Number(objeto?.referencia_mensagem_id ?? 0) || null,
                    }
                );
                emitirStatusMesa("respondeu", {
                    origem: "mesa",
                    laudoId,
                    preview: texto.slice(0, 120),
                });
            } else {
                mostrarToast("Mensagem enviada para a mesa avaliadora.", "sucesso", 1800);
                emitirStatusMesa("aguardando", {
                    origem: "inspetor",
                    laudoId,
                    preview: texto.slice(0, 120),
                });
            }

            return true;
        }

        // =========================================================
        // RESPOSTA JSON DIRETA
        // =========================================================
        async function consumirRespostaJSON(response, opcoes = {}) {
            const {
                invisivel = false,
                tmpId = null,
                modoAtual = "detalhado",
            } = opcoes;

            const dados = await response.json();
            const texto = String(dados?.texto || dados?.mensagem || "");

            if (tmpId) {
                atualizarTiquesStatus(tmpId, "entregue");
            }

            ocultarDigitando();

            let elementoIA = null;
            let elementoTexto = null;

            if (!invisivel) {
                elementoIA = criarBolhaIA(modoAtual);
                elementoTexto = elementoIA?.querySelector(".texto-msg");
            }

            const laudoJson = dados?.laudo_id ?? dados?.laudoId ?? dados?.laudoid ?? null;
            if (laudoJson) {
                notificarLaudoCriadoSeMudou(Number(laudoJson));
            }
            if (dados?.laudo_card?.id) {
                emitirEvento("tariel:laudo-card-sincronizado", {
                    card: dados.laudo_card,
                    selecionar: true,
                });
            }

            if (!invisivel && elementoTexto) {
                elementoTexto.innerHTML = renderizarMarkdown(texto);
            }

            if (!invisivel) {
                setUltimoDiagnosticoBruto(texto);

                if (texto) {
                    adicionarAoHistorico("assistente", texto);
                }

                if (elementoIA) {
                    if (Array.isArray(dados?.citacoes) && dados.citacoes.length) {
                        renderizarCitacoes(elementoIA, dados.citacoes);
                    }
                    if (dados?.confianca_ia && typeof dados.confianca_ia === "object") {
                        renderizarConfiancaIA(elementoIA, dados.confianca_ia);
                    }

                    if (texto) {
                        mostrarAcoesPosResposta(elementoIA, texto);
                    }
                }
            }

            if (tmpId) {
                atualizarTiquesStatus(tmpId, "lido");
            }

            try {
                await sincronizarEstadoRelatorio();
            } catch (_) {}

            return {
                ok: true,
                texto,
                laudoId: getLaudoAtualId?.() || null,
                citacoes: Array.isArray(dados?.citacoes) ? dados.citacoes : [],
                confianca: dados?.confianca_ia && typeof dados.confianca_ia === "object" ? dados.confianca_ia : null,
            };
        }

        // =========================================================
        // ENVIO PRINCIPAL PARA IA
        // =========================================================
        async function enviarParaIA(
            mensagem,
            dadosImagem = null,
            setor = "geral",
            textoDocumento = null,
            nomeDocumento = null,
            tmpId = null,
            invisivel = false
        ) {
            if (!mensagem && !dadosImagem && !textoDocumento) return null;

            setIaRespondendo(true);
            atualizarEstadoBotao();

            if (!invisivel) {
                mostrarDigitando();
            }

            abortarStreamAtivo();

            const controller = new AbortController();
            setControllerStream(controller);

            const timeout = setTimeout(() => {
                try {
                    controller.abort();
                } catch (_) {}

                log("warn", "Stream SSE cancelado por timeout.");
            }, TIMEOUT_STREAM_MS);

            let elementoIA = null;
            let elementoTexto = null;
            let cursor = null;
            let textoAcumulado = "";
            let citacoesPendentes = [];
            let confiancaPendente = null;
            let streamCompleto = false;

            const modoAtual = obterModoAtualSeguro();

            try {
                const response = await fetch(ROTAS.CHAT, {
                    method: "POST",
                    signal: controller.signal,
                    credentials: "same-origin",
                    headers: criarHeadersSSE(),
                    body: JSON.stringify({
                        mensagem: mensagem || "",
                        dados_imagem: dadosImagem ? validarPrefixoBase64(dadosImagem) : "",
                        setor: sanitizarSetor(setor || "geral"),
                        historico: (getHistoricoConversa?.() || []).slice(-20),
                        modo: modoAtual,
                        texto_documento: textoDocumento || "",
                        nome_documento: nomeDocumento || "",
                        laudo_id: getLaudoAtualId?.() ? Number(getLaudoAtualId()) : null,
                    }),
                });

                limparTimeoutSeguro(timeout);

                if (!response.ok) {
                    const detalheErro = await extrairErroHTTPDetalhado(response);
                    tratarGateQualidadeErroHTTP(detalheErro, {
                        origem: "chat",
                        laudo_id: Number(getLaudoAtualId?.() || 0) || null,
                    });
                    throw criarErroHttp(detalheErro);
                }

                const contentType = response.headers.get("content-type") || "";

                if (
                    !contentType.includes("text/event-stream") &&
                    !contentType.includes("application/json")
                ) {
                    throw new Error("CONTENT_TYPE_INESPERADO");
                }

                if (contentType.includes("application/json")) {
                    return await consumirRespostaJSON(response, {
                        invisivel,
                        tmpId,
                        modoAtual,
                    });
                }

                if (tmpId) {
                    atualizarTiquesStatus(tmpId, "entregue");
                }

                ocultarDigitando();

                if (!invisivel) {
                    elementoIA = criarBolhaIA(modoAtual);
                    elementoTexto = elementoIA?.querySelector(".texto-msg");
                    cursor = elementoIA?.querySelector(".cursor-piscando");
                }

                const leitor = response.body?.getReader?.();
                if (!leitor) {
                    throw new Error("STREAM_INDISPONIVEL");
                }

                const decoder = new TextDecoder();
                let buffer = "";

                while (!streamCompleto) {
                    const { done, value } = await leitor.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const linhas = buffer.split(/\r?\n/);
                    buffer = linhas.pop() || "";

                    for (const linha of linhas) {
                        const dadoLimpo = linha.replace(/^data:\s?/, "").trim();
                        if (!dadoLimpo) continue;

                        if (dadoLimpo === "FIM" || dadoLimpo === "[FIM]") {
                            streamCompleto = true;
                            break;
                        }

                        let obj = null;

                        try {
                            obj = JSON.parse(dadoLimpo);
                        } catch (_) {
                            obj = { texto: dadoLimpo };
                        }

                        const laudoSSE = obj?.laudo_id ?? obj?.laudoId ?? obj?.laudoid ?? null;
                        if (laudoSSE) {
                            notificarLaudoCriadoSeMudou(Number(laudoSSE));
                        }
                        if (obj?.laudo_card?.id) {
                            emitirEvento("tariel:laudo-card-sincronizado", {
                                card: obj.laudo_card,
                                selecionar: true,
                            });
                        }

                        if (obj?.tipo && String(obj.tipo).startsWith("humano")) {
                            consumirObjetoHumano(obj, tmpId, invisivel);
                            continue;
                        }

                        if (Array.isArray(obj?.citacoes) && obj.citacoes.length) {
                            citacoesPendentes = obj.citacoes;

                            if (!invisivel && elementoIA) {
                                renderizarCitacoes(elementoIA, obj.citacoes);
                            }

                            continue;
                        }

                        if (obj?.confianca_ia && typeof obj.confianca_ia === "object") {
                            confiancaPendente = obj.confianca_ia;
                            if (!invisivel && elementoIA) {
                                renderizarConfiancaIA(elementoIA, obj.confianca_ia);
                            }
                            continue;
                        }

                        if (typeof obj?.texto === "string") {
                            textoAcumulado += obj.texto;

                            if (!invisivel && elementoTexto) {
                                elementoTexto.innerHTML = renderizarMarkdown(textoAcumulado);

                                if (cursor) {
                                    elementoTexto.appendChild(cursor);
                                }

                                rolarParaBaixo();
                            }
                        }
                    }
                }

                if (cursor) cursor.remove();

                if (!invisivel) {
                    setUltimoDiagnosticoBruto(textoAcumulado);

                    if (textoAcumulado) {
                        adicionarAoHistorico("assistente", textoAcumulado);
                    }

                    if (elementoIA && textoAcumulado) {
                        if (citacoesPendentes.length) {
                            renderizarCitacoes(elementoIA, citacoesPendentes);
                        }
                        if (confiancaPendente) {
                            renderizarConfiancaIA(elementoIA, confiancaPendente);
                        }

                        mostrarAcoesPosResposta(elementoIA, textoAcumulado);
                    }
                }

                if (tmpId) {
                    atualizarTiquesStatus(tmpId, "lido");
                }

                try {
                    await sincronizarEstadoRelatorio();
                } catch (_) {}

                return {
                    ok: true,
                    texto: textoAcumulado,
                    laudoId: getLaudoAtualId?.() || null,
                    citacoes: citacoesPendentes,
                    confianca: confiancaPendente,
                };
            } catch (erro) {
                limparTimeoutSeguro(timeout);
                ocultarDigitando();
                cursor?.remove();

                const { titulo, mensagem } = classificarErroChat(erro);

                if (!invisivel) {
                    if (elementoTexto) {
                        elementoTexto.innerHTML = renderizarMarkdown(
                            `**${titulo}**\n\n${mensagem}`
                        );
                    } else {
                        criarBolhaErro(mensagem, titulo);
                    }
                } else {
                    const mensagemErro = erro?.gateQualidade
                        ? String(erro?.message || "Gate de qualidade reprovado.")
                        : "Erro ao processar o comando do sistema.";
                    mostrarToast(mensagemErro, "erro");
                }

                log("error", "Erro no stream SSE:", erro);
                return null;
            } finally {
                limparTimeoutSeguro(timeout);
                ocultarDigitando();
                setControllerStream(null);
                setIaRespondendo(false);
                atualizarEstadoBotao();
                rolarParaBaixo();
            }
        }

        // =========================================================
        // COMANDO DE SISTEMA
        // =========================================================
        async function processarEventoComandoSistema(event) {
            const { comando, tipo } = event?.detail || {};
            const comandoNormalizado = String(comando || "").trim().toUpperCase();

            if (
                comandoNormalizado !== "FINALIZARLAUDOAGORA" &&
                comandoNormalizado !== "FINALIZAR_LAUDO_AGORA"
            ) {
                return;
            }

            if (estadoInterno.comandoSistemaEmExecucao) return;

            estadoInterno.comandoSistemaEmExecucao = true;

            try {
                await finalizarViaComandoSistema(tipo || "padrao");
            } finally {
                estadoInterno.comandoSistemaEmExecucao = false;
            }
        }

        // =========================================================
        // PROCESSAMENTO DE ENVIO
        // =========================================================
        async function processarEnvio() {
            const texto = String(campoMensagem?.value || "").trim();
            const imagemBase64Pendente = getImagemBase64Pendente?.();
            const textoDocumentoPendente = getTextoDocumentoPendente?.();
            const nomeDocumentoPendente = getNomeDocumentoPendente?.();

            const temTexto = !!texto;
            const temImagemPronta = !!imagemBase64Pendente;
            const temDocumentoPronto = !!textoDocumentoPendente;

            if (!temTexto && !temImagemPronta && !temDocumentoPronto) return null;
            if (getIaRespondendo?.()) return null;

            if (texto.length > 8000) {
                mostrarToast("Mensagem muito longa. Máximo 8000 caracteres.", "aviso");
                return null;
            }

            const statusRelatorio = await consultarStatusRelatorioAtual();
            const laudoSelecionado = Number(getLaudoAtualId?.() || 0) || null;

            if (
                laudoSelecionado &&
                (statusRelatorio.estado === "aguardando" ||
                    statusRelatorio.estado === "ajustes" ||
                    statusRelatorio.estado === "aprovado")
            ) {
                const mensagemBloqueio = statusRelatorio.estado === "ajustes"
                    ? "Este laudo precisa ser reaberto antes de continuar."
                    : statusRelatorio.estado === "aprovado"
                        ? "Este laudo já foi aprovado e está somente leitura."
                        : "Este laudo está aguardando avaliação e está somente leitura.";
                mostrarToast(mensagemBloqueio, "aviso", 4200);
                return null;
            }

            const setor = setorSelect?.value || "geral";
            ocultarBoasVindas();

            const tmpId = `tmp-${Date.now()}`;
            const imagemParaEnviar = imagemBase64Pendente;
            const textoDocParaEnviar = textoDocumentoPendente;
            const nomeDocParaEnviar = nomeDocumentoPendente;

            if (typeof window.adicionarMensagemInspetor === "function") {
                window.adicionarMensagemInspetor(
                    texto,
                    imagemParaEnviar,
                    nomeDocParaEnviar,
                    tmpId
                );
            }

            const textoHistorico =
                texto ||
                (nomeDocParaEnviar
                    ? `[Documento: ${nomeDocParaEnviar}]`
                    : "[Imagem enviada]");

            if (textoHistorico) {
                adicionarAoHistorico("usuario", textoHistorico);
            }

            if (campoMensagem) {
                campoMensagem.value = "";
                campoMensagem.style.height = "auto";
            }

            atualizarContadorChars();
            limparPreview();

            return enviarParaIA(
                texto,
                imagemParaEnviar,
                setor,
                textoDocParaEnviar,
                nomeDocParaEnviar,
                tmpId,
                false
            );
        }

        // =========================================================
        // EVENTOS DOM DO COMPOSER
        // =========================================================
        function onCampoMensagemInput() {
            this.style.height = "auto";
            this.style.height = `${Math.min(this.scrollHeight, 200)}px`;

            atualizarEstadoBotao();
            atualizarContadorChars();
        }

        function onCampoMensagemKeydown(event) {
            if (event.key === "Enter" && !event.shiftKey && !getIaRespondendo?.()) {
                event.preventDefault();
                processarEnvio();
            }
        }

        function onBtnEnviarClick() {
            if (!getIaRespondendo?.()) {
                processarEnvio();
            }
        }

        // =========================================================
        // API PÚBLICA
        // =========================================================
        const apiPublica = {
            prepararArquivoParaEnvio,
            limparPreview,
            sincronizarEstadoRelatorio,
            iniciarRelatorio,
            finalizarRelatorio,
            finalizarRelatorioDireto,
            cancelarRelatorio,
            enviarFeedback,
            gerarPDF,
            enviarParaIA,
            processarEnvio,

            obterLaudoAtualId() {
                const id = getLaudoAtualId?.();
                return id == null ? null : Number(id);
            },

            obterEstadoRelatorio() {
                return estadoRelatorioLegacy();
            },

            obterEstadoRelatorioNormalizado() {
                return normalizarEstadoRelatorio(getEstadoRelatorio?.());
            },

            destruir() {
                try {
                    EVENTOS.CMD_SISTEMA.forEach((nome) => {
                        document.removeEventListener(nome, processarEventoComandoSistema);
                    });

                    campoMensagem?.removeEventListener("input", onCampoMensagemInput);
                    campoMensagem?.removeEventListener("keydown", onCampoMensagemKeydown);
                    btnEnviar?.removeEventListener("click", onBtnEnviarClick);

                    abortarStreamAtivo();
                } catch (_) {}
            },
        };

        // =========================================================
        // EXPOSIÇÃO GLOBAL / COMPATIBILIDADE
        // =========================================================
        window.TarielAPI = apiPublica;
        window.prepararArquivoParaEnvio = apiPublica.prepararArquivoParaEnvio;
        window.limparPreview = apiPublica.limparPreview;
        window.iniciarRelatorio = apiPublica.iniciarRelatorio;
        window.finalizarRelatorio = apiPublica.finalizarRelatorio;
        window.cancelarRelatorio = apiPublica.cancelarRelatorio;
        window.processarEnvio = apiPublica.processarEnvio;

        // =========================================================
        // BIND INICIAL
        // =========================================================
        EVENTOS.CMD_SISTEMA.forEach((nome) => {
            document.removeEventListener(nome, processarEventoComandoSistema);
            document.addEventListener(nome, processarEventoComandoSistema);
        });

        campoMensagem?.removeEventListener("input", onCampoMensagemInput);
        campoMensagem?.removeEventListener("keydown", onCampoMensagemKeydown);
        btnEnviar?.removeEventListener("click", onBtnEnviarClick);

        campoMensagem?.addEventListener("input", onCampoMensagemInput);
        campoMensagem?.addEventListener("keydown", onCampoMensagemKeydown);
        btnEnviar?.addEventListener("click", onBtnEnviarClick);

        if (!window.__TARIEL_CHAT_NETWORK_BEFOREUNLOAD_WIRED__) {
            window.__TARIEL_CHAT_NETWORK_BEFOREUNLOAD_WIRED__ = true;

            window.addEventListener(
                "beforeunload",
                () => {
                    try {
                        apiPublica.destruir();
                    } catch (_) {}
                },
                { once: true }
            );
        }

        atualizarEstadoBotao();
        atualizarContadorChars();

        return apiPublica;
    };
})();
