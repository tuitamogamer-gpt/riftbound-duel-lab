import { Composition, registerRoot } from "remotion";
import { RiftSealComposition } from "../../src/motion/RiftSealComposition";

function MotionRoot() {
  return (
    <>
      <Composition
        id="SignatureSeal"
        component={RiftSealComposition}
        durationInFrames={72}
        fps={30}
        width={160}
        height={160}
        defaultProps={{ kind: "champion", opponent: false }}
      />
      <Composition
        id="VictorySeal"
        component={RiftSealComposition}
        durationInFrames={72}
        fps={30}
        width={160}
        height={160}
        defaultProps={{ kind: "victory", opponent: false }}
      />
    </>
  );
}
registerRoot(MotionRoot);
