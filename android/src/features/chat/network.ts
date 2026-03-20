import * as Network from "expo-network";

export interface NetworkSnapshot {
  connected: boolean;
  isWifi: boolean;
  typeLabel: string;
}

export interface NetworkGateResult {
  allowed: boolean;
  reason: string;
  snapshot: NetworkSnapshot;
}

export async function readNetworkSnapshot(): Promise<NetworkSnapshot> {
  try {
    const state = await Network.getNetworkStateAsync();
    return {
      connected: Boolean(state.isConnected),
      isWifi: Boolean(state.isConnected) && state.type === Network.NetworkStateType.WIFI,
      typeLabel: String(state.type || "unknown"),
    };
  } catch {
    return {
      connected: false,
      isWifi: false,
      typeLabel: "unknown",
    };
  }
}

export async function canSyncOnCurrentNetwork(wifiOnlySync: boolean): Promise<boolean> {
  if (!wifiOnlySync) {
    return true;
  }
  const snapshot = await readNetworkSnapshot();
  return snapshot.connected && snapshot.isWifi;
}

export async function gateHeavyTransfer(params: {
  wifiOnlySync: boolean;
  requiresHeavyTransfer: boolean;
  blockedMessage: string;
}): Promise<NetworkGateResult> {
  const snapshot = await readNetworkSnapshot();
  if (!params.requiresHeavyTransfer) {
    return {
      allowed: snapshot.connected,
      reason: snapshot.connected ? "" : "Sem conexão disponível.",
      snapshot,
    };
  }
  if (!snapshot.connected) {
    return {
      allowed: false,
      reason: "Sem conexão disponível.",
      snapshot,
    };
  }
  if (params.wifiOnlySync && !snapshot.isWifi) {
    return {
      allowed: false,
      reason: params.blockedMessage,
      snapshot,
    };
  }
  return {
    allowed: true,
    reason: "",
    snapshot,
  };
}

