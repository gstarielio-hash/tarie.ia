// ==========================================
// TARIEL CONTROL TOWER — SERVICE WORKER
// Versão: 3.0.1-Enterprise
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
//       return FileResponse("static/js/shared/trabalhador_servico.js",
//                           media_type="application/javascript",
//                           headers={"Service-Worker-Allowed": "/app/"})
// ==========================================

"use strict";

const VERSAO_APP = "3.0.1";
const PREFIXO_CACHE = "wf-";
const CACHE_ESTATICO = `${PREFIXO_CACHE}estatico-v${VERSAO_APP}`;
const CACHE_DINAMICO = `${PREFIXO_CACHE}dinamico-v${VERSAO_APP}`;
const CACHE_FONTES = `${PREFIXO_CACHE}fontes-v${VERSAO_APP}`;

const ESCOPO_APP = "/app";
const LIMITE_CACHE_DINAMICO = 30;
const EXPIRACAO_CACHE_DIAS = 7;

const EM_PRODUCAO =
    self.location.hostname !== "localhost" &&
    self.location.hostname !== "127.0.0.1";

const ARQUIVOS_NUCLEO = [
    `${ESCOPO_APP}/`,
    "/static/css/shared/global.css",
    "/static/css/shared/layout.css",
    "/static/css/chat/chat_base.css",
    "/static/css/chat/chat_index.css",
    "/static/js/shared/api.js",
    "/static/js/shared/ui.js",
    "/static/js/shared/hardware.js",
    `${ESCOPO_APP}/manifesto.json`,
];

const ORIGENS_FONTES = new Set([
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
]);

const ROTAS_SEM_CACHE = [
    "/admin/",
    `${ESCOPO_APP}/api/`,
    `${ESCOPO_APP}/logout`,
];

function log(nivel, ...args) {
    if (EM_PRODUCAO) return;
    const fn = console?.[nivel] || console.log;
    fn("[WF SW]", ...args);
}

// ==========================================
// 1. INSTALAÇÃO
// ==========================================

self.addEventListener("install", (evento) => {
    log("log", `Instalando v${VERSAO_APP}...`);

    evento.waitUntil((async () => {
        const cache = await caches.open(CACHE_ESTATICO);

        const resultados = await Promise.allSettled(
            ARQUIVOS_NUCLEO.map(async (url) => {
                const req = new Request(url, { cache: "reload" });
                await cache.add(req);
            })
        );

        const falhas = resultados.filter((r) => r.status === "rejected");
        for (const falha of falhas) {
            log("warn", "Falha ao cachear arquivo do núcleo:", falha.reason?.message || falha.reason);
        }

        await self.skipWaiting();
        log("log", `v${VERSAO_APP} instalada.`);
    })());
});

// ==========================================
// 2. ATIVAÇÃO
// ==========================================

self.addEventListener("activate", (evento) => {
    log("log", `Ativando v${VERSAO_APP}...`);

    evento.waitUntil((async () => {
        const nomes = await caches.keys();
        const cachesAtuais = new Set([CACHE_ESTATICO, CACHE_DINAMICO, CACHE_FONTES]);

        await Promise.all(
            nomes
                .filter((nome) => nome.startsWith(PREFIXO_CACHE) && !cachesAtuais.has(nome))
                .map(async (nome) => {
                    log("log", `Removendo cache obsoleto: ${nome}`);
                    await caches.delete(nome);
                })
        );

        await _limparCacheExpirado();
        await self.clients.claim();

        log("log", `v${VERSAO_APP} ativa.`);
    })());
});

// ==========================================
// 3. MENSAGENS DO CLIENTE
// ==========================================

self.addEventListener("message", (evento) => {
    evento.waitUntil(_tratarMensagem(evento));
});

async function _tratarMensagem(evento) {
    const clienteConfiavel = await _clienteConfiavel(evento);
    if (!clienteConfiavel) {
        log("warn", "Mensagem rejeitada: cliente não confiável.");
        return;
    }

    const { tipo } = evento.data ?? {};

    switch (tipo) {
        case "SKIP_WAITING":
            log("log", "skipWaiting solicitado pelo cliente.");
            await self.skipWaiting();
            await _responderCliente(evento.source, {
                tipo: "SW_ATUALIZANDO",
                versao: VERSAO_APP,
            });
            break;

        case "LIMPAR_CACHE":
        case "LIMPARCACHE":
            await _limparTodosOsCaches();
            log("log", "Cache limpo a pedido do cliente.");
            await _responderCliente(evento.source, {
                tipo: "CACHE_LIMPO",
                versao: VERSAO_APP,
            });
            break;

        case "PING":
            await _responderCliente(evento.source, {
                tipo: "PONG",
                versao: VERSAO_APP,
            });
            break;

        default:
            log("warn", `Tipo de mensagem desconhecido: ${tipo}`);
            await _responderCliente(evento.source, {
                tipo: "SW_MENSAGEM_IGNORADA",
                versao: VERSAO_APP,
            });
    }
}

// ==========================================
// 4. INTERCEPTAÇÃO DE FETCH
// ==========================================

self.addEventListener("fetch", (evento) => {
    const req = evento.request;
    const url = new URL(req.url);

    if (!/^https?:$/.test(url.protocol)) return;

    if (url.hostname === "localhost" && url.port && url.port !== self.location.port) {
        return;
    }

    const mesmaOrigem = url.origin === self.location.origin;
    const aceitaSSE = (req.headers.get("accept") || "").includes("text/event-stream");
    const ehRotaSemCache = ROTAS_SEM_CACHE.some((rota) => url.pathname.startsWith(rota));

    if (ORIGENS_FONTES.has(url.origin)) {
        evento.respondWith(_estrategiaFontes(req));
        return;
    }

    if (!mesmaOrigem) return;

    if (aceitaSSE) {
        evento.respondWith(
            fetch(req).catch(() => _respostaOffline(url, req))
        );
        return;
    }

    if (req.method !== "GET") {
        evento.respondWith(_estrategiaRedePura(req));
        return;
    }

    if (ehRotaSemCache) {
        evento.respondWith(
            fetch(req).catch(() => _respostaOffline(url, req))
        );
        return;
    }

    const ehPaginaHtml =
        req.mode === "navigate" ||
        (url.pathname.startsWith(`${ESCOPO_APP}/`) && !url.pathname.includes("."));

    if (ehPaginaHtml) {
        evento.respondWith(_estrategiaNetworkFirst(req, CACHE_DINAMICO, true));
        return;
    }

    evento.respondWith(_estrategiaStaleWhileRevalidate(req, CACHE_ESTATICO, false));
});

// ==========================================
// ESTRATÉGIAS DE CACHE
// ==========================================

async function _estrategiaRedePura(req) {
    try {
        return await fetch(req);
    } catch {
        return _respostaOffline(new URL(req.url), req);
    }
}

// Fontes — Cache-First
async function _estrategiaFontes(req) {
    const cache = await caches.open(CACHE_FONTES);
    const respostaCache = await cache.match(req);
    if (respostaCache) return respostaCache;

    try {
        const resposta = await fetch(req, { credentials: "omit" });

        if (_podeCachearResposta(req, resposta, { aceitarCors: true })) {
            await cache.put(req, resposta.clone()).catch(() => { });
        }

        return resposta;
    } catch {
        return new Response("", {
            status: 200,
            headers: { "Content-Type": "text/css; charset=utf-8" },
        });
    }
}

// Páginas HTML — Network First
async function _estrategiaNetworkFirst(req, nomeCache, aplicarLimite = false) {
    const cache = await caches.open(nomeCache);

    try {
        const resposta = await fetch(req);

        if (_podeCachearResposta(req, resposta)) {
            await cache.put(req, await _clonarComTimestamp(resposta));
            if (aplicarLimite) {
                await _limitarTamanhoCache(nomeCache, LIMITE_CACHE_DINAMICO);
            }
        }

        return resposta;
    } catch {
        const respostaCache = await cache.match(req);
        if (respostaCache) return respostaCache;

        const fallback = await caches.match(`${ESCOPO_APP}/`);
        if (fallback && req.mode === "navigate") return fallback;

        return _respostaOffline(new URL(req.url), req);
    }
}

// Assets estáticos — Stale While Revalidate
async function _estrategiaStaleWhileRevalidate(req, nomeCache, aplicarLimite = false) {
    const cache = await caches.open(nomeCache);
    const respostaCache = await cache.match(req);

    const promessaRede = fetch(req)
        .then(async (resposta) => {
            if (_podeCachearResposta(req, resposta)) {
                await cache.put(req, await _clonarComTimestamp(resposta));
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

    return _respostaOffline(new URL(req.url), req);
}

// ==========================================
// RESPOSTAS OFFLINE
// ==========================================

const HEADERS_SEGURANCA = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store",
};

function _respostaOffline(url, req) {
    const aceitaSSE = (req?.headers?.get("accept") || "").includes("text/event-stream");

    if (aceitaSSE || url.pathname.includes("/api/chat")) {
        const payload =
            "data: " +
            JSON.stringify({
                texto:
                    "\n\n**[Tariel Offline]** Sem conexão com o servidor. Verifique a rede e tente novamente.",
            }) +
            "\n\n" +
            "data: FIM\n\n";

        return new Response(payload, {
            status: 200,
            headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                ...HEADERS_SEGURANCA,
            },
        });
    }

    if (url.pathname.startsWith(`${ESCOPO_APP}/`) && !url.pathname.includes(".")) {
        return new Response(_htmlOffline(), {
            status: 503,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                ...HEADERS_SEGURANCA,
            },
        });
    }

    return new Response(
        JSON.stringify({
            erro: "Dispositivo offline. Tente novamente com conexão ativa.",
        }),
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
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sem Conexão • Tariel WF</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      background:#081624;
      color:#B0C4DE;
      font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      display:flex;
      justify-content:center;
      align-items:center;
      min-height:100vh;
      padding:24px;
      text-align:center
    }
    .card{
      background:#0F2B46;
      border-radius:12px;
      padding:40px 32px;
      max-width:420px;
      border-top:4px solid #F47B20;
      box-shadow:0 12px 40px rgba(0,0,0,.25)
    }
    .icone{font-size:48px;margin-bottom:16px}
    h1{font-size:20px;font-weight:700;color:#fff;margin-bottom:8px}
    p{font-size:14px;color:#B0C4DE;line-height:1.6;margin-bottom:24px}
    .acoes{display:flex;justify-content:center}
    a{
      background:#F47B20;
      color:#fff;
      border:none;
      border-radius:8px;
      padding:12px 24px;
      font-weight:700;
      cursor:pointer;
      font-size:15px;
      text-decoration:none
    }
    a:hover{background:#d9691a}
  </style>
</head>
<body>
  <div class="card" role="main" aria-labelledby="offline-titulo">
    <div class="icone" aria-hidden="true">📡</div>
    <h1 id="offline-titulo">Sem Conexão</h1>
    <p>O Tariel WF não conseguiu conectar ao servidor.<br>Verifique sua rede e tente novamente.</p>
    <div class="acoes">
      <a href="${ESCOPO_APP}/" aria-label="Tentar reconectar">Tentar Novamente</a>
    </div>
  </div>
</body>
</html>`;
}

// ==========================================
// UTILITÁRIOS
// ==========================================

async function _clienteConfiavel(evento) {
    try {
        if (!evento.source?.id) return false;

        const cliente = await self.clients.get(evento.source.id);
        if (!cliente?.url) return false;

        const url = new URL(cliente.url);

        if (url.origin !== self.location.origin) return false;
        if (!url.pathname.startsWith(`${ESCOPO_APP}/`)) return false;
        if (url.pathname.startsWith("/admin/")) return false;

        return true;
    } catch {
        return false;
    }
}

async function _responderCliente(source, payload) {
    try {
        source?.postMessage?.(payload);
    } catch (e) {
        log("warn", "Falha ao responder cliente:", e?.message || e);
    }
}

function _podeCachearResposta(req, resposta, opcoes = {}) {
    if (!resposta) return false;
    if (req.method !== "GET") return false;
    if (resposta.status !== 200) return false;

    const url = new URL(req.url);

    if (ROTAS_SEM_CACHE.some((rota) => url.pathname.startsWith(rota))) return false;

    const aceitaSSE = (req.headers.get("accept") || "").includes("text/event-stream");
    if (aceitaSSE) return false;

    const cacheControl = resposta.headers.get("cache-control") || "";
    if (/no-store|private|no-cache/i.test(cacheControl)) return false;

    const tiposPermitidos = opcoes.aceitarCors
        ? new Set(["basic", "cors"])
        : new Set(["basic"]);

    if (!tiposPermitidos.has(resposta.type)) return false;

    return true;
}

async function _clonarComTimestamp(resposta) {
    const headers = new Headers(resposta.headers);
    headers.set("x-sw-cached-at", String(Date.now()));

    const corpo = await resposta.clone().arrayBuffer();

    return new Response(corpo, {
        status: resposta.status,
        statusText: resposta.statusText,
        headers,
    });
}

async function _limparTodosOsCaches() {
    const nomes = await caches.keys();
    await Promise.all(nomes.map((nome) => caches.delete(nome)));
}

// Limita APENAS o cache dinâmico
async function _limitarTamanhoCache(nomeCache, limite) {
    try {
        const cache = await caches.open(nomeCache);
        const chaves = await cache.keys();
        if (chaves.length <= limite) return;

        const entradas = await Promise.all(
            chaves.map(async (chave) => {
                const resposta = await cache.match(chave);
                const ts = parseInt(resposta?.headers.get("x-sw-cached-at") || "0", 10);
                return { chave, ts: Number.isFinite(ts) ? ts : 0 };
            })
        );

        entradas.sort((a, b) => a.ts - b.ts);

        const excesso = entradas.slice(0, entradas.length - limite);
        await Promise.all(excesso.map((item) => cache.delete(item.chave)));

        log("log", `Cache "${nomeCache}" limitado: ${excesso.length} entrada(s) removida(s).`);
    } catch (e) {
        log("warn", "Falha ao limitar tamanho do cache:", e?.message || e);
    }
}

// Remove entradas expiradas do cache dinâmico
async function _limparCacheExpirado() {
    try {
        const cache = await caches.open(CACHE_DINAMICO);
        const chaves = await cache.keys();
        const agora = Date.now();
        const maxIdade = EXPIRACAO_CACHE_DIAS * 24 * 60 * 60 * 1000;

        await Promise.allSettled(
            chaves.map(async (chave) => {
                const resposta = await cache.match(chave);
                const dataCache = resposta?.headers.get("x-sw-cached-at");
                const ts = parseInt(dataCache || "0", 10);

                if (ts > 0 && (agora - ts) > maxIdade) {
                    await cache.delete(chave);
                    log("log", `Cache expirado removido: ${chave.url}`);
                }
            })
        );
    } catch (e) {
        log("warn", "Falha ao limpar cache expirado:", e?.message || e);
    }
}
