// ==========================================
// TARIEL CONTROL TOWER — SCRIPTS DO PAINEL
// ==========================================

(function () {
    "use strict";

    if (window.TarielPainelScripts) return;

    const CORE_FALLBACK = (() => {
        const EM_PRODUCAO =
            window.location.hostname !== "localhost" &&
            window.location.hostname !== "127.0.0.1";

        function log(nivel, ...args) {
            if (EM_PRODUCAO && nivel !== "error") return;
            try {
                if (EM_PRODUCAO) {
                    console.error("[Tariel Painel]", args[0] ?? "Erro");
                    return;
                }
                (console?.[nivel] ?? console?.log)?.call(console, "[Tariel Painel]", ...args);
            } catch (_) { }
        }

        function obterCSRFToken() {
            return document.querySelector('meta[name="csrf-token"]')?.content?.trim() ?? "";
        }

        return {
            EM_PRODUCAO,
            log,
            obterCSRFToken,
        };
    })();

    const Core = window.TarielCore ?? CORE_FALLBACK;

    let instanciaGrafico = null;
    let controllerFetch = null;
    let timeoutResize = null;
    let listenerResizeAtivo = false;
    let painelInicializado = false;

    let ultimoPayloadGrafico = {
        labels: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"],
        valores: [0, 0, 0, 0, 0, 0, 0],
    };

    function log(nivel, ...args) {
        Core.log?.(nivel, ...args);
    }

    function normalizarCaminho(path) {
        const bruto = String(path || "").trim();
        if (!bruto || bruto === "/") return "/";
        return bruto.replace(/\/+$/, "") || "/";
    }

    function obterCanvasGrafico() {
        return document.getElementById("graficoInspecoes");
    }

    function possuiChart() {
        return typeof window.Chart === "function";
    }

    function destruirGrafico() {
        if (!instanciaGrafico) return;
        try {
            instanciaGrafico.destroy();
        } catch (erro) {
            log("warn", "Falha ao destruir instância anterior do gráfico.", erro);
        } finally {
            instanciaGrafico = null;
        }
    }

    function abortarFetchGrafico() {
        if (!controllerFetch) return;
        try {
            controllerFetch.abort();
        } catch (_) {
        } finally {
            controllerFetch = null;
        }
    }

    function obterDadosFallback() {
        return {
            labels: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"],
            valores: [0, 0, 0, 0, 0, 0, 0],
        };
    }

    function sanitizarPayloadGrafico(payload) {
        const fallback = obterDadosFallback();

        const labels = Array.isArray(payload?.labels) && payload.labels.length
            ? payload.labels.map((item) => String(item ?? "").trim() || "—")
            : fallback.labels;

        const valores = Array.isArray(payload?.valores) && payload.valores.length
            ? payload.valores.map((item) => {
                const numero = Number(item);
                return Number.isFinite(numero) ? numero : 0;
            })
            : fallback.valores;

        if (labels.length !== valores.length) {
            const menor = Math.min(labels.length, valores.length);
            return {
                labels: labels.slice(0, menor),
                valores: valores.slice(0, menor),
            };
        }

        return { labels, valores };
    }

    function renderizarGrafico(labels, valores) {
        const canvas = obterCanvasGrafico();
        if (!canvas) return;

        if (!possuiChart()) {
            log("error", "Chart.js não está disponível na página.");
            return;
        }

        destruirGrafico();

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            log("error", "Falha ao obter contexto 2D do canvas.");
            return;
        }

        const gradiente = ctx.createLinearGradient(0, 0, 0, Math.max(canvas.height || 0, 320));
        gradiente.addColorStop(0, "rgba(244, 123, 32, 0.40)");
        gradiente.addColorStop(1, "rgba(244, 123, 32, 0.00)");

        const semAnimacao = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

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
                    pointBorderColor: "#FFFFFF",
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    fill: true,
                    tension: 0.35,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: semAnimacao
                    ? false
                    : {
                        duration: 600,
                        easing: "easeInOutQuart",
                    },
                interaction: {
                    intersect: false,
                    mode: "index",
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#0F2B46",
                        titleFont: { family: "Inter", size: 13 },
                        bodyFont: { family: "Inter", size: 15, weight: "bold" },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            label: (contexto) => ` ${contexto.parsed.y} laudos`,
                        },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: "rgba(0, 0, 0, 0.05)",
                            drawBorder: false,
                        },
                        border: {
                            display: false,
                        },
                        ticks: {
                            font: { family: "Inter", size: 12 },
                            color: "#777",
                            precision: 0,
                        },
                    },
                    x: {
                        grid: {
                            display: false,
                            drawBorder: false,
                        },
                        border: {
                            display: false,
                        },
                        ticks: {
                            font: { family: "Inter", size: 12 },
                            color: "#777",
                        },
                    },
                },
            },
        });
    }

    async function carregarMetricasGrafico() {
        const canvas = obterCanvasGrafico();
        if (!canvas) return;

        abortarFetchGrafico();
        controllerFetch = new AbortController();

        const timeoutId = setTimeout(() => {
            controllerFetch?.abort();
        }, 8000);

        try {
            const resposta = await fetch("/admin/api/metricas-grafico", {
                signal: controllerFetch.signal,
                credentials: "same-origin",
                headers: {
                    Accept: "application/json",
                    ...(Core.obterCSRFToken?.()
                        ? { "X-CSRF-Token": Core.obterCSRFToken() }
                        : {}),
                },
            });

            clearTimeout(timeoutId);

            const contentType = resposta.headers.get("content-type") ?? "";

            if (!resposta.ok) {
                throw new Error(`HTTP_${resposta.status}`);
            }

            if (!contentType.includes("application/json")) {
                throw new Error("CONTENT_TYPE_INVALIDO");
            }

            const json = await resposta.json();
            ultimoPayloadGrafico = sanitizarPayloadGrafico(json);
            renderizarGrafico(ultimoPayloadGrafico.labels, ultimoPayloadGrafico.valores);
        } catch (erro) {
            clearTimeout(timeoutId);

            if (erro?.name === "AbortError") {
                log("warn", "Requisição de métricas cancelada por timeout ou nova carga.");
            } else {
                log("warn", "Falha ao carregar métricas do gráfico. Usando fallback seguro.", erro);
            }

            ultimoPayloadGrafico = obterDadosFallback();
            renderizarGrafico(ultimoPayloadGrafico.labels, ultimoPayloadGrafico.valores);
        } finally {
            controllerFetch = null;
        }
    }

    function aoRedimensionar() {
        clearTimeout(timeoutResize);
        timeoutResize = setTimeout(() => {
            const canvas = obterCanvasGrafico();
            if (!canvas) return;
            renderizarGrafico(ultimoPayloadGrafico.labels, ultimoPayloadGrafico.valores);
        }, 250);
    }

    function sincronizarMenuAtivo() {
        const linksMenu = document.querySelectorAll("a.item-menu[href]");
        const urlAtual = normalizarCaminho(window.location.pathname);

        linksMenu.forEach((link) => {
            let caminhoLink = "/";

            try {
                caminhoLink = normalizarCaminho(new URL(link.href, window.location.origin).pathname);
            } catch (_) {
                caminhoLink = normalizarCaminho(link.getAttribute("href"));
            }

            const estaAtivo =
                caminhoLink === urlAtual ||
                (caminhoLink !== "/" && urlAtual.startsWith(caminhoLink + "/"));

            if (estaAtivo) {
                link.classList.add("ativo");
                link.setAttribute("aria-current", "page");
            } else {
                link.classList.remove("ativo");
                link.removeAttribute("aria-current");
            }
        });
    }

    function registrarListenerResize() {
        if (listenerResizeAtivo) return;
        window.addEventListener("resize", aoRedimensionar, { passive: true });
        listenerResizeAtivo = true;
    }

    function registrarLimpeza() {
        window.addEventListener("pagehide", () => {
            clearTimeout(timeoutResize);
            abortarFetchGrafico();
            destruirGrafico();
        });
    }

    function inicializarPainel() {
        if (painelInicializado) return;
        painelInicializado = true;

        sincronizarMenuAtivo();
        registrarListenerResize();
        registrarLimpeza();
        carregarMetricasGrafico();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", inicializarPainel, { once: true });
    } else {
        inicializarPainel();
    }

    window.TarielPainelScripts = {
        sincronizarMenuAtivo,
        recarregarGrafico: carregarMetricasGrafico,
        obterUltimoPayloadGrafico: () => ({ ...ultimoPayloadGrafico }),
    };
})();
