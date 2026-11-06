# Neeko, Blending In: more than one legend — 6 November 2026

Neeko, Blending In is now playable, so all **219** Radiance printings are playable.

> If Neeko is in your deck, choose up to 3 different legends in addition to your starting legend. When you play me, choose one of those Legends and add it to your Legend Zone while I'm on the board.

## Deck building

- A deck that contains Neeko (in the main deck or as the chosen champion) can list up to **three more legends**. Their names must differ from each other and from the starting legend. They do not change the deck's domains.
- The deck builder shows three **Neeko legend** selectors while Neeko is in the deck. The text format has a `Neeko Legends` section (also read as `Additional legends` or `Dodatne legende`), and exported decks write it after `Battlefields`.
- Extra legends without Neeko, more than three, repeated names or non-legend cards are errors. Online rooms, saved drafts and best-of-three series accept the field. In a series the extra legends stay fixed, like the starting legend.
- The chosen legends are private: the opponent's view and the bot's observation leave them out until Neeko adds one to play.

## In play

- When Neeko is played, her controller chooses one of the deck's extra legends whose name is not already in the Legend Zone. It joins the Legend Zone while that Neeko is on the board and leaves when she dies, is returned to hand or is banished.
- An added legend is a full legend. Its activated abilities appear beside the starting legend's, and its triggered and passive rules apply. It has its own **exhausted** and **Empowered** state, and it readies in your Awaken Phase.
- Effects that look for your legend find any legend in your Legend Zone. Effects that exhaust or ready a particular legend use that legend. "Exhaust your legend" as a cost uses the starting legend first, if it is ready. Heartening Soul readies your first exhausted legend, and Royal Entourage can choose any legend in the chosen player's Legend Zone.
- The board shows an added legend next to your starting legend and champion, marked **Added by Neeko**, with its own ready and Empowered status.

## Engine change

Legends are now handled as a list per player (`src/game/legends.ts`): the starting legend (source `legend`) and any legend Neeko added (source `neeko-legend:<Neeko's id>`). Every legend check in the Origins, Spiritforged, Unleashed, Vendetta and Radiance rules now goes through that list.

## Validation

`tests/radiance-neeko.test.ts` covers adding a legend and using its ability, separate exhausted and Empowered state, The Exile's passive rule from an added legend, removal when Neeko dies, name restrictions, hidden information, saved games, deck validation and the `Neeko Legends` import and export.
