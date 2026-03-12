(function () {
    "use strict";

    if (window.__TARIEL_CLIENTE_PORTAL_WIRED__) return;
    window.__TARIEL_CLIENTE_PORTAL_WIRED__ = true;

    const STORAGE_TAB_KEY = "tariel.cliente.tab";
    const STORAGE_CHAT_KEY = "tariel.cliente.chat.laudo";
    const STORAGE_MESA_KEY = "tariel.cliente.mesa.laudo";

    const state = {
        bootstrap: null,
        ui: {
            tab: "admin",
            feedbackTimer: null,
            usuariosBusca: "",
            usuariosPapel: "todos",
            chatBusca: "",
            mesaBusca: "",
        },
        chat: {
            laudoId: null,
            mensagens: [],
        },
        mesa: {
            laudoId: null,
            mensagens: [],
            pacote: null,
        },
    };

    const $ = (id) => document.getElementById(id);
    const csrf = document.querySelector('meta[name="csrf-token"]')?.content || "";

    function texto(valor) {
        if (valor == null) return "";
        return String(valor);
    }

    function escapeHtml(valor) {
        return texto(valor)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function escapeAttr(valor) {
        return escapeHtml(valor);
    }

    function textoComQuebras(valor) {
        return escapeHtml(valor).replaceAll("\n", "<br>");
    }

    function formatarInteiro(valor) {
        const numero = Number(valor || 0);
        return Number.isFinite(numero) ? numero.toLocaleString("pt-BR") : "0";
    }

    function formatarPercentual(valor) {
        if (valor == null || valor === "") return "Ilimitado";
        const numero = Number(valor);
        return Number.isFinite(numero) ? `${numero}%` : "Ilimitado";
    }

    function formatarBytes(valor) {
        const numero = Number(valor || 0);
        if (!Number.isFinite(numero) || numero <= 0) return "0 B";
        const unidades = ["B", "KB", "MB", "GB"];
        let idx = 0;
        let atual = numero;
        while (atual >= 1024 && idx < unidades.length - 1) {
            atual /= 1024;
            idx += 1;
        }
        const casas = atual >= 10 || idx === 0 ? 0 : 1;
        return `${atual.toFixed(casas).replace(".", ",")} ${unidades[idx]}`;
    }

    function slugPapel(usuario) {
        const papel = texto(usuario?.papel).toLowerCase();
        if (papel.includes("admin")) return "admin_cliente";
        if (papel.includes("mesa") || papel.includes("revisor")) return "revisor";
        return "inspetor";
    }

    function obterNomePapel(slug) {
        if (slug === "admin_cliente") return "Admin-Cliente";
        if (slug === "revisor") return "Mesa Avaliadora";
        return "Inspetor";
    }

    function variantStatusLaudo(status) {
        const valor = texto(status).trim().toLowerCase();
        if (valor === "aguardando" || valor === "ajustes" || valor === "aprovado") {
            return valor;
        }
        return "aberto";
    }

    function parseDataIso(valor) {
        const timestamp = Date.parse(texto(valor));
        return Number.isFinite(timestamp) ? timestamp : 0;
    }

    function ordenarPorPrioridade(lista, resolverPrioridade) {
        return [...(Array.isArray(lista) ? lista : [])].sort((a, b) => {
            const prioridadeA = resolverPrioridade(a);
            const prioridadeB = resolverPrioridade(b);
            if (prioridadeB.score !== prioridadeA.score) {
                return prioridadeB.score - prioridadeA.score;
            }
            return parseDataIso(b?.atualizado_em) - parseDataIso(a?.atualizado_em);
        });
    }

    function prioridadeChat(laudo) {
        const status = variantStatusLaudo(laudo?.status_card);

        if (status === "ajustes") {
            return {
                score: 400,
                badge: "Acao agora",
                tone: "ajustes",
                acao: "Reabra o laudo e complemente o que a mesa devolveu para ajuste.",
            };
        }

        if (status === "aberto") {
            return {
                score: 320,
                badge: "Em operacao",
                tone: "aberto",
                acao: "Continue a conversa ou finalize quando o laudo estiver pronto.",
            };
        }

        if (status === "aguardando") {
            return {
                score: 220,
                badge: "Aguardando mesa",
                tone: "aguardando",
                acao: "Acompanhe o retorno da mesa e prepare a proxima resposta, se necessario.",
            };
        }

        return {
            score: 120,
            badge: "Concluido",
            tone: "aprovado",
            acao: "Sem acao urgente neste laudo agora.",
        };
    }

    function prioridadeMesa(laudo) {
        const pendencias = Number(laudo?.pendencias_abertas || 0);
        const whispers = Number(laudo?.whispers_nao_lidos || 0);
        const status = variantStatusLaudo(laudo?.status_card);

        if (whispers > 0 && pendencias > 0) {
            return {
                score: 620 + whispers * 12 + pendencias * 8,
                badge: "Resposta e pendencias",
                tone: "ajustes",
                acao: "Leia os whispers novos e trate as pendencias abertas antes da aprovacao.",
            };
        }

        if (whispers > 0) {
            return {
                score: 560 + whispers * 12,
                badge: "Responder agora",
                tone: "aguardando",
                acao: "Existe retorno novo do time. Responda a mesa antes da fila esfriar.",
            };
        }

        if (pendencias > 0) {
            return {
                score: 500 + pendencias * 10,
                badge: "Resolver pendencias",
                tone: "ajustes",
                acao: "Feche ou reabra as pendencias tecnicas antes de liberar o laudo.",
            };
        }

        if (status === "aguardando") {
            return {
                score: 300,
                badge: "Pronto para revisar",
                tone: "aguardando",
                acao: "Avalie este laudo e decida entre aprovar ou devolver para ajustes.",
            };
        }

        if (status === "ajustes") {
            return {
                score: 240,
                badge: "Ajustes em campo",
                tone: "ajustes",
                acao: "Acompanhe o retorno do time antes da aprovacao final.",
            };
        }

        if (status === "aprovado") {
            return {
                score: 120,
                badge: "Concluido",
                tone: "aprovado",
                acao: "Sem acao pendente neste laudo.",
            };
        }

        return {
            score: 180,
            badge: "Em preparacao",
            tone: "aberto",
            acao: "O laudo ainda esta sendo preparado pelo time antes da revisao formal.",
        };
    }

    function prioridadeEmpresa(empresa, usuarios) {
        const uso = Number(empresa?.uso_percentual ?? 0);
        const usuariosLista = Array.isArray(usuarios) ? usuarios : [];
        const bloqueados = usuariosLista.filter((item) => !item?.ativo).length;
        const temporarios = usuariosLista.filter((item) => item?.senha_temporaria_ativa).length;

        if (empresa?.status_bloqueio) {
            return {
                tone: "ajustes",
                badge: "Conta bloqueada",
                acao: "Libere a empresa e revise imediatamente o que esta travando a operacao.",
            };
        }
        if (uso >= 90) {
            return {
                tone: "ajustes",
                badge: "Revisar plano agora",
                acao: "O consumo esta muito alto. Ajuste o plano antes de estrangular o uso da empresa.",
            };
        }
        if (bloqueados > 0) {
            return {
                tone: "aguardando",
                badge: "Revisar acessos bloqueados",
                acao: "Ha usuarios travados. Confira se isso foi intencional ou se alguem precisa voltar a operar.",
            };
        }
        if (temporarios > 0 || uso >= 75) {
            return {
                tone: "aberto",
                badge: "Acompanhar ativacao",
                acao: "Existem primeiros acessos pendentes ou o consumo ja entrou na zona de atencao.",
            };
        }
        return {
            tone: "aprovado",
            badge: "Operacao estavel",
            acao: "A empresa esta liberada e a equipe principal ja esta pronta para operar.",
        };
    }

    function prioridadeUsuario(usuario) {
        const papel = slugPapel(usuario);
        const ultimoLogin = parseDataIso(usuario?.ultimo_login);

        if (!usuario?.ativo) {
            return {
                score: 620,
                tone: "ajustes",
                badge: "Acesso bloqueado",
                acao: "Revise se o bloqueio ainda precisa continuar antes de perder ritmo operacional.",
            };
        }

        if (usuario?.senha_temporaria_ativa) {
            return {
                score: 560,
                tone: "aguardando",
                badge: "Primeiro acesso",
                acao: "Este usuario ainda precisa concluir a troca obrigatoria de senha.",
            };
        }

        if (!ultimoLogin) {
            return {
                score: papel === "admin_cliente" ? 500 : 470,
                tone: "aguardando",
                badge: "Sem login ainda",
                acao: "Confirme se a pessoa recebeu o acesso e se ja deveria estar operando.",
            };
        }

        if (papel === "admin_cliente") {
            return {
                score: 260,
                tone: "aberto",
                badge: "Gestao ativa",
                acao: "Conta administrativa pronta para coordenar empresa, chat e mesa.",
            };
        }

        if (papel === "revisor") {
            return {
                score: 220,
                tone: "aberto",
                badge: "Mesa disponivel",
                acao: "Usuario de mesa apto para responder whispers, pendencias e aprovacoes.",
            };
        }

        return {
            score: 200,
            tone: "aprovado",
            badge: "Operando",
            acao: "Usuario liberado para tocar o fluxo normal da empresa.",
        };
    }

    function roleBadge(label) {
        return `<span class="pill" data-kind="role">${escapeHtml(label)}</span>`;
    }

    function userStatusBadges(usuario) {
        const badges = [
            `<span class="pill" data-kind="status" data-status="${usuario.ativo ? "ativo" : "bloqueado"}">${usuario.ativo ? "Ativo" : "Bloqueado"}</span>`,
        ];
        if (usuario.senha_temporaria_ativa) {
            badges.push('<span class="pill" data-kind="status" data-status="temporaria">Senha temporaria</span>');
        }
        return badges.join("");
    }

    function laudoBadge(label, status) {
        return `<span class="pill" data-kind="laudo" data-status="${variantStatusLaudo(status)}">${escapeHtml(label || "Sem status")}</span>`;
    }

    function feedback(mensagem, erro = false, titulo = "") {
        const box = $("feedback");
        if (!box) return;

        box.innerHTML = `
            <strong class="feedback-title">${escapeHtml(titulo || (erro ? "Algo precisa de atencao" : "Atualizacao concluida"))}</strong>
            <div class="feedback-message">${escapeHtml(mensagem)}</div>
        `;
        box.dataset.kind = erro ? "error" : "success";
        box.dataset.visible = "true";

        if (state.ui.feedbackTimer) {
            window.clearTimeout(state.ui.feedbackTimer);
        }

        state.ui.feedbackTimer = window.setTimeout(() => {
            box.dataset.visible = "false";
        }, erro ? 5200 : 3600);
    }

    async function api(url, options = {}) {
        const opts = {
            method: "GET",
            credentials: "same-origin",
            ...options,
            headers: {
                "Accept": "application/json",
                "X-CSRF-Token": csrf,
                ...(options.headers || {}),
            },
        };

        if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== "string") {
            opts.headers["Content-Type"] = "application/json";
            opts.body = JSON.stringify(opts.body);
        }

        const response = await fetch(url, opts);
        const contentType = response.headers.get("content-type") || "";
        const data = contentType.includes("application/json")
            ? await response.json()
            : await response.text();

        if (!response.ok) {
            const detail = typeof data === "string" ? data : data?.detail || JSON.stringify(data);
            throw new Error(detail || "Falha na operacao.");
        }

        return data;
    }

    async function withBusy(target, busyText, callback) {
        const button = target || null;
        const original = button ? button.textContent : "";

        if (button) {
            button.disabled = true;
            button.dataset.busy = "true";
            if (busyText) button.textContent = busyText;
        }

        try {
            return await callback();
        } finally {
            if (button) {
                button.disabled = false;
                button.dataset.busy = "false";
                if (busyText) button.textContent = original;
            }
        }
    }

    function persistirTab(nome) {
        try {
            localStorage.setItem(STORAGE_TAB_KEY, nome);
        } catch (_) {}
    }

    function persistirSelecao(chave, valor) {
        try {
            if (valor) {
                localStorage.setItem(chave, String(valor));
            } else {
                localStorage.removeItem(chave);
            }
        } catch (_) {}
    }

    function lerNumeroPersistido(chave) {
        try {
            const valor = Number(localStorage.getItem(chave) || 0);
            return Number.isFinite(valor) && valor > 0 ? valor : null;
        } catch (_) {
            return null;
        }
    }

    function restaurarTab() {
        try {
            const salvo = localStorage.getItem(STORAGE_TAB_KEY);
            if (salvo === "admin" || salvo === "chat" || salvo === "mesa") {
                state.ui.tab = salvo;
            }
        } catch (_) {}
    }

    function definirTab(nome, persistir = true) {
        state.ui.tab = nome;
        if (persistir) persistirTab(nome);

        document.querySelectorAll(".cliente-tab").forEach((button) => {
            button.classList.toggle("active", button.dataset.tab === nome);
            button.setAttribute("aria-selected", String(button.dataset.tab === nome));
        });

        document.querySelectorAll(".panel").forEach((panel) => {
            panel.classList.toggle("active", panel.id === `panel-${nome}`);
        });
    }

    function atualizarBadgesTabs() {
        const bootstrap = state.bootstrap;
        if (!bootstrap) return;

        const totalUsuarios = bootstrap.usuarios?.length || 0;
        const totalLaudosChat = bootstrap.chat?.laudos?.length || 0;
        const totalMesaQuente = (bootstrap.mesa?.laudos || []).filter(
            (item) => Number(item.pendencias_abertas || 0) > 0 || Number(item.whispers_nao_lidos || 0) > 0
        ).length;

        $("tab-admin-count").textContent = formatarInteiro(totalUsuarios);
        $("tab-chat-count").textContent = formatarInteiro(totalLaudosChat);
        $("tab-mesa-count").textContent = formatarInteiro(totalMesaQuente || bootstrap.mesa?.laudos?.length || 0);
    }

    function filtrarUsuarios() {
        const usuarios = state.bootstrap?.usuarios || [];
        const busca = state.ui.usuariosBusca.trim().toLowerCase();
        const papel = state.ui.usuariosPapel;

        return usuarios.filter((usuario) => {
            const combinaPapel = papel === "todos" ? true : slugPapel(usuario) === papel;
            if (!combinaPapel) return false;
            if (!busca) return true;

            const alvo = [
                usuario.nome,
                usuario.email,
                usuario.telefone,
                usuario.crea,
                usuario.papel,
            ]
                .map((item) => texto(item).toLowerCase())
                .join(" ");
            return alvo.includes(busca);
        });
    }

    function filtrarLaudosChat() {
        const laudos = state.bootstrap?.chat?.laudos || [];
        const busca = state.ui.chatBusca.trim().toLowerCase();
        if (!busca) return laudos;

        return laudos.filter((laudo) => {
            const alvo = [
                laudo.titulo,
                laudo.preview,
                laudo.status_card_label,
                laudo.tipo_template_label,
            ]
                .map((item) => texto(item).toLowerCase())
                .join(" ");
            return alvo.includes(busca);
        });
    }

    function filtrarLaudosMesa() {
        const laudos = state.bootstrap?.mesa?.laudos || [];
        const busca = state.ui.mesaBusca.trim().toLowerCase();
        if (!busca) return laudos;

        return laudos.filter((laudo) => {
            const alvo = [
                laudo.titulo,
                laudo.preview,
                laudo.status_card_label,
                laudo.status_revisao,
            ]
                .map((item) => texto(item).toLowerCase())
                .join(" ");
            return alvo.includes(busca);
        });
    }

    function obterLaudoChatSelecionado() {
        return (state.bootstrap?.chat?.laudos || []).find((laudo) => Number(laudo.id) === Number(state.chat.laudoId)) || null;
    }

    function obterLaudoMesaSelecionado() {
        return (state.bootstrap?.mesa?.laudos || []).find((laudo) => Number(laudo.id) === Number(state.mesa.laudoId)) || null;
    }

    function sincronizarSelecoes() {
        const idsChat = new Set((state.bootstrap?.chat?.laudos || []).map((item) => Number(item.id)));
        const idsMesa = new Set((state.bootstrap?.mesa?.laudos || []).map((item) => Number(item.id)));

        if (!idsChat.has(Number(state.chat.laudoId))) {
            state.chat.laudoId = lerNumeroPersistido(STORAGE_CHAT_KEY);
        }
        if (!idsMesa.has(Number(state.mesa.laudoId))) {
            state.mesa.laudoId = lerNumeroPersistido(STORAGE_MESA_KEY);
        }

        if (!idsChat.has(Number(state.chat.laudoId))) {
            state.chat.laudoId = (state.bootstrap?.chat?.laudos || [])[0]?.id || null;
        }
        if (!idsMesa.has(Number(state.mesa.laudoId))) {
            state.mesa.laudoId = (state.bootstrap?.mesa?.laudos || [])[0]?.id || null;
        }

        persistirSelecao(STORAGE_CHAT_KEY, state.chat.laudoId);
        persistirSelecao(STORAGE_MESA_KEY, state.mesa.laudoId);

        if (!state.chat.laudoId) {
            state.chat.mensagens = [];
        }
        if (!state.mesa.laudoId) {
            state.mesa.mensagens = [];
            state.mesa.pacote = null;
        }
    }

    function renderAnexos(anexos) {
        const itens = Array.isArray(anexos) ? anexos : [];
        if (!itens.length) return "";

        return `
            <div class="attachment-list">
                ${itens.map((anexo) => {
                    const url = texto(anexo.url || "");
                    const link = url
                        ? `<a class="attachment-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">Abrir</a>`
                        : `<span class="attachment-link" aria-hidden="true">Disponivel</span>`;

                    return `
                        <div class="attachment-item">
                            <div class="attachment-copy">
                                <span class="attachment-name">${escapeHtml(anexo.nome || "Anexo")}</span>
                                <span class="attachment-meta">${escapeHtml(anexo.categoria || "arquivo")} • ${formatarBytes(anexo.tamanho_bytes || 0)}</span>
                            </div>
                            ${link}
                        </div>
                    `;
                }).join("")}
            </div>
        `;
    }

    function renderEmpresaCards() {
        const empresa = state.bootstrap?.empresa;
        if (!empresa) return;
        const prioridade = prioridadeEmpresa(empresa, state.bootstrap?.usuarios || []);

        const usoValor = empresa.uso_percentual == null ? "Sem teto" : `${formatarInteiro(empresa.mensagens_processadas)} processados`;
        $("empresa-cards").innerHTML = `
            <article class="metric-card" data-accent="${empresa.status_bloqueio ? "attention" : "done"}">
                <small>Plano em operacao</small>
                <strong>${escapeHtml(empresa.plano_ativo)}</strong>
                <span class="metric-meta">${empresa.status_bloqueio ? "Empresa bloqueada" : "Empresa liberada para operar"}</span>
            </article>
            <article class="metric-card" data-accent="live">
                <small>Usuarios da empresa</small>
                <strong>${formatarInteiro(empresa.total_usuarios)}</strong>
                <span class="metric-meta">${formatarInteiro(empresa.admins_cliente)} admins, ${formatarInteiro(empresa.inspetores)} inspetores, ${formatarInteiro(empresa.revisores)} mesa</span>
            </article>
            <article class="metric-card" data-accent="aberto">
                <small>Laudos rastreados</small>
                <strong>${formatarInteiro(empresa.total_laudos)}</strong>
                <span class="metric-meta">${empresa.segmento ? escapeHtml(empresa.segmento) : "Sem segmento informado"}</span>
            </article>
            <article class="metric-card" data-accent="${prioridade.tone}">
                <small>Consumo do plano</small>
                <strong>${formatarPercentual(empresa.uso_percentual)}</strong>
                <span class="metric-meta">${usoValor}</span>
            </article>
        `;

        const progresso = empresa.uso_percentual == null ? 22 : Math.max(6, Math.min(100, Number(empresa.uso_percentual || 0)));
        $("empresa-resumo-detalhado").innerHTML = `
            <div class="stack">
                <div class="status-strip">
                    <span class="pill" data-kind="laudo" data-status="${empresa.status_bloqueio ? "ajustes" : "aberto"}">${empresa.status_bloqueio ? "Conta bloqueada" : "Operacao liberada"}</span>
                    <span class="pill" data-kind="role">CNPJ ${escapeHtml(empresa.cnpj || "nao informado")}</span>
                </div>
                <div class="usage-strip">
                    <div class="context-head">
                        <div>
                            <small>Consumo mensal monitorado</small>
                            <strong>${formatarInteiro(empresa.mensagens_processadas)} laudos processados</strong>
                        </div>
                        <span class="pill" data-kind="laudo" data-status="${Number(empresa.uso_percentual || 0) >= 90 ? "ajustes" : Number(empresa.uso_percentual || 0) >= 75 ? "aguardando" : "aprovado"}">${formatarPercentual(empresa.uso_percentual)}</span>
                    </div>
                    <div class="progress-track"><div class="progress-bar" style="width:${progresso}%"></div></div>
                    <div class="toolbar-meta">
                        <span class="hero-chip">Limite mensal: ${empresa.laudos_mes_limite == null ? "sob consulta" : formatarInteiro(empresa.laudos_mes_limite)}</span>
                        <span class="hero-chip">Limite de usuarios: ${empresa.usuarios_max == null ? "sob consulta" : formatarInteiro(empresa.usuarios_max)}</span>
                    </div>
                </div>
                <div class="chip-list">
                    <span class="feature-chip" data-enabled="${empresa.upload_doc ? "true" : "false"}">Upload documental ${empresa.upload_doc ? "ativo" : "indisponivel"}</span>
                    <span class="feature-chip" data-enabled="${empresa.deep_research ? "true" : "false"}">Deep research ${empresa.deep_research ? "ativo" : "indisponivel"}</span>
                    <span class="feature-chip" data-enabled="true">Responsavel ${escapeHtml(empresa.nome_responsavel || "nao informado")}</span>
                    <span class="feature-chip" data-enabled="true">Base ${escapeHtml(empresa.cidade_estado || "nao informada")}</span>
                </div>
                <div class="context-guidance" data-tone="${prioridade.tone}">
                    <div class="context-guidance-copy">
                        <small>Proximo foco da administracao</small>
                        <strong>${escapeHtml(prioridade.badge)}</strong>
                        <p>${escapeHtml(prioridade.acao)}</p>
                    </div>
                    <span class="pill" data-kind="priority" data-status="${prioridade.tone}">${escapeHtml(prioridade.badge)}</span>
                </div>
            </div>
        `;

        const plano = $("empresa-plano");
        plano.innerHTML = (empresa.planos_disponiveis || [])
            .map((item) => `<option value="${escapeAttr(item)}" ${item === empresa.plano_ativo ? "selected" : ""}>${escapeHtml(item)}</option>`)
            .join("");
    }

    function renderAdminResumo() {
        const container = $("admin-resumo-geral");
        const empresa = state.bootstrap?.empresa;
        const usuarios = state.bootstrap?.usuarios || [];
        if (!container || !empresa) return;

        const bloqueados = usuarios.filter((item) => !item.ativo).length;
        const temporarios = usuarios.filter((item) => item.senha_temporaria_ativa).length;
        const semLogin = usuarios.filter((item) => !parseDataIso(item.ultimo_login)).length;
        const prioridade = prioridadeEmpresa(empresa, usuarios);

        container.innerHTML = `
            <article class="metric-card" data-accent="attention">
                <small>Acesso pedindo revisao</small>
                <strong>${formatarInteiro(bloqueados)}</strong>
                <span class="metric-meta">Usuarios bloqueados que podem travar operacao, escalonamento ou atendimento.</span>
            </article>
            <article class="metric-card" data-accent="waiting">
                <small>Primeiros acessos</small>
                <strong>${formatarInteiro(temporarios)}</strong>
                <span class="metric-meta">${formatarInteiro(semLogin)} contas ainda nao registraram login no portal.</span>
            </article>
            <article class="metric-card" data-accent="${Number(empresa.uso_percentual || 0) >= 75 ? "waiting" : "live"}">
                <small>Capacidade contratada</small>
                <strong>${formatarPercentual(empresa.uso_percentual)}</strong>
                <span class="metric-meta">Plano ${escapeHtml(empresa.plano_ativo)} com ${empresa.usuarios_max == null ? "usuarios sob consulta" : `${formatarInteiro(empresa.usuarios_max)} usuarios maximos`}.</span>
            </article>
            <article class="metric-card" data-accent="${prioridade.tone}">
                <small>Foco da administracao</small>
                <strong>${escapeHtml(prioridade.badge)}</strong>
                <span class="metric-meta">${escapeHtml(prioridade.acao)}</span>
            </article>
        `;
    }

    function renderUsuarios() {
        const usuarios = ordenarPorPrioridade(filtrarUsuarios(), prioridadeUsuario);
        const tbody = $("lista-usuarios");
        const vazio = $("usuarios-vazio");
        const resumo = $("usuarios-resumo");

        const totalTemporarios = (state.bootstrap?.usuarios || []).filter((item) => item.senha_temporaria_ativa).length;
        const totalBloqueados = (state.bootstrap?.usuarios || []).filter((item) => !item.ativo).length;
        const totalSemLogin = (state.bootstrap?.usuarios || []).filter((item) => !parseDataIso(item.ultimo_login)).length;
        resumo.innerHTML = `
            <span class="hero-chip">${formatarInteiro(usuarios.length)} visiveis agora</span>
            <span class="hero-chip">${formatarInteiro(totalTemporarios)} com senha temporaria</span>
            <span class="hero-chip">${formatarInteiro(totalBloqueados)} bloqueados</span>
            <span class="hero-chip">${formatarInteiro(totalSemLogin)} sem login</span>
            <span class="hero-chip">${formatarInteiro((state.bootstrap?.usuarios || []).filter((item) => item.ativo).length)} ativos</span>
        `;

        if (!usuarios.length) {
            tbody.innerHTML = "";
            vazio.hidden = false;
            return;
        }

        vazio.hidden = true;
        tbody.innerHTML = usuarios.map((usuario) => {
            const papel = obterNomePapel(slugPapel(usuario));
            const ultimoLogin = escapeHtml(usuario.ultimo_login_label || "Nunca");
            const prioridade = prioridadeUsuario(usuario);

            return `
                <tr>
                    <td>
                        <div class="user-main">
                            <div class="user-primary">
                                <span class="user-name">${escapeHtml(usuario.nome || "Usuario")}</span>
                                ${roleBadge(papel)}
                                ${userStatusBadges(usuario)}
                                <span class="pill" data-kind="priority" data-status="${prioridade.tone}">${escapeHtml(prioridade.badge)}</span>
                            </div>
                            <div class="user-email">${escapeHtml(usuario.email)}</div>
                            <div class="toolbar-meta">
                                <span class="hero-chip">${usuario.telefone ? escapeHtml(usuario.telefone) : "Sem telefone"}</span>
                                ${slugPapel(usuario) === "revisor"
                                    ? `<span class="hero-chip">${usuario.crea ? `CREA ${escapeHtml(usuario.crea)}` : "Sem CREA"}</span>`
                                    : ""}
                            </div>
                            <details class="user-editor">
                                <summary class="user-editor-toggle">Editar dados deste usuario</summary>
                                <div class="user-grid">
                                    <label>Nome<input data-field="nome" data-user="${usuario.id}" value="${escapeAttr(usuario.nome || "")}"></label>
                                    <label>E-mail<input data-field="email" data-user="${usuario.id}" type="email" value="${escapeAttr(usuario.email || "")}"></label>
                                    <label>Telefone<input data-field="telefone" data-user="${usuario.id}" value="${escapeAttr(usuario.telefone || "")}" placeholder="Telefone"></label>
                                    ${slugPapel(usuario) === "revisor"
                                        ? `<label>CREA<input data-field="crea" data-user="${usuario.id}" value="${escapeAttr(usuario.crea || "")}" placeholder="CREA"></label>`
                                        : ""}
                                </div>
                            </details>
                        </div>
                    </td>
                    <td>
                        <div class="stack">
                            <div class="context-block">
                                <small>Papel operacional</small>
                                <strong>${escapeHtml(papel)}</strong>
                            </div>
                            <div class="context-block">
                                <small>Ultimo login</small>
                                <strong>${ultimoLogin}</strong>
                            </div>
                            <div class="context-guidance" data-tone="${prioridade.tone}">
                                <div class="context-guidance-copy">
                                    <small>Foco deste cadastro</small>
                                    <strong>${escapeHtml(prioridade.badge)}</strong>
                                    <p>${escapeHtml(prioridade.acao)}</p>
                                </div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="user-actions">
                            <button class="btn" data-act="save-user" data-user="${usuario.id}" type="button">Salvar cadastro</button>
                            <button class="btn" data-act="toggle-user" data-user="${usuario.id}" type="button">${usuario.ativo ? "Bloquear acesso" : "Desbloquear acesso"}</button>
                            <button class="btn ghost" data-act="reset-user" data-user="${usuario.id}" type="button">Gerar senha temporaria</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    function renderAdmin() {
        renderAdminResumo();
        renderEmpresaCards();
        renderUsuarios();
    }

    function renderChatResumo() {
        const container = $("chat-resumo-geral");
        const laudos = state.bootstrap?.chat?.laudos || [];
        const selecionado = obterLaudoChatSelecionado();
        const prioridade = selecionado ? prioridadeChat(selecionado) : null;

        const abertos = laudos.filter((item) => variantStatusLaudo(item.status_card) === "aberto").length;
        const aguardando = laudos.filter((item) => variantStatusLaudo(item.status_card) === "aguardando").length;
        const ajustes = laudos.filter((item) => variantStatusLaudo(item.status_card) === "ajustes").length;
        const concluidos = laudos.filter((item) => variantStatusLaudo(item.status_card) === "aprovado").length;

        container.innerHTML = `
            <article class="metric-card" data-accent="attention">
                <small>Acao agora</small>
                <strong>${formatarInteiro(ajustes)}</strong>
                <span class="metric-meta">Laudos devolvidos para ajuste e que pedem resposta do time.</span>
            </article>
            <article class="metric-card" data-accent="live">
                <small>Em operacao</small>
                <strong>${formatarInteiro(abertos)}</strong>
                <span class="metric-meta">Conversas abertas e prontas para continuar no chat.</span>
            </article>
            <article class="metric-card" data-accent="waiting">
                <small>Aguardando mesa</small>
                <strong>${formatarInteiro(aguardando)}</strong>
                <span class="metric-meta">Laudos que ja sairam do campo e estao esperando retorno da mesa.</span>
            </article>
            <article class="metric-card" data-accent="${prioridade ? prioridade.tone : "done"}">
                <small>Foco do laudo selecionado</small>
                <strong>${escapeHtml(prioridade ? prioridade.badge : "Sem selecao")}</strong>
                <span class="metric-meta">${escapeHtml(prioridade ? prioridade.acao : `${formatarInteiro(concluidos)} concluidos sem urgencia na fila.`)}</span>
            </article>
        `;
    }

    function renderChatList() {
        const laudos = ordenarPorPrioridade(filtrarLaudosChat(), prioridadeChat);
        const lista = $("lista-chat-laudos");
        const resumo = $("chat-lista-resumo");

        resumo.innerHTML = `
            <span class="hero-chip">${formatarInteiro(laudos.length)} laudos visiveis</span>
            <span class="hero-chip">${formatarInteiro((state.bootstrap?.chat?.laudos || []).filter((item) => variantStatusLaudo(item.status_card) === "aberto").length)} abertos</span>
            <span class="hero-chip">${formatarInteiro((state.bootstrap?.chat?.laudos || []).filter((item) => variantStatusLaudo(item.status_card) === "ajustes").length)} em ajuste</span>
        `;

        if (!laudos.length) {
            lista.innerHTML = `
                <div class="empty-state">
                    <strong>Nenhum laudo encontrado</strong>
                    <p>Ajuste a busca ou crie um novo laudo para operar o chat por aqui.</p>
                </div>
            `;
            return;
        }

        lista.innerHTML = laudos.map((laudo) => `
            <article class="item ${Number(state.chat.laudoId) === Number(laudo.id) ? "active" : ""}" data-chat="${laudo.id}" tabindex="0">
                <div class="item-head">
                    <strong>${escapeHtml(laudo.titulo)}</strong>
                    ${laudoBadge(laudo.status_card_label, laudo.status_card)}
                </div>
                <div class="item-preview">${escapeHtml(laudo.preview || "Sem preview de conversa ainda.")}</div>
                <div class="item-footer">
                    <span class="pill" data-kind="priority" data-status="${prioridadeChat(laudo).tone}">${escapeHtml(prioridadeChat(laudo).badge)}</span>
                    <span class="hero-chip">${escapeHtml(laudo.tipo_template_label || "Inspecao")}</span>
                    <small>${escapeHtml(laudo.data_br || "Sem data")}</small>
                </div>
            </article>
        `).join("");
    }

    function renderChatContext() {
        const alvo = obterLaudoChatSelecionado();
        const contexto = $("chat-contexto");
        const finalizar = $("btn-chat-finalizar");
        const reabrir = $("btn-chat-reabrir");

        if (!alvo) {
            contexto.innerHTML = `
                <div class="empty-state">
                    <strong>Selecione um laudo do lado esquerdo</strong>
                    <p>Quando um laudo for selecionado, o contexto operacional e o historico aparecem aqui.</p>
                </div>
            `;
            finalizar.disabled = true;
            reabrir.disabled = true;
            $("chat-titulo").textContent = "Selecione um laudo";
            return;
        }

        const status = variantStatusLaudo(alvo.status_card);
        const prioridade = prioridadeChat(alvo);
        $("chat-titulo").textContent = alvo.titulo || "Laudo selecionado";
        finalizar.disabled = status !== "aberto";
        reabrir.disabled = status === "aberto";

        contexto.innerHTML = `
            <div class="context-card">
                <div class="context-head">
                    <div>
                        <div class="context-title">${escapeHtml(alvo.titulo)}</div>
                        <div class="context-subtitle">${escapeHtml(alvo.preview || "Sem preview registrado.")}</div>
                    </div>
                    <div class="context-actions">
                        ${laudoBadge(alvo.status_card_label, alvo.status_card)}
                    </div>
                </div>
                <div class="context-grid">
                    <div class="context-block">
                        <small>Template atual</small>
                        <strong>${escapeHtml(alvo.tipo_template_label || "Inspecao padrao")}</strong>
                    </div>
                    <div class="context-block">
                        <small>Ultima atualizacao</small>
                        <strong>${escapeHtml(alvo.data_br || "Sem data")}</strong>
                    </div>
                    <div class="context-block">
                        <small>Setor</small>
                        <strong>${escapeHtml(alvo.setor_industrial || "Geral")}</strong>
                    </div>
                </div>
                <div class="context-guidance" data-tone="${prioridade.tone}">
                    <div class="context-guidance-copy">
                        <small>Proximo passo recomendado</small>
                        <strong>${escapeHtml(prioridade.badge)}</strong>
                        <p>${escapeHtml(prioridade.acao)}</p>
                    </div>
                    <span class="pill" data-kind="priority" data-status="${prioridade.tone}">${escapeHtml(prioridade.badge)}</span>
                </div>
            </div>
        `;
    }

    function renderChatMensagens() {
        const container = $("chat-mensagens");
        const mensagens = Array.isArray(state.chat.mensagens) ? state.chat.mensagens : [];

        if (!mensagens.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <strong>Nenhuma mensagem carregada</strong>
                    <p>Assim que voce conversar com a IA ou com a mesa, o historico aparece aqui.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = mensagens.map((mensagem) => {
            const papel = texto(mensagem.papel).toLowerCase();
            const classe = papel === "usuario" ? "msg--usuario" : papel === "assistente" ? "msg--assistente" : "msg--whisper";
            const titulo = papel === "usuario" ? "Usuario" : papel === "assistente" ? "Assistente" : "Mesa";

            return `
                <article class="msg ${classe}">
                    <div class="msg-head">
                        <div class="msg-meta">
                            <span class="msg-title">${escapeHtml(titulo)}</span>
                            <span class="msg-time">${escapeHtml(mensagem.tipo || "mensagem")}</span>
                        </div>
                    </div>
                    <div class="msg-body">${textoComQuebras(mensagem.texto || "(sem conteudo)")}</div>
                    ${renderAnexos(mensagem.anexos)}
                </article>
            `;
        }).join("");
    }

    function renderMesaList() {
        const laudos = ordenarPorPrioridade(filtrarLaudosMesa(), prioridadeMesa);
        const lista = $("lista-mesa-laudos");
        const resumo = $("mesa-lista-resumo");

        const totalPendencias = (state.bootstrap?.mesa?.laudos || []).reduce((acc, item) => acc + Number(item.pendencias_abertas || 0), 0);
        const totalWhispers = (state.bootstrap?.mesa?.laudos || []).reduce((acc, item) => acc + Number(item.whispers_nao_lidos || 0), 0);
        resumo.innerHTML = `
            <span class="hero-chip">${formatarInteiro(totalPendencias)} pendencias abertas</span>
            <span class="hero-chip">${formatarInteiro(totalWhispers)} whispers pendentes</span>
        `;

        if (!laudos.length) {
            lista.innerHTML = `
                <div class="empty-state">
                    <strong>Nenhum laudo na fila da mesa</strong>
                    <p>Quando o chat da empresa enviar laudos para revisao, eles aparecem aqui.</p>
                </div>
            `;
            return;
        }

        lista.innerHTML = laudos.map((laudo) => `
            <article class="item ${Number(state.mesa.laudoId) === Number(laudo.id) ? "active" : ""}" data-mesa="${laudo.id}" tabindex="0">
                <div class="item-head">
                    <strong>${escapeHtml(laudo.titulo)}</strong>
                    ${laudoBadge(laudo.status_card_label, laudo.status_card)}
                </div>
                <div class="item-preview">${escapeHtml(laudo.preview || "Sem preview registrado.")}</div>
                <div class="item-footer">
                    <span class="pill" data-kind="priority" data-status="${prioridadeMesa(laudo).tone}">${escapeHtml(prioridadeMesa(laudo).badge)}</span>
                    <span class="hero-chip">${formatarInteiro(laudo.pendencias_abertas || 0)} pendencias</span>
                    <span class="hero-chip">${formatarInteiro(laudo.whispers_nao_lidos || 0)} whispers</span>
                </div>
            </article>
        `).join("");
    }

    function renderMesaContext() {
        const alvo = obterLaudoMesaSelecionado();
        const contexto = $("mesa-contexto");
        const aprovar = $("btn-mesa-aprovar");
        const rejeitar = $("btn-mesa-rejeitar");

        if (!alvo) {
            contexto.innerHTML = `
                <div class="empty-state">
                    <strong>Selecione um laudo para revisar</strong>
                    <p>O painel da mesa mostra pendencias, whispers e historico tecnico do laudo selecionado.</p>
                </div>
            `;
            aprovar.disabled = true;
            rejeitar.disabled = true;
            $("mesa-titulo").textContent = "Selecione um laudo";
            return;
        }

        const prioridade = prioridadeMesa(alvo);
        $("mesa-titulo").textContent = alvo.titulo || "Laudo selecionado";
        aprovar.disabled = false;
        rejeitar.disabled = false;

        contexto.innerHTML = `
            <div class="context-card">
                <div class="context-head">
                    <div>
                        <div class="context-title">${escapeHtml(alvo.titulo)}</div>
                        <div class="context-subtitle">${escapeHtml(alvo.preview || "Sem resumo de campo.")}</div>
                    </div>
                    <div class="context-actions">
                        ${laudoBadge(alvo.status_card_label, alvo.status_card)}
                    </div>
                </div>
                <div class="context-grid">
                    <div class="context-block">
                        <small>Pendencias abertas</small>
                        <strong>${formatarInteiro(alvo.pendencias_abertas || 0)}</strong>
                    </div>
                    <div class="context-block">
                        <small>Whispers nao lidos</small>
                        <strong>${formatarInteiro(alvo.whispers_nao_lidos || 0)}</strong>
                    </div>
                    <div class="context-block">
                        <small>Atualizado em</small>
                        <strong>${escapeHtml(alvo.data_br || "Sem data")}</strong>
                    </div>
                </div>
                <div class="context-guidance" data-tone="${prioridade.tone}">
                    <div class="context-guidance-copy">
                        <small>Proximo passo recomendado</small>
                        <strong>${escapeHtml(prioridade.badge)}</strong>
                        <p>${escapeHtml(prioridade.acao)}</p>
                    </div>
                    <span class="pill" data-kind="priority" data-status="${prioridade.tone}">${escapeHtml(prioridade.badge)}</span>
                </div>
            </div>
        `;
    }

    function renderMesaResumoGeral() {
        const container = $("mesa-resumo-geral");
        const laudos = state.bootstrap?.mesa?.laudos || [];
        const selecionado = obterLaudoMesaSelecionado();
        const prioridade = selecionado ? prioridadeMesa(selecionado) : null;

        const comAcaoAgora = laudos.filter((item) => Number(item.pendencias_abertas || 0) > 0 || Number(item.whispers_nao_lidos || 0) > 0).length;
        const totalPendencias = laudos.reduce((acc, item) => acc + Number(item.pendencias_abertas || 0), 0);
        const totalWhispers = laudos.reduce((acc, item) => acc + Number(item.whispers_nao_lidos || 0), 0);
        const prontosParaRevisar = laudos.filter((item) => {
            const status = variantStatusLaudo(item.status_card);
            return status === "aguardando" && Number(item.pendencias_abertas || 0) === 0 && Number(item.whispers_nao_lidos || 0) === 0;
        }).length;

        container.innerHTML = `
            <article class="metric-card" data-accent="attention">
                <small>Acao agora</small>
                <strong>${formatarInteiro(comAcaoAgora)}</strong>
                <span class="metric-meta">Laudos com whisper novo ou pendencia aberta pedindo resposta imediata.</span>
            </article>
            <article class="metric-card" data-accent="waiting">
                <small>Pendencias abertas</small>
                <strong>${formatarInteiro(totalPendencias)}</strong>
                <span class="metric-meta">${formatarInteiro(totalWhispers)} whispers ainda aguardam leitura da mesa.</span>
            </article>
            <article class="metric-card" data-accent="live">
                <small>Prontos para revisar</small>
                <strong>${formatarInteiro(prontosParaRevisar)}</strong>
                <span class="metric-meta">Laudos sem gargalo tecnico, prontos para aprovacao ou devolucao objetiva.</span>
            </article>
            <article class="metric-card" data-accent="${prioridade ? prioridade.tone : "done"}">
                <small>Foco do laudo selecionado</small>
                <strong>${escapeHtml(prioridade ? prioridade.badge : "Sem selecao")}</strong>
                <span class="metric-meta">${escapeHtml(prioridade ? prioridade.acao : "Escolha um laudo da fila para ver a acao recomendada.")}</span>
            </article>
        `;
    }

    function renderMesaResumo() {
        const pacote = state.mesa.pacote;
        const container = $("mesa-resumo");
        if (!pacote) {
            container.innerHTML = "";
            return;
        }

        container.innerHTML = `
            <article class="metric-card">
                <small>Pendencias abertas</small>
                <strong>${formatarInteiro(pacote.resumo_pendencias?.abertas || 0)}</strong>
                <span class="metric-meta">${formatarInteiro(pacote.resumo_pendencias?.resolvidas || 0)} resolvidas recentes</span>
            </article>
            <article class="metric-card">
                <small>Whispers recentes</small>
                <strong>${formatarInteiro((pacote.whispers_recentes || []).length)}</strong>
                <span class="metric-meta">${formatarInteiro(pacote.resumo_mensagens?.inspetor || 0)} mensagens do inspetor</span>
            </article>
            <article class="metric-card">
                <small>Interacoes da mesa</small>
                <strong>${formatarInteiro(pacote.resumo_mensagens?.mesa || 0)}</strong>
                <span class="metric-meta">${formatarInteiro(pacote.resumo_evidencias?.documentos || 0)} documentos e ${formatarInteiro(pacote.resumo_evidencias?.fotos || 0)} fotos</span>
            </article>
        `;
    }

    function tituloMensagemMesa(mensagem) {
        if (mensagem.is_whisper) return "Whisper do inspetor";
        if (texto(mensagem.tipo) === "humano_eng") {
            return mensagem.lida ? "Pendencia resolvida" : "Pendencia da mesa";
        }
        return "Resposta da mesa";
    }

    function classeMensagemMesa(mensagem) {
        if (mensagem.is_whisper) return "msg--whisper";
        if (texto(mensagem.tipo) === "humano_eng") return "msg--mesa";
        return "msg--assistente";
    }

    function renderMesaMensagens() {
        const container = $("mesa-mensagens");
        const mensagens = Array.isArray(state.mesa.mensagens) ? state.mesa.mensagens : [];

        if (!mensagens.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <strong>Nada carregado ainda</strong>
                    <p>As respostas da mesa, whispers e anexos deste laudo aparecem aqui.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = mensagens.map((mensagem) => {
            const pendencia = texto(mensagem.tipo) === "humano_eng";
            const statusPendencia = pendencia
                ? `<span class="pill" data-kind="status" data-status="${mensagem.lida ? "ativo" : "temporaria"}">${mensagem.lida ? "Resolvida" : "Aberta"}</span>`
                : "";
            const resolucao = mensagem.resolvida_em_label
                ? `<div class="msg-time">Resolvida em ${escapeHtml(mensagem.resolvida_em_label)}${mensagem.resolvida_por_nome ? ` por ${escapeHtml(mensagem.resolvida_por_nome)}` : ""}</div>`
                : "";

            return `
                <article class="msg ${classeMensagemMesa(mensagem)}">
                    <div class="msg-head">
                        <div class="msg-meta">
                            <span class="msg-title">${escapeHtml(tituloMensagemMesa(mensagem))}</span>
                            <span class="msg-time">${escapeHtml(mensagem.data || "Agora")}</span>
                            ${statusPendencia}
                        </div>
                    </div>
                    <div class="msg-body">${textoComQuebras(mensagem.texto || "(sem conteudo)")}</div>
                    ${resolucao}
                    ${renderAnexos(mensagem.anexos)}
                    ${pendencia ? `
                        <div class="msg-actions">
                            <button class="btn" data-act="toggle-pendencia" data-id="${mensagem.id}" data-lida="${mensagem.lida ? "1" : "0"}" type="button">
                                ${mensagem.lida ? "Reabrir pendencia" : "Marcar resolvida"}
                            </button>
                        </div>
                    ` : ""}
                </article>
            `;
        }).join("");
    }

    function renderEverything() {
        if (!state.bootstrap) return;
        atualizarBadgesTabs();
        renderAdmin();
        renderChatResumo();
        renderChatList();
        renderChatContext();
        renderChatMensagens();
        renderMesaResumoGeral();
        renderMesaList();
        renderMesaContext();
        renderMesaResumo();
        renderMesaMensagens();
    }

    async function bootstrapPortal({ carregarDetalhes = false } = {}) {
        state.bootstrap = await api("/cliente/api/bootstrap");
        sincronizarSelecoes();
        renderEverything();

        if (!carregarDetalhes) return;

        const promessas = [];
        if (state.chat.laudoId) promessas.push(loadChat(state.chat.laudoId, { silencioso: true }));
        if (state.mesa.laudoId) promessas.push(loadMesa(state.mesa.laudoId, { silencioso: true }));
        await Promise.all(promessas);
    }

    async function loadChat(laudoId, { silencioso = false } = {}) {
        const id = Number(laudoId || 0);
        if (!Number.isFinite(id) || id <= 0) return;

        state.chat.laudoId = id;
        persistirSelecao(STORAGE_CHAT_KEY, id);
        renderChatResumo();
        renderChatList();
        renderChatContext();

        const payload = await api(`/cliente/api/chat/laudos/${id}/mensagens`);
        state.chat.mensagens = payload.itens || [];
        renderChatMensagens();

        if (!silencioso && state.ui.tab !== "chat") {
            feedback("Historico do chat carregado.");
        }
    }

    async function loadMesa(laudoId, { silencioso = false } = {}) {
        const id = Number(laudoId || 0);
        if (!Number.isFinite(id) || id <= 0) return;

        state.mesa.laudoId = id;
        persistirSelecao(STORAGE_MESA_KEY, id);
        renderMesaResumoGeral();
        renderMesaList();
        renderMesaContext();

        const [mensagens, pacote] = await Promise.all([
            api(`/cliente/api/mesa/laudos/${id}/mensagens`),
            api(`/cliente/api/mesa/laudos/${id}/pacote`),
        ]);

        state.mesa.mensagens = mensagens.itens || [];
        state.mesa.pacote = pacote || null;
        renderMesaMensagens();
        renderMesaResumo();

        const alvo = obterLaudoMesaSelecionado();
        if (Number(alvo?.whispers_nao_lidos || 0) > 0) {
            api(`/cliente/api/mesa/laudos/${id}/marcar-whispers-lidos`, { method: "POST" }).catch(() => null);
            if (state.bootstrap?.mesa?.laudos) {
                state.bootstrap.mesa.laudos = state.bootstrap.mesa.laudos.map((item) =>
                    Number(item.id) === id ? { ...item, whispers_nao_lidos: 0 } : item
                );
                renderMesaResumoGeral();
                renderMesaList();
                renderMesaContext();
                atualizarBadgesTabs();
            }
        }

        if (!silencioso && state.ui.tab !== "mesa") {
            feedback("Fila da mesa sincronizada.");
        }
    }

    function bindTabs() {
        document.querySelectorAll(".cliente-tab").forEach((button) => {
            button.addEventListener("click", () => definirTab(button.dataset.tab || "admin"));
        });
    }

    function bindFiltros() {
        $("usuarios-busca")?.addEventListener("input", (event) => {
            state.ui.usuariosBusca = event.target.value || "";
            renderUsuarios();
        });
        $("usuarios-filtro-papel")?.addEventListener("change", (event) => {
            state.ui.usuariosPapel = event.target.value || "todos";
            renderUsuarios();
        });
        $("chat-busca-laudos")?.addEventListener("input", (event) => {
            state.ui.chatBusca = event.target.value || "";
            renderChatList();
        });
        $("mesa-busca-laudos")?.addEventListener("input", (event) => {
            state.ui.mesaBusca = event.target.value || "";
            renderMesaList();
        });
    }

    function bindAdminActions() {
        $("form-plano")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const button = event.submitter || event.target.querySelector('button[type="submit"]');
            await withBusy(button, "Salvando...", async () => {
                await api("/cliente/api/empresa/plano", {
                    method: "PATCH",
                    body: { plano: $("empresa-plano").value },
                });
                await bootstrapPortal();
                feedback("Plano da empresa atualizado.");
            }).catch((erro) => feedback(erro.message || "Falha ao atualizar plano.", true));
        });

        $("form-usuario")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const button = event.submitter || event.target.querySelector('button[type="submit"]');
            await withBusy(button, "Criando...", async () => {
                const resposta = await api("/cliente/api/usuarios", {
                    method: "POST",
                    body: {
                        nome: $("usuario-nome").value,
                        email: $("usuario-email").value,
                        nivel_acesso: $("usuario-papel").value,
                        telefone: $("usuario-telefone").value,
                        crea: $("usuario-crea").value,
                    },
                });
                event.target.reset();
                await bootstrapPortal();
                feedback(`Usuario criado. Senha temporaria: ${resposta.senha_temporaria}`);
            }).catch((erro) => feedback(erro.message || "Falha ao criar usuario.", true));
        });

        $("lista-usuarios")?.addEventListener("click", async (event) => {
            const button = event.target.closest("button[data-act]");
            if (!button) return;

            const userId = Number(button.dataset.user || 0);
            if (!Number.isFinite(userId) || userId <= 0) return;

            try {
                if (button.dataset.act === "reset-user") {
                    await withBusy(button, "Gerando...", async () => {
                        const resposta = await api(`/cliente/api/usuarios/${userId}/resetar-senha`, { method: "POST" });
                        feedback(`Senha temporaria: ${resposta.senha_temporaria}`);
                    });
                    return;
                }

                if (button.dataset.act === "toggle-user") {
                    await withBusy(button, "Atualizando...", async () => {
                        await api(`/cliente/api/usuarios/${userId}/bloqueio`, { method: "PATCH" });
                        await bootstrapPortal();
                        feedback("Status do usuario atualizado.");
                    });
                    return;
                }

                const campos = Array.from(document.querySelectorAll(`[data-user="${userId}"][data-field]`));
                const payload = Object.fromEntries(campos.map((campo) => [campo.dataset.field, campo.value]));

                await withBusy(button, "Salvando...", async () => {
                    await api(`/cliente/api/usuarios/${userId}`, {
                        method: "PATCH",
                        body: payload,
                    });
                    await bootstrapPortal();
                    feedback("Cadastro do usuario atualizado.");
                });
            } catch (erro) {
                feedback(erro.message || "Falha ao atualizar usuario.", true);
            }
        });
    }

    function bindChatActions() {
        $("form-chat-laudo")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const button = event.submitter || event.target.querySelector('button[type="submit"]');

            await withBusy(button, "Criando...", async () => {
                const formData = new FormData();
                formData.append("tipo_template", $("chat-tipo-template").value);
                const resposta = await api("/cliente/api/chat/laudos", {
                    method: "POST",
                    body: formData,
                });
                await bootstrapPortal();
                await loadChat(resposta.laudo_id, { silencioso: true });
                definirTab("chat");
                feedback("Novo laudo criado para a empresa.");
            }).catch((erro) => feedback(erro.message || "Falha ao criar laudo.", true));
        });

        ["click", "keydown"].forEach((tipoEvento) => {
            $("lista-chat-laudos")?.addEventListener(tipoEvento, async (event) => {
                const item = event.target.closest("[data-chat]");
                if (!item) return;
                if (tipoEvento === "keydown" && event.key !== "Enter" && event.key !== " ") return;
                if (tipoEvento === "keydown") event.preventDefault();
                await loadChat(item.dataset.chat).catch((erro) => feedback(erro.message || "Falha ao abrir laudo.", true));
            });
        });

        $("form-chat-msg")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!state.chat.laudoId) {
                feedback("Selecione um laudo do chat primeiro.", true);
                return;
            }

            const mensagem = $("chat-mensagem").value.trim();
            if (!mensagem) {
                feedback("Escreva uma mensagem antes de enviar.", true);
                return;
            }

            const button = event.submitter || event.target.querySelector('button[type="submit"]');
            await withBusy(button, "Enviando...", async () => {
                const historico = (state.chat.mensagens || [])
                    .filter((item) => item.papel === "usuario" || item.papel === "assistente")
                    .map((item) => ({
                        papel: item.papel,
                        texto: item.texto || "",
                    }))
                    .slice(-20);

                await api("/cliente/api/chat/mensagem", {
                    method: "POST",
                    body: {
                        laudo_id: state.chat.laudoId,
                        mensagem,
                        historico,
                        setor: "geral",
                        modo: "detalhado",
                    },
                });
                $("chat-mensagem").value = "";
                await bootstrapPortal();
                await loadChat(state.chat.laudoId, { silencioso: true });
                feedback("Mensagem enviada no chat da empresa.");
            }).catch((erro) => feedback(erro.message || "Falha ao enviar mensagem.", true));
        });

        $("btn-chat-finalizar")?.addEventListener("click", async (event) => {
            if (!state.chat.laudoId) return;
            const button = event.currentTarget;
            await withBusy(button, "Enviando...", async () => {
                await api(`/cliente/api/chat/laudos/${state.chat.laudoId}/finalizar`, { method: "POST" });
                await bootstrapPortal();
                await loadChat(state.chat.laudoId, { silencioso: true });
                feedback("Laudo enviado para a mesa avaliadora.");
            }).catch((erro) => feedback(erro.message || "Falha ao finalizar laudo.", true));
        });

        $("btn-chat-reabrir")?.addEventListener("click", async (event) => {
            if (!state.chat.laudoId) return;
            const button = event.currentTarget;
            await withBusy(button, "Reabrindo...", async () => {
                await api(`/cliente/api/chat/laudos/${state.chat.laudoId}/reabrir`, { method: "POST" });
                await bootstrapPortal();
                await loadChat(state.chat.laudoId, { silencioso: true });
                feedback("Laudo reaberto para nova iteracao.");
            }).catch((erro) => feedback(erro.message || "Falha ao reabrir laudo.", true));
        });
    }

    function bindMesaActions() {
        ["click", "keydown"].forEach((tipoEvento) => {
            $("lista-mesa-laudos")?.addEventListener(tipoEvento, async (event) => {
                const item = event.target.closest("[data-mesa]");
                if (!item) return;
                if (tipoEvento === "keydown" && event.key !== "Enter" && event.key !== " ") return;
                if (tipoEvento === "keydown") event.preventDefault();
                await loadMesa(item.dataset.mesa).catch((erro) => feedback(erro.message || "Falha ao abrir laudo da mesa.", true));
            });
        });

        $("form-mesa-msg")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!state.mesa.laudoId) {
                feedback("Selecione um laudo da mesa primeiro.", true);
                return;
            }

            const resposta = $("mesa-resposta").value.trim();
            const arquivo = $("mesa-arquivo").files?.[0] || null;
            if (!resposta && !arquivo) {
                feedback("Escreva uma resposta ou selecione um anexo.", true);
                return;
            }

            const button = event.submitter || event.target.querySelector('button[type="submit"]');
            await withBusy(button, "Respondendo...", async () => {
                if (arquivo) {
                    const formData = new FormData();
                    formData.append("arquivo", arquivo);
                    formData.append("texto", resposta);
                    await api(`/cliente/api/mesa/laudos/${state.mesa.laudoId}/responder-anexo`, {
                        method: "POST",
                        body: formData,
                    });
                } else {
                    await api(`/cliente/api/mesa/laudos/${state.mesa.laudoId}/responder`, {
                        method: "POST",
                        body: { texto: resposta },
                    });
                }

                $("mesa-resposta").value = "";
                $("mesa-arquivo").value = "";
                await bootstrapPortal();
                await loadMesa(state.mesa.laudoId, { silencioso: true });
                feedback("Resposta registrada na mesa avaliadora.");
            }).catch((erro) => feedback(erro.message || "Falha ao responder a mesa.", true));
        });

        $("mesa-mensagens")?.addEventListener("click", async (event) => {
            const button = event.target.closest('[data-act="toggle-pendencia"]');
            if (!button || !state.mesa.laudoId) return;

            const resolvida = button.dataset.lida === "1";
            await withBusy(button, resolvida ? "Reabrindo..." : "Resolvendo...", async () => {
                await api(`/cliente/api/mesa/laudos/${state.mesa.laudoId}/pendencias/${button.dataset.id}`, {
                    method: "PATCH",
                    body: { lida: !resolvida },
                });
                await bootstrapPortal();
                await loadMesa(state.mesa.laudoId, { silencioso: true });
                feedback(resolvida ? "Pendencia reaberta." : "Pendencia marcada como resolvida.");
            }).catch((erro) => feedback(erro.message || "Falha ao atualizar pendencia.", true));
        });

        $("btn-mesa-aprovar")?.addEventListener("click", async (event) => {
            if (!state.mesa.laudoId) return;
            const button = event.currentTarget;
            await withBusy(button, "Aprovando...", async () => {
                await api(`/cliente/api/mesa/laudos/${state.mesa.laudoId}/avaliar`, {
                    method: "POST",
                    body: { acao: "aprovar", motivo: "" },
                });
                await bootstrapPortal();
                await loadMesa(state.mesa.laudoId, { silencioso: true });
                feedback("Laudo aprovado pela mesa.");
            }).catch((erro) => feedback(erro.message || "Falha ao aprovar laudo.", true));
        });

        $("btn-mesa-rejeitar")?.addEventListener("click", async (event) => {
            if (!state.mesa.laudoId) return;

            const motivo = $("mesa-motivo").value.trim();
            if (!motivo) {
                feedback("Informe o motivo antes de devolver para ajustes.", true);
                return;
            }

            const button = event.currentTarget;
            await withBusy(button, "Devolvendo...", async () => {
                await api(`/cliente/api/mesa/laudos/${state.mesa.laudoId}/avaliar`, {
                    method: "POST",
                    body: { acao: "rejeitar", motivo },
                });
                await bootstrapPortal();
                await loadMesa(state.mesa.laudoId, { silencioso: true });
                feedback("Laudo devolvido para ajustes.");
            }).catch((erro) => feedback(erro.message || "Falha ao rejeitar laudo.", true));
        });
    }

    async function init() {
        restaurarTab();
        bindTabs();
        bindFiltros();
        bindAdminActions();
        bindChatActions();
        bindMesaActions();

        try {
            await bootstrapPortal({ carregarDetalhes: true });
            definirTab(state.ui.tab, false);
        } catch (erro) {
            feedback(erro.message || "Falha ao carregar o portal do cliente.", true);
        }
    }

    init();
})();
