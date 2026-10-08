/**
 * Service worker (offline app shell) registration. A new app build is only applied when the
 * kiosk is idle on the welcome screen — see `applyAppUpdateIfReady`.
 */
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
let updateReady = false;

export function registerAppUpdates() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  void import('virtual:pwa-register').then(({ registerSW }) => {
    updateSW = registerSW({
      onNeedRefresh() {
        updateReady = true;
      },
    });
  });
}

/** Call only when no visitor is using the app. */
export function applyAppUpdateIfReady() {
  if (updateReady && updateSW) void updateSW(true);
}
