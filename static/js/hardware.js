// ==========================================
// TARIEL CONTROL TOWER — HARDWARE.JS
// Responsabilidades: GPS, microfone/voz,
// câmera, estampa de auditoria
// ==========================================

(function () {
    "use strict";


    // =========================================================================
    // AMBIENTE E LOG
    // =========================================================================

    const EM_PRODUCAO = window.location.hostname !== "localhost"
        && window.location.hostname !== "127.0.0.1";

    function log(nivel, ...args) {
        if (EM_PRODUCAO) return;
        console[nivel]("[Tariel HW]", ...args);
    }


    // =========================================================================
    // TOAST
    // ALTERAÇÃO: hardware.js não redefine window.exibirToast.
    // ui.js (carregado antes) já define window.exibirToast como fonte única.
    // Este wrapper garante que chamadas internas funcionem mesmo se ui.js
    // ainda não tiver sido executado (edge case de carregamento fora de ordem).
    // =========================================================================

    function _toast(mensagem, tipo = "erro", duracao = 5000) {
        if (typeof window.exibirToast === "function") {
            window.exibirToast(mensagem, tipo, duracao);
        } else {
            // Fallback mínimo — não deve ocorrer em produção
            log("warn", `[Toast HW fallback] ${mensagem}`);
        }
    }

    // FIX: whitelist de classes CSS permitidas — previne injeção de classe
    function _sanitizarClasse(str) {
        const permitidas = new Set(["erro", "sucesso", "info", "aviso"]);
        return permitidas.has(str) ? str : "erro";
    }

    // FIX: sanitiza nome de arquivo antes de exibir ao usuário
    function _sanitizarNomeArquivo(nome) {
        if (typeof nome !== "string") return "arquivo";
        return nome.replace(/[<>"'&]/g, "").slice(0, 80) || "arquivo";
    }


    // =========================================================================
    // ACESSO AO DOM
    // =========================================================================

    function _el(id) { return document.getElementById(id); }


    // =========================================================================
    // INICIALIZAÇÃO
    // =========================================================================

    document.addEventListener("DOMContentLoaded", function () {
        _inicializarAnexo();
        _inicializarMicrofone();
        _inicializarLimpezaUnload();
        _inicializarAriaLiveVoz();
    });


    // =========================================================================
    // 1. GPS E RASTREABILIDADE
    // =========================================================================

    let _ultimaPosicaoGPS = null;
    let _buscandoGPS = false;

    async function obterLocalizacaoGPS() {
        if (_ultimaPosicaoGPS && (Date.now() - _ultimaPosicaoGPS.timestamp) < 60_000) {
            return _ultimaPosicaoGPS.texto;
        }

        if (_buscandoGPS) return "GPS em andamento...";

        return new Promise((resolve) => {
            if (!("geolocation" in navigator)) {
                resolve("GPS não suportado neste dispositivo");
                return;
            }

            _buscandoGPS = true;

            const opcoes = {
                enableHighAccuracy: true,
                timeout: 6000,
                maximumAge: 30_000,
            };

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    _buscandoGPS = false;
                    const lat = pos.coords.latitude.toFixed(5);
                    const lng = pos.coords.longitude.toFixed(5);
                    const precisao = pos.coords.accuracy
                        ? ` (±${Math.round(pos.coords.accuracy)}m)`
                        : "";
                    const texto = `${lat}, ${lng}${precisao}`;
                    _ultimaPosicaoGPS = { texto, timestamp: Date.now() };
                    resolve(texto);
                },
                (err) => {
                    _buscandoGPS = false;
                    const msgs = {
                        1: "GPS negado pelo usuário",
                        2: "Localização indisponível",
                        3: "Timeout GPS",
                    };
                    resolve(msgs[err.code] || "GPS indisponível");
                },
                opcoes
            );
        });
    }


    // =========================================================================
    // 2. MICROFONE (DITADO TÉCNICO)
    // =========================================================================

    let reconhecedorVoz = null;
    let estaGravando = false;
    let _tentativasVoz = 0;
    const MAX_TENTATIVAS = 5;

    const PLACEHOLDER_PADRAO = "Descreva a inconformidade, solicite um orçamento ou envie a foto...";
    const PLACEHOLDER_OUVINDO = "🎙️ Ouvindo relatório técnico WF...";
    const ERROS_RECUPERAVEIS = new Set(["no-speech", "audio-capture", "network"]);

    function _inicializarMicrofone() {
        const btnMicrofone = _el("btn-microfone");
        if (!btnMicrofone) return;

        if (location.protocol !== "https:" && location.hostname !== "localhost") {
            log("warn", "SpeechRecognition requer HTTPS. Microfone desabilitado em HTTP.");
            btnMicrofone.disabled = true;
            btnMicrofone.title = "Ditado por voz requer conexão segura (HTTPS)";
            return;
        }

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            btnMicrofone.disabled = true;
            btnMicrofone.title = "Reconhecimento de voz não suportado neste navegador";
            return;
        }

        reconhecedorVoz = new SR();
        reconhecedorVoz.lang = "pt-BR";
        reconhecedorVoz.continuous = true;
        reconhecedorVoz.interimResults = true;
        reconhecedorVoz.maxAlternatives = 1;

        reconhecedorVoz.onstart = () => {
            _tentativasVoz = 0;
            estaGravando = true;
            btnMicrofone.classList.add("gravando");
            btnMicrofone.setAttribute("aria-pressed", "true");
            btnMicrofone.setAttribute("aria-label", "Parar ditado por voz");
            const campo = _el("campo-mensagem");
            if (campo) campo.placeholder = PLACEHOLDER_OUVINDO;
            _anunciarEstadoVoz("Ditado ativado. Fale agora.");
        };

        reconhecedorVoz.onresult = (evento) => {
            const campo = _el("campo-mensagem");
            if (!campo) return;

            let finalChunk = "";
            for (let i = evento.resultIndex; i < evento.results.length; i++) {
                if (evento.results[i].isFinal) {
                    finalChunk += evento.results[i][0].transcript;
                }
            }

            if (finalChunk) {
                const LIMITE = 4000;
                const atual = campo.value.trimEnd();
                const novo = (atual + (atual.length > 0 ? " " : "") + finalChunk.trim())
                    .slice(0, LIMITE);
                campo.value = novo;
                campo.dispatchEvent(new Event("input"));
            }
        };

        reconhecedorVoz.onerror = (evento) => {
            log("warn", `Erro de voz: ${evento.error}`);

            if (ERROS_RECUPERAVEIS.has(evento.error)) return;

            _pararGravacaoInterno(btnMicrofone);

            const mensagensErro = {
                "not-allowed": "Permissão de microfone negada. Habilite nas configurações do navegador.",
                "service-not-allowed": "Reconhecimento de voz requer HTTPS.",
                "aborted": "Ditado interrompido.",
            };

            const msg = mensagensErro[evento.error];
            if (msg) _toast(msg, "erro", 6000);
        };

        reconhecedorVoz.onend = () => {
            if (!estaGravando) return;
            if (document.visibilityState === "hidden") {
                _pararGravacaoInterno(btnMicrofone);
                return;
            }

            if (_tentativasVoz >= MAX_TENTATIVAS) {
                log("warn", `Ditado parado após ${MAX_TENTATIVAS} tentativas consecutivas.`);
                _pararGravacaoInterno(btnMicrofone);
                _toast("Ditado interrompido após múltiplos erros. Tente novamente.", "aviso");
                return;
            }

            _tentativasVoz++;
            try {
                reconhecedorVoz.start();
            } catch (e) {
                log("warn", "Falha ao reiniciar SpeechRecognition:", e);
                _pararGravacaoInterno(btnMicrofone);
            }
        };

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden" && estaGravando) {
                pararGravacao();
            }
        });

        btnMicrofone.addEventListener("click", () => {
            if (estaGravando) {
                pararGravacao();
            } else {
                try {
                    _tentativasVoz = 0;
                    reconhecedorVoz.start();
                } catch (e) {
                    log("error", "Falha ao iniciar SpeechRecognition:", e);
                    _toast("Erro ao acessar o microfone.", "erro");
                }
            }
        });

        document.addEventListener("tariel:mensagem-enviada", () => {
            if (estaGravando) pararGravacao();
        });
    }

    function _pararGravacaoInterno(btnMicrofone) {
        estaGravando = false;
        const btn = btnMicrofone || _el("btn-microfone");
        btn?.classList.remove("gravando");
        btn?.setAttribute("aria-pressed", "false");
        btn?.setAttribute("aria-label", "Ativar ditado por voz");
        const campo = _el("campo-mensagem");
        if (campo) campo.placeholder = PLACEHOLDER_PADRAO;
        _anunciarEstadoVoz("Ditado encerrado.");
    }

    function pararGravacao() {
        _pararGravacaoInterno();
        try { reconhecedorVoz?.stop(); } catch (_) { }
    }

    function _inicializarAriaLiveVoz() {
        if (document.getElementById("aria-live-voz")) return;
        const live = document.createElement("div");
        live.id = "aria-live-voz";
        live.setAttribute("aria-live", "polite");
        live.setAttribute("aria-atomic", "true");
        live.className = "sr-only";
        document.body.appendChild(live);
    }

    function _anunciarEstadoVoz(mensagem) {
        const live = document.getElementById("aria-live-voz");
        if (!live) return;
        live.textContent = "";
        requestAnimationFrame(() => { live.textContent = mensagem; });
    }


    // =========================================================================
    // 3. CÂMERA — BOTÃO DE ANEXO
    // =========================================================================

    function _inicializarAnexo() {
        const btnAnexo = _el("btn-anexo");
        const inputAnexo = _el("input-anexo");

        if (!btnAnexo || !inputAnexo) {
            log("warn", "Elementos de anexo não encontrados no DOM.");
            return;
        }

        inputAnexo.setAttribute("accept", "image/jpeg,image/png,image/webp,image/gif");

        btnAnexo.addEventListener("click", () => inputAnexo.click());

        inputAnexo.addEventListener("change", async function () {
            const arquivo = this.files?.[0];
            this.value = "";
            if (!arquivo) return;
            await processarImagemAuditoria(arquivo);
        });
    }


    // =========================================================================
    // 4. PROCESSAMENTO DE IMAGEM COM AUDITORIA
    // =========================================================================

    const TIPOS_IMAGEM_PERMITIDOS = new Set([
        "image/jpeg", "image/jpg", "image/png",
        "image/webp", "image/gif",
    ]);

    let _processandoImagem = false;

    async function processarImagemAuditoria(arquivo) {
        if (!arquivo) return;

        if (_processandoImagem) {
            _toast("Aguarde o processamento da imagem anterior.", "aviso");
            return;
        }

        if (!TIPOS_IMAGEM_PERMITIDOS.has(arquivo.type)) {
            _toast("Apenas evidências fotográficas são aceitas (PNG, JPG, WebP).", "erro");
            return;
        }

        if (arquivo.size > 10 * 1024 * 1024) {
            _toast("Imagem muito grande (máx. 10MB). Reduza o tamanho antes de enviar.", "aviso");
            return;
        }

        const assinaturaValida = await _verificarAssinaturaMagica(arquivo);
        if (!assinaturaValida) {
            _toast("Arquivo inválido ou corrompido. Envie uma imagem real.", "erro");
            return;
        }

        _processandoImagem = true;

        try {
            const [coordenadas, imagemBase64] = await Promise.all([
                obterLocalizacaoGPS(),
                _lerArquivoComoBase64(arquivo),
            ]);

            const dataHora = new Date().toLocaleString("pt-BR");

            // ALTERAÇÃO: api.js aceita apenas (arquivo) — imagemBase64 é gerado
            // internamente pelo FileReader em prepararArquivoParaEnvio.
            // hardware.js não precisa passar imagemBase64 separadamente.
            // Se no futuro api.js aceitar base64 pré-computado, basta adicionar
            // o segundo argumento aqui.
            const fn = window.TarielAPI?.prepararArquivoParaEnvio
                ?? window.prepararArquivoParaEnvio;

            if (typeof fn !== "function") {
                log("error", "prepararArquivoParaEnvio não encontrada. api.js carregado?");
                _toast("Erro interno: módulo de envio não carregado.", "erro");
                return;
            }

            fn(arquivo);

            // Estampa após preview ser adicionado ao DOM
            requestAnimationFrame(() => {
                _aplicarEstampaAuditoria(dataHora, coordenadas);
            });

            const campo = _el("campo-mensagem");
            if (campo && campo.value.trim() === "") {
                const nomeSeguro = _sanitizarNomeArquivo(arquivo.name);
                campo.value = `Analisar evidência fotográfica: ${nomeSeguro}`;
                campo.dispatchEvent(new Event("input"));
            }

            campo?.focus();

        } catch (erro) {
            log("error", "Erro ao processar imagem:", erro);
            _toast("Erro ao processar a imagem. Tente novamente.", "erro");
        } finally {
            _processandoImagem = false;
        }
    }

    async function _verificarAssinaturaMagica(arquivo) {
        try {
            const buffer = await arquivo.slice(0, 12).arrayBuffer();
            const bytes = new Uint8Array(buffer);

            const assinaturas = [
                [0xFF, 0xD8, 0xFF],           // JPEG
                [0x89, 0x50, 0x4E, 0x47],     // PNG
                [0x47, 0x49, 0x46, 0x38],     // GIF
                [0x52, 0x49, 0x46, 0x46],     // WebP (RIFF)
            ];

            return assinaturas.some(assinatura =>
                assinatura.every((byte, i) => bytes[i] === byte)
            );
        } catch {
            return false;
        }
    }


    // =========================================================================
    // 5. ESTAMPA DE AUDITORIA
    // =========================================================================

    function _aplicarEstampaAuditoria(dataHora, coordenadas) {
        const previewContainer = _el("preview-anexo");
        const areaMsgs = _el("area-mensagens");

        const imgAlvo = previewContainer?.querySelector(".preview-thumb")
            ?? areaMsgs?.lastElementChild?.querySelector(".img-anexo");

        if (!imgAlvo) return;

        const container = imgAlvo.parentElement;
        if (!container) return;

        if (container.querySelector(".estampa-auditoria")) return;

        container.style.position = "relative";
        container.style.display = "inline-block";

        const estampa = document.createElement("div");
        estampa.className = "estampa-auditoria";

        Object.assign(estampa.style, {
            position: "absolute",
            bottom: "6px",
            left: "6px",
            background: "rgba(8, 22, 36, 0.82)",
            color: "#FFFFFF",
            padding: "3px 8px",
            fontSize: "10px",
            borderRadius: "4px",
            borderLeft: "2px solid #F47B20",
            pointerEvents: "none",
            userSelect: "none",
            lineHeight: "1.4",
            maxWidth: "calc(100% - 12px)",
            wordBreak: "break-all",
        });

        estampa.textContent = `WF Inspeções  ${dataHora}  GPS: ${coordenadas}`;
        container.appendChild(estampa);
    }


    // =========================================================================
    // 6. LIMPEZA NO UNLOAD
    // =========================================================================

    function _inicializarLimpezaUnload() {
        window.addEventListener("pagehide", () => {
            if (estaGravando) pararGravacao();
        });

        window.addEventListener("beforeunload", () => {
            if (estaGravando) {
                try { reconhecedorVoz?.stop(); } catch (_) { }
            }
        });
    }


    // =========================================================================
    // 7. UTILITÁRIOS
    // =========================================================================

    function _lerArquivoComoBase64(arquivo) {
        return new Promise((resolve, reject) => {
            const leitor = new FileReader();
            leitor.onload = (e) => resolve(e.target.result);
            leitor.onerror = () => reject(new Error("Falha ao ler arquivo via FileReader"));
            leitor.onabort = () => reject(new Error("Leitura do arquivo abortada"));
            leitor.readAsDataURL(arquivo);
        });
    }


    // =========================================================================
    // NAMESPACE DE EXPORTS
    // =========================================================================

    window.HardwareWF = {
        processarImagemAuditoria,
        obterLocalizacaoGPS,
        pararGravacao,
        // ALTERAÇÃO: exibirToast removido daqui — usa window.exibirToast de ui.js
    };

    // Retrocompatibilidade
    window.processarImagemAuditoria = processarImagemAuditoria;

})();
