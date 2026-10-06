import type { Card } from "../data/cards";
import { gameplayFingerprint } from "../data/card-identity";

// Reviewed faces whose premium/reprint text omits only reminder text. Do not
// strip reminder text globally: incomplete Equipment records must fail closed.
const reviewedFaces = [
  "unl-022-219",
  "unl-028-219",
  "unl-030-219",
  "unl-051-219",
  "unl-055-219",
  "unl-058-219",
  "unl-059-219",
  "unl-060-219",
  "unl-079-219",
  "unl-082-219",
  "unl-089-219",
  "unl-113-219",
  "unl-116-219",
  "unl-143-219",
  "unl-145-219",
  "unl-150-219",
  "unl-172-219",
  "sfd-036-221",
  "sfd-099-221",
  "unl-185-219",
  "unl-191-219",
  "ven-143-166--6a517606ad64d2d80a4f03a5",
  "ven-143-166--6a56ab97ff602fd324f47636",
  "ven-134-166",
  "ven-155-166--6a517605ad64d2d80a4f0392",
  "ven-155-166--6a56ab96ff602fd324f4761e",
];
function rulesText(text: string) {
  return text
    .replace(/\([^()]*\)/g, "")
    .replace(/\[&gt;\]|[—–]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, "")
    .trim();
}
export function reviewedPrintingAliases(
  catalog: Card[],
): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const id of reviewedFaces) {
    const source = catalog.find((c) => c.id === id);
    if (!source) continue;
    const key = gameplayFingerprint({
      ...source,
      text: rulesText(source.text),
    });
    for (const card of catalog) {
      if (
        card.id !== id &&
        gameplayFingerprint({ ...card, text: rulesText(card.text) }) === key
      )
        aliases[card.id] = id;
    }
  }
  return aliases;
}
