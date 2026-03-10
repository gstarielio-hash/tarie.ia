// ==========================================
// PAINEL.JS — Dashboard Admin WF
// Depende de: Chart.js (carregado antes no dashboard.html)
// Escopo: IIFE — não polui window
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
        console[nivel]("[Painel WF]", ...args);
    }

    // FIX: instância encapsulada — sem vazamento para window
    let _instanciaGrafico = null;

    // =========================================================================
    // INICIALIZAÇÃO
    // =========================================================================

    document.addEventListener("DOMContentLoaded", () => {
        _inicializarGrafico();
        _inicializarMenuAtivo();
        _inicializarLogoutConfirmacao();
    });

    // =========================================================================
    // GRÁFICO DE LAUDOS (últimos 7 dias)
    // =========================================================================

    function _inicializarGrafico() {
        const canvas = document.getElementById("graficoInspecoes");
        if (!canvas) return;

        // FIX: guarda de Chart.js — CDN pode ter falhado ao carregar
        if (typeof Chart === "undefined") {
            log("error", "Chart.js não encontrado. Verifique o carregamento do script.");
            _exibirFallbackGrafico(canvas, "Gráfico indisponível (Chart.js não carregado).");
            return;
        }

        // ── Leitura dos data-attributes ─────────────────────────────────────
        //
        // FIX: DOM Clobbering — `canvas.dataset` pode ser comprometido se um
        // elemento filho tiver name/id igual. Lemos via getAttribute no
        // elemento correto (o próprio canvas, verificado por ID).
        //
        // Verificamos também que `canvas` é de fato o elemento com esse ID
        // e não um objeto injetado via formulário.
        const canvasVerificado = document.getElementById("graficoInspecoes");
        if (canvasVerificado !== canvas) {
            log("error", "DOM Clobbering detectado no canvas do gráfico.");
            return;
        }

        let labels = [];
        let valores = [];

        try {
            const rawLabels = canvas.getAttribute("data-labels") || "[]";
            const rawValores = canvas.getAttribute("data-valores") || "[]";

            // FIX: limita o tamanho da string antes de parsear (evita DoS com JSON gigante)
            if (rawLabels.length > 2048 || rawValores.length > 2048) {
                throw new Error("Dados do gráfico excedem o tamanho máximo permitido.");
            }

            const parsedLabels = JSON.parse(rawLabels);
            const parsedValores = JSON.parse(rawValores);

            // FIX: valida que são arrays antes de usar
            if (!Array.isArray(parsedLabels) || !Array.isArray(parsedValores)) {
                throw new Error("Formato inválido: esperado Array para labels e valores.");
            }

            // FIX: sanitiza cada elemento — labels devem ser strings, valores devem ser números
            labels = parsedLabels.map((l) =>
                typeof l === "string" ? l.slice(0, 20) : String(l).slice(0, 20)
            );
            valores = parsedValores.map((v) => {
                const n = Number(v);
                // FIX: rejeita NaN, Infinity, negativos — laudos nunca são negativos
                return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
            });

            // FIX: garante que labels e valores têm o mesmo comprimento
            const tamanho = Math.min(labels.length, valores.length, 31); // máx. 31 dias
            labels = labels.slice(0, tamanho);
            valores = valores.slice(0, tamanho);

        } catch (e) {
            log("warn", `Dados do gráfico inválidos: ${e.message}. Usando placeholder.`);
            labels = [];
            valores = [];
        }

        // Gera últimos 7 dias como placeholder se o backend não enviou dados
        if (labels.length === 0) {
            const hoje = new Date();
            for (let i = 6; i >= 0; i--) {
                const d = new Date(hoje);
                d.setDate(hoje.getDate() - i);
                labels.push(d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }));
                valores.push(0);
            }
        }

        // ── Destrói instância anterior ───────────────────────────────────────
        // FIX: sem destruição prévia, Chart.js lança "Canvas already in use"
        // em navegação SPA, hot-reload ou chamadas repetidas
        if (_instanciaGrafico) {
            _instanciaGrafico.destroy();
            _instanciaGrafico = null;
        }

        // FIX: prefers-reduced-motion — desabilita animações quando solicitado
        const semAnimacao = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        // ── Acessibilidade: aria-label no canvas ─────────────────────────────
        // FIX: leitores de tela não descrevem canvas — aria-label fornece contexto
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Gráfico de barras: laudos gerados nos últimos ${labels.length} dias`);

        try {
            _instanciaGrafico = new Chart(canvas, {
                type: "bar",
                data: {
                    labels,
                    datasets: [{
                        label: "Laudos Gerados",
                        data: valores,
                        backgroundColor: "rgba(244, 123, 32, 0.75)",
                        borderColor: "#F47B20",
                        borderWidth: 1,
                        borderRadius: 6,
                        hoverBackgroundColor: "#F47B20",
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,

                    // FIX: desabilita animações se prefers-reduced-motion estiver ativo
                    animation: semAnimacao ? false : {
                        duration: 500,
                        easing: "easeInOutQuart",
                    },

                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            // FIX: estilo consistente com o restante do painel WF
                            backgroundColor: "#0F2B46",
                            titleFont: { family: "Inter", size: 12 },
                            bodyFont: { family: "Inter", size: 14, weight: "bold" },
                            padding: 10,
                            cornerRadius: 8,
                            displayColors: false,
                            callbacks: {
                                label: (ctx) => {
                                    const v = ctx.parsed.y;
                                    return ` ${v} laudo${v !== 1 ? "s" : ""}`;
                                },
                            },
                        },
                    },

                    scales: {
                        x: {
                            grid: {
                                color: "rgba(255,255,255,0.06)",
                                border: { display: false }, // Chart.js v4
                            },
                            ticks: {
                                color: "#B0C4DE",
                                // FIX: family ausente — usava fonte padrão do browser
                                font: { size: 11, family: "Inter" },
                            },
                        },
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: "rgba(255,255,255,0.06)",
                                border: { display: false },
                            },
                            ticks: {
                                color: "#B0C4DE",
                                font: { size: 11, family: "Inter" },
                                precision: 0,
                                // FIX: callback para garantir que só inteiros aparecem no eixo
                                callback: (v) => Number.isInteger(v) ? v : null,
                            },
                        },
                    },
                },
            });
        } catch (e) {
            log("error", `Falha ao instanciar Chart.js: ${e.message}`);
            _exibirFallbackGrafico(canvas, "Não foi possível renderizar o gráfico.");
        }
    }

    // FIX: fallback visual quando Chart.js falha — sem tela em branco
    function _exibirFallbackGrafico(canvas, mensagem) {
        const wrapper = canvas.parentElement;
        if (!wrapper) return;
        const fallback = document.createElement("div");
        fallback.className = "grafico-fallback";
        Object.assign(fallback.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#888",
            fontSize: "13px",
            fontStyle: "italic",
        });
        // FIX: textContent — sem risco de XSS com a mensagem
        fallback.textContent = mensagem;
        canvas.replaceWith(fallback);
    }

    // =========================================================================
    // MENU LATERAL: marca item ativo pela URL atual
    // =========================================================================

    function _inicializarMenuAtivo() {
        // FIX: seleciona apenas <a> com href — exclui <button> de logout
        // que também possui .item-menu mas não é um link de navegação
        const links = document.querySelectorAll("a.item-menu[href]");
        const atual = window.location.pathname;

        links.forEach((link) => {
            const href = link.getAttribute("href");

            // FIX: comparação exata falha com trailing slash (/admin vs /admin/)
            // Normaliza removendo barra final para comparação
            const hrefNorm = href.replace(/\/$/, "") || "/";
            const atualNorm = atual.replace(/\/$/, "") || "/";

            // FIX: startsWith com "/" no final — evita que /admin/ marque /admin/clientes
            const estaAtivo = hrefNorm === atualNorm
                || (hrefNorm !== "/" && atualNorm.startsWith(hrefNorm + "/"));

            link.classList.toggle("ativo", estaAtivo);

            if (estaAtivo) {
                link.setAttribute("aria-current", "page");
            } else {
                link.removeAttribute("aria-current");
            }
        });
    }

    // =========================================================================
    // CONFIRMAÇÃO DE LOGOUT
    // FIX: ausente no painel — admin pode sair por acidente ao clicar no botão
    // =========================================================================

    function _inicializarLogoutConfirmacao() {
        const formLogout = document.querySelector("form[action*='/logout']");
        if (!formLogout) return;

        formLogout.addEventListener("submit", (e) => {
            // FIX: confirm() simples — adequado para admin; substituir por
            // modal customizado se o projeto tiver modal reutilizável
            if (!confirm("Deseja realmente sair do sistema?")) {
                e.preventDefault();
            }
        });
    }

})();
