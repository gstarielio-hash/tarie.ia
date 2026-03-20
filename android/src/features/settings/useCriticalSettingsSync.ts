import { useEffect, useRef } from "react";

import {
  carregarConfiguracoesCriticasNoBackend,
  salvarConfiguracoesCriticasNoBackend,
} from "./settingsBackend";
import {
  hashSnapshotCritico,
  type CriticalSettingsSnapshot,
} from "./criticalSettings";

interface UseCriticalSettingsSyncArgs {
  accessToken?: string | null;
  carregando: boolean;
  snapshotAtual: CriticalSettingsSnapshot;
  aplicarSnapshot: (snapshot: CriticalSettingsSnapshot) => void;
  debounceMs?: number;
  onLoadError?: (error: unknown) => void;
  onSaveError?: (error: unknown) => void;
}

export function useCriticalSettingsSync({
  accessToken,
  carregando,
  snapshotAtual,
  aplicarSnapshot,
  debounceMs = 900,
  onLoadError,
  onSaveError,
}: UseCriticalSettingsSyncArgs): void {
  const sincronizacaoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const hidratandoRef = useRef(false);
  const ultimoHashRef = useRef("");
  const snapshotAtualRef = useRef(snapshotAtual);
  const aplicarSnapshotRef = useRef(aplicarSnapshot);
  const onLoadErrorRef = useRef(onLoadError);
  const onSaveErrorRef = useRef(onSaveError);

  useEffect(() => {
    snapshotAtualRef.current = snapshotAtual;
  }, [snapshotAtual]);

  useEffect(() => {
    aplicarSnapshotRef.current = aplicarSnapshot;
  }, [aplicarSnapshot]);

  useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  }, [onLoadError]);

  useEffect(() => {
    onSaveErrorRef.current = onSaveError;
  }, [onSaveError]);

  useEffect(() => {
    return () => {
      if (sincronizacaoTimerRef.current) {
        clearTimeout(sincronizacaoTimerRef.current);
        sincronizacaoTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let ativo = true;
    hidratandoRef.current = true;
    const hashAntesDaCarga = hashSnapshotCritico(snapshotAtualRef.current);
    void (async () => {
      try {
        const snapshotRemoto =
          await carregarConfiguracoesCriticasNoBackend(accessToken);
        if (!ativo) {
          return;
        }
        const hashRemoto = hashSnapshotCritico(snapshotRemoto);
        const hashAtual = hashSnapshotCritico(snapshotAtualRef.current);
        if (hashAtual === hashAntesDaCarga) {
          aplicarSnapshotRef.current(snapshotRemoto);
        }
        ultimoHashRef.current = hashRemoto;
      } catch (error) {
        if (ativo) {
          onLoadErrorRef.current?.(error);
        }
      } finally {
        if (ativo) {
          hidratandoRef.current = false;
        }
      }
    })();

    return () => {
      ativo = false;
      hidratandoRef.current = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || carregando) {
      if (sincronizacaoTimerRef.current) {
        clearTimeout(sincronizacaoTimerRef.current);
        sincronizacaoTimerRef.current = null;
      }
      return;
    }

    if (hidratandoRef.current) {
      return;
    }

    const hashAtual = hashSnapshotCritico(snapshotAtual);
    if (hashAtual === ultimoHashRef.current) {
      return;
    }

    if (sincronizacaoTimerRef.current) {
      clearTimeout(sincronizacaoTimerRef.current);
    }

    let ativo = true;
    sincronizacaoTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const snapshotSalvo = await salvarConfiguracoesCriticasNoBackend(
            accessToken,
            snapshotAtual,
          );
          if (!ativo) {
            return;
          }
          const hashSalvo = hashSnapshotCritico(snapshotSalvo);
          ultimoHashRef.current = hashSalvo;

          if (hashSalvo !== hashAtual) {
            hidratandoRef.current = true;
            aplicarSnapshotRef.current(snapshotSalvo);
            hidratandoRef.current = false;
          }
        } catch (error) {
          if (ativo) {
            onSaveErrorRef.current?.(error);
          }
        }
      })();
    }, debounceMs);

    return () => {
      ativo = false;
      if (sincronizacaoTimerRef.current) {
        clearTimeout(sincronizacaoTimerRef.current);
        sincronizacaoTimerRef.current = null;
      }
    };
  }, [accessToken, carregando, debounceMs, snapshotAtual]);
}
