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
            usuariosSituacao: "",
            chatBusca: "",
            chatSituacao: "",
            mesaBusca: "",
            mesaSituacao: "",
            usuarioEmDestaque: null,
        },
        chat: {
            laudoId: null,
            mensagens: [],
            documentoTexto: "",
            documentoNome: "",
            documentoChars: 0,
            documentoTruncado: false,
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

    function formatarCapacidadeRestante(restante, excedente, singular, plural) {
        const sufixo = Number(restante) === 1 ? singular : plural;
        if (restante == null) return `Sem teto de ${plural}`;
        if (Number(excedente || 0) > 0) {
            const excesso = Number(excedente || 0);
            const sufixoExcesso = excesso === 1 ? singular : plural;
            return `${formatarInteiro(excesso)} ${sufixoExcesso} acima do plano`;
        }
        if (Number(restante) <= 0) return `No limite de ${plural}`;
        return `${formatarInteiro(restante)} ${sufixo} restantes`;
    }

    function tomCapacidadeEmpresa(empresa) {
        const tone = texto(empresa?.capacidade_tone).trim().toLowerCase();
        if (tone === "aberto" || tone === "aguardando" || tone === "ajustes" || tone === "aprovado") {
            return tone;
        }
        return "aprovado";
    }

    function obterPlanoCatalogo(plano) {
        return (state.bootstrap?.empresa?.planos_catalogo || []).find((item) => texto(item?.plano) === texto(plano)) || null;
    }

    function formatarLimitePlano(valor, singular, plural) {
        if (valor == null || valor === "") return `Sem teto de ${plural}`;
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return `Sem teto de ${plural}`;
        return `${formatarInteiro(numero)} ${numero === 1 ? singular : plural}`;
    }

    function formatarVariacao(valor) {
        const numero = Number(valor || 0);
        if (!Number.isFinite(numero)) return "0%";
        if (numero > 0) return `+${numero}%`;
        return `${numero}%`;
    }

    function resumoCanalOperacional(canal) {
        if (canal === "chat") return "Chat";
        if (canal === "mesa") return "Mesa Avaliadora";
        return "Admin";
    }

    function scrollToPortalSection(id) {
        const alvo = id ? $(id) : null;
        if (!alvo) return;
        try {
            alvo.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (_) {
            alvo.scrollIntoView();
        }
    }

    function htmlBarrasHistorico(serie, tone) {
        const lista = Array.isArray(serie) ? serie : [];
        const maior = Math.max(...lista.map((item) => Number(item?.total || 0)), 1);
        return `
            <div class="health-bars" data-tone="${escapeAttr(tone || "aberto")}">
                ${lista.map((item) => {
                    const total = Number(item?.total || 0);
                    const altura = Math.max(10, Math.round((total / maior) * 100));
                    return `
                        <div class="health-bar" title="${escapeAttr(`${item.label}: ${total}`)}">
                            <div class="health-bar-fill${item.atual ? " is-current" : ""}" style="height:${altura}%"></div>
                            <span class="health-bar-value">${escapeHtml(formatarInteiro(total))}</span>
                            <span class="health-bar-label">${escapeHtml(item.label || "")}</span>
                        </div>
                    `;
                }).join("")}
            </div>
        `;
    }

    function construirPrioridadesPortal() {
        const empresa = state.bootstrap?.empresa;
        const usuarios = state.bootstrap?.usuarios || [];
        const laudosChat = state.bootstrap?.chat?.laudos || [];
        const laudosMesa = state.bootstrap?.mesa?.laudos || [];
        const prioridades = [];

        if (!empresa) return prioridades;

        if (empresa.status_bloqueio) {
            prioridades.push({
                score: 1000,
                tone: "ajustes",
                canal: "admin",
                titulo: "Empresa bloqueada",
                detalhe: "A operacao central esta bloqueada e isso merece revisao imediata.",
                acaoLabel: "Abrir Admin",
                kind: "admin-section",
                targetId: "empresa-resumo-detalhado",
            });
        }

        if (empresa.capacidade_status === "critico" && texto(empresa.plano_sugerido).trim()) {
            prioridades.push({
                score: 960,
                tone: "ajustes",
                canal: "admin",
                titulo: "Upgrade precisa sair agora",
                detalhe: empresa.capacidade_acao || "A empresa ja encostou no teto do contrato.",
                acaoLabel: `Preparar ${empresa.plano_sugerido}`,
                kind: "upgrade",
                origem: empresa.capacidade_gargalo === "laudos" ? "chat" : "admin",
            });
        }

        const primeiroTemporario = ordenarPorPrioridade(
            usuarios.filter((item) => item?.senha_temporaria_ativa),
            prioridadeUsuario
        )[0];
        if (primeiroTemporario) {
            prioridades.push({
                score: 760,
                tone: "aguardando",
                canal: "admin",
                titulo: "Primeiro acesso pendente",
                detalhe: `${primeiroTemporario.nome || "Usuario"} ainda precisa concluir a troca de senha para operar.`,
                acaoLabel: "Revisar equipe",
                kind: "admin-user",
                targetId: "lista-usuarios",
                userId: Number(primeiroTemporario.id),
                busca: primeiroTemporario.email || primeiroTemporario.nome || "",
                papel: slugPapel(primeiroTemporario),
            });
        }

        const primeiroBloqueado = ordenarPorPrioridade(
            usuarios.filter((item) => !item?.ativo),
            prioridadeUsuario
        )[0];
        if (primeiroBloqueado) {
            prioridades.push({
                score: 720,
                tone: "ajustes",
                canal: "admin",
                titulo: "Acesso bloqueado pede revisao",
                detalhe: `${primeiroBloqueado.nome || "Usuario"} esta bloqueado e pode estar travando a rotina da empresa.`,
                acaoLabel: "Abrir equipe",
                kind: "admin-user",
                targetId: "lista-usuarios",
                userId: Number(primeiroBloqueado.id),
                busca: primeiroBloqueado.email || primeiroBloqueado.nome || "",
                papel: slugPapel(primeiroBloqueado),
            });
        }

        const chatUrgente = ordenarPorPrioridade(
            laudosChat.filter((item) => {
                const status = variantStatusLaudo(item?.status_card);
                return status === "ajustes" || status === "aberto" || status === "aguardando";
            }),
            prioridadeChat
        )[0];
        if (chatUrgente && prioridadeChat(chatUrgente).tone !== "aprovado") {
            const prioridade = prioridadeChat(chatUrgente);
            prioridades.push({
                score: 680,
                tone: prioridade.tone,
                canal: "chat",
                titulo: chatUrgente.titulo || "Laudo no chat",
                detalhe: prioridade.acao,
                acaoLabel: "Abrir laudo",
                kind: "chat-laudo",
                laudoId: Number(chatUrgente.id),
                targetId: "chat-contexto",
            });
        }

        const mesaUrgente = ordenarPorPrioridade(
            laudosMesa.filter((item) => {
                const prioridade = prioridadeMesa(item);
                return prioridade.tone !== "aprovado";
            }),
            prioridadeMesa
        )[0];
        if (mesaUrgente && prioridadeMesa(mesaUrgente).tone !== "aprovado") {
            const prioridade = prioridadeMesa(mesaUrgente);
            prioridades.push({
                score: 660,
                tone: prioridade.tone,
                canal: "mesa",
                titulo: mesaUrgente.titulo || "Laudo na mesa",
                detalhe: prioridade.acao,
                acaoLabel: "Abrir mesa",
                kind: "mesa-laudo",
                laudoId: Number(mesaUrgente.id),
                targetId: "mesa-contexto",
            });
        }

        const resultado = prioridades
            .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
            .slice(0, 4);

        if (resultado.length) return resultado;

        return [
            {
                score: 100,
                tone: "aprovado",
                canal: "admin",
                titulo: "Operacao sob controle",
                detalhe: "Nenhum gargalo critico apareceu agora entre equipe, chat e mesa.",
                acaoLabel: "Abrir Admin",
                kind: "admin-section",
                targetId: "panel-admin",
            },
        ];
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

    function rotuloSituacaoUsuarios(situacao) {
        if (situacao === "temporarios") return "Primeiros acessos";
        if (situacao === "sem_login") return "Sem login";
        if (situacao === "bloqueados") return "Bloqueados";
        return "";
    }

    function rotuloSituacaoChat(situacao) {
        if (situacao === "ajustes") return "Ação agora";
        if (situacao === "abertos") return "Em operação";
        if (situacao === "aguardando") return "Aguardando mesa";
        if (situacao === "parados") return "Parados";
        if (situacao === "concluidos") return "Concluídos";
        return "";
    }

    function rotuloSituacaoMesa(situacao) {
        if (situacao === "responder") return "Respostas novas";
        if (situacao === "pendencias") return "Pendências abertas";
        if (situacao === "aguardando") return "Pronto para revisar";
        if (situacao === "parados") return "Parados";
        if (situacao === "aprovados") return "Concluídos";
        return "";
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

    function horasDesdeAtualizacao(valor) {
        const timestamp = parseDataIso(valor);
        if (!timestamp) return null;
        const diff = Date.now() - timestamp;
        if (!Number.isFinite(diff) || diff < 0) return 0;
        return Math.floor(diff / (1000 * 60 * 60));
    }

    function resumoEsperaHoras(horas) {
        const numero = Number(horas);
        if (!Number.isFinite(numero) || numero <= 0) return "Atualizado agora";
        if (numero < 24) return `Parado ha ${numero}h`;
        const dias = Math.floor(numero / 24);
        return `Parado ha ${dias}d`;
    }

    function laudoChatParado(laudo) {
        const horas = horasDesdeAtualizacao(laudo?.atualizado_em);
        const status = variantStatusLaudo(laudo?.status_card);
        if (horas == null || status === "aprovado") return false;
        return horas >= 48;
    }

    function laudoMesaParado(laudo) {
        const horas = horasDesdeAtualizacao(laudo?.atualizado_em);
        const prioridade = prioridadeMesa(laudo);
        if (horas == null || prioridade.tone === "aprovado") return false;
        return horas >= 24;
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
        const capacidadeTone = tomCapacidadeEmpresa(empresa);
        const capacidadeStatus = texto(empresa?.capacidade_status).trim().toLowerCase();
        const sugestaoPlano = texto(empresa?.plano_sugerido).trim();

        if (empresa?.status_bloqueio) {
            return {
                tone: "ajustes",
                badge: "Conta bloqueada",
                acao: "Libere a empresa e revise imediatamente o que esta travando a operacao.",
            };
        }
        if (capacidadeStatus === "critico") {
            return {
                tone: capacidadeTone,
                badge: texto(empresa?.capacidade_badge || "Expandir plano agora"),
                acao: `${texto(empresa?.capacidade_acao || "A empresa chegou no limite contratado.")}${sugestaoPlano ? ` Proximo passo comercial: migrar para ${sugestaoPlano}.` : ""}`,
            };
        }
        if (bloqueados > 0) {
            return {
                tone: "aguardando",
                badge: "Revisar acessos bloqueados",
                acao: "Ha usuarios travados. Confira se isso foi intencional ou se alguem precisa voltar a operar.",
            };
        }
        if (capacidadeStatus === "atencao" || capacidadeStatus === "monitorar") {
            return {
                tone: capacidadeTone,
                badge: texto(empresa?.capacidade_badge || "Planejar upgrade"),
                acao: `${texto(empresa?.capacidade_acao || "O plano entrou na faixa de atencao.")}${sugestaoPlano ? ` Melhor encaixe agora: ${sugestaoPlano}.` : ""}`,
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
        const situacao = state.ui.usuariosSituacao;

        return usuarios.filter((usuario) => {
            const combinaPapel = papel === "todos" ? true : slugPapel(usuario) === papel;
            if (!combinaPapel) return false;
            if (situacao === "temporarios" && !usuario.senha_temporaria_ativa) return false;
            if (situacao === "sem_login" && parseDataIso(usuario.ultimo_login)) return false;
            if (situacao === "bloqueados" && usuario.ativo) return false;
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
        const situacao = state.ui.chatSituacao;

        return laudos.filter((laudo) => {
            const status = variantStatusLaudo(laudo.status_card);
            if (situacao === "ajustes" && status !== "ajustes") return false;
            if (situacao === "abertos" && status !== "aberto") return false;
            if (situacao === "aguardando" && status !== "aguardando") return false;
            if (situacao === "parados" && !laudoChatParado(laudo)) return false;
            if (situacao === "concluidos" && status !== "aprovado") return false;
            if (!busca) return true;

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
        const situacao = state.ui.mesaSituacao;

        return laudos.filter((laudo) => {
            const prioridade = prioridadeMesa(laudo);
            const status = variantStatusLaudo(laudo.status_card);
            if (situacao === "responder" && Number(laudo?.whispers_nao_lidos || 0) <= 0) return false;
            if (situacao === "pendencias" && Number(laudo?.pendencias_abertas || 0) <= 0) return false;
            if (situacao === "aguardando" && !(status === "aguardando" && Number(laudo?.whispers_nao_lidos || 0) <= 0 && Number(laudo?.pendencias_abertas || 0) <= 0)) return false;
            if (situacao === "parados" && !laudoMesaParado(laudo)) return false;
            if (situacao === "aprovados" && prioridade.tone !== "aprovado") return false;
            if (!busca) return true;

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
            limparDocumentoChatPendente();
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

    function documentoChatPendenteAtivo() {
        return Boolean(texto(state.chat.documentoTexto).trim());
    }

    function limparDocumentoChatPendente() {
        state.chat.documentoTexto = "";
        state.chat.documentoNome = "";
        state.chat.documentoChars = 0;
        state.chat.documentoTruncado = false;
        if ($("chat-upload-doc")) {
            $("chat-upload-doc").value = "";
        }
        renderChatDocumentoPendente();
    }

    function renderChatDocumentoPendente() {
        const container = $("chat-upload-status");
        const botaoUpload = $("btn-chat-upload-doc");
        if (botaoUpload) {
            botaoUpload.disabled = !state.chat.laudoId;
        }
        if (!container) return;

        if (!documentoChatPendenteAtivo()) {
            container.hidden = true;
            container.innerHTML = "";
            return;
        }

        const nome = texto(state.chat.documentoNome || "documento");
        const chars = Number(state.chat.documentoChars || texto(state.chat.documentoTexto).length || 0);
        const truncado = Boolean(state.chat.documentoTruncado);

        container.hidden = false;
        container.innerHTML = `
            <div class="attachment-list">
                <div class="attachment-item">
                    <div class="attachment-copy">
                        <span class="attachment-name">${escapeHtml(nome)}</span>
                        <span class="attachment-meta">
                            Documento pronto para envio • ${escapeHtml(formatarInteiro(chars))} caracteres${truncado ? " • resumo truncado" : ""}
                        </span>
                    </div>
                    <button id="btn-chat-upload-limpar" class="btn ghost" type="button">Remover</button>
                </div>
            </div>
        `;

        $("btn-chat-upload-limpar")?.addEventListener("click", () => {
            limparDocumentoChatPendente();
            feedback("Documento removido do rascunho do chat.");
        });
    }

    async function importarDocumentoChat(arquivo) {
        if (!arquivo) return;
        if (!state.chat.laudoId) {
            if ($("chat-upload-doc")) {
                $("chat-upload-doc").value = "";
            }
            feedback("Selecione um laudo do chat antes de importar um documento.", true);
            return;
        }

        const botao = $("btn-chat-upload-doc");
        await withBusy(botao, "Lendo...", async () => {
            const formData = new FormData();
            formData.append("arquivo", arquivo);
            const resposta = await api("/cliente/api/chat/upload_doc", {
                method: "POST",
                body: formData,
            });

            state.chat.documentoTexto = texto(resposta?.texto || "").trim();
            state.chat.documentoNome = texto(resposta?.nome || arquivo.name || "documento");
            state.chat.documentoChars = Number(resposta?.chars || state.chat.documentoTexto.length || 0);
            state.chat.documentoTruncado = Boolean(resposta?.truncado);
            renderChatDocumentoPendente();
            $("chat-mensagem")?.focus();
            feedback(
                `${state.chat.documentoNome} pronto para envio no chat da empresa.`,
                false,
                "Documento carregado"
            );
        }).catch((erro) => {
            limparDocumentoChatPendente();
            feedback(erro.message || "Falha ao importar documento.", true);
        });
    }

    function renderEmpresaCards() {
        const empresa = state.bootstrap?.empresa;
        if (!empresa) return;
        const prioridade = prioridadeEmpresa(empresa, state.bootstrap?.usuarios || []);
        const capacidadeTone = tomCapacidadeEmpresa(empresa);
        const usoValor = empresa.uso_percentual == null
            ? "Sem teto comercial neste contrato"
            : `${formatarInteiro(empresa.laudos_mes_atual || 0)} laudos no mes`;
        const resumoUsuarios = formatarCapacidadeRestante(empresa.usuarios_restantes, empresa.usuarios_excedente, "vaga", "vagas");
        const resumoLaudos = formatarCapacidadeRestante(empresa.laudos_restantes, empresa.laudos_excedente, "laudo", "laudos");
        const progresso = empresa.uso_percentual == null ? 18 : Math.max(6, Math.min(100, Number(empresa.uso_percentual || 0)));
        const riscoLabel = texto(empresa.capacidade_badge || "Capacidade estavel");
        const riscoMensagem = texto(empresa.capacidade_acao || "A empresa ainda tem folga operacional dentro do plano.");
        const planoSugerido = texto(empresa.plano_sugerido).trim();
        const alertaCapacidade = $("empresa-alerta-capacidade");
        const notaCapacidadeUsuario = $("usuario-capacidade-nota");
        const botaoCriarUsuario = $("btn-usuario-criar");

        $("empresa-cards").innerHTML = `
            <article class="metric-card" data-accent="${empresa.status_bloqueio ? "attention" : "done"}">
                <small>Plano em operacao</small>
                <strong>${escapeHtml(empresa.plano_ativo)}</strong>
                <span class="metric-meta">${empresa.status_bloqueio ? "Empresa bloqueada" : "Empresa liberada para operar"}</span>
            </article>
            <article class="metric-card" data-accent="${empresa.usuarios_restantes === 0 && empresa.usuarios_max != null ? "attention" : "live"}">
                <small>Equipe em uso</small>
                <strong>${formatarInteiro(empresa.usuarios_em_uso || empresa.total_usuarios)}</strong>
                <span class="metric-meta">${resumoUsuarios}. ${formatarInteiro(empresa.admins_cliente)} admins, ${formatarInteiro(empresa.inspetores)} inspetores, ${formatarInteiro(empresa.revisores)} mesa.</span>
            </article>
            <article class="metric-card" data-accent="${empresa.laudos_restantes === 0 && empresa.laudos_mes_limite != null ? "attention" : "aberto"}">
                <small>Laudos deste mes</small>
                <strong>${formatarInteiro(empresa.laudos_mes_atual || 0)}</strong>
                <span class="metric-meta">${resumoLaudos}. ${empresa.laudos_mes_limite == null ? "Contrato sem limite mensal fixo." : `Limite de ${formatarInteiro(empresa.laudos_mes_limite)} laudos.`}</span>
            </article>
            <article class="metric-card" data-accent="${capacidadeTone}">
                <small>Folga comercial</small>
                <strong>${formatarPercentual(empresa.uso_percentual)}</strong>
                <span class="metric-meta">${usoValor}. ${escapeHtml(riscoLabel)}</span>
            </article>
        `;

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
                            <strong>${formatarInteiro(empresa.laudos_mes_atual || 0)} laudos criados neste mes</strong>
                        </div>
                        <span class="pill" data-kind="laudo" data-status="${capacidadeTone}">${formatarPercentual(empresa.uso_percentual)}</span>
                    </div>
                    <div class="progress-track"><div class="progress-bar" style="width:${progresso}%"></div></div>
                    <div class="toolbar-meta">
                        <span class="hero-chip">Limite mensal: ${empresa.laudos_mes_limite == null ? "sem teto" : formatarInteiro(empresa.laudos_mes_limite)}</span>
                        <span class="hero-chip">Laudos restantes: ${empresa.laudos_restantes == null ? "sem teto" : formatarInteiro(empresa.laudos_restantes)}</span>
                        <span class="hero-chip">Limite de usuarios: ${empresa.usuarios_max == null ? "sem teto" : formatarInteiro(empresa.usuarios_max)}</span>
                        <span class="hero-chip">Vagas restantes: ${empresa.usuarios_restantes == null ? "sem teto" : formatarInteiro(empresa.usuarios_restantes)}</span>
                    </div>
                </div>
                <div class="context-grid">
                    <div class="context-block">
                        <small>Equipe ocupando o plano</small>
                        <strong>${formatarInteiro(empresa.usuarios_em_uso || empresa.total_usuarios)}</strong>
                    </div>
                    <div class="context-block">
                        <small>Margem de usuarios</small>
                        <strong>${escapeHtml(resumoUsuarios)}</strong>
                    </div>
                    <div class="context-block">
                        <small>Laudos na janela atual</small>
                        <strong>${formatarInteiro(empresa.laudos_mes_atual || 0)}</strong>
                    </div>
                    <div class="context-block">
                        <small>Margem do mes</small>
                        <strong>${escapeHtml(resumoLaudos)}</strong>
                    </div>
                </div>
                <div class="chip-list">
                    <span class="feature-chip" data-enabled="${empresa.upload_doc ? "true" : "false"}">Upload documental ${empresa.upload_doc ? "ativo" : "indisponivel"}</span>
                    <span class="feature-chip" data-enabled="${empresa.deep_research ? "true" : "false"}">Deep research ${empresa.deep_research ? "ativo" : "indisponivel"}</span>
                    <span class="feature-chip" data-enabled="true">Responsavel ${escapeHtml(empresa.nome_responsavel || "nao informado")}</span>
                    <span class="feature-chip" data-enabled="true">Base ${escapeHtml(empresa.cidade_estado || "nao informada")}</span>
                    <span class="feature-chip" data-enabled="true">Processamento acumulado ${formatarInteiro(empresa.mensagens_processadas || 0)}</span>
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

        if (alertaCapacidade) {
            const recomendacaoUpgrade = planoSugerido
                ? `Migrar para ${planoSugerido} tende a aliviar primeiro ${empresa.capacidade_gargalo === "usuarios" ? "a equipe" : "a fila mensal de laudos"}.`
                : "O plano atual ja e o topo da escada comercial configurada.";
            alertaCapacidade.innerHTML = `
                <div class="context-guidance capacity-alert" data-tone="${capacidadeTone}">
                    <div class="context-guidance-copy">
                        <small>Capacidade e proximo passo comercial</small>
                        <strong>${escapeHtml(riscoLabel)}</strong>
                        <p>${escapeHtml(riscoMensagem)}</p>
                        <p>${escapeHtml(planoSugerido ? `${empresa.plano_sugerido_motivo || recomendacaoUpgrade}` : recomendacaoUpgrade)}</p>
                    </div>
                    <div class="capacity-alert-side">
                        <span class="pill" data-kind="priority" data-status="${capacidadeTone}">${escapeHtml(riscoLabel)}</span>
                        <span class="hero-chip">${planoSugerido ? `Plano sugerido: ${escapeHtml(planoSugerido)}` : "Sem upgrade imediato"}</span>
                    </div>
                </div>
            `;
        }

        if (notaCapacidadeUsuario) {
            const limiteUsuariosAtingido = empresa.usuarios_max != null && Number(empresa.usuarios_restantes || 0) <= 0;
            notaCapacidadeUsuario.innerHTML = `
                <div class="form-hint" data-tone="${limiteUsuariosAtingido ? "ajustes" : capacidadeTone}">
                    <strong>${limiteUsuariosAtingido ? "Equipe no teto do plano" : "Capacidade para novos usuarios"}</strong>
                    <span>${escapeHtml(limiteUsuariosAtingido
                        ? `${resumoUsuarios}. ${planoSugerido ? `Troque para ${planoSugerido} antes de criar outro acesso.` : "Revise o plano antes de ampliar a equipe."}`
                        : `${resumoUsuarios}. ${planoSugerido && (empresa.capacidade_status === "atencao" || empresa.capacidade_status === "monitorar") ? `Se a fila crescer, o melhor encaixe passa a ser ${planoSugerido}.` : "Ainda existe folga para ampliar a equipe com seguranca."}`)}</span>
                </div>
            `;
            if (botaoCriarUsuario) {
                botaoCriarUsuario.disabled = limiteUsuariosAtingido;
            }
        }
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
        const capacidadeTone = tomCapacidadeEmpresa(empresa);
        const resumoUsuarios = formatarCapacidadeRestante(empresa.usuarios_restantes, empresa.usuarios_excedente, "vaga", "vagas");
        const resumoLaudos = formatarCapacidadeRestante(empresa.laudos_restantes, empresa.laudos_excedente, "laudo", "laudos");
        const planoSugerido = texto(empresa.plano_sugerido).trim();

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
            <article class="metric-card" data-accent="${empresa.usuarios_restantes === 0 && empresa.usuarios_max != null ? "attention" : "live"}">
                <small>Margem de equipe</small>
                <strong>${empresa.usuarios_restantes == null ? "Livre" : formatarInteiro(empresa.usuarios_restantes)}</strong>
                <span class="metric-meta">${escapeHtml(resumoUsuarios)} dentro do plano ${escapeHtml(empresa.plano_ativo)}.</span>
            </article>
            <article class="metric-card" data-accent="${capacidadeTone}">
                <small>Janela de laudos</small>
                <strong>${empresa.laudos_restantes == null ? "Livre" : formatarInteiro(empresa.laudos_restantes)}</strong>
                <span class="metric-meta">${escapeHtml(resumoLaudos)}. ${formatarInteiro(empresa.laudos_mes_atual || 0)} ja passaram nesta janela mensal.</span>
            </article>
            <article class="metric-card" data-accent="${prioridade.tone}">
                <small>Foco da administracao</small>
                <strong>${escapeHtml(prioridade.badge)}</strong>
                <span class="metric-meta">${escapeHtml(prioridade.acao)}${planoSugerido ? ` Proximo plano sugerido: ${escapeHtml(planoSugerido)}.` : ""}</span>
            </article>
        `;
    }

    function renderSaudeEmpresa() {
        const empresa = state.bootstrap?.empresa;
        const resumo = $("admin-saude-resumo");
        const historico = $("admin-saude-historico");
        const saude = empresa?.saude_operacional;
        if (!empresa || !resumo || !historico || !saude) return;

        resumo.innerHTML = `
            <article class="metric-card" data-accent="${escapeAttr(saude.tone || "aprovado")}">
                <small>Status da operacao</small>
                <strong>${escapeHtml(saude.status || "Sem leitura")}</strong>
                <span class="metric-meta">${escapeHtml(saude.texto || "Sem observacoes adicionais.")}</span>
            </article>
            <article class="metric-card" data-accent="${escapeAttr(saude.tendencia_tone || "aberto")}">
                <small>Tendencia mensal</small>
                <strong>${escapeHtml(saude.tendencia_rotulo || "Estavel")}</strong>
                <span class="metric-meta">${escapeHtml(formatarVariacao(saude.variacao_mensal_percentual || 0))} em relacao ao mes anterior.</span>
            </article>
            <article class="metric-card" data-accent="live">
                <small>Equipe ativa em 14 dias</small>
                <strong>${escapeHtml(formatarInteiro(saude.usuarios_login_recente || 0))}</strong>
                <span class="metric-meta">${escapeHtml(formatarInteiro(saude.usuarios_sem_login_recente || 0))} ainda nao apareceram na janela recente.</span>
            </article>
            <article class="metric-card" data-accent="waiting">
                <small>Movimentos comerciais</small>
                <strong>${escapeHtml(formatarInteiro(saude.eventos_comerciais_60d || 0))}</strong>
                <span class="metric-meta">${escapeHtml(formatarInteiro(saude.primeiros_acessos_pendentes || 0))} primeiros acessos ainda pedem conclusao.</span>
            </article>
        `;

        historico.innerHTML = `
            <article class="health-card">
                <div class="context-guidance" data-tone="${escapeAttr(saude.tendencia_tone || "aberto")}">
                    <div class="context-guidance-copy">
                        <small>Ultimos 6 meses</small>
                        <strong>${escapeHtml(saude.tendencia_rotulo || "Ritmo estavel")}</strong>
                        <p>Mes atual: ${escapeHtml(formatarInteiro(saude.laudos_mes_atual || 0))} laudos. Mes anterior: ${escapeHtml(formatarInteiro(saude.laudos_mes_anterior || 0))}.</p>
                    </div>
                    <span class="pill" data-kind="priority" data-status="${escapeAttr(saude.tendencia_tone || "aberto")}">${escapeHtml(formatarVariacao(saude.variacao_mensal_percentual || 0))}</span>
                </div>
                ${htmlBarrasHistorico(saude.historico_mensal || [], saude.tendencia_tone || "aberto")}
            </article>
            <article class="health-card">
                <div class="context-guidance" data-tone="${escapeAttr(saude.tone || "aprovado")}">
                    <div class="context-guidance-copy">
                        <small>Pulso dos ultimos 14 dias</small>
                        <strong>${escapeHtml(saude.status || "Sem leitura")}</strong>
                        <p>${escapeHtml(formatarInteiro(saude.usuarios_login_recente || 0))} pessoas usaram o portal recentemente, com ${escapeHtml(formatarInteiro(saude.mix_equipe?.inspetores || 0))} inspetores e ${escapeHtml(formatarInteiro(saude.mix_equipe?.revisores || 0))} usuarios de mesa no mix.</p>
                    </div>
                    <span class="pill" data-kind="priority" data-status="${escapeAttr(saude.tone || "aprovado")}">${escapeHtml(formatarInteiro(saude.eventos_comerciais_60d || 0))} eventos</span>
                </div>
                ${htmlBarrasHistorico(saude.historico_diario || [], saude.tone || "aprovado")}
            </article>
        `;
    }

    function renderOnboardingEquipe() {
        const resumo = $("admin-onboarding-resumo");
        const lista = $("admin-onboarding-lista");
        const usuarios = state.bootstrap?.usuarios || [];
        if (!resumo || !lista) return;

        const temporarios = ordenarPorPrioridade(
            usuarios.filter((item) => item?.senha_temporaria_ativa),
            prioridadeUsuario
        );
        const semLogin = ordenarPorPrioridade(
            usuarios.filter((item) => !parseDataIso(item?.ultimo_login)),
            prioridadeUsuario
        );
        const bloqueados = ordenarPorPrioridade(
            usuarios.filter((item) => !item?.ativo),
            prioridadeUsuario
        );
        const revisoresSemLogin = semLogin.filter((item) => slugPapel(item) === "revisor");

        resumo.innerHTML = `
            <article class="metric-card" data-accent="waiting">
                <small>Primeiros acessos</small>
                <strong>${formatarInteiro(temporarios.length)}</strong>
                <span class="metric-meta">Usuarios com senha temporaria ainda pendente de conclusao.</span>
            </article>
            <article class="metric-card" data-accent="aberto">
                <small>Sem login</small>
                <strong>${formatarInteiro(semLogin.length)}</strong>
                <span class="metric-meta">Cadastros criados que ainda nao entraram nenhuma vez.</span>
            </article>
            <article class="metric-card" data-accent="attention">
                <small>Bloqueados</small>
                <strong>${formatarInteiro(bloqueados.length)}</strong>
                <span class="metric-meta">Acessos travados que podem segurar a operacao da empresa.</span>
            </article>
            <article class="metric-card" data-accent="live">
                <small>Mesa sem login</small>
                <strong>${formatarInteiro(revisoresSemLogin.length)}</strong>
                <span class="metric-meta">Usuarios da Mesa Avaliadora que ainda nao ativaram o acesso.</span>
            </article>
        `;

        const pendenciasMap = new Map();
        [...temporarios, ...bloqueados, ...semLogin].forEach((item) => {
            if (item?.id != null) pendenciasMap.set(Number(item.id), item);
        });
        const pendencias = ordenarPorPrioridade([...pendenciasMap.values()], prioridadeUsuario).slice(0, 4);

        const quickActions = `
            <div class="toolbar-meta">
                <button class="btn" type="button" data-act="filtrar-usuarios-status" data-situacao="temporarios">Ver primeiros acessos</button>
                <button class="btn" type="button" data-act="filtrar-usuarios-status" data-situacao="sem_login">Ver sem login</button>
                <button class="btn" type="button" data-act="filtrar-usuarios-status" data-situacao="bloqueados">Ver bloqueados</button>
                <button class="btn ghost" type="button" data-act="limpar-filtro-usuarios">Limpar filtro rapido</button>
            </div>
        `;

        if (!pendencias.length) {
            lista.innerHTML = `
                <div class="empty-state">
                    <strong>Equipe principal ativada</strong>
                    <p>Nao ha onboarding pendente agora. Novos primeiros acessos e bloqueios vao aparecer aqui.</p>
                </div>
                ${quickActions}
            `;
            return;
        }

        lista.innerHTML = `
            ${quickActions}
            ${pendencias.map((usuario) => {
                const prioridade = prioridadeUsuario(usuario);
                const papel = slugPapel(usuario);
                const detalhe =
                    !usuario.ativo
                        ? `${usuario.nome || "Usuario"} esta bloqueado e pode estar segurando a rotina da empresa.`
                        : usuario.senha_temporaria_ativa
                            ? `${usuario.nome || "Usuario"} ainda precisa concluir o primeiro acesso.`
                            : `${usuario.nome || "Usuario"} foi criado, mas ainda nao entrou nenhuma vez.`;

                return `
                    <article class="activity-item">
                        <div class="activity-head">
                            <div class="activity-copy">
                                <strong>${escapeHtml(usuario.nome || "Usuario")}</strong>
                                <span class="activity-meta">${escapeHtml(usuario.email || "Sem e-mail")} • ${escapeHtml(obterNomePapel(papel))}</span>
                            </div>
                            <span class="pill" data-kind="priority" data-status="${escapeAttr(prioridade.tone)}">${escapeHtml(prioridade.badge)}</span>
                        </div>
                        <p class="activity-detail">${escapeHtml(detalhe)}</p>
                        <div class="toolbar-meta">
                            ${!usuario.ativo
                                ? `<button class="btn" type="button" data-act="toggle-user" data-user="${escapeAttr(String(usuario.id || ""))}">Desbloquear agora</button>`
                                : `<button class="btn" type="button" data-act="reset-user" data-user="${escapeAttr(String(usuario.id || ""))}">Gerar nova senha</button>`}
                            <button
                                class="btn"
                                type="button"
                                data-act="abrir-prioridade"
                                data-kind="admin-user"
                                data-canal="admin"
                                data-target="lista-usuarios"
                                data-user="${escapeAttr(String(usuario.id || ""))}"
                                data-busca="${escapeAttr(usuario.email || usuario.nome || "")}"
                                data-papel="${escapeAttr(papel)}"
                            >Abrir cadastro</button>
                        </div>
                    </article>
                `;
            }).join("")}
        `;
    }

    function renderAdminAuditoria() {
        const container = $("admin-auditoria-lista");
        if (!container) return;

        const itens = state.bootstrap?.auditoria?.itens || [];
        if (!itens.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <strong>Nenhuma atividade registrada ainda</strong>
                    <p>As alteracoes de plano, equipe e acesso passam a aparecer aqui conforme o portal for sendo usado.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = itens.map((item) => `
            <article class="activity-item">
                <div class="activity-head">
                    <div class="activity-copy">
                        <strong>${escapeHtml(item.resumo || "Ação registrada")}</strong>
                        <span class="activity-meta">Por ${escapeHtml(item.ator_nome || "Sistema")} • ${escapeHtml(item.criado_em_label || "Agora")}</span>
                    </div>
                    <span class="pill" data-kind="priority" data-status="aberto">${escapeHtml(texto(item.acao || "evento").replaceAll("_", " "))}</span>
                </div>
                ${item.detalhe ? `<p class="activity-detail">${escapeHtml(item.detalhe)}</p>` : ""}
            </article>
        `).join("");
    }

    function renderHistoricoPlanos() {
        const container = $("admin-planos-historico");
        if (!container) return;

        const itens = (state.bootstrap?.auditoria?.itens || []).filter((item) => texto(item?.acao) === "plano_alterado");
        if (!itens.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <strong>Nenhuma troca de plano registrada ainda</strong>
                    <p>Quando a empresa mudar de plano, o impacto esperado fica registrado aqui para consulta rapida.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = itens.map((item) => {
            const payload = item.payload || {};
            const antes = texto(payload.plano_anterior || "").trim();
            const depois = texto(payload.plano_novo || "").trim();
            const impacto = texto(payload.impacto_resumido || item.detalhe || "").trim();
            return `
                <article class="activity-item">
                    <div class="activity-head">
                        <div class="activity-copy">
                            <strong>${escapeHtml(item.resumo || "Mudanca de plano")}</strong>
                            <span class="activity-meta">Por ${escapeHtml(item.ator_nome || "Sistema")} • ${escapeHtml(item.criado_em_label || "Agora")}</span>
                        </div>
                        <span class="pill" data-kind="priority" data-status="aberto">${escapeHtml(texto(payload.movimento || "plano"))}</span>
                    </div>
                    <p class="activity-detail">${escapeHtml(impacto || "Impacto nao informado.")}</p>
                    <div class="toolbar-meta">
                        <span class="hero-chip">${antes ? `Antes: ${escapeHtml(antes)}` : "Antes nao informado"}</span>
                        <span class="hero-chip">${depois ? `Depois: ${escapeHtml(depois)}` : "Depois nao informado"}</span>
                    </div>
                </article>
            `;
        }).join("");
    }

    function renderPreviewPlano() {
        const container = $("plano-impacto-preview");
        const empresa = state.bootstrap?.empresa;
        const seletor = $("empresa-plano");
        const botao = $("btn-plano-salvar");
        if (!container || !empresa || !seletor) return;

        const planoSelecionado = obterPlanoCatalogo(seletor.value) || obterPlanoCatalogo(empresa.plano_ativo);
        if (!planoSelecionado) {
            container.innerHTML = "";
            if (botao) botao.disabled = false;
            return;
        }

        const ehAtual = texto(planoSelecionado.plano) === texto(empresa.plano_ativo);
        const movimento = texto(planoSelecionado.movimento || (ehAtual ? "manter" : "upgrade"));
        const tone = ehAtual ? "aprovado" : movimento === "downgrade" ? "aguardando" : "aberto";
        const chips = [];
        chips.push(`<span class="hero-chip">Usuarios: ${escapeHtml(formatarLimitePlano(planoSelecionado.usuarios_max, "vaga", "vagas"))}</span>`);
        chips.push(`<span class="hero-chip">Laudos/mes: ${escapeHtml(formatarLimitePlano(planoSelecionado.laudos_mes, "laudo", "laudos"))}</span>`);
        chips.push(`<span class="hero-chip">${planoSelecionado.upload_doc ? "Upload documental liberado" : "Upload documental indisponivel"}</span>`);
        chips.push(`<span class="hero-chip">${planoSelecionado.deep_research ? "Deep research liberado" : "Deep research indisponivel"}</span>`);
        const acoes = ehAtual
            ? ""
            : `
                <div class="toolbar-meta" style="margin-top: 10px;">
                    <button class="btn" type="button" data-act="registrar-interesse-plano" data-origem="admin" data-plano="${escapeAttr(planoSelecionado.plano)}">Registrar interesse</button>
                </div>
            `;

        container.innerHTML = `
            <div class="context-guidance" data-tone="${tone}">
                <div class="context-guidance-copy">
                    <small>${ehAtual ? "Plano atual em vigor" : "Impacto esperado da troca"}</small>
                    <strong>${escapeHtml(planoSelecionado.plano)}</strong>
                    <p>${escapeHtml(ehAtual
                        ? `Este plano sustenta hoje ${empresa.capacidade_badge ? empresa.capacidade_badge.toLowerCase() : "a operacao atual"}.`
                        : planoSelecionado.resumo_impacto || "Sem alteracao material detectada.")}</p>
                </div>
                <span class="pill" data-kind="priority" data-status="${tone}">${escapeHtml(ehAtual ? "Plano atual" : movimento)}</span>
            </div>
            <div class="toolbar-meta" style="margin-top: 10px;">
                ${chips.join("")}
            </div>
            ${acoes}
        `;

        if (botao) {
            botao.disabled = ehAtual;
        }
    }

    function renderAvisosOperacionais(canal, targetId) {
        const container = $(targetId);
        if (!container) return;

        const avisos = (state.bootstrap?.empresa?.avisos_operacionais || []).filter((item) => texto(item?.canal) === canal);
        if (!avisos.length) {
            container.innerHTML = "";
            return;
        }

        container.innerHTML = avisos.map((item) => `
            <div class="context-guidance operational-warning" data-tone="${escapeAttr(item.tone || "aberto")}">
                <div class="context-guidance-copy">
                    <small>${escapeHtml(resumoCanalOperacional(canal))}</small>
                    <strong>${escapeHtml(item.titulo || item.badge || "Aviso operacional")}</strong>
                    <p>${escapeHtml(item.detalhe || "")}</p>
                    ${item.acao ? `<p>${escapeHtml(item.acao)}</p>` : ""}
                    ${state.bootstrap?.empresa?.plano_sugerido
                        ? `<div class="toolbar-meta"><button class="btn" type="button" data-act="preparar-upgrade" data-origem="${escapeAttr(canal)}">Preparar ${escapeHtml(state.bootstrap.empresa.plano_sugerido)}</button></div>`
                        : ""}
                </div>
                <span class="pill" data-kind="priority" data-status="${escapeAttr(item.tone || "aberto")}">${escapeHtml(item.badge || "Acompanhar")}</span>
            </div>
        `).join("");
    }

    function renderChatCapacidade() {
        const empresa = state.bootstrap?.empresa;
        const nota = $("chat-capacidade-nota");
        const botao = $("btn-chat-laudo-criar");
        const seletor = $("chat-tipo-template");
        if (!empresa || !nota) return;

        const atingiuTeto = empresa.laudos_mes_limite != null && Number(empresa.laudos_restantes || 0) <= 0;
        const emAtencao = empresa.laudos_mes_limite != null && Number(empresa.laudos_restantes || 0) > 0 && Number(empresa.laudos_restantes || 0) <= 5;
        const planoSugerido = texto(empresa.plano_sugerido).trim();
        const tone = atingiuTeto ? "ajustes" : emAtencao ? "aguardando" : tomCapacidadeEmpresa(empresa);

        nota.innerHTML = `
            <div class="form-hint" data-tone="${tone}">
                <strong>${atingiuTeto ? "Novos laudos bloqueados pelo plano" : emAtencao ? "Janela mensal quase no limite" : "Abertura de laudo dentro da capacidade"}</strong>
                <span>${escapeHtml(
                    atingiuTeto
                        ? `${formatarCapacidadeRestante(empresa.laudos_restantes, empresa.laudos_excedente, "laudo", "laudos")}. ${planoSugerido ? `Prepare ${planoSugerido} para liberar novas aberturas.` : "Revise o contrato antes de abrir novos laudos."}`
                        : emAtencao
                            ? `${formatarCapacidadeRestante(empresa.laudos_restantes, empresa.laudos_excedente, "laudo", "laudos")}. ${planoSugerido ? `Vale deixar ${planoSugerido} pronto antes do proximo pico.` : "Monitore a fila antes do proximo pico."}`
                            : "O plano atual ainda sustenta novas aberturas de laudo com folga operacional."
                )}</span>
                ${planoSugerido && (atingiuTeto || emAtencao)
                    ? `<div class="toolbar-meta"><button class="btn" type="button" data-act="preparar-upgrade" data-origem="chat">Preparar ${escapeHtml(planoSugerido)}</button></div>`
                    : ""}
            </div>
        `;

        if (botao) {
            botao.disabled = atingiuTeto;
        }
        if (seletor) {
            seletor.disabled = atingiuTeto;
        }
    }

    function aplicarFiltrosUsuarios({ busca = "", papel = "todos", userId = null } = {}) {
        state.ui.usuariosBusca = texto(busca).trim();
        state.ui.usuariosPapel = texto(papel).trim() || "todos";
        state.ui.usuariosSituacao = "";
        state.ui.usuarioEmDestaque = userId ? Number(userId) : null;

        if ($("usuarios-busca")) {
            $("usuarios-busca").value = state.ui.usuariosBusca;
        }
        if ($("usuarios-filtro-papel")) {
            $("usuarios-filtro-papel").value = state.ui.usuariosPapel;
        }

        renderUsuarios();
    }

    function focarUsuarioNaTabela(userId, { expandir = true } = {}) {
        const id = Number(userId || 0);
        if (!Number.isFinite(id) || id <= 0) return;

        window.setTimeout(() => {
            const linha = document.querySelector(`[data-user-row="${id}"]`);
            if (!linha) return;
            if (expandir) {
                const details = linha.querySelector(".user-editor");
                if (details && !details.open) {
                    details.open = true;
                }
            }
            try {
                linha.scrollIntoView({ behavior: "smooth", block: "center" });
            } catch (_) {
                linha.scrollIntoView();
            }
        }, 40);
    }

    function renderUsuarios() {
        const usuarios = ordenarPorPrioridade(filtrarUsuarios(), prioridadeUsuario);
        const tbody = $("lista-usuarios");
        const vazio = $("usuarios-vazio");
        const resumo = $("usuarios-resumo");

        const totalTemporarios = (state.bootstrap?.usuarios || []).filter((item) => item.senha_temporaria_ativa).length;
        const totalBloqueados = (state.bootstrap?.usuarios || []).filter((item) => !item.ativo).length;
        const totalSemLogin = (state.bootstrap?.usuarios || []).filter((item) => !parseDataIso(item.ultimo_login)).length;
        const rotuloFiltroRapido = rotuloSituacaoUsuarios(state.ui.usuariosSituacao);
        resumo.innerHTML = `
            <span class="hero-chip">${formatarInteiro(usuarios.length)} visiveis agora</span>
            <span class="hero-chip">${formatarInteiro(totalTemporarios)} com senha temporaria</span>
            <span class="hero-chip">${formatarInteiro(totalBloqueados)} bloqueados</span>
            <span class="hero-chip">${formatarInteiro(totalSemLogin)} sem login</span>
            <span class="hero-chip">${formatarInteiro((state.bootstrap?.usuarios || []).filter((item) => item.ativo).length)} ativos</span>
            ${rotuloFiltroRapido ? `<span class="hero-chip">Filtro rapido: ${escapeHtml(rotuloFiltroRapido)}</span>` : ""}
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
            const emDestaque = Number(state.ui.usuarioEmDestaque || 0) === Number(usuario.id);

            return `
                <tr data-user-row="${usuario.id}"${emDestaque ? ' class="user-row-highlight"' : ""}>
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
        renderSaudeEmpresa();
        renderPreviewPlano();
        renderHistoricoPlanos();
        renderOnboardingEquipe();
        renderAdminAuditoria();
        renderUsuarios();
    }

    function renderCentralPrioridades() {
        const container = $("hero-prioridades");
        if (!container) return;

        const prioridades = construirPrioridadesPortal();
        container.innerHTML = prioridades.map((item, indice) => `
            <article class="priority-item" data-tone="${escapeAttr(item.tone || "aberto")}">
                <div class="priority-head">
                    <span class="pill" data-kind="priority" data-status="${escapeAttr(item.tone || "aberto")}">P${indice + 1}</span>
                    <span class="hero-chip">${escapeHtml(resumoCanalOperacional(item.canal))}</span>
                </div>
                <div class="priority-copy">
                    <strong>${escapeHtml(item.titulo || "Prioridade")}</strong>
                    <p>${escapeHtml(item.detalhe || "")}</p>
                </div>
                <button
                    class="btn"
                    type="button"
                    data-act="abrir-prioridade"
                    data-kind="${escapeAttr(item.kind || "admin-section")}"
                    data-canal="${escapeAttr(item.canal || "admin")}"
                    data-laudo="${item.laudoId ? escapeAttr(String(item.laudoId)) : ""}"
                    data-target="${escapeAttr(item.targetId || "")}"
                    data-origem="${escapeAttr(item.origem || item.canal || "admin")}"
                    data-user="${item.userId ? escapeAttr(String(item.userId)) : ""}"
                    data-busca="${escapeAttr(item.busca || "")}"
                    data-papel="${escapeAttr(item.papel || "todos")}"
                >${escapeHtml(item.acaoLabel || "Abrir")}</button>
            </article>
        `).join("");
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

    function renderChatTriagem() {
        const container = $("chat-triagem");
        const laudos = state.bootstrap?.chat?.laudos || [];
        if (!container) return;

        const ajustes = ordenarPorPrioridade(laudos.filter((item) => variantStatusLaudo(item.status_card) === "ajustes"), prioridadeChat);
        const abertos = ordenarPorPrioridade(laudos.filter((item) => variantStatusLaudo(item.status_card) === "aberto"), prioridadeChat);
        const aguardando = ordenarPorPrioridade(laudos.filter((item) => variantStatusLaudo(item.status_card) === "aguardando"), prioridadeChat);
        const parados = ordenarPorPrioridade(laudos.filter((item) => laudoChatParado(item)), prioridadeChat);
        const filtroAtivo = rotuloSituacaoChat(state.ui.chatSituacao);
        const destaque = ajustes[0] || parados[0] || aguardando[0] || abertos[0] || null;

        container.innerHTML = `
            <div class="toolbar-meta">
                <button class="btn" type="button" data-act="filtrar-chat-status" data-situacao="ajustes">Ver ajustes</button>
                <button class="btn" type="button" data-act="filtrar-chat-status" data-situacao="abertos">Ver abertos</button>
                <button class="btn" type="button" data-act="filtrar-chat-status" data-situacao="aguardando">Ver aguardando mesa</button>
                <button class="btn" type="button" data-act="filtrar-chat-status" data-situacao="parados">Ver parados</button>
                <button class="btn ghost" type="button" data-act="limpar-chat-filtro">Limpar filtro rapido</button>
                ${filtroAtivo ? `<span class="hero-chip">Filtro rapido: ${escapeHtml(filtroAtivo)}</span>` : ""}
            </div>
            ${destaque ? `
                <article class="activity-item">
                    <div class="activity-head">
                        <div class="activity-copy">
                            <strong>${escapeHtml(destaque.titulo || "Laudo do chat")}</strong>
                            <span class="activity-meta">${escapeHtml(destaque.tipo_template_label || "Inspeção")} • ${escapeHtml(destaque.data_br || "Sem data")}</span>
                        </div>
                        <span class="pill" data-kind="priority" data-status="${escapeAttr(prioridadeChat(destaque).tone)}">${escapeHtml(prioridadeChat(destaque).badge)}</span>
                    </div>
                    <p class="activity-detail">${escapeHtml(prioridadeChat(destaque).acao)}${laudoChatParado(destaque) ? ` ${resumoEsperaHoras(horasDesdeAtualizacao(destaque.atualizado_em))}.` : ""}</p>
                    <div class="toolbar-meta">
                        <button class="btn" type="button" data-act="abrir-prioridade" data-kind="chat-laudo" data-canal="chat" data-laudo="${escapeAttr(String(destaque.id || ""))}" data-target="chat-contexto">Abrir laudo prioritario</button>
                    </div>
                </article>
            ` : `
                <div class="empty-state">
                    <strong>Fila do chat controlada</strong>
                    <p>Nenhum laudo pede atenção imediata agora. Use os filtros rápidos se quiser revisar a fila por status.</p>
                </div>
            `}
        `;
    }

    function renderChatMovimentos() {
        const container = $("chat-movimentos");
        const laudos = ordenarPorPrioridade(state.bootstrap?.chat?.laudos || [], (item) => ({
            score: parseDataIso(item?.atualizado_em),
        })).slice(0, 3);
        if (!container) return;

        if (!laudos.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <strong>Sem movimentos recentes no chat</strong>
                    <p>Os laudos mais novos da empresa vao aparecer aqui assim que o chat começar a rodar.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <article class="activity-item">
                <div class="activity-head">
                    <div class="activity-copy">
                        <strong>Movimentos recentes do chat</strong>
                        <span class="activity-meta">Os ultimos laudos tocados pela empresa no canal operacional.</span>
                    </div>
                    <span class="hero-chip">${formatarInteiro(laudos.length)} recentes</span>
                </div>
                <div class="activity-list">
                    ${laudos.map((laudo) => `
                        <article class="activity-item">
                            <div class="activity-head">
                                <div class="activity-copy">
                                    <strong>${escapeHtml(laudo.titulo || "Laudo do chat")}</strong>
                                    <span class="activity-meta">${escapeHtml(laudo.data_br || "Sem data")} • ${escapeHtml(laudo.tipo_template_label || "Inspecao")}</span>
                                </div>
                                <span class="pill" data-kind="priority" data-status="${escapeAttr(prioridadeChat(laudo).tone)}">${escapeHtml(prioridadeChat(laudo).badge)}</span>
                            </div>
                            <p class="activity-detail">${escapeHtml(laudo.preview || "Sem resumo recente no chat.")}</p>
                            <div class="toolbar-meta">
                                ${laudoChatParado(laudo) ? `<span class="hero-chip">${escapeHtml(resumoEsperaHoras(horasDesdeAtualizacao(laudo.atualizado_em)))}</span>` : ""}
                                <button class="btn" type="button" data-act="abrir-prioridade" data-kind="chat-laudo" data-canal="chat" data-laudo="${escapeAttr(String(laudo.id || ""))}" data-target="chat-contexto">Abrir laudo</button>
                            </div>
                        </article>
                    `).join("")}
                </div>
            </article>
        `;
    }

    function renderChatList() {
        const laudos = ordenarPorPrioridade(filtrarLaudosChat(), prioridadeChat);
        const lista = $("lista-chat-laudos");
        const resumo = $("chat-lista-resumo");
        const filtroAtivo = rotuloSituacaoChat(state.ui.chatSituacao);

        resumo.innerHTML = `
            <span class="hero-chip">${formatarInteiro(laudos.length)} laudos visiveis</span>
            <span class="hero-chip">${formatarInteiro((state.bootstrap?.chat?.laudos || []).filter((item) => variantStatusLaudo(item.status_card) === "aberto").length)} abertos</span>
            <span class="hero-chip">${formatarInteiro((state.bootstrap?.chat?.laudos || []).filter((item) => variantStatusLaudo(item.status_card) === "ajustes").length)} em ajuste</span>
            ${filtroAtivo ? `<span class="hero-chip">Filtro rapido: ${escapeHtml(filtroAtivo)}</span>` : ""}
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
                    ${laudoChatParado(laudo) ? `<span class="hero-chip">${escapeHtml(resumoEsperaHoras(horasDesdeAtualizacao(laudo.atualizado_em)))}</span>` : ""}
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
            renderChatDocumentoPendente();
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
                ${laudoChatParado(alvo) ? `
                    <div class="context-guidance" data-tone="aguardando">
                        <div class="context-guidance-copy">
                            <small>Item parado</small>
                            <strong>${escapeHtml(resumoEsperaHoras(horasDesdeAtualizacao(alvo.atualizado_em)))}</strong>
                            <p>Vale retomar este laudo para nao perder ritmo operacional no chat.</p>
                        </div>
                        <span class="pill" data-kind="priority" data-status="aguardando">Retomar</span>
                    </div>
                ` : ""}
            </div>
        `;
        renderChatDocumentoPendente();
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
        const filtroAtivo = rotuloSituacaoMesa(state.ui.mesaSituacao);

        const totalPendencias = (state.bootstrap?.mesa?.laudos || []).reduce((acc, item) => acc + Number(item.pendencias_abertas || 0), 0);
        const totalWhispers = (state.bootstrap?.mesa?.laudos || []).reduce((acc, item) => acc + Number(item.whispers_nao_lidos || 0), 0);
        resumo.innerHTML = `
            <span class="hero-chip">${formatarInteiro(totalPendencias)} pendencias abertas</span>
            <span class="hero-chip">${formatarInteiro(totalWhispers)} whispers pendentes</span>
            ${filtroAtivo ? `<span class="hero-chip">Filtro rapido: ${escapeHtml(filtroAtivo)}</span>` : ""}
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
                    ${laudoMesaParado(laudo) ? `<span class="hero-chip">${escapeHtml(resumoEsperaHoras(horasDesdeAtualizacao(laudo.atualizado_em)))}</span>` : ""}
                </div>
            </article>
        `).join("");
    }

    function renderMesaTriagem() {
        const container = $("mesa-triagem");
        const laudos = state.bootstrap?.mesa?.laudos || [];
        if (!container) return;

        const responder = ordenarPorPrioridade(laudos.filter((item) => Number(item?.whispers_nao_lidos || 0) > 0), prioridadeMesa);
        const pendencias = ordenarPorPrioridade(laudos.filter((item) => Number(item?.pendencias_abertas || 0) > 0), prioridadeMesa);
        const aguardando = ordenarPorPrioridade(
            laudos.filter((item) => variantStatusLaudo(item.status_card) === "aguardando" && Number(item?.whispers_nao_lidos || 0) <= 0 && Number(item?.pendencias_abertas || 0) <= 0),
            prioridadeMesa
        );
        const parados = ordenarPorPrioridade(laudos.filter((item) => laudoMesaParado(item)), prioridadeMesa);
        const filtroAtivo = rotuloSituacaoMesa(state.ui.mesaSituacao);
        const destaque = responder[0] || pendencias[0] || parados[0] || aguardando[0] || null;

        container.innerHTML = `
            <div class="toolbar-meta">
                <button class="btn" type="button" data-act="filtrar-mesa-status" data-situacao="responder">Ver respostas novas</button>
                <button class="btn" type="button" data-act="filtrar-mesa-status" data-situacao="pendencias">Ver pendencias</button>
                <button class="btn" type="button" data-act="filtrar-mesa-status" data-situacao="aguardando">Ver prontos para revisar</button>
                <button class="btn" type="button" data-act="filtrar-mesa-status" data-situacao="parados">Ver parados</button>
                <button class="btn ghost" type="button" data-act="limpar-mesa-filtro">Limpar filtro rapido</button>
                ${filtroAtivo ? `<span class="hero-chip">Filtro rapido: ${escapeHtml(filtroAtivo)}</span>` : ""}
            </div>
            ${destaque ? `
                <article class="activity-item">
                    <div class="activity-head">
                        <div class="activity-copy">
                            <strong>${escapeHtml(destaque.titulo || "Laudo da mesa")}</strong>
                            <span class="activity-meta">${escapeHtml(destaque.status_revisao || destaque.status_card_label || "Em revisão")} • ${escapeHtml(destaque.data_br || "Sem data")}</span>
                        </div>
                        <span class="pill" data-kind="priority" data-status="${escapeAttr(prioridadeMesa(destaque).tone)}">${escapeHtml(prioridadeMesa(destaque).badge)}</span>
                    </div>
                    <p class="activity-detail">${escapeHtml(prioridadeMesa(destaque).acao)}${laudoMesaParado(destaque) ? ` ${resumoEsperaHoras(horasDesdeAtualizacao(destaque.atualizado_em))}.` : ""}</p>
                    <div class="toolbar-meta">
                        <button class="btn" type="button" data-act="abrir-prioridade" data-kind="mesa-laudo" data-canal="mesa" data-laudo="${escapeAttr(String(destaque.id || ""))}" data-target="mesa-contexto">Abrir laudo prioritario</button>
                    </div>
                </article>
            ` : `
                <div class="empty-state">
                    <strong>Mesa em dia</strong>
                    <p>Nenhum whisper ou pendência urgente apareceu agora. Use os filtros rápidos para revisar a fila por estado.</p>
                </div>
            `}
        `;
    }

    function renderMesaMovimentos() {
        const container = $("mesa-movimentos");
        const laudos = ordenarPorPrioridade(state.bootstrap?.mesa?.laudos || [], (item) => ({
            score: parseDataIso(item?.atualizado_em),
        })).slice(0, 3);
        if (!container) return;

        if (!laudos.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <strong>Sem movimentos recentes na mesa</strong>
                    <p>Assim que a empresa receber whispers, pendencias ou aprovacoes, o resumo aparece aqui.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <article class="activity-item">
                <div class="activity-head">
                    <div class="activity-copy">
                        <strong>Movimentos recentes da mesa</strong>
                        <span class="activity-meta">Os laudos mais novos tocados na fila da Mesa Avaliadora.</span>
                    </div>
                    <span class="hero-chip">${formatarInteiro(laudos.length)} recentes</span>
                </div>
                <div class="activity-list">
                    ${laudos.map((laudo) => `
                        <article class="activity-item">
                            <div class="activity-head">
                                <div class="activity-copy">
                                    <strong>${escapeHtml(laudo.titulo || "Laudo da mesa")}</strong>
                                    <span class="activity-meta">${escapeHtml(laudo.data_br || "Sem data")} • ${escapeHtml(laudo.status_revisao || laudo.status_card_label || "Em revisao")}</span>
                                </div>
                                <span class="pill" data-kind="priority" data-status="${escapeAttr(prioridadeMesa(laudo).tone)}">${escapeHtml(prioridadeMesa(laudo).badge)}</span>
                            </div>
                            <p class="activity-detail">${escapeHtml(laudo.preview || "Sem resumo recente na mesa.")}</p>
                            <div class="toolbar-meta">
                                <span class="hero-chip">${formatarInteiro(laudo.pendencias_abertas || 0)} pendencias</span>
                                <span class="hero-chip">${formatarInteiro(laudo.whispers_nao_lidos || 0)} whispers</span>
                                ${laudoMesaParado(laudo) ? `<span class="hero-chip">${escapeHtml(resumoEsperaHoras(horasDesdeAtualizacao(laudo.atualizado_em)))}</span>` : ""}
                                <button class="btn" type="button" data-act="abrir-prioridade" data-kind="mesa-laudo" data-canal="mesa" data-laudo="${escapeAttr(String(laudo.id || ""))}" data-target="mesa-contexto">Abrir laudo</button>
                            </div>
                        </article>
                    `).join("")}
                </div>
            </article>
        `;
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
                ${laudoMesaParado(alvo) ? `
                    <div class="context-guidance" data-tone="aguardando">
                        <div class="context-guidance-copy">
                            <small>Fila parada</small>
                            <strong>${escapeHtml(resumoEsperaHoras(horasDesdeAtualizacao(alvo.atualizado_em)))}</strong>
                            <p>Vale revisar este laudo para nao deixar a mesa esfriar com pendencias ou resposta em aberto.</p>
                        </div>
                        <span class="pill" data-kind="priority" data-status="aguardando">Retomar</span>
                    </div>
                ` : ""}
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
        renderCentralPrioridades();
        renderAdmin();
        renderChatResumo();
        renderChatTriagem();
        renderChatMovimentos();
        renderChatCapacidade();
        renderAvisosOperacionais("chat", "chat-alertas-operacionais");
        renderChatList();
        renderChatContext();
        renderChatMensagens();
        renderMesaResumoGeral();
        renderMesaTriagem();
        renderMesaMovimentos();
        renderAvisosOperacionais("mesa", "mesa-alertas-operacionais");
        renderMesaList();
        renderMesaContext();
        renderMesaResumo();
        renderMesaMensagens();
    }

    async function registrarInteressePlano(plano, origem) {
        const nomePlano = texto(plano).trim();
        if (!nomePlano) return;

        const resposta = await api("/cliente/api/empresa/plano/interesse", {
            method: "POST",
            body: {
                plano: nomePlano,
                origem: texto(origem).trim().toLowerCase() || "admin",
            },
        });
        return resposta;
    }

    async function prepararUpgradeGuiado({ origem = "admin", button = null } = {}) {
        const empresa = state.bootstrap?.empresa;
        const planoSugerido = texto(empresa?.plano_sugerido).trim();
        if (!planoSugerido) {
            feedback("Nao ha plano sugerido para preparar agora.", true);
            return;
        }

        await withBusy(button, "Preparando...", async () => {
            definirTab("admin");
            const seletor = $("empresa-plano");
            if (seletor) {
                seletor.value = planoSugerido;
            }
            renderPreviewPlano();
            await registrarInteressePlano(planoSugerido, origem);
            await bootstrapPortal();
            if (seletor) {
                seletor.value = planoSugerido;
            }
            renderPreviewPlano();
            feedback(`Plano ${planoSugerido} preparado para revisao e registrado no historico.`, false, "Upgrade encaminhado");
        }).catch((erro) => feedback(erro.message || "Falha ao preparar upgrade.", true));
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
        const laudoAnterior = Number(state.chat.laudoId || 0) || null;

        state.chat.laudoId = id;
        if (laudoAnterior && laudoAnterior !== id) {
            limparDocumentoChatPendente();
        }
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
            state.ui.usuariosSituacao = "";
            state.ui.usuarioEmDestaque = null;
            renderUsuarios();
        });
        $("usuarios-filtro-papel")?.addEventListener("change", (event) => {
            state.ui.usuariosPapel = event.target.value || "todos";
            state.ui.usuariosSituacao = "";
            state.ui.usuarioEmDestaque = null;
            renderUsuarios();
        });
        $("chat-busca-laudos")?.addEventListener("input", (event) => {
            state.ui.chatBusca = event.target.value || "";
            state.ui.chatSituacao = "";
            renderChatTriagem();
            renderChatList();
        });
        $("mesa-busca-laudos")?.addEventListener("input", (event) => {
            state.ui.mesaBusca = event.target.value || "";
            state.ui.mesaSituacao = "";
            renderMesaTriagem();
            renderMesaList();
        });
    }

    function bindAdminActions() {
        $("empresa-plano")?.addEventListener("change", () => {
            renderPreviewPlano();
        });

        $("form-plano")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const button = event.submitter || event.target.querySelector('button[type="submit"]');
            const planoSelecionado = $("empresa-plano")?.value || "";
            await withBusy(button, "Salvando...", async () => {
                await api("/cliente/api/empresa/plano", {
                    method: "PATCH",
                    body: { plano: planoSelecionado },
                });
                await bootstrapPortal();
                feedback(
                    `Plano atualizado para ${planoSelecionado}.`,
                    false,
                    "Contrato ajustado"
                );
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

        const tratarAcaoUsuario = async (event) => {
            const button = event.target.closest("button[data-act][data-user]");
            if (!button) return;

            const userId = Number(button.dataset.user || 0);
            if (!Number.isFinite(userId) || userId <= 0) return;

            try {
                if (button.dataset.act === "reset-user") {
                    await withBusy(button, "Gerando...", async () => {
                        const resposta = await api(`/cliente/api/usuarios/${userId}/resetar-senha`, { method: "POST" });
                        await bootstrapPortal();
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
        };

        $("lista-usuarios")?.addEventListener("click", tratarAcaoUsuario);
        $("admin-onboarding-lista")?.addEventListener("click", tratarAcaoUsuario);
    }

    function bindCommercialActions() {
        document.addEventListener("click", async (event) => {
            const button = event.target.closest("button[data-act]");
            if (!button) return;

            if (button.dataset.act === "abrir-prioridade") {
                const kind = button.dataset.kind || "admin-section";
                if (kind === "upgrade") {
                    await prepararUpgradeGuiado({
                        origem: button.dataset.origem || "admin",
                        button,
                    });
                    return;
                }

                if (kind === "chat-laudo") {
                    definirTab("chat");
                    await loadChat(button.dataset.laudo, { silencioso: true }).catch((erro) => feedback(erro.message || "Falha ao abrir prioridade do chat.", true));
                    scrollToPortalSection(button.dataset.target || "chat-contexto");
                    return;
                }

                if (kind === "mesa-laudo") {
                    definirTab("mesa");
                    await loadMesa(button.dataset.laudo, { silencioso: true }).catch((erro) => feedback(erro.message || "Falha ao abrir prioridade da mesa.", true));
                    scrollToPortalSection(button.dataset.target || "mesa-contexto");
                    return;
                }

                definirTab("admin");
                if (kind === "admin-user") {
                    aplicarFiltrosUsuarios({
                        busca: button.dataset.busca || "",
                        papel: button.dataset.papel || "todos",
                        userId: button.dataset.user || null,
                    });
                    scrollToPortalSection(button.dataset.target || "lista-usuarios");
                    focarUsuarioNaTabela(button.dataset.user, { expandir: true });
                    return;
                }

                scrollToPortalSection(button.dataset.target || "panel-admin");
                return;
            }

            if (button.dataset.act === "filtrar-usuarios-status") {
                const situacao = texto(button.dataset.situacao).trim();
                definirTab("admin");
                state.ui.usuariosBusca = "";
                state.ui.usuariosPapel = "todos";
                state.ui.usuariosSituacao = situacao;
                state.ui.usuarioEmDestaque = null;
                if ($("usuarios-busca")) $("usuarios-busca").value = "";
                if ($("usuarios-filtro-papel")) $("usuarios-filtro-papel").value = "todos";
                renderUsuarios();
                scrollToPortalSection("lista-usuarios");
                feedback(`Equipe filtrada por ${rotuloSituacaoUsuarios(situacao).toLowerCase() || "situacao"}.`);
                return;
            }

            if (button.dataset.act === "limpar-filtro-usuarios") {
                definirTab("admin");
                state.ui.usuariosBusca = "";
                state.ui.usuariosPapel = "todos";
                state.ui.usuariosSituacao = "";
                state.ui.usuarioEmDestaque = null;
                if ($("usuarios-busca")) $("usuarios-busca").value = "";
                if ($("usuarios-filtro-papel")) $("usuarios-filtro-papel").value = "todos";
                renderUsuarios();
                scrollToPortalSection("lista-usuarios");
                feedback("Filtro rapido da equipe limpo.");
                return;
            }

            if (button.dataset.act === "filtrar-chat-status") {
                definirTab("chat");
                state.ui.chatBusca = "";
                state.ui.chatSituacao = texto(button.dataset.situacao).trim();
                if ($("chat-busca-laudos")) $("chat-busca-laudos").value = "";
                renderChatTriagem();
                renderChatList();
                scrollToPortalSection("lista-chat-laudos");
                feedback(`Chat filtrado por ${rotuloSituacaoChat(state.ui.chatSituacao).toLowerCase() || "status"}.`);
                return;
            }

            if (button.dataset.act === "limpar-chat-filtro") {
                definirTab("chat");
                state.ui.chatBusca = "";
                state.ui.chatSituacao = "";
                if ($("chat-busca-laudos")) $("chat-busca-laudos").value = "";
                renderChatTriagem();
                renderChatList();
                scrollToPortalSection("lista-chat-laudos");
                feedback("Filtro rapido do chat limpo.");
                return;
            }

            if (button.dataset.act === "filtrar-mesa-status") {
                definirTab("mesa");
                state.ui.mesaBusca = "";
                state.ui.mesaSituacao = texto(button.dataset.situacao).trim();
                if ($("mesa-busca-laudos")) $("mesa-busca-laudos").value = "";
                renderMesaTriagem();
                renderMesaList();
                scrollToPortalSection("lista-mesa-laudos");
                feedback(`Mesa filtrada por ${rotuloSituacaoMesa(state.ui.mesaSituacao).toLowerCase() || "status"}.`);
                return;
            }

            if (button.dataset.act === "limpar-mesa-filtro") {
                definirTab("mesa");
                state.ui.mesaBusca = "";
                state.ui.mesaSituacao = "";
                if ($("mesa-busca-laudos")) $("mesa-busca-laudos").value = "";
                renderMesaTriagem();
                renderMesaList();
                scrollToPortalSection("lista-mesa-laudos");
                feedback("Filtro rapido da mesa limpo.");
                return;
            }

            if (button.dataset.act === "preparar-upgrade") {
                await prepararUpgradeGuiado({
                    origem: button.dataset.origem || "admin",
                    button,
                });
                return;
            }

            if (button.dataset.act === "registrar-interesse-plano") {
                const plano = button.dataset.plano || "";
                const origem = button.dataset.origem || "admin";
                await withBusy(button, "Registrando...", async () => {
                    await registrarInteressePlano(plano, origem);
                    await bootstrapPortal();
                    const seletor = $("empresa-plano");
                    if (seletor && plano) {
                        seletor.value = plano;
                    }
                    renderPreviewPlano();
                    feedback(`Interesse em ${plano} registrado no historico do portal.`, false, "Interesse salvo");
                }).catch((erro) => feedback(erro.message || "Falha ao registrar interesse no plano.", true));
            }
        });
    }

    function bindChatActions() {
        $("form-chat-laudo")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const empresa = state.bootstrap?.empresa;
            if (empresa?.laudos_mes_limite != null && Number(empresa.laudos_restantes || 0) <= 0) {
                feedback("O plano atual bloqueou novas aberturas de laudo. Prepare o upgrade antes de continuar.", true);
                return;
            }
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

        $("btn-chat-upload-doc")?.addEventListener("click", () => {
            $("chat-upload-doc")?.click();
        });

        $("chat-upload-doc")?.addEventListener("change", async (event) => {
            const arquivo = event.target?.files?.[0] || null;
            if (!arquivo) return;
            await importarDocumentoChat(arquivo);
        });

        $("form-chat-msg")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!state.chat.laudoId) {
                feedback("Selecione um laudo do chat primeiro.", true);
                return;
            }

            const mensagem = $("chat-mensagem").value.trim();
            if (!mensagem && !documentoChatPendenteAtivo()) {
                feedback("Escreva uma mensagem ou importe um documento antes de enviar.", true);
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
                        texto_documento: state.chat.documentoTexto || "",
                        nome_documento: state.chat.documentoNome || "",
                    },
                });
                $("chat-mensagem").value = "";
                limparDocumentoChatPendente();
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
        bindCommercialActions();
        bindChatActions();
        bindMesaActions();

        try {
            await bootstrapPortal({ carregarDetalhes: true });
            definirTab(state.ui.tab, false);
        } catch (erro) {
            feedback(erro.message || "Falha ao carregar o portal admin-cliente.", true);
        }
    }

    init();
})();
