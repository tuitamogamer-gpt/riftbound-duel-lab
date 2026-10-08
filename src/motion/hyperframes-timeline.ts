import { gsap } from "gsap";

export type TacticalBurstKind = "combat" | "counter" | "conquer";

export const TACTICAL_BURST_DURATION = 1.25;
export const TACTICAL_BURST_HERO_TIME = 0.54;

/**
 * The game and editable Hyperframes composition share this finite timeline.
 * Only dedicated decorative children are owned here. The caller owns event
 * filtering, layout, reduced-motion changes, playback speed, pause and cleanup.
 */
export function createTacticalBurstTimeline(
  root: HTMLElement,
  {
    kind,
    reducedMotion = false,
  }: { kind: TacticalBurstKind; reducedMotion?: boolean },
) {
  const aura = root.querySelector<HTMLElement>("[data-motion-aura]");
  const ring = root.querySelector<HTMLElement>("[data-motion-ring]");
  const rays = root.querySelector<HTMLElement>("[data-motion-rays]");
  const seal = root.querySelector<HTMLElement>("[data-motion-seal]");
  const targets = [aura, ring, rays, seal].filter(
    (element): element is HTMLElement => element !== null,
  );
  const timeline = gsap.timeline({ paused: true });

  if (reducedMotion) {
    timeline.set(targets, { opacity: 0 }, 0);
    if (seal) timeline.set(seal, { opacity: 1, scale: 1, x: 0, y: 0 }, 0);
    return timeline;
  }

  if (aura) {
    timeline.from(
      aura,
      { opacity: 0, scale: 0.65, duration: 0.26, ease: "sine.out" },
      0.1,
    );
    timeline.to(aura, { opacity: 0, duration: 0.24, ease: "sine.in" }, 0.82);
  }

  if (ring) {
    timeline.from(
      ring,
      {
        opacity: 0,
        scale: kind === "counter" ? 1.14 : 0.58,
        rotation: kind === "conquer" ? -18 : 0,
        duration: 0.36,
        ease: "expo.out",
      },
      0.12,
    );
    timeline.to(
      ring,
      { opacity: 0, scale: 1.12, duration: 0.25, ease: "power2.in" },
      0.86,
    );
  }

  if (rays) {
    timeline.from(
      rays,
      {
        opacity: 0,
        scale: 0.72,
        rotation: kind === "counter" ? 12 : -6,
        duration: 0.24,
        ease: "power3.out",
      },
      0.17,
    );
    timeline.to(
      rays,
      { opacity: 0, scale: 1.08, duration: 0.28, ease: "power3.in" },
      0.71,
    );
  }

  if (seal) {
    timeline.from(
      seal,
      { opacity: 0, scale: 0.82, y: 2, duration: 0.3, ease: "back.out(1.2)" },
      0.2,
    );
    timeline.to(
      seal,
      { opacity: 0, y: -2, duration: 0.25, ease: "power2.in" },
      1,
    );
  }

  return timeline;
}
