import * as FileSystem from "expo-file-system/legacy";

export interface ClearCacheResult {
  removedCount: number;
}

export async function clearLocalCache(
  paths: string[],
): Promise<ClearCacheResult> {
  let removedCount = 0;
  for (const path of paths) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        await FileSystem.deleteAsync(path, { idempotent: true });
        removedCount += 1;
      }
    } catch {
      // Segue limpando os demais itens mesmo se um deles falhar.
    }
  }
  return { removedCount };
}
