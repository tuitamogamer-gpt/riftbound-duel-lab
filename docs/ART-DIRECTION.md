# Art direction

The interface follows the user's request for the spirit of League of Legends: deep navy stone, antique gold bevels, cyan magical accents, carved-looking Cinzel headings, champion portraits, sharp framed buttons, and landscape playmats. This is an original fan interface, not Riot's official client or branding.

All three decorative backgrounds were generated with the built-in imagegen tool. Original PNGs are preserved in `assets/originals/`; visually equivalent compressed WebP versions are served from `public/art/`. The originals are 1672 × 941 pixels. WebP total size is approximately 748 KiB. The generation prompts intentionally leave quiet central areas for readable card play.

## Main arena

- Original: `assets/originals/rift-terrace.png`
- App asset: `public/art/rift-terrace.webp`
- Prompt: Create a single original 16:9 cinematic painterly fantasy strategy card game playmat. An ancient circular dark slate dueling terrace, near top-down three-quarter perspective, suspended above a misty teal ravine. Weathered golden temple ruins and restrained amber light at the left edge; luminous turquoise willow roots, foliage and waterfalls at the right. Central 70 percent quiet empty blue-slate playing surface, subtle concentric engraving, low contrast for card overlays. Intricacy around edges and corners. Enemy side above, player side below, antique gold rim and cyan ambience. No characters, cards, card slots, text, logos, UI or watermark. Original setting; no existing map copied.

## Ancient altar

- Original: `assets/originals/ancient-altar.png`
- App asset: `public/art/ancient-altar.webp`
- Full prompt: Use case: stylized-concept. Asset type: environmental artwork for left battlefield panel in a fantasy strategy card game. Original painterly game concept art, wide landscape 16:9. A monumental ancient stone altar on a circular terrace within ruined sandstone arches, suspended above a deep misty ravine. Elegant weathered bronze inlay, small warm amber braziers near the edges, distant majestic mountains. Center is dark blue-gray flat stone open ground with generous negative space for overlaying playing cards. Symmetrical and calm composition, rich navy shadows and antique gold accent, premium restrained game art. Environment visible along outer third only, no bright center. No characters, no cards, no game interface, no lettering, no logos, no text, no watermarks. This is decorative playmat artwork, not a card illustration. Original setting, do not copy an existing map.

## Moonlit willow

- Original: `assets/originals/moonlit-willow.png`
- App asset: `public/art/moonlit-willow.webp`
- Full prompt: Use case: stylized-concept. Asset type: environmental artwork for right battlefield panel in a fantasy strategy card game. Original painterly game concept art, wide landscape 16:9. A sacred enormous willow tree with softly luminous turquoise leaves and silver roots arching around a serene dark slate clearing. Deep blue nocturnal enchanted woodland, light mist near the ground, tiny restrained pale gold fireflies, a distant teal waterfall beyond roots. Center is mostly quiet empty dark slate and subtle shallow water reflection for overlaying playing cards. Rich navy and deep teal palette with a few warm gold flecks. Premium cinematic painterly game environment, intricacy on outer edges only, readable negative space central70percent. No characters, no cards, no interface, no lettering, no logos, no text, no watermarks. Original setting, do not copy any existing game map.

## Responsive behavior

Desktop: arena and action panel side by side. Mobile: two battlefield columns, a horizontally scrollable hand, and action panel below the board. The Proceed bar remains sticky; no timed progression is used. Large card inspection is available independently of playing actions. Gold highlights persist until the player advances; reduced-motion preferences disable pulse animation. Fonts are bundled locally using Fontsource packages.
