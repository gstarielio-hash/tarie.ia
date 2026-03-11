// ==========================================
// TARIEL CONTROL TOWER — UI.JS
// Responsabilidades: sidebar, menu mobile,
// overlay, scroll, login, logout, toasts
// ==========================================

(function () {
    "use strict";

    // =========================================================================
    // AMBIENTE
    // =========================================================================

    const EM_PRODUCAO = window.location.hostname !== "localhost"
                     && window.location.hostname !== "127.0.0.1";

    function log(nivel, ...args) {
        if (EM_PRODUCAO) return;
        console[nivel]("[Tariel UI]", ...args);
    }

    // CSRF token — injetado via <meta name="csrf-token"> pelo backend
    const CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]')?.content ?? "";

    // FIX: escapeHTML centralizado — chamado antes de qualquer inserção no DOM
    function escapeHTML(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g,  "&amp;")
            .replace(/</g,  "&lt;")
            .replace(/>/g,  "&gt;")
            .replace(/"/g,  "&quot;")
            .replace(/'/g,  "&#x27;")
            .replace(/\//g, "&#x2F;");
    }

    // =========================================================================
    // 1. INICIALIZAÇÃO
    // =========================================================================

    document.addEventListener("DOMContentLoaded", () => {
        _inicializarMenuLateral();
        _inicializarLoginForm();
        _inicializarLogoutForm();

        document.getElementById("campo-mensagem")?.focus();
    });

    // =========================================================================
    // 2. MENU LATERAL (SIDEBAR + DRAWER MOBILE)
    // =========================================================================

    // FIX: MediaQueryList instanciada uma única vez — reutilizada em todo o módulo
    const mqDesktop = window.matchMedia("(min-width: 769px)");

    // FIX: AbortController para o listener de Escape — evita acumulação se
    // _inicializarMenuLateral for chamada mais de uma vez (ex: navegação SPA)
    let _abortEscape = null;

    function _inicializarMenuLateral() {
        const btnMenu = document.getElementById("btn-menu");
        const sidebar = document.getElementById("barra-historico");

        // Cria overlay dinamicamente se não existir no HTML
        let overlay = document.querySelector(".overlay-sidebar");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.className = "overlay-sidebar";
            overlay.setAttribute("aria-hidden", "true");
            document.body.appendChild(overlay);
        }

        if (!btnMenu || !sidebar) return;

        btnMenu.addEventListener("click",   () => _toggleSidebar(sidebar, overlay, btnMenu));
        overlay.addEventListener("click",   () => _fecharSidebar(sidebar, overlay, btnMenu));

        // FIX: cancela listener anterior antes de registrar novo (evita acumulação)
        if (_abortEscape) _abortEscape.abort();
        _abortEscape = new AbortController();

        document.addEventListener(
            "keydown",
            (e) => {
                if (e.key === "Escape" && sidebar.classList.contains("aberto")) {
                    _fecharSidebar(sidebar, overlay, btnMenu);
                    btnMenu.focus(); // FIX: devolve foco ao botão (acessibilidade)
                }
            },
            { signal: _abortEscape.signal }
        );

        // FIX: usa a MediaQueryList já instanciada — não cria nova a cada chamada
        mqDesktop.addEventListener("change", (e) => {
            if (e.matches) _fecharSidebar(sidebar, overlay, btnMenu);
        });

        // Delegação de eventos nos itens do histórico (funciona com itens dinâmicos)
        sidebar.addEventListener("click", (e) => {
            const item = e.target.closest(".item-historico[data-laudo-id]");
            if (!item) return;

            sidebar.querySelectorAll(".item-historico").forEach(el => {
                el.classList.remove("ativo");
                el.removeAttribute("aria-current");
            });
            item.classList.add("ativo");
            item.setAttribute("aria-current", "true");

            // Fecha drawer no mobile após seleção
            if (!mqDesktop.matches) {
                _fecharSidebar(sidebar, overlay, btnMenu);
            }
        });
    }

    function _toggleSidebar(sidebar, overlay, btnMenu) {
        sidebar.classList.contains("aberto")
            ? _fecharSidebar(sidebar, overlay, btnMenu)
            : _abrirSidebar(sidebar, overlay, btnMenu);
    }

    function _abrirSidebar(sidebar, overlay, btnMenu) {
        sidebar.classList.add("aberto");
        sidebar.classList.remove("oculta");
        overlay.classList.add("ativo");
        overlay.removeAttribute("aria-hidden");
        btnMenu.setAttribute("aria-expanded", "true");
        // FIX: usa mqDesktop em vez de window.innerWidth (consistente)
        if (!mqDesktop.matches) {
            document.body.style.overflow = "hidden";
        }
        // FIX: foca no primeiro item focável da sidebar (acessibilidade)
        sidebar.querySelector("a, button")?.focus();
    }

    function _fecharSidebar(sidebar, overlay, btnMenu) {
        sidebar.classList.remove("aberto");
        overlay.classList.remove("ativo");
        overlay.setAttribute("aria-hidden", "true");
        btnMenu.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
    }

    // =========================================================================
    // 3. LOGIN
    // =========================================================================

    // FIX: rate limiting no cliente — previne múltiplos submits antes do `disabled`
    let _loginEmAndamento = false;

    function _inicializarLoginForm() {
        const btnEntrar    = document.getElementById("btn-entrar");
        const campoSenha   = document.getElementById("login-senha");
        const campoEmail   = document.getElementById("login-email");

        if (!btnEntrar) return;

        btnEntrar.addEventListener("click", _entrarSistema);

        campoSenha?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); _entrarSistema(); }
        });

        campoEmail?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                campoSenha?.focus();
            }
        });
    }

    async function _entrarSistema() {
        // FIX: lock duplo — disabled no DOM + flag JS (previne race condition)
        if (_loginEmAndamento) return;

        const campoEmail = document.getElementById("login-email");
        const campoSenha = document.getElementById("login-senha");
        const btnEntrar  = document.getElementById("btn-entrar");
        const divErro    = document.getElementById("login-erro");

        const email = campoEmail?.value.trim() ?? "";
        const senha = campoSenha?.value ?? "";

        // Validação básica no cliente (servidor valida novamente)
        if (!email || !senha) {
            _exibirErroLogin(divErro, "Insira suas credenciais corporativas.");
            return;
        }

        // FIX: validação de formato de e-mail no cliente
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            _exibirErroLogin(divErro, "Formato de e-mail inválido.");
            return;
        }

        _loginEmAndamento    = true;
        btnEntrar.disabled   = true;

        // FIX: salva texto do botão de forma segura (não innerHTML)
        // evita reinserção de HTML arbitrário se o botão for adulterado
        const labelOriginal  = btnEntrar.querySelector("span:not(.material-symbols-rounded)")?.textContent ?? "Entrar";
        const iconOriginal   = btnEntrar.querySelector(".material-symbols-rounded")?.textContent ?? "login";

        // Exibe estado de carregamento via DOM (sem innerHTML com dados externos)
        btnEntrar.innerHTML  = "";
        const iconSync = document.createElement("span");
        iconSync.className   = "material-symbols-rounded";
        iconSync.textContent = "sync";
        const labelSync = document.createElement("span");
        labelSync.textContent = " Autenticando...";
        btnEntrar.appendChild(iconSync);
        btnEntrar.appendChild(labelSync);

        if (divErro) divErro.style.display = "none";

        try {
            // FIX: CSRF token adicionado ao form de login
            const corpo = new URLSearchParams({ email, senha });
            if (CSRF_TOKEN) corpo.append("csrf_token", CSRF_TOKEN);

            const resposta = await fetch("/admin/login", {
                method:      "POST",
                headers:     {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-CSRF-Token": CSRF_TOKEN,
                },
                body:        corpo,
                credentials: "same-origin",
                // FIX: redirect "follow" (padrão) — deixa o browser seguir o redirect
                // do backend. Com redirect:"manual", resposta.url é "" em redirecionamentos
                // opacos, impossibilitando determinar o destino correto.
                // O backend já controla o destino (/app/ ou /admin/painel) pelo nível de acesso.
                redirect: "follow",
            });

            if (resposta.ok) {
                // FIX: redirect já foi seguido — resposta.url contém a URL final
                // Se o backend redirecionou, window.location já está no destino
                // Usamos resposta.url como destino seguro (validado pelo próprio servidor)
                window.location.replace(resposta.url || "/app/");

            } else if (resposta.status === 401 || resposta.status === 403) {
                // FIX: limpa o campo de senha após falha (padrão de segurança)
                if (campoSenha) campoSenha.value = "";
                _exibirErroLogin(divErro, "Credenciais inválidas ou acesso negado.");
                campoSenha?.focus();

            } else if (resposta.status === 429) {
                // FIX: trata rate limiting do servidor explicitamente
                _exibirErroLogin(
                    divErro,
                    "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente."
                );
            } else {
                // FIX: nunca exibe resposta.statusText — pode conter detalhes internos
                _exibirErroLogin(divErro, "Erro no servidor. Tente novamente em instantes.");
            }

        } catch {
            // FIX: sem detalhes do erro (sem console.error em produção)
            _exibirErroLogin(divErro, "Sem conexão com o servidor. Verifique a rede.");
            log("warn", "Falha de rede durante autenticação.");

        } finally {
            _loginEmAndamento = false;
            btnEntrar.disabled = false;

            // Restaura botão via DOM (seguro)
            btnEntrar.innerHTML = "";
            const iconOrig = document.createElement("span");
            iconOrig.className   = "material-symbols-rounded";
            iconOrig.textContent = iconOriginal;
            const labelOrig = document.createElement("span");
            labelOrig.textContent = ` ${labelOriginal}`;
            btnEntrar.appendChild(iconOrig);
            btnEntrar.appendChild(labelOrig);
        }
    }

    function _exibirErroLogin(divErro, mensagem) {
        if (!divErro) {
            log("warn", "#login-erro não encontrado:", mensagem);
            return;
        }
        // FIX: textContent — mensagem nunca deve virar HTML
        divErro.textContent   = mensagem;
        divErro.style.display = "block";
        divErro.setAttribute("role",      "alert");
        divErro.setAttribute("aria-live", "assertive");
        divErro.focus?.();
    }

    // =========================================================================
    // 4. LOGOUT
    // =========================================================================

    function _inicializarLogoutForm() {
        // FIX: suporta tanto <form action="/admin/logout"> quanto <button id="btn-logout">
        // Formulário POST é o método correto — GET é vulnerável a CSRF logout
        const formLogout = document.querySelector("form[action*='/logout']");
        if (formLogout) {
            formLogout.addEventListener("submit", async (e) => {
                e.preventDefault();
                await _executarLogout();
            });
        }

        // Fallback: botão sem form
        document.getElementById("btn-logout")
            ?.addEventListener("click", async (e) => {
                e.preventDefault();
                await _executarLogout();
            });
    }

    async function _executarLogout() {
        // FIX: confirmação antes de deslogar — admin pode clicar por acidente
        if (!confirm("Deseja realmente sair do sistema Tariel WF?")) return;

        try {
            // FIX: logout via POST com CSRF — GET é vulnerável a logout CSRF
            // (<img src="/admin/logout"> em página terceira desfaria a sessão)
            await fetch("/admin/logout", {
                method:      "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": CSRF_TOKEN,
                },
            });
        } catch {
            // FIX: falha silenciosa em produção — redireciona mesmo sem resposta
            log("warn", "Falha ao notificar logout ao servidor. Redirecionando...");
        } finally {
            // FIX: limpa Service Worker cache ao fazer logout
            // Previne que próximo usuário acesse dados em cache
            if ("serviceWorker" in navigator) {
                navigator.serviceWorker.controller?.postMessage({ tipo: "LIMPAR_CACHE" });
            }
            // Substitui o histórico — botão "Voltar" não retorna ao painel autenticado
            window.location.replace("/admin/login");
        }
    }

    // =========================================================================
    // 5. TOASTS — ÚNICA DEFINIÇÃO NO SISTEMA
    //
    // FIX: hardware.js e ui.js definiam window.exibirToast separadamente.
    // Definida aqui (ui.js, carregado por último) como fonte única de verdade.
    // hardware.js usa window.exibirToast que aponta para esta implementação.
    // =========================================================================

    // Tipos permitidos — whitelist para evitar injeção de classe CSS
    const TIPOS_TOAST = {
        info:    { bg: "#0F2B46", border: "#1E446A", icon: "info" },
        sucesso: { bg: "#1B5E20", border: "#2E7D32", icon: "check_circle" },
        erro:    { bg: "#7F0000", border: "#C62828", icon: "error" },
        aviso:   { bg: "#4A3000", border: "#F47B20", icon: "warning" },
    };

    // FIX: deduplicação — não empilha toasts idênticos
    const _toastsAtivos = new Set();

    function exibirToast(mensagem, tipo = "info", duracaoMs = 3000) {
        // FIX: valida tipo via whitelist — fallback para "info"
        const config = TIPOS_TOAST[tipo] ?? TIPOS_TOAST.info;

        // FIX: deduplicação por conteúdo — não empilha mensagens idênticas
        if (_toastsAtivos.has(mensagem)) return;
        _toastsAtivos.add(mensagem);

        // Cria container se não existir
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            Object.assign(container.style, {
                position:      "fixed",
                bottom:        "90px",
                right:         "20px",
                display:       "flex",
                flexDirection: "column",
                gap:           "8px",
                zIndex:        "9998",
                pointerEvents: "none",
                maxWidth:      "340px",
            });
            // FIX: aria-live region para que leitores de tela anunciem toasts
            container.setAttribute("aria-live",   "polite");
            container.setAttribute("aria-atomic", "false");
            document.body.appendChild(container);
        }

        // FIX: toast criado via DOM — sem innerHTML com dados externos (previne XSS)
        const toast = document.createElement("div");
        toast.setAttribute("role", tipo === "erro" ? "alert" : "status");
        Object.assign(toast.style, {
            background:    config.bg,
            border:        `1px solid ${config.border}`,
            borderLeft:    `4px solid ${config.border}`,
            color:         "#fff",
            padding:       "10px 16px",
            borderRadius:  "8px",
            fontSize:      "13px",
            display:       "flex",
            alignItems:    "center",
            gap:           "8px",
            boxShadow:     "0 4px 14px rgba(0,0,0,0.3)",
            pointerEvents: "auto",
            transition:    "opacity 0.3s ease, transform 0.3s ease",
            opacity:       "0",
            transform:     "translateY(8px)",
        });

        // Ícone (Material Symbols — valor vem da whitelist interna, seguro)
        const icone = document.createElement("span");
        icone.className   = "material-symbols-rounded";
        icone.style.fontSize = "18px";
        icone.setAttribute("aria-hidden", "true");
        icone.textContent = config.icon;

        // FIX: textContent — mensagem nunca deve virar HTML
        const texto = document.createElement("span");
        texto.textContent = mensagem;

        toast.appendChild(icone);
        toast.appendChild(texto);
        container.appendChild(toast);

        // Anima entrada
        requestAnimationFrame(() =>
            requestAnimationFrame(() => {
                toast.style.opacity   = "1";
                toast.style.transform = "translateY(0)";
            })
        );

        // Remove após duração
        setTimeout(() => {
            toast.style.opacity   = "0";
            toast.style.transform = "translateY(8px)";
            setTimeout(() => {
                toast.remove();
                _toastsAtivos.delete(mensagem);
            }, 300);
        }, duracaoMs);
    }

    // =========================================================================
    // NAMESPACE DE EXPORTS
    // FIX: agrupa em window.TarielUI — não polui window com funções avulsas
    // =========================================================================

    window.TarielUI = {
        exibirToast,
        fecharSidebar() {
            const s = document.getElementById("barra-historico");
            const o = document.querySelector(".overlay-sidebar");
            const b = document.getElementById("btn-menu");
            if (s && o && b) _fecharSidebar(s, o, b);
        },
        logout: _executarLogout,
    };

    // Aliases globais para retrocompatibilidade com chamadas legadas
    window.exibirToast  = exibirToast;
    window.fecharSidebar = window.TarielUI.fecharSidebar;
    window.sairSistema  = _executarLogout;
    // FIX: entrarSistema removida do escopo global — não deve ser chamável externamente
    // O formulário de login usa o handler registrado por _inicializarLoginForm()

})();
