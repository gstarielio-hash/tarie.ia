import * as FileSystem from "expo-file-system/legacy";

interface CrashReportItem {
  id: string;
  createdAt: string;
  fatal: boolean;
  name: string;
  message: string;
  stack?: string;
}

interface GlobalErrorUtilsLike {
  getGlobalHandler: () => ((error: Error, isFatal?: boolean) => void) | null;
  setGlobalHandler: (
    handler: (error: Error, isFatal?: boolean) => void,
  ) => void;
}

const CRASH_REPORTS_FILE = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ""}tariel-mobile-crash-reports.json`;
let originalGlobalHandler: ((error: Error, isFatal?: boolean) => void) | null =
  null;
let crashReportsEnabled = false;

async function readCrashReports(): Promise<CrashReportItem[]> {
  try {
    const raw = await FileSystem.readAsStringAsync(CRASH_REPORTS_FILE);
    const payload = JSON.parse(raw);
    return Array.isArray(payload) ? (payload as CrashReportItem[]) : [];
  } catch {
    return [];
  }
}

async function writeCrashReports(items: CrashReportItem[]): Promise<void> {
  try {
    if (!items.length) {
      await FileSystem.deleteAsync(CRASH_REPORTS_FILE, { idempotent: true });
      return;
    }
    await FileSystem.writeAsStringAsync(
      CRASH_REPORTS_FILE,
      JSON.stringify(items.slice(-40)),
    );
  } catch {
    // Crash reporting local não pode quebrar o app.
  }
}

async function persistCrashReport(
  error: Error,
  isFatal: boolean,
): Promise<void> {
  const current = await readCrashReports();
  current.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    fatal: Boolean(isFatal),
    name: error.name || "Error",
    message: error.message || "Unknown error",
    stack: error.stack,
  });
  await writeCrashReports(current);
}

export function configureCrashReports(options: { enabled: boolean }): void {
  crashReportsEnabled = options.enabled;
  const globalErrorUtils = (globalThis as { ErrorUtils?: GlobalErrorUtilsLike })
    .ErrorUtils;
  if (
    !globalErrorUtils ||
    typeof globalErrorUtils.getGlobalHandler !== "function" ||
    typeof globalErrorUtils.setGlobalHandler !== "function"
  ) {
    return;
  }

  if (!originalGlobalHandler) {
    originalGlobalHandler = globalErrorUtils.getGlobalHandler();
  }

  if (!crashReportsEnabled) {
    void writeCrashReports([]);
    if (originalGlobalHandler) {
      globalErrorUtils.setGlobalHandler(originalGlobalHandler);
    }
    return;
  }

  globalErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    void persistCrashReport(error, Boolean(isFatal));
    if (originalGlobalHandler) {
      originalGlobalHandler(error, isFatal);
    }
  });
}

export async function clearCrashReports(): Promise<void> {
  await writeCrashReports([]);
}
