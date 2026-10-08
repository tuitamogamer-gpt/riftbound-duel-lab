import { useEffect } from "react";

const locks = new WeakMap<HTMLElement, { count: number; overflow: string }>();

/** Every open surface keeps its lock until the last surface has closed. */
export function lockBodyScroll(body: HTMLElement): () => void {
  const lock = locks.get(body) ?? { count: 0, overflow: body.style.overflow };
  lock.count++;
  locks.set(body, lock);
  body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lock.count === 0) {
      body.style.overflow = lock.overflow;
      locks.delete(body);
    }
  };
}

export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    return lockBodyScroll(document.body);
  }, [active]);
}
