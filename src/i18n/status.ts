/** Status labels and rules explanations; printed keyword names stay in English. */
export const statusMessages: Record<string, [string, string, string]> = {
  "Named spell: {card}": [
    "Named spell: {card}",
    "Imenovana čarolija: {card}",
    "Incantesimo nominato: {card}",
  ],
  "Opponents cannot play this spell while this unit is at a battlefield.": [
    "Opponents cannot play this spell while this unit is at a battlefield.",
    "Protivnici ne mogu igrati ovu čaroliju dok je ova jedinica na bojištu.",
    "Gli avversari non possono giocare questo incantesimo mentre l'unità è su un campo.",
  ],
  "Active effects": ["Active effects", "Aktivni efekti", "Effetti attivi"],
  "{count} more active effects": [
    "{count} more active effects",
    "Još aktivnih efekata: {count}",
    "Altri effetti attivi: {count}",
  ],
  Stunned: ["Stunned", "Omamljena", "Stordita"],
  "Deals no combat damage this turn.": [
    "Deals no combat damage this turn.",
    "Ne nanosi borbenu štetu ovog poteza.",
    "Non infligge danni da combattimento in questo turno.",
  ],
  "Damage {count}": ["Damage {count}", "Šteta {count}", "Danni {count}"],
  "Marked damage clears at the end of the turn.": [
    "Marked damage clears at the end of the turn.",
    "Zabilježena šteta uklanja se na kraju poteza.",
    "I danni segnati si rimuovono alla fine del turno.",
  ],
  "Buff {count}": ["Buff {count}", "Buff {count}", "Buff {count}"],
  "Buff remains until it is spent or removed.": [
    "Buff remains until it is spent or removed.",
    "Buff ostaje dok se ne potroši ili ukloni.",
    "Il Buff rimane finché non viene consumato o rimosso.",
  ],
  "Might {amount}": ["Might {amount}", "Might {amount}", "Might {amount}"],
  "Might modifier lasts until the end of the turn.": [
    "Might modifier lasts until the end of the turn.",
    "Promjena vrijednosti Might traje do kraja poteza.",
    "Il modificatore di Might dura fino alla fine del turno.",
  ],
  Assault: ["Assault", "Assault", "Assault"],
  "Assault {amount}": [
    "Assault {amount}",
    "Assault {amount}",
    "Assault {amount}",
  ],
  "Extra Might while attacking this turn.": [
    "Extra Might while attacking this turn.",
    "Dodatni Might pri napadu ovog poteza.",
    "Might aggiuntivo durante gli attacchi in questo turno.",
  ],
  Shield: ["Shield", "Shield", "Shield"],
  "Shield {amount}": ["Shield {amount}", "Shield {amount}", "Shield {amount}"],
  "Extra Might while defending this combat.": [
    "Extra Might while defending this combat.",
    "Dodatni Might pri odbrani u ovoj borbi.",
    "Might aggiuntivo in difesa durante questo combattimento.",
  ],
  "Extra Might while defending this turn.": [
    "Extra Might while defending this turn.",
    "Dodatni Might pri odbrani ovog poteza.",
    "Might aggiuntivo in difesa durante questo turno.",
  ],
  Empowered: ["Empowered", "Empowered", "Empowered"],
  "Empowered abilities are active.": [
    "Empowered abilities are active.",
    "Empowered sposobnosti su aktivne.",
    "Le abilità Empowered sono attive.",
  ],
  "Prevent {count}": [
    "Prevent {count}",
    "Sprečava {count}",
    "Previene {count}",
  ],
  "Prevents this much damage; unused protection expires at the end of the turn.":
    [
      "Prevents this much damage; unused protection expires at the end of the turn.",
      "Sprečava ovoliko štete; neiskorištena zaštita prestaje na kraju poteza.",
      "Previene questa quantità di danni; la protezione inutilizzata termina alla fine del turno.",
    ],
  Guarded: ["Guarded", "Zaštićena", "Protetta"],
  "Prevents the next damage dealt to this unit this turn.": [
    "Prevents the next damage dealt to this unit this turn.",
    "Sprečava sljedeću štetu nanesenu ovoj jedinici ovog poteza.",
    "Previene i prossimi danni inflitti a questa unità in questo turno.",
  ],
  "Vulnerable ×{count}": [
    "Vulnerable ×{count}",
    "Ranjiva ×{count}",
    "Vulnerabile ×{count}",
  ],
  "Incoming damage is multiplied this turn.": [
    "Incoming damage is multiplied this turn.",
    "Primljena šteta se umnožava ovog poteza.",
    "I danni subiti vengono moltiplicati in questo turno.",
  ],
  Untargetable: ["Untargetable", "Untargetable", "Untargetable"],
  "Enemy spells and abilities cannot choose this unit this turn.": [
    "Enemy spells and abilities cannot choose this unit this turn.",
    "Protivničke čarolije i sposobnosti ne mogu izabrati ovu jedinicu ovog poteza.",
    "Le magie e le abilità nemiche non possono scegliere questa unità in questo turno.",
  ],
  "Enemy spells and abilities cannot choose this unit while this effect is active.":
    [
      "Enemy spells and abilities cannot choose this unit while this effect is active.",
      "Protivničke čarolije i sposobnosti ne mogu izabrati ovu jedinicu dok je ovaj efekat aktivan.",
      "Le magie e le abilità nemiche non possono scegliere questa unità mentre questo effetto è attivo.",
    ],
  "Base Might {count}": [
    "Base Might {count}",
    "Osnovni Might {count}",
    "Might base {count}",
  ],
  "Base Might is replaced until the end of the turn; other modifiers still apply.":
    [
      "Base Might is replaced until the end of the turn; other modifiers still apply.",
      "Osnovni Might je zamijenjen do kraja poteza; ostale promjene i dalje važe.",
      "Il Might base viene sostituito fino alla fine del turno; gli altri modificatori si applicano comunque.",
    ],
  "Move locked": ["Move locked", "Kretanje blokirano", "Movimento bloccato"],
  "Cannot move this turn.": [
    "Cannot move this turn.",
    "Ne može se kretati ovog poteza.",
    "Non può muoversi in questo turno.",
  ],
  "Death ward": ["Death ward", "Zaštita od smrti", "Protezione dalla morte"],
  "The next time this unit would die this turn, recall it exhausted instead.": [
    "The next time this unit would die this turn, recall it exhausted instead.",
    "Kada bi ova jedinica sljedeći put umrla ovog poteza, umjesto toga se vraća iscrpljena u bazu.",
    "La prossima volta che questa unità morirebbe in questo turno, torna invece esausta alla base.",
  ],
  Temporary: ["Temporary", "Temporary", "Temporary"],
  "Temporary removal is suppressed while the protecting effect remains at this battlefield.":
    [
      "Temporary removal is suppressed while the protecting effect remains at this battlefield.",
      "Uklanjanje zbog efekta Temporary je onemogućeno dok zaštitni efekat ostaje na ovom bojištu.",
      "La rimozione dovuta a Temporary è sospesa finché l'effetto protettivo rimane su questo campo di battaglia.",
    ],
  "Dies at the beginning of its controller's next turn.": [
    "Dies at the beginning of its controller's next turn.",
    "Umire na početku sljedećeg poteza igrača koji je kontroliše.",
    "Muore all'inizio del prossimo turno del giocatore che la controlla.",
  ],
  "Destroyed at the beginning of its controller's next turn.": [
    "Destroyed at the beginning of its controller's next turn.",
    "Uništava se na početku sljedećeg poteza igrača koji je kontroliše.",
    "Viene distrutta all'inizio del prossimo turno del giocatore che la controlla.",
  ],
  "Effect shield": [
    "Effect shield",
    "Zaštita od efekata",
    "Protezione dagli effetti",
  ],
  "Prevents damage from spells and abilities this turn.": [
    "Prevents damage from spells and abilities this turn.",
    "Sprečava štetu od čarolija i sposobnosti ovog poteza.",
    "Previene i danni da magie e abilità in questo turno.",
  ],
  Invulnerable: ["Invulnerable", "Neranjiva", "Invulnerabile"],
  "Prevents all damage while this effect is active.": [
    "Prevents all damage while this effect is active.",
    "Sprečava svu štetu dok je ovaj efekat aktivan.",
    "Previene tutti i danni mentre questo effetto è attivo.",
  ],
  "No combat damage": [
    "No combat damage",
    "Bez borbene štete",
    "Nessun danno da combattimento",
  ],
  "This unit contributes no combat damage while this effect is active.": [
    "This unit contributes no combat damage while this effect is active.",
    "Ova jedinica ne doprinosi borbenoj šteti dok je ovaj efekat aktivan.",
    "Questa unità non contribuisce ai danni da combattimento mentre questo effetto è attivo.",
  ],
  "Cannot ready": [
    "Cannot ready",
    "Ne može se pripremiti",
    "Non può prepararsi",
  ],
  "This unit cannot ready while this effect is active.": [
    "This unit cannot ready while this effect is active.",
    "Ova jedinica se ne može pripremiti dok je ovaj efekat aktivan.",
    "Questa unità non può prepararsi mentre questo effetto è attivo.",
  ],
  "No recall move": [
    "No recall move",
    "Bez povratka u bazu",
    "Nessun ritorno alla base",
  ],
  "This unit cannot move to base while this effect is active.": [
    "This unit cannot move to base while this effect is active.",
    "Ova jedinica se ne može pomjeriti u bazu dok je ovaj efekat aktivan.",
    "Questa unità non può muoversi alla base mentre questo effetto è attivo.",
  ],
  Anchored: ["Anchored", "Usidrena", "Ancorata"],
  "Enemies cannot move this unit while this effect is active.": [
    "Enemies cannot move this unit while this effect is active.",
    "Protivnici ne mogu pomjeriti ovu jedinicu dok je ovaj efekat aktivan.",
    "I nemici non possono muovere questa unità mentre questo effetto è attivo.",
  ],
  "Out-of-combat guard": [
    "Out-of-combat guard",
    "Zaštita izvan borbe",
    "Protezione fuori dal combattimento",
  ],
  "Prevents damage while this unit is outside combat.": [
    "Prevents damage while this unit is outside combat.",
    "Sprečava štetu dok je ova jedinica izvan borbe.",
    "Previene i danni mentre questa unità è fuori dal combattimento.",
  ],
  "Granted until the end of the turn.": [
    "Granted until the end of the turn.",
    "Dodijeljeno do kraja poteza.",
    "Concesso fino alla fine del turno.",
  ],
  "Active while the granting effect remains.": [
    "Active while the granting effect remains.",
    "Aktivno dok traje efekat koji ga dodjeljuje.",
    "Attivo finché permane l'effetto che lo concede.",
  ],
  Deflect: ["Deflect", "Deflect", "Deflect"],
  "Deflect {amount}": [
    "Deflect {amount}",
    "Deflect {amount}",
    "Deflect {amount}",
  ],
  Ganking: ["Ganking", "Ganking", "Ganking"],
  Tank: ["Tank", "Tank", "Tank"],
  Backline: ["Backline", "Backline", "Backline"],
  Vision: ["Vision", "Vision", "Vision"],
  Weaponmaster: ["Weaponmaster", "Weaponmaster", "Weaponmaster"],
  Hunt: ["Hunt", "Hunt", "Hunt"],
  "Hunt {amount}": ["Hunt {amount}", "Hunt {amount}", "Hunt {amount}"],
  Deathknell: ["Deathknell", "Deathknell", "Deathknell"],
};
