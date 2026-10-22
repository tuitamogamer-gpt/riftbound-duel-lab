# Conditional triggers and completed Legend presentation

Jinx, Loose Cannon legitimately enters the chain at the start of Beginning,
including with two or more cards in hand. Her trailing “if you have one or fewer
cards” is checked when the effect resolves. A reaction can reduce or increase the
hand before that check. Current [Core Rules, 9 October 2026,
§383.2.a.1](https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/5c7946f7c3b8c6e0faff85ab6dadc6d2e721ea94.pdf)
use Loose Cannon as this exact example; the [official Unleashed
FAQ](https://playriftbound.com/en-us/news/rules-and-releases/unleashed-rules-faq-and-clarifications/)
confirms the distinction.

The visible bug was a completed Legend lingering as “resolving” through Channel,
the ordinary turn draw and Main. A completed effect now leaves the visual chain
when its turn step ends. A Jinx resolution that has already begun with more than
one card gets a brief 450ms cue at normal speed. Her actual reaction window and
successful draw remain intact; this check uses the currently displayed public
hand count and supports printing aliases.

Mushroom Pouch had a separate rules bug. Its immediate “if you control a facedown
card at a battlefield” belongs to the trigger condition. The ability now enters
the chain only when that condition holds at Beginning, and keeps its qualified
draw if the Hidden card is revealed in response. This follows the same rule's
Sona example: a fulfilled trigger condition is not rechecked during resolution.
Annie's unconditional end-turn trigger remains valid with already-ready runes.

The real-engine regressions in `conditional-beginning-triggers.test.ts` exercise
both directions of Jinx's hand-size change through actual reactions, human
response protection, normal and bonus draws, printing aliases, source lifetime,
and Mushroom Pouch's condition across a Hidden reveal and saved-session reload.
