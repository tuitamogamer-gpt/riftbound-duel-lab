# Native motion sources

These portable Tesseract compositions author the restrained brass diamond and
teal inward wings used by the game's significant-event seals. The signature
crown, victory trophy, and conquest standard remain editable native vector
layers with stable IDs and a coordinated AnimationGraph.

`sigil-geometry.json` preserves the exact native paths, palette, and authored
timing. Remotion uses this geometry for the signature and victory seals; the
game does not load or play rendered video files.

Each document has one 160 × 160 composition lasting 2.4 seconds. Thin linework
draws on during the first 520 ms, holds, then fades out from 1920 ms. The
overlay is silent. The runtime can adapt duration to the game's review clock
and uses a still pose when playback is paused or reduced motion is enabled.

Authored and rendered with pinned `tsrct 0.3.1`
(`baaf418a83c2f83835a15c12111316559bfc7da3`). The public Linux bundle SHA-256 was
`64dcde94e2e717073b1c56d36473a03a9448fa0f19f6a3a19b567c2bcdbdad6a`;
the installer verified its manifest before activation. Rendering used Mesa
lavapipe 25.0.7 locally on Debian 13. No system driver installation was needed.

All three native filmstrips were inspected at 0, 70, 140, 260, 420, 900, 1920,
2100, and 2300 ms. Native source commits, filmstrip renders, and silent preview
exports passed. A 160 × 160, 72-frame ProRes 4444 solo export preserved alpha:
91.14% of pixels were fully transparent at the readable hold, with both fully
transparent and opaque pixels present. Its edges were inspected over navy and
light backgrounds. Exported movies, filmstrips, and process receipts remain
in the private authoring workspace; only the editable sources, geometry, and
one representative native preview are retained here.

All three matching MP4 previews also played through in fresh Chromium pages.
Their 160 × 160 video clocks advanced through the readable hold to the actual
2.4-second end without page errors; the hold frames were inspected.

![Native signature seal](native-signature-preview.png)
