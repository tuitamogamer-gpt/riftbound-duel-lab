/** Let visible images and fonts finish before warming the complete offline cache. */
export function registerOfflineWhenIdle() {
  if (!("serviceWorker" in navigator)) return;
  const register = () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Online play and browser saves remain available if offline setup fails.
    });
  };
  const schedule = () => {
    if ("requestIdleCallback" in window)
      window.requestIdleCallback(register, { timeout: 3000 });
    else setTimeout(register, 1000);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}
