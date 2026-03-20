import {
  carregarLaudosMobile,
  carregarMensagensMesaMobile,
} from "../../config/api";
import { registrarEventoObservabilidade } from "../../config/observability";
import type { MobileLaudoCard, MobileMesaMessage } from "../../types/mobile";

interface RunMonitorActivityFlowParams<TNotification> {
  accessToken: string;
  monitorandoAtividade: boolean;
  conversaLaudoId: number | null;
  conversaLaudoTitulo: string;
  sessionUserId: number | null;
  assinaturaStatusLaudo: (item: MobileLaudoCard) => string;
  assinaturaMensagemMesa: (item: MobileMesaMessage) => string;
  selecionarLaudosParaMonitoramentoMesa: (params: {
    laudos: MobileLaudoCard[];
    laudoAtivoId: number | null;
  }) => number[];
  criarNotificacaoStatusLaudo: (item: MobileLaudoCard) => TNotification;
  criarNotificacaoMesa: (
    kind: "mesa_nova" | "mesa_resolvida" | "mesa_reaberta",
    item: MobileMesaMessage,
    tituloLaudo: string,
  ) => TNotification;
  atualizarResumoLaudoAtual: (payload: unknown) => void;
  registrarNotificacoes: (novasNotificacoes: TNotification[]) => void;
  erroSugereModoOffline: (error: unknown) => boolean;
  chaveCacheLaudo: (laudoId: number | null) => string;
  statusSnapshotRef: { current: Record<number, string> };
  mesaSnapshotRef: { current: Record<number, Record<number, string>> };
  onSetMonitorandoAtividade: (value: boolean) => void;
  onSetLaudosDisponiveis: (itens: MobileLaudoCard[]) => void;
  onSetCacheLaudos: (itens: MobileLaudoCard[]) => void;
  onSetErroLaudos: (value: string) => void;
  onSetMensagensMesa: (itens: MobileMesaMessage[]) => void;
  onSetLaudoMesaCarregado: (laudoId: number) => void;
  onSetCacheMesa: (itensPorLaudo: Record<string, MobileMesaMessage[]>) => void;
  onSetStatusApi: (value: "online" | "offline") => void;
  onSetErroConversaIfEmpty: (value: string) => void;
}

export async function runMonitorActivityFlow<TNotification>({
  accessToken,
  monitorandoAtividade,
  conversaLaudoId,
  conversaLaudoTitulo,
  sessionUserId,
  assinaturaStatusLaudo,
  assinaturaMensagemMesa,
  selecionarLaudosParaMonitoramentoMesa,
  criarNotificacaoStatusLaudo,
  criarNotificacaoMesa,
  atualizarResumoLaudoAtual,
  registrarNotificacoes,
  erroSugereModoOffline,
  chaveCacheLaudo,
  statusSnapshotRef,
  mesaSnapshotRef,
  onSetMonitorandoAtividade,
  onSetLaudosDisponiveis,
  onSetCacheLaudos,
  onSetErroLaudos,
  onSetMensagensMesa,
  onSetLaudoMesaCarregado,
  onSetCacheMesa,
  onSetStatusApi,
  onSetErroConversaIfEmpty,
}: RunMonitorActivityFlowParams<TNotification>) {
  if (monitorandoAtividade) {
    return;
  }

  onSetMonitorandoAtividade(true);
  const monitoramentoIniciadoEm = Date.now();

  try {
    const payloadLaudos = await carregarLaudosMobile(accessToken);
    const proximosLaudos = payloadLaudos.itens || [];
    const snapshotAnterior = statusSnapshotRef.current;
    const snapshotNovo: Record<number, string> = {};
    const novasNotificacoes: TNotification[] = [];

    for (const item of proximosLaudos) {
      const assinatura = assinaturaStatusLaudo(item);
      snapshotNovo[item.id] = assinatura;

      if (
        snapshotAnterior[item.id] &&
        snapshotAnterior[item.id] !== assinatura
      ) {
        novasNotificacoes.push(criarNotificacaoStatusLaudo(item));
      }
    }

    statusSnapshotRef.current = snapshotNovo;
    onSetLaudosDisponiveis(proximosLaudos);
    onSetCacheLaudos(proximosLaudos);
    onSetErroLaudos("");

    const laudosMonitoradosMesa = selecionarLaudosParaMonitoramentoMesa({
      laudos: proximosLaudos,
      laudoAtivoId: conversaLaudoId,
    });

    if (laudosMonitoradosMesa.length) {
      const resultadosMesa = await Promise.allSettled(
        laudosMonitoradosMesa.map(async (laudoId) => ({
          laudoId,
          payload: await carregarMensagensMesaMobile(accessToken, laudoId),
        })),
      );
      const cacheMesaAtualizado: Record<string, MobileMesaMessage[]> = {};
      const titulosLaudos = new Map(
        proximosLaudos.map((item) => [item.id, item.titulo]),
      );

      for (const resultado of resultadosMesa) {
        if (resultado.status !== "fulfilled") {
          continue;
        }

        const { laudoId, payload } = resultado.value;
        const itensMesa = payload.itens || [];
        const snapshotMesaAnterior = mesaSnapshotRef.current[laudoId] || {};
        const snapshotMesaNovo: Record<number, string> = {};
        const tituloLaudo =
          titulosLaudos.get(laudoId) ||
          (conversaLaudoId === laudoId ? conversaLaudoTitulo || "" : "") ||
          `Laudo #${laudoId}`;
        const mesaPossuiaSnapshot =
          Object.keys(snapshotMesaAnterior).length > 0;

        for (const item of itensMesa) {
          const assinatura = assinaturaMensagemMesa(item);
          snapshotMesaNovo[item.id] = assinatura;
          const assinaturaAntiga = snapshotMesaAnterior[item.id];

          if (!mesaPossuiaSnapshot) {
            continue;
          }

          if (!assinaturaAntiga) {
            const veioDaMesa = item.remetente_id !== sessionUserId;
            if (veioDaMesa) {
              novasNotificacoes.push(
                criarNotificacaoMesa("mesa_nova", item, tituloLaudo),
              );
            }
            continue;
          }

          const estavaResolvida = assinaturaAntiga.split("|")[1] || "";
          const estaResolvida = item.resolvida_em || "";
          if (!estavaResolvida && estaResolvida) {
            novasNotificacoes.push(
              criarNotificacaoMesa("mesa_resolvida", item, tituloLaudo),
            );
          } else if (estavaResolvida && !estaResolvida) {
            novasNotificacoes.push(
              criarNotificacaoMesa("mesa_reaberta", item, tituloLaudo),
            );
          }
        }

        mesaSnapshotRef.current[laudoId] = snapshotMesaNovo;
        cacheMesaAtualizado[chaveCacheLaudo(laudoId)] = itensMesa;

        if (conversaLaudoId === laudoId) {
          onSetMensagensMesa(itensMesa);
          onSetLaudoMesaCarregado(laudoId);
          atualizarResumoLaudoAtual(payload);
        }
      }

      if (Object.keys(cacheMesaAtualizado).length) {
        onSetCacheMesa(cacheMesaAtualizado);
      }
    }

    registrarNotificacoes(novasNotificacoes);
    onSetStatusApi("online");
    void registrarEventoObservabilidade({
      kind: "activity_monitor",
      name: "activity_cycle",
      ok: true,
      durationMs: Date.now() - monitoramentoIniciadoEm,
      count: novasNotificacoes.length,
      detail: `laudos_${proximosLaudos.length}`,
    });
  } catch (error) {
    if (erroSugereModoOffline(error)) {
      onSetStatusApi("offline");
      void registrarEventoObservabilidade({
        kind: "activity_monitor",
        name: "activity_cycle",
        ok: false,
        durationMs: Date.now() - monitoramentoIniciadoEm,
        detail: "offline",
      });
      return;
    }

    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível monitorar a atividade do inspetor.";
    onSetErroConversaIfEmpty(message);
    void registrarEventoObservabilidade({
      kind: "activity_monitor",
      name: "activity_cycle",
      ok: false,
      durationMs: Date.now() - monitoramentoIniciadoEm,
      detail: message,
    });
  } finally {
    onSetMonitorandoAtividade(false);
  }
}
