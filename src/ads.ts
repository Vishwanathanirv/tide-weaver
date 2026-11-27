/**
 * Portal adapter. Tide-Weaver ships with no ad code of its own. When it is embedded on a portal that
 * injects its SDK (Poki, CrazyGames), the rewarded break and the gameplay start/stop signals are used;
 * anywhere else every call is a harmless no-op and `rewardedAvailable()` is false.
 */
interface PokiSdk {
  rewardedBreak?: () => Promise<boolean>;
  gameplayStart?: () => void;
  gameplayStop?: () => void;
}
interface CrazyGamesSdk {
  ad?: { requestAd?: (type: string, cb: { adFinished?: () => void; adError?: (e: unknown) => void }) => void };
  game?: { gameplayStart?: () => void; gameplayStop?: () => void };
}
type Host = { PokiSDK?: PokiSdk; CrazyGames?: { SDK?: CrazyGamesSdk } };

const host = (): Host => (typeof window === "undefined" ? {} : (window as unknown as Host));

export type Portal = "poki" | "crazygames" | "none";
export function portal(): Portal {
  const h = host();
  if (h.PokiSDK?.rewardedBreak) return "poki";
  if (h.CrazyGames?.SDK?.ad?.requestAd) return "crazygames";
  return "none";
}

export const rewardedAvailable = (): boolean => portal() !== "none";

/** Shows a rewarded video. Resolves true only if the player watched it to the end. */
export function rewarded(): Promise<boolean> {
  const h = host();
  try {
    if (h.PokiSDK?.rewardedBreak) return h.PokiSDK.rewardedBreak().then(Boolean, () => false);
    const cg = h.CrazyGames?.SDK?.ad;
    if (cg?.requestAd) return new Promise((res) => cg.requestAd!("rewarded", { adFinished: () => res(true), adError: () => res(false) }));
  } catch {
    /* fall through */
  }
  return Promise.resolve(false);
}

export function gameplay(on: boolean): void {
  const h = host();
  try {
    if (on) {
      h.PokiSDK?.gameplayStart?.();
      h.CrazyGames?.SDK?.game?.gameplayStart?.();
    } else {
      h.PokiSDK?.gameplayStop?.();
      h.CrazyGames?.SDK?.game?.gameplayStop?.();
    }
  } catch {
    /* ignore */
  }
}
