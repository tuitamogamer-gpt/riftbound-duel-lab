import { Interactive, interpolate, useCurrentFrame } from "remotion";

export type RiftSealProps = { kind: "champion" | "victory"; opponent: boolean };

/** Native Tesseract sigil geometry, animated with Remotion's deterministic clock. */
export function RiftSealComposition({ kind, opponent }: RiftSealProps) {
  const frame = useCurrentFrame();
  return (
    <Interactive.Svg
      name="Riftbound event sigil"
      viewBox="0 0 160 160"
      width={160}
      height={160}
      data-motion-frame={frame}
      style={{
        opacity: interpolate(frame, [0, 8, 54, 71], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        scale: interpolate(frame, [0, 18], [0.88, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        overflow: "hidden",
      }}
    >
      <Interactive.Path
        name="Brass diamond reveal"
        d="M 80 24 L 136 80 L 80 136 L 24 80 Z"
        fill="none"
        stroke="#e9c97b"
        strokeWidth={1.4}
        pathLength={1}
        strokeDasharray="1"
        style={{
          strokeDashoffset: interpolate(frame, [2, 16], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <Interactive.Path
        name="Left inward wing"
        d="M 68 42 L 30 80 L 68 118"
        fill="none"
        stroke={opponent ? "#f1a6a6" : "#7de4cd"}
        strokeWidth={1.1}
        pathLength={1}
        strokeDasharray="1"
        style={{
          strokeDashoffset: interpolate(frame, [5, 19], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <Interactive.Path
        name="Right inward wing"
        d="M 92 42 L 130 80 L 92 118"
        fill="none"
        stroke={opponent ? "#f1a6a6" : "#7de4cd"}
        strokeWidth={1.1}
        pathLength={1}
        strokeDasharray="1"
        style={{
          strokeDashoffset: interpolate(frame, [5, 19], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      {kind === "victory" && (
        <Interactive.Path
          name="Victory trophy"
          d="M65 58 L95 58 L95 78 L89 91 L80 97 L71 91 L65 78 Z M65 64 L53 64 L53 77 L60 85 L69 85 M95 64 L107 64 L107 77 L100 85 L91 85 M80 97 L80 110 M67 112 L93 112"
          fill="none"
          stroke="#e9c97b"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            opacity: interpolate(frame, [7, 17], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />
      )}
    </Interactive.Svg>
  );
}
