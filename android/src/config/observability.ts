import * as FileSystem from "expo-file-system/legacy";

export type MobileObservabilityKind =
  | "api"
  | "offline_queue"
  | "activity_monitor"
  | "push";

export interface MobileObservabilityEvent {
  id: string;
  kind: MobileObservabilityKind;
  name: string;
  ok: boolean;
  createdAt: string;
  durationMs?: number;
  method?: string;
  path?: string;
  httpStatus?: number;
  detail?: string;
  count?: number;
}

interface ObservabilitySummary {
  total: number;
  failures: number;
  byKind: Record<MobileObservabilityKind, number>;
  failuresByKind: Record<MobileObservabilityKind, number>;
  averageDurationMs: number;
  latestAt: string;
}

const OBSERVABILITY_FILE = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ""}tariel-mobile-observability.json`;
const OBSERVABILITY_LIMIT = 320;
let analyticsOptInEnabled = true;

function nowIso(): string {
  return new Date().toISOString();
}

function clampDuration(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.round(value);
}

function parseKind(value: unknown): MobileObservabilityKind {
  if (value === "api" || value === "offline_queue" || value === "activity_monitor" || value === "push") {
    return value;
  }
  return "api";
}

function normalizeRecord(raw: unknown): MobileObservabilityEvent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const item = raw as Record<string, unknown>;
  const name = String(item.name || "").trim();
  if (!name) {
    return null;
  }
  const id = String(item.id || "").trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const createdAt = String(item.createdAt || "").trim() || nowIso();
  const httpStatus =
    typeof item.httpStatus === "number" && Number.isFinite(item.httpStatus)
      ? Math.round(item.httpStatus)
      : undefined;
  const count =
    typeof item.count === "number" && Number.isFinite(item.count)
      ? Math.max(0, Math.round(item.count))
      : undefined;

  return {
    id,
    kind: parseKind(item.kind),
    name,
    ok: Boolean(item.ok),
    createdAt,
    durationMs: clampDuration(item.durationMs),
    method: typeof item.method === "string" ? item.method.trim().toUpperCase() : undefined,
    path: typeof item.path === "string" ? item.path.trim() : undefined,
    httpStatus,
    detail: typeof item.detail === "string" ? item.detail.trim().slice(0, 320) : undefined,
    count,
  };
}

async function readEvents(): Promise<MobileObservabilityEvent[]> {
  try {
    const raw = await FileSystem.readAsStringAsync(OBSERVABILITY_FILE);
    const payload = JSON.parse(raw);
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload
      .map((item) => normalizeRecord(item))
      .filter((item): item is MobileObservabilityEvent => Boolean(item));
  } catch {
    return [];
  }
}

async function saveEvents(items: MobileObservabilityEvent[]): Promise<void> {
  try {
    if (!items.length) {
      await FileSystem.deleteAsync(OBSERVABILITY_FILE, { idempotent: true });
      return;
    }
    await FileSystem.writeAsStringAsync(OBSERVABILITY_FILE, JSON.stringify(items));
  } catch {
    // Observabilidade não pode quebrar o fluxo principal.
  }
}

export function configureObservability(options: { analyticsOptIn: boolean }): void {
  analyticsOptInEnabled = options.analyticsOptIn;
  if (!analyticsOptInEnabled) {
    void saveEvents([]);
  }
}

export async function registrarEventoObservabilidade(
  input: Omit<MobileObservabilityEvent, "id" | "createdAt"> & { createdAt?: string },
): Promise<void> {
  if (!analyticsOptInEnabled) {
    return;
  }
  const nome = String(input.name || "").trim();
  if (!nome) {
    return;
  }

  const evento: MobileObservabilityEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    kind: parseKind(input.kind),
    name: nome,
    ok: Boolean(input.ok),
    createdAt: input.createdAt || nowIso(),
    durationMs: clampDuration(input.durationMs),
    method: input.method ? String(input.method).trim().toUpperCase() : undefined,
    path: input.path ? String(input.path).trim() : undefined,
    httpStatus:
      typeof input.httpStatus === "number" && Number.isFinite(input.httpStatus)
        ? Math.round(input.httpStatus)
        : undefined,
    detail: input.detail ? String(input.detail).trim().slice(0, 320) : undefined,
    count:
      typeof input.count === "number" && Number.isFinite(input.count)
        ? Math.max(0, Math.round(input.count))
        : undefined,
  };

  const atual = await readEvents();
  const proximo = [...atual, evento].slice(-OBSERVABILITY_LIMIT);
  await saveEvents(proximo);
}

export async function listarEventosObservabilidade(limit = 120): Promise<MobileObservabilityEvent[]> {
  const limite = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.round(limit))) : 120;
  const itens = await readEvents();
  return itens.slice(-limite).reverse();
}

export async function limparEventosObservabilidade(): Promise<void> {
  await saveEvents([]);
}

export function resumirEventosObservabilidade(itens: MobileObservabilityEvent[]): ObservabilitySummary {
  const baseKind: Record<MobileObservabilityKind, number> = {
    api: 0,
    offline_queue: 0,
    activity_monitor: 0,
    push: 0,
  };
  const failuresKind: Record<MobileObservabilityKind, number> = {
    api: 0,
    offline_queue: 0,
    activity_monitor: 0,
    push: 0,
  };

  let total = 0;
  let failures = 0;
  let durationTotal = 0;
  let durationCount = 0;
  let latestAt = "";

  for (const item of itens) {
    total += 1;
    baseKind[item.kind] += 1;
    if (!item.ok) {
      failures += 1;
      failuresKind[item.kind] += 1;
    }
    if (typeof item.durationMs === "number") {
      durationTotal += item.durationMs;
      durationCount += 1;
    }
    if (!latestAt || item.createdAt > latestAt) {
      latestAt = item.createdAt;
    }
  }

  return {
    total,
    failures,
    byKind: baseKind,
    failuresByKind: failuresKind,
    averageDurationMs: durationCount ? Math.round(durationTotal / durationCount) : 0,
    latestAt,
  };
}
