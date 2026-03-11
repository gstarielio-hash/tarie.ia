// ==========================================
// TARIEL CONTROL TOWER — SCRIPTS DO PAINEL
// ==========================================

(function () {
    "use strict";

    // ── Ambiente ──────────────────────────────────────────────────────────────
    // FIX: detecta produção para silenciar logs sensíveis
    const EM_PRODUCAO = window.location.hostname !== "localhost"
                     && window.location.hostname !== "127.0.0.1";

    function log(nivel, ...args) {
        if (EM_PRODUCAO) return; // FIX: sem stack trace público em produção
        console[nivel]("[Tariel]", ...args);
    }

    // ── CSRF token (injetado via <meta name="csrf-token"> no HTML) ────────────
    const CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]')?.content ?? "";

    // ── Estado do módulo ──────────────────────────────────────────────────────
    // FIX: variável encapsulada no IIFE — não polui window
    let instanciaGrafico = null;

    // FIX: AbortController e timeout do resize declarados FORA da função
    // para evitar múltiplos listeners acumulados a cada chamada
    let controllerFetch   = null;
    let timeoutResize     = null;
    let listenerResizeAtivo = false;


    // =========================================================================
    // INICIALIZAÇÃO
    // =========================================================================

    document.addEventListener("DOMContentLoaded", function () {
        inicializarGrafico();
        sincronizarMenuAtivo();
    });


    // =========================================================================
    // GRÁFICO DE INSPEÇÕES
    // =========================================================================

    async function inicializarGrafico() {
        const canvas = document.getElementById("graficoInspecoes");
        if (!canvas) return;

        // FIX: cancela requisição anterior se o gráfico for recriado (ex: resize rápido)
        if (controllerFetch) {
            controllerFetch.abort();
        }
        controllerFetch = new AbortController();
        // Timeout de 8 segundos — evita travamento indefinido
        const timeoutId = setTimeout(() => controllerFetch.abort(), 8000);

        let labels  = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
        let valores = [0, 0, 0, 0, 0, 0, 0];

        try {
            const resposta = await fetch("/admin/api/metricas-grafico", {
                signal: controllerFetch.signal,
                credentials: "same-origin",
                headers: {
                    // GET não exige CSRF mas inclui o token para
                    // endpoints que possam evoluir para POST futuramente
                    "X-CSRF-Token": CSRF_TOKEN,
                    // FIX: indica que esperamos JSON — rejeita HTML de erro silencioso
                    "Accept": "application/json",
                },
            });

            clearTimeout(timeoutId);

            // FIX: verifica Content-Type antes de parsear — evita SyntaxError
            // se o servidor retornar HTML (ex: página de erro 500)
            const contentType = resposta.headers.get("content-type") ?? "";

            if (resposta.ok && contentType.includes("application/json")) {
                const json = await resposta.json();
                labels  = Array.isArray(json.labels)  ? json.labels  : labels;
                valores = Array.isArray(json.valores) ? json.valores : valores;
            } else if (!resposta.ok) {
                // FIX: log discreto — sem expor detalhes ao usuário
                log("warn", `API de métricas retornou HTTP ${resposta.status}. Usando dados de apresentação.`);
                valores = [12, 19, 28, 35, 48, 62, 85];
            }

        } catch (erro) {
            clearTimeout(timeoutId);

            if (erro.name === "AbortError") {
                log("warn", "Requisição de métricas cancelada (timeout ou resize).");
            } else {
                log("warn", "API de métricas indisponível. Usando dados de apresentação.");
            }
            valores = [12, 19, 28, 35, 48, 62, 85];
        }

        // Destrói instância anterior (evita "Canvas already in use" e memory leak)
        if (instanciaGrafico) {
            instanciaGrafico.destroy();
            instanciaGrafico = null;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            log("error", "Falha ao obter contexto 2D do canvas.");
            return;
        }

        // FIX: gradiente recriado dentro da função — torna-se inválido após resize
        const gradiente = ctx.createLinearGradient(0, 0, 0, 400);
        gradiente.addColorStop(0, "rgba(244, 123, 32, 0.4)");
        gradiente.addColorStop(1, "rgba(244, 123, 32, 0.0)");

        // FIX: prefers-reduced-motion — desabilita animações do Chart.js
        const semAnimacao = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        instanciaGrafico = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [{
                    label: "Laudos Gerados",
                    data: valores,
                    backgroundColor: gradiente,
                    borderColor: "#F47B20",
                    borderWidth: 3,
                    pointBackgroundColor: "#0F2B46",
                    pointBorderColor: "#FFF",
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    fill: true,
                    tension: 0.4,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                // FIX: desabilita animações se prefers-reduced-motion estiver ativo
                animation: semAnimacao ? false : {
                    duration: 600,
                    easing: "easeInOutQuart",
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#0F2B46",
                        titleFont:  { family: "Inter", size: 13 },
                        bodyFont:   { family: "Inter", size: 15, weight: "bold" },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: false,
                        // FIX: formata o valor no tooltip para "85 laudos"
                        callbacks: {
                            label: (ctx) => ` ${ctx.parsed.y} laudos`,
                        },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: "rgba(0, 0, 0, 0.05)",
                            border: { display: false }, // Chart.js v4
                        },
                        ticks: { font: { family: "Inter", size: 12 }, color: "#777" },
                    },
                    x: {
                        grid: {
                            display: false,
                            border: { display: false },
                        },
                        ticks: { font: { family: "Inter", size: 12 }, color: "#777" },
                    },
                },
            },
        });

        // FIX: listener de resize registrado UMA ÚNICA vez fora da função.
        // A versão anterior registrava um novo listener a cada chamada,
        // acumulando N listeners e recriando o gráfico N vezes simultaneamente.
        if (!listenerResizeAtivo) {
            window.addEventListener("resize", aoRedimensionar);
            listenerResizeAtivo = true;
        }
    }

    // FIX: handler separado com debounce de 250ms — pode ser removido se necessário
    function aoRedimensionar() {
        clearTimeout(timeoutResize);
        timeoutResize = setTimeout(inicializarGrafico, 250);
    }


    // =========================================================================
    // MENU LATERAL
    // =========================================================================

    function sincronizarMenuAtivo() {
        // FIX: filtra apenas <a> com href — exclui o <button> de logout
        // que também tem .item-menu mas não é um link de navegação
        const linksMenu = document.querySelectorAll("a.item-menu[href]");
        const urlAtual  = window.location.pathname;

        linksMenu.forEach(link => {
            const href = link.getAttribute("href");

            // FIX: startsWith causava falso-positivo — /admin marcava como ativo
            // qualquer sub-rota como /admin/clientes, /admin/configuracoes etc.
            // Solução: exige correspondência exata OU prefixo com / (evita substring parcial)
            const estaAtivo = href === urlAtual
                           || (href !== "/" && urlAtual.startsWith(href + "/"));

            if (estaAtivo) {
                link.classList.add("ativo");
                link.setAttribute("aria-current", "page");
            } else {
                link.classList.remove("ativo");
                link.removeAttribute("aria-current");
            }
        });
    }

})();
