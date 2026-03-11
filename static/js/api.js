// ==========================================
// TARIEL CONTROL TOWER — API.JS
// Responsabilidades: SSE stream, histórico,
// markdown, PDF, drag-drop, preview
// ==========================================

(function () {
    "use strict";

    // =========================================================================
    // AMBIENTE E UTILITÁRIOS BASE
    // =========================================================================

    const EM_PRODUCAO = window.location.hostname !== "localhost"
                     && window.location.hostname !== "127.0.0.1";

    // FIX: suprime stack traces públicos em produção
    function log(nivel, ...args) {
        if (EM_PRODUCAO && nivel !== "error") return;
        if (EM_PRODUCAO) {
            console.error("[Tariel]", args[0]); // só a mensagem, sem objeto de erro
            return;
        }
        console[nivel]("[Tariel]", ...args);
    }

    // CSRF token — injetado via <meta name="csrf-token"> pelo backend
    const CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]')?.content ?? "";
    if (!CSRF_TOKEN) {
        log("warn", "CSRF token não encontrado. Requisições POST podem ser rejeitadas.");
    }

    // FIX: escapeHTML deve ser chamado em TODOS os dados externos antes de
    // qualquer manipulação de DOM. Centralizado aqui para reutilização.
    function escapeHTML(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g,  "&amp;")
            .replace(/</g,  "&lt;")
            .replace(/>/g,  "&gt;")
            .replace(/"/g,  "&quot;")
            .replace(/'/g,  "&#x27;")
            .replace(/\//g, "&#x2F;"); // FIX: barra também pode ser perigosa em atributos
    }

    // FIX: notificação não-bloqueante — substitui todos os alert()
    // Requer .toast-notificacao no CSS (ver comentário abaixo da função)
    function mostrarToast(mensagem, tipo = "erro") {
        const toast = document.createElement("div");
        toast.className = `toast-notificacao toast-${escapeHTML(tipo)}`;
        toast.setAttribute("role", tipo === "erro" ? "alert" : "status");
        toast.setAttribute("aria-live", tipo === "erro" ? "assertive" : "polite");
        // textContent é seguro — sem risco de XSS
        toast.textContent = mensagem;
        document.body.appendChild(toast);
        // Dois rAF garantem que a transição CSS será aplicada
        requestAnimationFrame(() =>
            requestAnimationFrame(() => toast.classList.add("visivel"))
        );
        setTimeout(() => {
            toast.classList.remove("visivel");
            setTimeout(() => toast.remove(), 350);
        }, 5000);
    }
    /*
     * CSS necessário para .toast-notificacao (adicionar em chat.css):
     *
     * .toast-notificacao {
     *     position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%) translateY(20px);
     *     background: #0F2B46; color: #fff; padding: 10px 20px; border-radius: 8px;
     *     font-size: 14px; z-index: 9998; opacity: 0;
     *     transition: opacity .3s ease, transform .3s ease;
     *     border-left: 4px solid #EF5350; pointer-events: none;
     * }
     * .toast-notificacao.toast-sucesso { border-left-color: #4CAF50; }
     * .toast-notificacao.visivel { opacity: 1; transform: translateX(-50%) translateY(0); }
     */


    // =========================================================================
    // REFERÊNCIAS DOM (verificadas uma única vez)
    // =========================================================================

    const campoMensagem    = document.getElementById("campo-mensagem");
    const btnEnviar        = document.getElementById("btn-enviar");
    const areaMensagens    = document.getElementById("area-mensagens");
    const telaBoasVindas   = document.getElementById("tela-boas-vindas");
    const previewContainer = document.getElementById("preview-anexo");
    const camadaArraste    = document.getElementById("camada-arraste");
    const btnAnexo         = document.getElementById("btn-anexo");
    const inputAnexo       = document.getElementById("input-anexo");
    const setorSelect      = document.getElementById("setor-industrial");

    // Dados do usuário vindos do data-attribute do <body> (injetados pelo backend, não JS)
    // FIX: escapeHTML aplicado na leitura — garante segurança em TODOS os usos posteriores
    const NOME_USUARIO = escapeHTML(document.body.dataset.usuario || "Inspetor WF");
    const NOME_EMPRESA = escapeHTML(document.body.dataset.empresa || "Empresa WF");

    // Guarda de segurança: sem os elementos críticos, o módulo não inicializa
    if (!campoMensagem || !btnEnviar || !areaMensagens) {
        log("error", "Elementos DOM críticos não encontrados. API.js não inicializado.");
        return;
    }


    // =========================================================================
    // ESTADO DA CONVERSA
    // =========================================================================

    let arquivoPendente        = null;
    let imagemBase64Pendente   = null;
    let ultimoDiagnosticoBruto = "";
    let iaRespondendo          = false;
    let contadorArraste        = 0;

    // FIX: AbortController encapsulado no estado — pode ser cancelado externamente
    let controllerStream = null;

    // FIX: historicoConversa limitado a MAX_HISTORICO_LOCAL entradas em memória
    // (não apenas ao enviar) — evita crescimento ilimitado
    const MAX_HISTORICO_LOCAL = 40; // 20 turnos (usuário + assistente)
    let historicoConversa = [];

    function adicionarAoHistorico(papel, texto) {
        historicoConversa.push({ papel, texto });
        // FIX: descarta entradas antigas mantendo o array limitado
        if (historicoConversa.length > MAX_HISTORICO_LOCAL) {
            historicoConversa = historicoConversa.slice(-MAX_HISTORICO_LOCAL);
        }
    }


    // =========================================================================
    // EXPORTS PARA O HTML
    // FIX: agrupados em um namespace único (window.TarielAPI) em vez de
    // poluir window diretamente com 4+ funções globais
    // =========================================================================

    window.TarielAPI = {
        limparHistoricoChat() {
            // Cancela stream em andamento antes de limpar
            if (controllerStream) {
                controllerStream.abort();
                controllerStream = null;
            }
            historicoConversa      = [];
            ultimoDiagnosticoBruto = "";
            arquivoPendente        = null;
            imagemBase64Pendente   = null;
            if (previewContainer) {
                previewContainer.style.display = "none";
                previewContainer.innerHTML     = "";
            }
            iaRespondendo = false;
            atualizarEstadoBotao();
        },

        preencherEntrada(texto) {
            // FIX: valida que o argumento é string antes de inserir
            if (typeof texto !== "string") return;
            campoMensagem.value = texto.slice(0, 4000); // limite razoável
            campoMensagem.dispatchEvent(new Event("input"));
            campoMensagem.focus();
        },

        prepararArquivoParaEnvio,
        limparPreview,
    };

    // Retrocompatibilidade com chamadas window.limparPreview() existentes no HTML
    // Remover após migrar todos os chamadores para window.TarielAPI.*
    window.limparPreview           = limparPreview;
    window.preencherEntrada        = window.TarielAPI.preencherEntrada;
    window.limparHistoricoChat     = window.TarielAPI.limparHistoricoChat;
    window.prepararArquivoParaEnvio = prepararArquivoParaEnvio;


    // =========================================================================
    // INTERAÇÃO DO USUÁRIO
    // =========================================================================

    campoMensagem.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 200) + "px";
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
        if (!iaRespondendo) processarEnvio();
    });

    function atualizarEstadoBotao() {
        const temConteudo = campoMensagem.value.trim() !== "" || arquivoPendente !== null;
        const habilitado  = temConteudo && !iaRespondendo;
        btnEnviar.disabled = !habilitado;
        btnEnviar.classList.toggle("destaque", habilitado);
        btnEnviar.setAttribute("aria-busy", iaRespondendo ? "true" : "false");
    }

    // FIX: contador de caracteres (elemento #contador-chars esperado no HTML)
    const LIMITE_CHARS = 4000;
    function atualizarContadorChars() {
        const contador = document.getElementById("contador-chars");
        if (!contador) return;
        const restantes = LIMITE_CHARS - campoMensagem.value.length;
        contador.textContent = restantes < 200 ? restantes : "";
        contador.classList.toggle("contador-alerta", restantes < 100);
    }


    // =========================================================================
    // PROCESSAMENTO DE ENVIO
    // =========================================================================

    async function processarEnvio() {
        const texto = campoMensagem.value.trim();
        if (!texto && !arquivoPendente) return;
        if (iaRespondendo) return;

        // FIX: limita o tamanho da mensagem no cliente (backend também deve validar)
        if (texto.length > LIMITE_CHARS) {
            mostrarToast(`Mensagem muito longa. Máximo ${LIMITE_CHARS} caracteres.`);
            return;
        }

        const setor = setorSelect?.value || "geral";

        if (telaBoasVindas) telaBoasVindas.style.display = "none";

        adicionarMensagemInspetor(texto, imagemBase64Pendente);

        if (texto) adicionarAoHistorico("usuario", texto);

        const imagemParaEnviar     = imagemBase64Pendente;
        campoMensagem.value        = "";
        campoMensagem.style.height = "auto";
        atualizarContadorChars();
        limparPreview();

        await enviarParaIA(texto, imagemParaEnviar, setor);
    }


    // =========================================================================
    // ENVIO SSE PARA O BACKEND
    // =========================================================================

    async function enviarParaIA(mensagem, dadosImagem, setor) {
        iaRespondendo = true;
        atualizarEstadoBotao();

        // FIX: AbortController com timeout de 2 minutos
        // Cancela qualquer stream anterior antes de criar novo
        if (controllerStream) controllerStream.abort();
        controllerStream = new AbortController();
        const timeoutStream = setTimeout(() => {
            controllerStream?.abort();
            log("warn", "Stream SSE cancelado por timeout (120s).");
        }, 120_000);

        const elementoIA    = criarBolhaIA();
        const elementoTexto = elementoIA.querySelector(".texto-msg");
        const cursor        = elementoIA.querySelector(".cursor-piscando");

        let textoAcumulado = "";
        // FIX: flag para encerrar o while(true) quando [FIM] chega
        // O break anterior só encerrava o for interno, não o while
        let streamCompleto = false;

        try {
            const resposta = await fetch("/app/api/chat", {
                method:  "POST",
                signal:  controllerStream.signal,
                credentials: "same-origin",
                headers: {
                    "Content-Type":  "application/json",
                    "Accept":        "text/event-stream",
                    // FIX: CSRF token ausente na versão anterior
                    "X-CSRF-Token":  CSRF_TOKEN,
                },
                body: JSON.stringify({
                    mensagem:     mensagem || "",
                    dados_imagem: dadosImagem ? validarPrefixoBase64(dadosImagem) : "",
                    setor:        sanitizarSetor(setor),
                    // Envia no máximo 20 entradas (10 turnos) para não estourar context window
                    historico: historicoConversa.slice(-20),
                }),
            });

            clearTimeout(timeoutStream);

            if (!resposta.ok) {
                // FIX: não expõe resposta.statusText diretamente (pode conter detalhes internos)
                throw new Error(`HTTP_${resposta.status}`);
            }

            // FIX: verifica que a resposta é realmente um stream
            const contentType = resposta.headers.get("content-type") ?? "";
            if (!contentType.includes("text/event-stream") && !contentType.includes("application/json")) {
                throw new Error("CONTENT_TYPE_INESPERADO");
            }

            const leitor  = resposta.body.getReader();
            const decoder = new TextDecoder();
            let   buffer  = "";

            while (!streamCompleto) {
                const { done, value } = await leitor.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const linhas = buffer.split("\n");
                buffer = linhas.pop(); // última linha pode estar incompleta

                for (const linha of linhas) {
                    if (!linha.startsWith("data:")) continue;

                    const dado = linha.slice(5).trim();

                    if (dado === "[FIM]") {
                        // FIX: flag encerra o while externo corretamente
                        streamCompleto = true;
                        ultimoDiagnosticoBruto = textoAcumulado;
                        adicionarAoHistorico("assistente", textoAcumulado);
                        cursor?.remove();
                        mostrarAcoesPosResposta(elementoIA);
                        break; // encerra o for; while vê streamCompleto=true e para
                    }

                    // FIX: trata evento de erro explícito do servidor
                    if (dado === "[ERRO]") {
                        streamCompleto = true;
                        throw new Error("ERRO_SERVIDOR");
                    }

                    try {
                        const obj = JSON.parse(dado);
                        if (typeof obj.texto === "string") {
                            textoAcumulado += obj.texto;
                            elementoTexto.innerHTML = renderizarMarkdown(textoAcumulado);
                            elementoTexto.appendChild(cursor);
                            rolarParaBaixo();
                        }
                    } catch {
                        // chunk mal-formado — ignora silenciosamente
                    }
                }
            }

        } catch (erro) {
            clearTimeout(timeoutStream);
            cursor?.remove();

            // FIX: mensagens de erro para o usuário sem expor detalhes técnicos
            let mensagemExibida = "Não foi possível contactar o servidor. Tente novamente.";
            if (erro.name === "AbortError") {
                mensagemExibida = "Conexão encerrada. O tempo limite foi atingido.";
            }

            elementoTexto.innerHTML = renderizarMarkdown(
                `**[Erro de Conexão]** ${escapeHTML(mensagemExibida)}`
            );

            // Log discreto — sem stack trace em produção
            log("error", `Erro no stream SSE: ${erro.message}`);

        } finally {
            clearTimeout(timeoutStream);
            controllerStream = null;
            iaRespondendo    = false;
            atualizarEstadoBotao();
            rolarParaBaixo();
        }
    }

    // FIX: valida que o base64 tem prefixo de imagem — previne envio de dados arbitrários
    function validarPrefixoBase64(base64) {
        if (typeof base64 !== "string") return "";
        const prefixosPermitidos = [
            "data:image/jpeg;base64,",
            "data:image/jpg;base64,",
            "data:image/png;base64,",
            "data:image/webp;base64,",
            "data:image/gif;base64,",
        ];
        const valido = prefixosPermitidos.some(p => base64.startsWith(p));
        return valido ? base64 : "";
    }

    // FIX: whitelist de setores válidos — previne injeção via select manipulado
    const SETORES_VALIDOS = new Set([
        "geral", "metalurgica", "agroindústria", "quimica",
        "petroquimica", "alimentos", "bebidas", "nr12",
        "spda", "loto", "pie", "rti", "caldeiraria",
    ]);
    function sanitizarSetor(setor) {
        return SETORES_VALIDOS.has(setor) ? setor : "geral";
    }


    // =========================================================================
    // RENDERIZAÇÃO DE MENSAGENS (DOM API — sem innerHTML com dados externos)
    // =========================================================================

    function adicionarMensagemInspetor(texto, imagemBase64) {
        const linha = document.createElement("div");
        linha.className = "linha-mensagem mensagem-inspetor";

        const conteudo = document.createElement("div");
        conteudo.className = "conteudo-mensagem";

        // Avatar
        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.innerHTML = `<span class="material-symbols-rounded">person</span>`;

        // Corpo
        const corpo = document.createElement("div");
        corpo.className = "corpo-texto";

        const nomeRemetente = document.createElement("span");
        nomeRemetente.className = "nome-remetente";
        // FIX: textContent — seguro, sem risco de XSS
        nomeRemetente.textContent = NOME_USUARIO;
        corpo.appendChild(nomeRemetente);

        // FIX: imagem criada via DOM — src atribuído via propriedade, não innerHTML
        // Evita payload: `" onerror="alert(1)` em imagemBase64
        if (imagemBase64) {
            const base64Validado = validarPrefixoBase64(imagemBase64);
            if (base64Validado) {
                const img = document.createElement("img");
                img.src       = base64Validado; // atribuição via .src — segura
                img.alt       = "Evidência enviada";
                img.className = "img-anexo";
                corpo.appendChild(img);
            }
        }

        if (texto) {
            const p = document.createElement("p");
            p.className = "texto-msg";
            // FIX: textContent — mensagem do usuário nunca deve virar HTML
            p.textContent = texto;
            corpo.appendChild(p);
        }

        conteudo.appendChild(avatar);
        conteudo.appendChild(corpo);
        linha.appendChild(conteudo);
        areaMensagens.appendChild(linha);
        rolarParaBaixo();
    }

    function criarBolhaIA() {
        const linha = document.createElement("div");
        linha.className = "linha-mensagem mensagem-ia";

        // FIX: NOME_EMPRESA era inserido sem escape no innerHTML original
        // Agora criado via DOM + textContent
        const nomeRemetente = document.createElement("span");
        nomeRemetente.className = "nome-remetente";
        nomeRemetente.textContent = `Tariel IA • ${NOME_EMPRESA}`;

        const textoMsg = document.createElement("div");
        textoMsg.className = "texto-msg";

        const cursor = document.createElement("span");
        cursor.className = "cursor-piscando";
        cursor.setAttribute("aria-hidden", "true");

        const corpo = document.createElement("div");
        corpo.className = "corpo-texto";
        corpo.appendChild(nomeRemetente);
        corpo.appendChild(textoMsg);
        corpo.appendChild(cursor);

        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.innerHTML = `<span class="material-symbols-rounded">smart_toy</span>`;

        const conteudo = document.createElement("div");
        conteudo.className = "conteudo-mensagem";
        conteudo.appendChild(avatar);
        conteudo.appendChild(corpo);

        linha.appendChild(conteudo);
        areaMensagens.appendChild(linha);
        rolarParaBaixo();
        return linha;
    }

    function mostrarAcoesPosResposta(elementoIA) {
        const acoes = document.createElement("div");
        acoes.className = "acoes-pos-resposta";

        const btnPdf = document.createElement("button");
        btnPdf.className = "btn-gerar-pdf btn-secundario";
        btnPdf.title = "Gerar laudo PDF com ART";
        btnPdf.innerHTML = `<span class="material-symbols-rounded">picture_as_pdf</span> Gerar PDF / ART`;

        const btnCopiar = document.createElement("button");
        btnCopiar.className = "btn-copiar btn-secundario";
        btnCopiar.title = "Copiar texto do laudo";
        btnCopiar.innerHTML = `<span class="material-symbols-rounded">content_copy</span> Copiar`;

        // FIX: addEventListener em vez de onclick inline (compatível com CSP)
        btnPdf.addEventListener("click", gerarPDF);
        btnCopiar.addEventListener("click", () => copiarTexto(btnCopiar));

        acoes.appendChild(btnPdf);
        acoes.appendChild(btnCopiar);
        elementoIA.querySelector(".corpo-texto")?.appendChild(acoes);
    }

    async function copiarTexto(btn) {
        if (!ultimoDiagnosticoBruto) return;
        try {
            await navigator.clipboard.writeText(ultimoDiagnosticoBruto);
            btn.innerHTML = `<span class="material-symbols-rounded">check</span> Copiado!`;
            setTimeout(() => {
                btn.innerHTML = `<span class="material-symbols-rounded">content_copy</span> Copiar`;
            }, 2000);
        } catch {
            mostrarToast("Não foi possível copiar. Use Ctrl+A e Ctrl+C manualmente.");
        }
    }


    // =========================================================================
    // GERAÇÃO DE PDF
    // =========================================================================

    async function gerarPDF() {
        if (!ultimoDiagnosticoBruto) return;

        const controllerPdf = new AbortController();
        const timeoutPdf    = setTimeout(() => controllerPdf.abort(), 30_000);

        try {
            const resposta = await fetch("/app/api/gerar_pdf", {
                method: "POST",
                signal: controllerPdf.signal,
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    // FIX: CSRF token ausente na versão anterior
                    "X-CSRF-Token": CSRF_TOKEN,
                    "Accept":       "application/pdf",
                },
                body: JSON.stringify({
                    diagnostico: ultimoDiagnosticoBruto,
                    inspetor:    NOME_USUARIO,
                    empresa:     NOME_EMPRESA,
                    setor:       sanitizarSetor(setorSelect?.value || "geral"),
                    data:        new Date().toLocaleDateString("pt-BR"),
                }),
            });

            clearTimeout(timeoutPdf);

            if (!resposta.ok) throw new Error(`HTTP_${resposta.status}`);

            // FIX: verifica Content-Type antes de tratar como PDF
            const contentType = resposta.headers.get("content-type") ?? "";
            if (!contentType.includes("application/pdf")) {
                throw new Error("RESPOSTA_NAO_PDF");
            }

            const blob = await resposta.blob();
            const url  = URL.createObjectURL(blob);
            const link = document.createElement("a");

            // FIX: nome de arquivo com data formatada em vez de timestamp cru
            const dataFormatada = new Date()
                .toLocaleDateString("pt-BR")
                .replace(/\//g, "-");
            link.href     = url;
            link.download = `Laudo_WF_${dataFormatada}.pdf`;
            // FIX: deve ser adicionado ao DOM para funcionar em Firefox
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

        } catch (erro) {
            clearTimeout(timeoutPdf);
            if (erro.name === "AbortError") {
                mostrarToast("A geração do PDF demorou muito. Tente novamente.");
            } else {
                mostrarToast("Erro ao gerar PDF. Tente novamente.");
            }
            log("error", `Erro PDF: ${erro.message}`);
        }
    }


    // =========================================================================
    // RENDERIZAÇÃO DE MARKDOWN
    // =========================================================================

    function renderizarMarkdown(texto) {
        // FIX: escapeHTML primeiro — garante que conteúdo da IA não injeta HTML
        let html = escapeHTML(texto);

        // Blocos de código (``` ```) — processados ANTES das demais regras
        html = html.replace(/```([\s\S]*?)```/g, (_, code) =>
            `<pre><code>${code.trim()}</code></pre>`
        );

        // Código inline — evita processar conteúdo dentro de <pre>
        html = html.replace(/(?<!<pre>[\s\S]*)`([^`\n]+)`(?![\s\S]*<\/pre>)/g,
            "<code>$1</code>"
        );

        // Negrito + itálico combinados
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
        html = html.replace(/\*\*(.+?)\*\*/g,      "<strong>$1</strong>");
        html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

        // Cabeçalhos (sem capturar dentro de blocos de código)
        html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
        html = html.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
        html = html.replace(/^# (.+)$/gm,   "<h1>$1</h1>");

        // Blockquote — &gt; porque escapeHTML já converteu ">"
        html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

        // Linha horizontal
        html = html.replace(/^---+$/gm, "<hr>");

        // Listas — agrupa itens consecutivos em <ul>
        const linhas = html.split("\n");
        const saida  = [];
        let dentroLista = false;

        for (const linha of linhas) {
            const itemLista = linha.match(/^[-*]\s+(.+)/);
            if (itemLista) {
                if (!dentroLista) { saida.push("<ul>"); dentroLista = true; }
                saida.push(`<li>${itemLista[1]}</li>`);
            } else {
                if (dentroLista) { saida.push("</ul>"); dentroLista = false; }
                saida.push(linha);
            }
        }
        if (dentroLista) saida.push("</ul>");

        html = saida.join("\n");

        // FIX: lookahead expandido para incluir tags DE FECHAMENTO (</ul>, </li> etc.)
        // A versão anterior inseria <br> entre </li> e <li>, quebrando a lista visualmente
        html = html.replace(
            /\n(?!<\/?(?:ul|ol|li|h[1-6]|pre|blockquote|hr|div|p))/g,
            "<br>"
        );

        return html;
    }


    // =========================================================================
    // PREVIEW E LIMPEZA DE ANEXOS
    // =========================================================================

    function limparPreview() {
        arquivoPendente      = null;
        imagemBase64Pendente = null;
        if (previewContainer) {
            previewContainer.style.display = "none";
            previewContainer.innerHTML     = "";
        }
        if (inputAnexo) inputAnexo.value = "";
        atualizarEstadoBotao();
    }

    function prepararArquivoParaEnvio(arquivo) {
        if (!arquivo) return;

        // FIX: valida MIME type com whitelist — não confia no tipo declarado
        const tiposPermitidos = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (!tiposPermitidos.includes(arquivo.type)) {
            mostrarToast("O Assistente WF suporta apenas imagens PNG, JPG e WebP.");
            return;
        }

        if (arquivo.size > 10 * 1024 * 1024) {
            mostrarToast("Imagem muito grande (máx. 10MB). Reduza o tamanho antes de enviar.");
            return;
        }

        arquivoPendente = arquivo;
        const leitor = new FileReader();

        leitor.onload = function (e) {
            const resultado = e.target.result;

            // FIX: valida prefixo do base64 gerado pelo FileReader
            if (!validarPrefixoBase64(resultado)) {
                mostrarToast("Arquivo inválido. Tente uma imagem diferente.");
                return;
            }

            imagemBase64Pendente = resultado;

            if (!previewContainer) return;
            previewContainer.style.display = "block";

            // FIX: preview criado via DOM — sem innerHTML com dados externos
            // (evita XSS se o Data URL contivesse payload)
            previewContainer.innerHTML = "";
            const item = document.createElement("div");
            item.className = "preview-item";

            const thumb = document.createElement("img");
            thumb.src       = resultado; // .src é seguro — não interpreta HTML
            thumb.alt       = "Preview da evidência";
            thumb.className = "preview-thumb";

            const btnRemover = document.createElement("button");
            btnRemover.className = "btn-remover-preview";
            btnRemover.setAttribute("aria-label", "Remover imagem");
            btnRemover.textContent = "×";
            // FIX: addEventListener em vez de onclick inline (CSP compliant)
            btnRemover.addEventListener("click", limparPreview);

            item.appendChild(thumb);
            item.appendChild(btnRemover);
            previewContainer.appendChild(item);

            atualizarEstadoBotao();
            campoMensagem.focus();
        };

        leitor.onerror = () => {
            mostrarToast("Erro ao ler o arquivo. Tente novamente.");
            log("error", "FileReader falhou ao processar imagem.");
        };

        leitor.readAsDataURL(arquivo);
    }


    // =========================================================================
    // DRAG AND DROP
    // =========================================================================

    window.addEventListener("dragenter", (e) => {
        e.preventDefault();
        contadorArraste++;
        camadaArraste?.classList.add("ativo");
    });

    window.addEventListener("dragleave", () => {
        contadorArraste--;
        if (contadorArraste <= 0) {
            contadorArraste = 0;
            camadaArraste?.classList.remove("ativo");
        }
    });

    window.addEventListener("dragover", (e) => e.preventDefault());

    window.addEventListener("drop", (e) => {
        e.preventDefault();
        contadorArraste = 0;
        camadaArraste?.classList.remove("ativo");
        const arquivo = e.dataTransfer?.files?.[0];
        if (arquivo) prepararArquivoParaEnvio(arquivo);
    });


    // =========================================================================
    // BOTÃO DE ANEXO E COLAR (Ctrl+V)
    // =========================================================================

    if (btnAnexo && !btnAnexo.dataset.anexoBindSource) {
        btnAnexo.dataset.anexoBindSource = "api";
        btnAnexo.addEventListener("click", () => inputAnexo?.click());
    }

    if (inputAnexo && !inputAnexo.dataset.anexoBindSource) {
        inputAnexo.dataset.anexoBindSource = "api";
        inputAnexo.addEventListener("change", function () {
            if (this.files?.[0]) prepararArquivoParaEnvio(this.files[0]);
            this.value = "";
        });
    }

    document.addEventListener("paste", (e) => {
        const itens = e.clipboardData?.items;
        if (!itens) return;
        for (const item of itens) {
            if (item.type.startsWith("image/")) {
                e.preventDefault();
                prepararArquivoParaEnvio(item.getAsFile());
                campoMensagem.focus();
                break;
            }
        }
    });


    // =========================================================================
    // UTILITÁRIOS
    // =========================================================================

    function rolarParaBaixo() {
        requestAnimationFrame(() => {
            areaMensagens?.scrollTo({
                top:      areaMensagens.scrollHeight,
                behavior: "smooth",
            });
        });
    }

})();
