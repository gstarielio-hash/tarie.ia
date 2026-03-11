// ==========================================
// TARIEL CONTROL TOWER — SERVICE WORKER
// Versão: 3.0.0-Enterprise
// Escopo: /app/ (apenas área do inspetor)
//
// ATENÇÃO: /admin/ NUNCA deve ser cacheado.
// Dados administrativos são sempre servidos
// diretamente do servidor (autenticação ativa).
//
// FIX 404: este arquivo deve ser servido em /app/trabalhador_servico.js
// Verifique main.py — a rota deve ser:
//   @app.get("/app/trabalhador_servico.js")
//   async def service_worker():
//       return FileResponse("static/js/trabalhador_servico.js",
//                           media_type="application/javascript",
//                           headers={"Service-Worker-Allowed": "/app/"})
// ==========================================

"use strict";

const VERSAO_APP     = "3.0.0";
const CACHE_ESTATICO = `wf-estatico-v${VERSAO_APP}`;
const CACHE_DINAMICO = `wf-dinamico-v${VERSAO_APP}`;
const CACHE_FONTES   = `wf-fontes-v${VERSAO_APP}`;

const EM_PRODUCAO = self.location.hostname !== "localhost"
                 && self.location.hostname !== "127.0.0.1";

function log(nivel, ...args) {
    if (EM_PRODUCAO) return;
    console[nivel]("[WF SW]", ...args);
}

// FIX: limites separados por tipo de cache
// CACHE_ESTATICO contém arquivos do núcleo — NUNCA deve ser limitado/truncado
// CACHE_DINAMICO contém páginas HTML navegadas — pode ser rotacionado com segurança
const LIMITE_CACHE_DINAMICO = 30;
const EXPIRACAO_CACHE_DIAS  = 7;

const ARQUIVOS_NUCLEO = [
    "/app/",
    "/static/css/global.css",
    "/static/css/layout.css",
    "/static/css/chat.css",
    "/static/js/api.js",
    "/static/js/ui.js",
    "/static/js/hardware.js",
    "/app/manifesto.json",
];

const ORIGENS_FONTES = new Set([
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
]);

const ROTAS_SEM_CACHE = [
    "/admin/",
    "/app/api/",
    "/app/logout",
];


// ==========================================
// 1. INSTALAÇÃO
// ==========================================

self.addEventListener("install", (evento) => {
    log("log", `Instalando v${VERSAO_APP}...`);

    evento.waitUntil(
        caches.open(CACHE_ESTATICO)
            .then(async (cache) => {
                const resultados = await Promise.allSettled(
                    ARQUIVOS_NUCLEO.map((url) =>
                        cache.add(url).catch((err) => {
                            log("warn", `Falha ao cachear ${url}:`, err.message);
                            return null;
                        })
                    )
                );
                const falhas = resultados.filter(r => r.status === "rejected").length;
                if (falhas > 0) log("warn", `${falhas} arquivo(s) do núcleo não cacheados.`);
            })
            .then(() => {
                if (!EM_PRODUCAO) return self.skipWaiting();
                log("log", `v${VERSAO_APP} instalada. Aguardando ativação.`);
            })
    );
});


// ==========================================
// 2. ATIVAÇÃO
// ==========================================

self.addEventListener("activate", (evento) => {
    log("log", `Ativando v${VERSAO_APP}...`);

    evento.waitUntil(
        Promise.all([
            caches.keys().then(async (nomes) => {
                const cachesProprios = new Set([CACHE_ESTATICO, CACHE_DINAMICO, CACHE_FONTES]);
                const obsoletos = nomes.filter(
                    (nome) => nome.startsWith("wf-") && !cachesProprios.has(nome)
                );
                await Promise.all(
                    obsoletos.map((nome) => {
                        log("log", `Removendo cache obsoleto: ${nome}`);
                        return caches.delete(nome);
                    })
                );
            }),
            _limparCacheExpirado(),
        ]).then(() => {
            log("log", `v${VERSAO_APP} ativa.`);
            return self.clients.claim();
        })
    );
});


// ==========================================
// 3. MENSAGENS DO CLIENTE
// ==========================================

self.addEventListener("message", (evento) => {
    if (!_origemConfiavel(evento.origin)) {
        log("warn", `Mensagem rejeitada de origem não confiável: ${evento.origin}`);
        return;
    }

    const { tipo } = evento.data ?? {};

    switch (tipo) {
        case "SKIP_WAITING":
            log("log", "skipWaiting solicitado pelo cliente.");
            self.skipWaiting();
            break;

        case "LIMPAR_CACHE":
            evento.waitUntil(
                caches.keys()
                    .then((nomes) => Promise.all(nomes.map((n) => caches.delete(n))))
                    .then(() => {
                        log("log", "Cache limpo a pedido do cliente.");
                        evento.source?.postMessage({ tipo: "CACHE_LIMPO" });
                    })
            );
            break;

        case "PING":
            evento.source?.postMessage({ tipo: "PONG", versao: VERSAO_APP });
            break;

        default:
            log("warn", `Tipo de mensagem desconhecido: ${tipo}`);
    }
});


// ==========================================
// 4. INTERCEPTAÇÃO DE FETCH
// ==========================================

self.addEventListener("fetch", (evento) => {
    const req = evento.request;
    const url = new URL(req.url);

    if (!url.protocol.startsWith("http")) return;
    if (url.hostname === "localhost" && url.port && url.port !== self.location.port) return;

    // Fontes externas — Cache-First separado
    if (ORIGENS_FONTES.has(url.origin)) {
        evento.respondWith(_estrategiaFontes(req));
        return;
    }

    // Ignora origens externas não-fonte
    if (url.origin !== self.location.origin) return;

    // POST e outros métodos não-GET
    if (req.method !== "GET") {
        evento.respondWith(_estrategiaPost(req));
        return;
    }

    // Rotas sem cache — sempre rede
    const semCache = ROTAS_SEM_CACHE.some((rota) => url.pathname.startsWith(rota));
    if (semCache) {
        evento.respondWith(
            fetch(req, { credentials: "same-origin" })
                .catch(() => _respostaOffline(url))
        );
        return;
    }

    // FIX: separa estratégia por tipo de recurso
    // Assets estáticos (CSS/JS/imagens) → CACHE_ESTATICO (sem limite de rotação)
    // Páginas HTML navegadas (/app/*) → CACHE_DINAMICO (rotacionado + expiração)
    const ehPaginaHtml = url.pathname.startsWith("/app/") && !url.pathname.includes(".");
    const nomeCache    = ehPaginaHtml ? CACHE_DINAMICO : CACHE_ESTATICO;

    evento.respondWith(_estrategiaStaleWhileRevalidate(req, nomeCache, ehPaginaHtml));
});


// ==========================================
// ESTRATÉGIAS DE CACHE
// ==========================================

// Fontes — Cache-First
async function _estrategiaFontes(req) {
    const cache         = await caches.open(CACHE_FONTES);
    const respostaCache = await cache.match(req);
    if (respostaCache) return respostaCache;

    try {
        const resposta = await fetch(req, { credentials: "omit" });
        if (resposta.status === 200 &&
            (resposta.type === "cors" || resposta.type === "basic")) {
            await cache.put(req, resposta.clone()).catch(() => {});
        }
        return resposta;
    } catch {
        return new Response("", {
            status: 200,
            headers: { "Content-Type": "text/css" },
        });
    }
}

// POST — sempre rede, sem cache
async function _estrategiaPost(req) {
    try {
        return await fetch(req, { credentials: "same-origin" });
    } catch {
        return _respostaOffline(new URL(req.url));
    }
}

// Stale-While-Revalidate
async function _estrategiaStaleWhileRevalidate(req, nomeCache, aplicarLimite = false) {
    const cache         = await caches.open(nomeCache);
    const respostaCache = await cache.match(req);

    const promessaRede = fetch(req, { credentials: "same-origin" })
        .then(async (resposta) => {
            if (resposta?.status === 200 && resposta.type === "basic") {
                // FIX: reconstrói a resposta com header x-sw-cached-at antes de cachear.
                // _limparCacheExpirado lê este header — sem ele a expiração nunca funciona.
                const headersNovos = new Headers(resposta.headers);
                headersNovos.set("x-sw-cached-at", String(Date.now()));

                const respostaCom = new Response(await resposta.clone().blob(), {
                    status:     resposta.status,
                    statusText: resposta.statusText,
                    headers:    headersNovos,
                });

                await cache.put(req, respostaCom).catch(() => {});

                // FIX: limite de rotação aplicado SOMENTE ao cache dinâmico (páginas HTML).
                // Antes era aplicado ao CACHE_ESTATICO, podendo remover global.css, api.js, etc.
                if (aplicarLimite) {
                    await _limitarTamanhoCache(nomeCache, LIMITE_CACHE_DINAMICO);
                }
            }
            return resposta;
        })
        .catch(() => null);

    if (respostaCache) return respostaCache;

    const respostaRede = await promessaRede;
    if (respostaRede) return respostaRede;

    return _respostaOffline(new URL(req.url));
}


// ==========================================
// RESPOSTAS OFFLINE
// ==========================================

const HEADERS_SEGURANCA = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options":        "DENY",
    "Cache-Control":          "no-store",
};

function _respostaOffline(url) {
    if (url.pathname.includes("/api/chat")) {
        const payload =
            "data: " +
            JSON.stringify({
                texto: "\n\n**[Tariel Offline]** Sem conexão com o servidor. " +
                       "Verifique a rede e tente novamente.",
            }) +
            "\n\ndata: [FIM]\n\n";

        return new Response(payload, {
            status: 200,
            headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                ...HEADERS_SEGURANCA,
            },
        });
    }

    if (url.pathname.startsWith("/app/") && !url.pathname.includes(".")) {
        return new Response(_htmlOffline(), {
            status: 503,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                ...HEADERS_SEGURANCA,
            },
        });
    }

    return new Response(
        JSON.stringify({ erro: "Dispositivo offline. Tente novamente com conexão ativa." }),
        {
            status: 503,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                ...HEADERS_SEGURANCA,
            },
        }
    );
}

function _htmlOffline() {
    // FIX: onclick="location.reload()" removido — inline event handlers são
    // bloqueados por CSP (script-src 'self'). Substituído por addEventListener
    // num <script> dedicado ao final do body (sem nonce necessário pois esta
    // resposta sintética do SW não carrega o CSP header do middleware).
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sem Conexão • Tariel WF</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#081624;color:#B0C4DE;font-family:system-ui,sans-serif;
         display:flex;justify-content:center;align-items:center;
         min-height:100vh;padding:24px;text-align:center}
    .card{background:#0F2B46;border-radius:12px;padding:40px 32px;
          max-width:420px;border-top:4px solid #F47B20}
    .icone{font-size:48px;margin-bottom:16px}
    h1{font-size:20px;font-weight:700;color:#fff;margin-bottom:8px}
    p{font-size:14px;color:#B0C4DE;line-height:1.6;margin-bottom:24px}
    button{background:#F47B20;color:#fff;border:none;border-radius:8px;
           padding:12px 24px;font-weight:700;cursor:pointer;font-size:15px}
    button:hover{background:#d9691a}
  </style>
</head>
<body>
  <div class="card" role="main">
    <div class="icone" aria-hidden="true">📡</div>
    <h1>Sem Conexão</h1>
    <p>O Tariel WF não conseguiu conectar ao servidor.<br>
       Verifique sua rede e tente novamente.</p>
    <button id="btn-reconectar" aria-label="Tentar reconectar">
      Tentar Novamente
    </button>
  </div>
  <script>
    document.getElementById("btn-reconectar")
            .addEventListener("click", function() { location.reload(); });
  </script>
</body>
</html>`;
}


// ==========================================
// UTILITÁRIOS
// ==========================================

function _origemConfiavel(origem) {
    if (!origem) return false;
    try {
        const url = new URL(origem);
        if (url.origin === self.location.origin) return true;
        if (!EM_PRODUCAO && url.hostname === "localhost") return true;
        return false;
    } catch {
        return false;
    }
}

// FIX: limita APENAS o cache dinâmico — nunca chamado para CACHE_ESTATICO
async function _limitarTamanhoCache(nomeCache, limite) {
    try {
        const cache  = await caches.open(nomeCache);
        const chaves = await cache.keys();
        if (chaves.length <= limite) return;

        const excesso = chaves.slice(0, chaves.length - limite);
        await Promise.all(excesso.map((chave) => cache.delete(chave)));
        log("log", `Cache "${nomeCache}" limitado: ${excesso.length} entrada(s) removida(s).`);
    } catch (e) {
        log("warn", "Falha ao limitar tamanho do cache:", e.message);
    }
}

// FIX: agora o header x-sw-cached-at é gravado em _estrategiaStaleWhileRevalidate
// Esta função passa a encontrar o header e remover entradas expiradas corretamente
async function _limparCacheExpirado() {
    try {
        const cache  = await caches.open(CACHE_DINAMICO);
        const chaves = await cache.keys();
        const agora  = Date.now();
        const maxIdade = EXPIRACAO_CACHE_DIAS * 24 * 60 * 60 * 1000;

        await Promise.allSettled(
            chaves.map(async (chave) => {
                const resposta  = await cache.match(chave);
                const dataCache = resposta?.headers.get("x-sw-cached-at");
                if (dataCache && (agora - parseInt(dataCache, 10)) > maxIdade) {
                    await cache.delete(chave);
                    log("log", `Cache expirado removido: ${chave.url}`);
                }
            })
        );
    } catch (e) {
        log("warn", "Falha ao limpar cache expirado:", e.message);
    }
}
