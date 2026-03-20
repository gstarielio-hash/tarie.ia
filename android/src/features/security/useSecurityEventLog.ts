import type { Dispatch, SetStateAction } from "react";

import type { SecurityEventItem } from "../settings/useSettingsPresentation";

interface UseSecurityEventLogParams {
  setEventosSeguranca: Dispatch<SetStateAction<SecurityEventItem[]>>;
}

export function useSecurityEventLog({
  setEventosSeguranca,
}: UseSecurityEventLogParams) {
  function registrarEventoSegurancaLocal(
    evento: Omit<SecurityEventItem, "id">,
  ) {
    setEventosSeguranca((estadoAtual) =>
      [
        {
          id: `security-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
          ...evento,
        },
        ...estadoAtual,
      ].slice(0, 20),
    );
  }

  return {
    registrarEventoSegurancaLocal,
  };
}
