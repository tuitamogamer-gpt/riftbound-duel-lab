import { useEffect, useState } from "react";
import { useInterfacePreferences } from "../interface-preferences";

export function useReducedMotion() {
  const preferences = useInterfacePreferences();
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced || preferences.reducedEffects;
}
