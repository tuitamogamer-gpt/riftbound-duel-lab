/** Engine strings remain canonical and language independent. Templates are matched
 * at the presentation boundary; placeholders contain card names or nested labels. */
const englishMessages: [string, string, string][] = [
  ["Name {card}", "Imenuj {card}", "Nomina {card}"],
  [
    "Add one Power for gear",
    "Dodaj jednu moć za opremu",
    "Aggiungi un Potere per gli oggetti",
  ],
  ["Play a Sand Soldier", "Odigraj Sand Soldiera", "Gioca un Sand Soldier"],
  [
    "Give the next spell 1 Bonus Damage",
    "Daj sljedećoj čaroliji 1 dodatnu štetu",
    "La prossima magia infligge 1 danno bonus",
  ],
  [
    "Channel 1 rune exhausted",
    "Kanalizuj 1 iscrpljenu runu",
    "Canalizza 1 runa esaurita",
  ],
  [
    "Pay Body power and exhaust Mistfall to ready the buffed unit",
    "Plati moć Body i iscrpi Mistfall da pripremiš pojačanu jedinicu",
    "Paga potere Body ed esaurisci Mistfall per preparare l'unità potenziata",
  ],
  [
    "Pay Fury power to play discarded Flame Chompers",
    "Plati moć Fury da odigraš odbačenu kartu Flame Chompers",
    "Paga potere Fury per giocare Flame Chompers dagli scarti",
  ],
  [
    "Pay 1 energy to draw 1",
    "Plati 1 energiju da povučeš 1 kartu",
    "Paga 1 energia per pescare 1 carta",
  ],
  [
    "Pay 1 energy for an exhausted Gold",
    "Plati 1 energiju za iscrpljeni Gold",
    "Paga 1 energia per un Gold esaurito",
  ],
  ["Temporary", "Privremeno", "Temporaneo"],
  ["Hunt", "Lov", "Caccia"],
  ["Hunt {amount}", "Lov {amount}", "Caccia {amount}"],
  // Players, locations, game terms and nested fragments.
  ["You", "Ti", "Tu"],
  ["Nexus AI", "Nexus AI", "Nexus IA"],
  ["your base", "tvoja baza", "la tua base"],
  ["enemy base", "protivnička baza", "la base avversaria"],
  ["battlefield 1", "bojište 1", "campo di battaglia 1"],
  ["battlefield 2", "bojište 2", "campo di battaglia 2"],
  ["base:0", "tvoja baza", "la tua base"],
  ["base:1", "protivnička baza", "la base avversaria"],
  ["field:0", "bojište 1", "campo di battaglia 1"],
  ["field:1", "bojište 2", "campo di battaglia 2"],
  ["ready", "spremno", "pronto"],
  ["exhausted", "iscrpljeno", "esaurito"],
  ["priority", "prioritet", "priorità"],
  ["focus", "fokus", "iniziativa"],
  ["triggered ability", "aktivirana sposobnost", "abilità innescata"],
  ["effect", "efekat", "effetto"],
  [
    "opponent burnout",
    "protivnikov prazan špil",
    "esaurimento del mazzo avversario",
  ],
  [
    "holding a battlefield",
    "zadržavanje bojišta",
    "mantenimento di un campo di battaglia",
  ],
  [
    "conquering a battlefield",
    "osvajanje bojišta",
    "conquista di un campo di battaglia",
  ],
  ["card effect", "efekat karte", "effetto di una carta"],
  ["Enters ready", "Ulazi spremno", "Entra pronto"],
  ["Empowered", "Osnaženo", "Potenziato"],
  ["Assault", "Juriš", "Assalto"],
  ["Assault {amount}", "Juriš {amount}", "Assalto {amount}"],
  ["Shield", "Štit", "Scudo"],
  ["Shield {amount}", "Štit {amount}", "Scudo {amount}"],
  ["Deflect", "Odbijanje", "Deviazione"],
  ["Deflect {amount}", "Odbijanje {amount}", "Deviazione {amount}"],
  ["Tank", "Zaštitnik", "Difensore"],
  ["Ganking", "Prepad", "Incursione"],
  ["Weaponmaster", "Majstor oružja", "Maestro d'armi"],
  ["Vision", "Vizija", "Visione"],
  ["Mighty", "Moćno", "Possente"],
  ["Accelerate", "Ubrzaj", "Accelera"],
  ["Hidden", "Skriveno", "Nascosto"],
  ["Repeat", "Ponovi", "Ripeti"],
  ["additional cost", "dodatni trošak", "costo aggiuntivo"],
  ["legend", "legenda", "leggenda"],
  ["champion", "šampion", "campione"],
  ["main", "glavni špil", "mazzo principale"],
  ["runes", "rune", "rune"],
  ["battlefields", "bojišta", "campi di battaglia"],
  // Common actions.
  [
    "Keep all four cards",
    "Zadrži sve četiri karte",
    "Tieni tutte e quattro le carte",
  ],
  ["Replace one card", "Zameni jednu kartu", "Sostituisci una carta"],
  ["Replace two cards", "Zameni dve karte", "Sostituisci due carte"],
  ["Replace {card}", "Zameni {card}", "Sostituisci {card}"],
  [
    "No legal target — continue",
    "Nema dozvoljene mete — nastavi",
    "Nessun bersaglio valido — continua",
  ],
  ["discard: {card}", "Odbaci: {card}", "Scarta: {card}"],
  ["recycle: {card}", "Recikliraj: {card}", "Ricicla: {card}"],
  ["retrieve: {card}", "Vrati u ruku: {card}", "Recupera in mano: {card}"],
  [
    "Continue without selecting a card",
    "Nastavi bez odabira karte",
    "Continua senza scegliere una carta",
  ],
  [
    "Keep {card} on top",
    "Zadrži {card} na vrhu špila",
    "Tieni {card} in cima al mazzo",
  ],
  ["Deck empty: continue", "Špil je prazan: nastavi", "Mazzo vuoto: continua"],
  ["Recycle {card}", "Recikliraj {card}", "Ricicla {card}"],
  ["Kill {card}", "Uništi {card}", "Distruggi {card}"],
  [
    "Spend a buff from {card}",
    "Potroši pojačanje sa {card}",
    "Consuma un potenziamento di {card}",
  ],
  [
    "Decline optional effect",
    "Preskoči opcioni efekat",
    "Rifiuta l'effetto facoltativo",
  ],
  [
    "Skip optional effect",
    "Preskoči opcioni efekat",
    "Salta l'effetto facoltativo",
  ],
  [
    "Use optional ability",
    "Iskoristi opcionu sposobnost",
    "Usa l'abilità facoltativa",
  ],
  [
    "Decline optional ability",
    "Preskoči opcionu sposobnost",
    "Rifiuta l'abilità facoltativa",
  ],
  ["Move to {location}", "Premesti na: {location}", "Sposta verso {location}"],
  [
    "Place {card} at {location} ({count} remaining)",
    "Postavi {card} na: {location} (preostalo: {count})",
    "Colloca {card} su {location} ({count} rimanenti)",
  ],
  ["Choose target", "Izaberi metu", "Scegli il bersaglio"],
  [
    "Decline optional trigger",
    "Preskoči opcionu aktivaciju",
    "Rifiuta l'innesco facoltativo",
  ],
  [
    "Resolve ability (no target)",
    "Razreši sposobnost (bez mete)",
    "Risolvi l'abilità (senza bersaglio)",
  ],
  [
    "Remove {card} ({might} Might)",
    "Ukloni {card} (snaga: {might})",
    "Rimuovi {card} ({might} Forza)",
  ],
  [
    "Add {card} ({might} Might)",
    "Dodaj {card} (snaga: {might})",
    "Aggiungi {card} ({might} Forza)",
  ],
  [
    "Move {count} unit to {location}",
    "Premesti {count} jedinicu na: {location}",
    "Sposta {count} unità verso {location}",
  ],
  [
    "Move {count} units to {location}",
    "Premesti jedinice ({count}) na: {location}",
    "Sposta {count} unità verso {location}",
  ],
  ["Cancel movement", "Otkaži kretanje", "Annulla lo spostamento"],
  [
    "Assign {amount} damage to {card}",
    "Dodeli {amount} štete karti {card}",
    "Assegna {amount} danni a {card}",
  ],
  [
    "Confirm damage assignment",
    "Potvrdi raspodelu štete",
    "Conferma l'assegnazione dei danni",
  ],
  [
    "Hide {card} at {location}",
    "Sakrij {card} na: {location}",
    "Nascondi {card} — {location}",
  ],
  [
    "Play {card} at {location}",
    "Odigraj {card} na: {location}",
    "Gioca {card} — {location}",
  ],
  ["Play {card}", "Odigraj {card}", "Gioca {card}"],
  [
    "Meditation: exhaust {card} to draw 2",
    "Meditation: iscrpi {card} da povučeš 2 karte",
    "Meditation: esaurisci {card} per pescare 2 carte",
  ],
  [
    "Play {card}: discard {discarded} for -2 energy",
    "Odigraj {card}: odbaci {discarded} za -2 energije",
    "Gioca {card}: scarta {discarded} per -2 energia",
  ],
  [
    "Accelerate {card} at {location}",
    "Ubrzaj {card} na: {location}",
    "Accelera {card} su {location}",
  ],
  ["Accelerate {card}", "Ubrzaj {card}", "Accelera {card}"],
  ["Move {card}", "Premesti {card}", "Sposta {card}"],
  [
    "Spend Gold: add one universal power",
    "Potroši Gold: dodaj jednu univerzalnu moć",
    "Consuma Gold: aggiungi un potere universale",
  ],
  [
    "Equip {gear} to {card}",
    "Pridruži opremu {gear} karti {card}",
    "Assegna {gear} a {card}",
  ],
  ["Pass priority", "Prepusti prioritet", "Passa la priorità"],
  ["Resolve showdown", "Razreši okršaj", "Risolvi lo scontro"],
  ["Pass focus", "Prepusti fokus", "Passa l'iniziativa"],
  ["End turn", "Završi potez", "Termina il turno"],
  ["Action complete", "Radnja završena", "Azione completata"],
  [
    "{energy} energy · {power} power",
    "{energy} energije · {power} moći",
    "{energy} energia · {power} potere",
  ],
  [
    "{energy} energy · {power} power · enters ready",
    "{energy} energije · {power} moći · ulazi spremno",
    "{energy} energia · {power} potere · entra pronto",
  ],
  // Specific extensions keep composited actions recursively translatable.
  [
    "{action} · spend a buff from {card}",
    "{action} · potroši buff sa {card}",
    "{action} · spendi un buff da {card}",
  ],
  [
    "{action} · return to hand {card}",
    "{action} · vrati u ruku {card}",
    "{action} · riprendi in mano {card}",
  ],
  [
    "{action} · kill {card}",
    "{action} · ubij {card}",
    "{action} · uccidi {card}",
  ],
  [
    "Additional cost: {cost}.",
    "Dodatni trošak: {cost}.",
    "Costo aggiuntivo: {cost}.",
  ],
  [
    "spend a buff from {card}",
    "potroši buff sa {card}",
    "spendi un buff da {card}",
  ],
  ["return to hand {card}", "vrati u ruku {card}", "riprendi in mano {card}"],
  ["kill {card}", "ubij {card}", "uccidi {card}"],
  [
    "{action} · additional cost (discard {card})",
    "{action} · dodatni trošak (odbaci {card})",
    "{action} · costo aggiuntivo (scarta {card})",
  ],
  [
    "{action} · additional cost",
    "{action} · dodatni trošak",
    "{action} · costo aggiuntivo",
  ],
  [
    "{action} · Repeat {target} (discard {card})",
    "{action} · ponovi {target} (odbaci {card})",
    "{action} · ripeti {target} (scarta {card})",
  ],
  [
    "{action} · Repeat (discard {card})",
    "{action} · ponovi (odbaci {card})",
    "{action} · ripeti (scarta {card})",
  ],
  [
    "{action} · Repeat {target}",
    "{action} · ponovi {target}",
    "{action} · ripeti {target}",
  ],
  ["{action} · Repeat", "{action} · ponovi", "{action} · ripeti"],
  [
    "{action} · recycle {card}",
    "{action} · recikliraj {card}",
    "{action} · ricicla {card}",
  ],
  ["{action} → {target}", "{action} → {target}", "{action} → {target}"],
  [
    "{left} fights → {right}",
    "{left} se bori protiv → {right}",
    "{left} combatte contro → {right}",
  ],
  ["{source}: {action}", "{source}: {action}", "{source}: {action}"],
  // Engine narration and combat progression.
  [
    "Duel initialized. Each player may replace up to two cards.",
    "Duel je započeo. Svaki igrač može zameniti do dve karte.",
    "Duello avviato. Ogni giocatore può sostituire fino a due carte.",
  ],
  [
    "{player} channels {count} rune(s) {status}.",
    "{player}: kanalizovane rune ({count}), stanje: {status}.",
    "{player}: canalizzazione di {count} rune, stato: {status}.",
  ],
  [
    "{player}: {points} / 8 — {reason}",
    "{player}: {points} / 8 — {reason}",
    "{player}: {points} / 8 — {reason}",
  ],
  [
    "{player} wins the match.",
    "{player} pobeđuje u meču.",
    "{player} vince la partita.",
  ],
  [
    "{player} draws {count} card(s).",
    "{player}: povučene karte ({count}).",
    "{player}: pesca {count} carte.",
  ],
  [
    "{player} conquers: draw 1 instead of the final point. Hold or score both battlefields to win.",
    "{player} osvaja: povuci 1 kartu umesto poslednjeg poena. Za pobedu zadrži bojište ili osvoji poene na oba bojišta.",
    "{player} conquista: pesca 1 carta invece del punto finale. Mantieni un campo di battaglia o segna su entrambi per vincere.",
  ],
  [
    "The Grand Plaza wins the game.",
    "The Grand Plaza donosi pobedu.",
    "The Grand Plaza vince la partita.",
  ],
  [
    "Turn {turn} — {player}: ready units, gear and runes.",
    "Potez {turn} — {player}: pripremi jedinice, opremu i rune.",
    "Turno {turn} — {player}: prepara unità, equipaggiamenti e rune.",
  ],
  [
    "{player} plays a {card} gear token.",
    "{player}: odigran žeton opreme {card}.",
    "{player}: gioca una pedina equipaggiamento {card}.",
  ],
  [
    "{player} plays a {card} at {location}.",
    "{player}: odigrana karta {card} na: {location}.",
    "{player} — carta giocata: {card}, posizione: {location}.",
  ],
  ["{card} is defeated.", "{card} je poražena.", "{card} viene sconfitto."],
  [
    "A hidden card is trashed after losing control of its battlefield.",
    "Skrivena karta je odbačena nakon gubitka kontrole nad njenim bojištem.",
    "Una carta nascosta viene scartata dopo la perdita del controllo del suo campo di battaglia.",
  ],
  [
    "The chosen target is no longer legal. That instruction is skipped.",
    "Izabrana meta više nije dozvoljena. Ovo uputstvo se preskače.",
    "Il bersaglio scelto non è più valido. L'istruzione viene saltata.",
  ],
  [
    "{source}: {kind} enters the chain.",
    "{source}: {kind} ulazi u lanac.",
    "{source}: {kind} entra nella catena.",
  ],
  [
    "Showdown at {location}. {player} has focus.",
    "Okršaj na: {location}. {player} ima fokus.",
    "Scontro su {location}. {player} ha l'iniziativa.",
  ],
  [
    "Assign combat damage: {attacker} {attack} · {defender} {defense}.",
    "Raspodeli borbenu štetu: {attacker} {attack} · {defender} {defense}.",
    "Assegna i danni da combattimento: {attacker} {attack} · {defender} {defense}.",
  ],
  [
    "Both sides deal their assigned combat damage simultaneously.",
    "Obe strane istovremeno nanose dodeljenu borbenu štetu.",
    "Entrambe le parti infliggono simultaneamente i danni da combattimento assegnati.",
  ],
  [
    "The defenders hold. Surviving attackers are recalled to base.",
    "Branioci zadržavaju bojište. Preživeli napadači vraćaju se u bazu.",
    "I difensori resistono. Gli attaccanti sopravvissuti tornano alla base.",
  ],
  [
    "Combat damage resolves simultaneously. Surviving units heal.",
    "Borbena šteta se razrešava istovremeno. Preživele jedinice se leče.",
    "I danni da combattimento si risolvono simultaneamente. Le unità sopravvissute guariscono.",
  ],
  [
    "Combat damage resolved. Resolve triggers before final control.",
    "Borbena šteta je razrešena. Razreši aktivirane sposobnosti pre konačne kontrole.",
    "Danni da combattimento risolti. Risolvi gli inneschi prima del controllo finale.",
  ],
  [
    "{location} is uncontrolled after the showdown.",
    "{location}: bez kontrole nakon okršaja.",
    "{location} resta senza controllo dopo lo scontro.",
  ],
  [
    "{player} controls {location}.",
    "{player} kontroliše: {location}.",
    "{player} controlla {location}.",
  ],
  [
    "{player} passes {kind}.",
    "{player} prepušta {kind}.",
    "{player} passa {kind}.",
  ],
  ["{card} resolves.", "{card}: efekat je razrešen.", "{card} si risolve."],
  [
    "{player} ends the turn. Damage, stuns and temporary bonuses expire.",
    "{player} završava potez. Šteta, omamljivanja i privremeni bonusi prestaju.",
    "{player} termina il turno. Danni, stordimenti e bonus temporanei scadono.",
  ],
  [
    "{player} replaced {count} card(s).",
    "{player}: zamenjene karte ({count}).",
    "{player}: sostituite {count} carte.",
  ],
  [
    "{player} hides a card at {location}.",
    "{player} skriva kartu na: {location}.",
    "{player} nasconde una carta su {location}.",
  ],
  [
    "{player} moves {count} unit(s) to {location}.",
    "{player} premešta jedinice ({count}) na: {location}.",
    "{player} sposta {count} unità verso {location}.",
  ],
  [
    "{player} assigns {amount} combat damage → {target}.",
    "{player} dodeljuje {amount} borbene štete → {target}.",
    "{player} assegna {amount} danni da combattimento → {target}.",
  ],
  [
    "{player} assigns {amount} combat damage.",
    "{player} dodeljuje {amount} borbene štete.",
    "{player} assegna {amount} danni da combattimento.",
  ],
  [
    "{player} spends Gold and adds one universal power.",
    "{player} troši Gold i dodaje jednu univerzalnu moć.",
    "{player} consuma Gold e aggiunge un potere universale.",
  ],
  [
    "{player} plays {card} → {target}.",
    "{player} igra {card} → {target}.",
    "{player} — carta giocata: {card} → {target}.",
  ],
  [
    "{player} plays {card}.",
    "{player} igra {card}.",
    "{player} — carta giocata: {card}.",
  ],
  [
    "{card} enters {status} at {location}.",
    "{card} ulazi u stanje {status} na: {location}.",
    "{card} entra in stato {status} su {location}.",
  ],
  ["{player}: {effect}.", "{player}: {effect}.", "{player}: {effect}."],
  // Effect narration, including operations whose engine description is generic.
  [
    "deals {amount} damage to affected units",
    "nanosi {amount} štete pogođenim jedinicama",
    "infligge {amount} danni alle unità interessate",
  ],
  ["deals {amount} damage", "nanosi {amount} štete", "infligge {amount} danni"],
  [
    "gives {amount} temporary Might",
    "daje {amount} privremene snage",
    "conferisce {amount} Forza temporanea",
  ],
  [
    "gives friendly units {amount} temporary Might",
    "daje savezničkim jedinicama {amount} privremene snage",
    "conferisce alle unità alleate {amount} Forza temporanea",
  ],
  [
    "grants Assault {amount}",
    "daje Juriš {amount}",
    "conferisce Assalto {amount}",
  ],
  [
    "gives a +1 Might buff",
    "daje pojačanje od +1 snage",
    "conferisce un potenziamento di +1 Forza",
  ],
  [
    "stuns the chosen unit",
    "omamljuje izabranu jedinicu",
    "stordisce l'unità scelta",
  ],
  [
    "readies the chosen unit",
    "priprema izabranu jedinicu",
    "prepara l'unità scelta",
  ],
  [
    "readies up to {amount} runes",
    "priprema do {amount} runa",
    "prepara fino a {amount} rune",
  ],
  [
    "kills the chosen unit",
    "uništava izabranu jedinicu",
    "distrugge l'unità scelta",
  ],
  [
    "moves the chosen unit to its base",
    "vraća izabranu jedinicu u njenu bazu",
    "sposta l'unità scelta nella sua base",
  ],
  [
    "units deal Might damage to each other",
    "jedinice međusobno nanose štetu jednaku svojoj snazi",
    "le unità si infliggono reciprocamente danni pari alla propria Forza",
  ],
  [
    "draw effect complete",
    "efekat povlačenja karata je završen",
    "effetto di pesca completato",
  ],
  [
    "rune channel effect complete",
    "efekat kanalizovanja runa je završen",
    "effetto di canalizzazione delle rune completato",
  ],
  [
    "recruit effect begins",
    "počinje efekat regrutovanja",
    "inizia l'effetto di reclutamento",
  ],
  [
    "heal effect resolves",
    "razrešava se efekat lečenja",
    "si risolve l'effetto di guarigione",
  ],
  [
    "recall effect resolves",
    "razrešava se povratak u bazu",
    "si risolve il richiamo alla base",
  ],
  [
    "exhaust effect resolves",
    "razrešava se iscrpljivanje",
    "si risolve l'esaurimento",
  ],
  [
    "energy effect resolves",
    "razrešava se efekat energije",
    "si risolve l'effetto di energia",
  ],
  [
    "recycle effect resolves",
    "razrešava se recikliranje",
    "si risolve il riciclo",
  ],
  [
    "discard effect resolves",
    "razrešava se odbacivanje",
    "si risolve lo scarto",
  ],
  [
    "drawDiscard effect resolves",
    "razrešava se povlačenje i odbacivanje",
    "si risolve la pesca e lo scarto",
  ],
  [
    "buffAll effect resolves",
    "razrešava se pojačanje svih jedinica",
    "si risolve il potenziamento di tutte le unità",
  ],
  [
    "healAll effect resolves",
    "razrešava se lečenje svih jedinica",
    "si risolve la guarigione di tutte le unità",
  ],
  [
    "counter effect resolves",
    "razrešava se poništavanje",
    "si risolve la neutralizzazione",
  ],
  [
    "equip effect resolves",
    "razrešava se opremanje",
    "si risolve l'equipaggiamento",
  ],
  [
    "mill effect resolves",
    "razrešava se odbacivanje sa vrha špila",
    "si risolve lo scarto dalla cima del mazzo",
  ],
  [
    "score effect resolves",
    "razrešava se osvajanje poena",
    "si risolve l'assegnazione dei punti",
  ],
  [
    "retrieve effect resolves",
    "razrešava se vraćanje u ruku",
    "si risolve il recupero in mano",
  ],
  [
    "bounce effect resolves",
    "razrešava se povratak karte u ruku",
    "si risolve il ritorno della carta in mano",
  ],
  [
    "temporary effect resolves",
    "razrešava se privremeni efekat",
    "si risolve l'effetto temporaneo",
  ],
  [
    "predict effect resolves",
    "razrešava se predviđanje",
    "si risolve la previsione",
  ],
  [
    "sacrifice effect resolves",
    "razrešava se žrtvovanje",
    "si risolve il sacrificio",
  ],
  [
    "spendBuff effect resolves",
    "razrešava se trošenje pojačanja",
    "si risolve il consumo del potenziamento",
  ],
  [
    "keyword effect resolves",
    "razrešava se dodela ključne reči",
    "si risolve l'assegnazione della parola chiave",
  ],
  [
    "buffBonus effect resolves",
    "razrešava se bonus pojačanja",
    "si risolve il bonus al potenziamento",
  ],
  [
    "special effect resolves",
    "razrešava se poseban efekat",
    "si risolve l'effetto speciale",
  ],
  // Starter and expansion abilities.
  [
    "Add 2 energy for spells",
    "Dodaj 2 energije za čarolije",
    "Aggiungi 2 energia per le magie",
  ],
  [
    "Spend buff: deal 2",
    "Potroši pojačanje: nanesi 2 štete",
    "Consuma un potenziamento: infliggi 2 danni",
  ],
  [
    "Spend buff: stun",
    "Potroši pojačanje: omami",
    "Consuma un potenziamento: stordisci",
  ],
  [
    "Spend buff: ready Udyr",
    "Potroši pojačanje: pripremi Udyr",
    "Consuma un potenziamento: prepara Udyr",
  ],
  [
    "Spend buff: Ganking",
    "Potroši pojačanje: Prepad",
    "Consuma un potenziamento: Incursione",
  ],
  [
    "Buff a friendly unit",
    "Pojačaj savezničku jedinicu",
    "Potenzia un'unità alleata",
  ],
  [
    "Recycle a card: +1 Might",
    "Recikliraj kartu: +1 snage",
    "Ricicla una carta: +1 Forza",
  ],
  ["-1 Might (minimum 1)", "-1 snage (najmanje 1)", "-1 Forza (minimo 1)"],
  ["Play a Recruit", "Odigraj Recruit", "Gioca un Recruit"],
  [
    "Double my Might this turn",
    "Udvostruči moju snagu ovog poteza",
    "Raddoppia la mia Forza in questo turno",
  ],
  [
    "Give a unit +3 Might this turn",
    "Daj jedinici +3 snage ovog poteza",
    "Conferisci a un'unità +3 Forza in questo turno",
  ],
  [
    "Eye of Twilight — grant Tank",
    "Eye of Twilight — dodeli Zaštitnika",
    "Eye of Twilight — conferisci Difensore",
  ],
  [
    "{card} becomes Empowered.",
    "{card} postaje osnažena.",
    "{card} diventa potenziato.",
  ],
  ["{card} is banished.", "{card} je prognana.", "{card} viene bandito."],
  [
    "Empower {card} — discard {discarded}",
    "Osnaži {card} — odbaci {discarded}",
    "Potenzia {card} — scarta {discarded}",
  ],
  ["Empower {card}", "Osnaži {card}", "Potenzia {card}"],
  [
    "Master of Shadows — disempower, discard 1, draw 1",
    "Master of Shadows — ukloni osnaženje, odbaci 1, povuci 1",
    "Master of Shadows — rimuovi il potenziamento, scarta 1, pesca 1",
  ],
  [
    "Swap Zed and Shadow Clone ({location})",
    "Zameni mesta Zed i Shadow Clone ({location})",
    "Scambia Zed e Shadow Clone ({location})",
  ],
  ["Pay 2: stun {card}", "Plati 2: omami {card}", "Paga 2: stordisci {card}"],
  [
    "Pakaa Protector reveals {card}.",
    "Pakaa Protector otkriva {card}.",
    "Pakaa Protector rivela {card}.",
  ],
  ["Ready {card}", "Pripremi {card}", "Prepara {card}"],
  [
    "Burn 1: +1 Might this turn",
    "Odbaci 1 sa vrha špila: +1 snage ovog poteza",
    "Scarta 1 dalla cima del mazzo: +1 Forza in questo turno",
  ],
  [
    "You Burn 1",
    "Odbaci 1 kartu sa vrha svog špila",
    "Scarta 1 carta dalla cima del tuo mazzo",
  ],
  [
    "Opponent Burns 1",
    "Protivnik odbacuje 1 kartu sa vrha špila",
    "L'avversario scarta 1 carta dalla cima del mazzo",
  ],
  [
    "Banish {card}: Assault 4",
    "Prognaj {card}: Juriš 4",
    "Bandisci {card}: Assalto 4",
  ],
  [
    "Banish {card}; Assault 2 to {target}",
    "Prognaj {card}; Juriš 2 za {target}",
    "Bandisci {card}; Assalto 2 a {target}",
  ],
  [
    "Banish Ravenbloom Prefect and that gear",
    "Prognaj Ravenbloom Prefect i tu opremu",
    "Bandisci Ravenbloom Prefect e quell'equipaggiamento",
  ],
  [
    "Zed and Shadow Clone exchange locations.",
    "Zed i Shadow Clone zamenjuju mesta.",
    "Zed e Shadow Clone si scambiano di posto.",
  ],
  [
    "{player} spends {amount} XP ({total} total).",
    "{player} troši {amount} XP (ukupno: {total}).",
    "{player} spende {amount} XP ({total} in totale).",
  ],
  [
    "{player} gains {amount} XP ({total} total).",
    "{player} dobija {amount} XP (ukupno: {total}).",
    "{player} ottiene {amount} XP ({total} in totale).",
  ],
  [
    "Keep {first} then {second}; recycle the other card",
    "Zadrži {first}, zatim {second}; recikliraj drugu kartu",
    "Tieni {first}, poi {second}; ricicla l'altra carta",
  ],
  [
    "Keep {card}; recycle the other card",
    "Zadrži {card}; recikliraj drugu kartu",
    "Tieni {card}; ricicla l'altra carta",
  ],
  [
    "Keep {first} then {second}",
    "Zadrži {first}, zatim {second}",
    "Tieni {first}, poi {second}",
  ],
  ["Keep {card}", "Zadrži {card}", "Tieni {card}"],
  [
    "Recycle both revealed cards",
    "Recikliraj obe otkrivene karte",
    "Ricicla entrambe le carte rivelate",
  ],
  ["Stun {card}", "Omami {card}", "Stordisci {card}"],
  ["Move {card} here", "Premesti {card} ovde", "Sposta {card} qui"],
  [
    "Move Vex - Mocking to the stunned unit's battlefield",
    "Premesti Vex - Mocking na bojište omamljene jedinice",
    "Sposta Vex - Mocking sul campo di battaglia dell'unità stordita",
  ],
  [
    "Exhaust Vex - Gloomist to draw 1",
    "Iscrpi Vex - Gloomist da povučeš 1 kartu",
    "Esaurisci Vex - Gloomist per pescare 1 carta",
  ],
  [
    "Exhaust Vi to ready {card}",
    "Iscrpi Vi da pripremiš {card}",
    "Esaurisci Vi per preparare {card}",
  ],
  ["Move {card} to base", "Premesti {card} u bazu", "Sposta {card} alla base"],
  [
    "Pay 1 energy to buff the played unit",
    "Plati 1 energiju da pojačaš odigranu jedinicu",
    "Paga 1 energia per potenziare l'unità giocata",
  ],
  [
    "Pay 1 energy to channel a rune exhausted",
    "Plati 1 energiju da kanalizuješ iscrpljenu runu",
    "Paga 1 energia per canalizzare una runa esaurita",
  ],
  [
    "Exhaust Blast Cone to stun the moved enemy unit",
    "Iscrpi Blast Cone da omamiš premeštenu neprijateljsku jedinicu",
    "Esaurisci Blast Cone per stordire l'unità nemica spostata",
  ],
  [
    "Move {card} to Evelynn's battlefield",
    "Premesti {card} na Evelynnino bojište",
    "Sposta {card} sul campo di battaglia di Evelynn",
  ],
  [
    "Spend 3 XP: friendly units here gain Ganking",
    "Potroši 3 XP: savezničke jedinice ovde dobijaju Prepad",
    "Spendi 3 XP: le unità alleate qui ottengono Incursione",
  ],
  ["Exhaust to gain 1 XP", "Iscrpi za 1 XP", "Esaurisci per ottenere 1 XP"],
  [
    "Deal 3 to {card}",
    "Nanesi 3 štete karti {card}",
    "Infliggi 3 danni a {card}",
  ],
  [
    "Stun attacking {card}",
    "Omami napadača {card}",
    "Stordisci l'attaccante {card}",
  ],
  [
    "Kill Divining Shells: +2 Might to {card}",
    "Uništi Divining Shells: +2 snage za {card}",
    "Distruggi Divining Shells: +2 Forza a {card}",
  ],
  [
    "Kill Scryer's Bloom: Predict 2, draw 1, gain 1 XP",
    "Uništi Scryer's Bloom: predvidi 2, povuci 1, dobiješ 1 XP",
    "Distruggi Scryer's Bloom: prevedi 2, pesca 1, ottieni 1 XP",
  ],
  ["Equip {card}", "Opremi {card}", "Equipaggia {card}"],
  ["Attach to {card}", "Pridruži karti {card}", "Assegna a {card}"],
  [
    "Exhaust Fiora to channel a rune exhausted",
    "Iscrpi Fiora da kanalizuješ iscrpljenu runu",
    "Esaurisci Fiora per canalizzare una runa esaurita",
  ],
  [
    "Pay Order power to ready the Mighty unit",
    "Plati moć Order da pripremiš moćnu jedinicu",
    "Paga potere Order per preparare l'unità possente",
  ],
  ["Detach equipment", "Odvoji opremu", "Rimuovi l'equipaggiamento"],
  ["Detach the Equipment", "Odvoji opremu", "Rimuovi l'equipaggiamento"],
  [
    "Ravenbloom Conservatory reveals {card}.",
    "Ravenbloom Conservatory otkriva {card}.",
    "Ravenbloom Conservatory rivela {card}.",
  ],
  [
    "Recycle {card}; play {played} at {location}",
    "Recikliraj {card}; odigraj {played} na: {location}",
    "Ricicla {card}; gioca {played} su {location}",
  ],
  [
    "Rumble recycles {card} and plays {played}.",
    "Rumble reciklira {card} i igra {played}.",
    "Rumble ricicla {card} e gioca {played}.",
  ],
  [
    "Assembly Rig: recycle {card} for a Mech",
    "Assembly Rig: recikliraj {card} za Mech",
    "Assembly Rig: ricicla {card} per un Mech",
  ],
  // Recoverable engine errors exposed by the interface.
  [
    "Unpayable cost",
    "Nema dovoljno resursa za ovaj trošak",
    "Risorse insufficienti per pagare il costo",
  ],
  ["Missing token {name}", "Nedostaje žeton {name}", "Pedina {name} mancante"],
  [
    "Cannot overwrite an unresolved choice",
    "Nije moguće zameniti nerazrešen izbor",
    "Impossibile sovrascrivere una scelta non risolta",
  ],
  [
    "Unsupported special: {operation}",
    "Nepodržana posebna sposobnost: {operation}",
    "Abilità speciale non supportata: {operation}",
  ],
  [
    "Unimplemented effect operation: {operation}",
    "Efekat nije implementiran: {operation}",
    "Operazione dell'effetto non implementata: {operation}",
  ],
  [
    "Illegal action: {action}",
    "Nedozvoljena radnja: {action}",
    "Azione non valida: {action}",
  ],
  [
    "Action not implemented: {action}",
    "Radnja nije implementirana: {action}",
    "Azione non implementata: {action}",
  ],
  [
    "Invalid game save",
    "Nevažeća sačuvana partija",
    "Salvataggio della partita non valido",
  ],
];

// Full effect sentences must be more specific than generic card-resolution
// messages, or "You: special effect resolves." is parsed as a card named
// "You: special effect". Deriving these keeps fragments and logs consistent.
const narratedEffects: [string, string, string][] = englishMessages
  .filter(([en]) =>
    /^(deals |gives |grants Assault |stuns the |readies |kills the |moves the chosen |units deal |draw effect complete$|rune channel effect complete$|recruit effect begins$)| effect resolves$/.test(
      en,
    ),
  )
  .flatMap(
    ([en, sr, it]) =>
      [
        [`{player}: ${en}.`, `{player}: ${sr}.`, `{player}: ${it}.`],
        [
          `{player}: ${en} → {target}.`,
          `{player}: ${sr} → {target}.`,
          `{player}: ${it} → {target}.`,
        ],
      ] as [string, string, string][],
  );

/** Legacy import diagnostics are stored in Serbian. English remains the default
 * display language without changing parsing, deck identities or saved exports. */
export const gameMessages: Record<string, [string, string, string]> = {
  ...Object.fromEntries(
    [...englishMessages, ...narratedEffects].map(([en, sr, it]) => [
      en,
      [en, sr, it],
    ]),
  ),
  "base:0": ["your base", "tvoja baza", "la tua base"],
  "base:1": ["enemy base", "protivnička baza", "la base avversaria"],
  "field:0": ["battlefield 1", "bojište 1", "campo di battaglia 1"],
  "field:1": ["battlefield 2", "bojište 2", "campo di battaglia 2"],
  "Nepoznat ID karte: {card}": [
    "Unknown card ID: {card}",
    "Nepoznat ID karte: {card}",
    "ID carta sconosciuto: {card}",
  ],
  "Karta je zabranjena u standardnom Duelu: {card}": [
    "Card banned in Standard Duel: {card}",
    "Karta je zabranjena u standardnom Duelu: {card}",
    "Carta vietata nel Duello Standard: {card}",
  ],
  "Nevažeća količina za {card}: {count}": [
    "Invalid quantity for {card}: {count}",
    "Nevažeća količina za {card}: {count}",
    "Quantità non valida per {card}: {count}",
  ],
  "Glavni špil mora imati 39 karata uz 1 odabranog championa; trenutno {count}.":
    [
      "The main deck must contain 39 cards plus 1 chosen champion; currently {count}.",
      "Glavni špil mora imati 39 karata uz 1 odabranog šampiona; trenutno {count}.",
      "Il mazzo principale deve contenere 39 carte più 1 campione scelto; attualmente {count}.",
    ],
  "Rune deck mora imati 12 runa; trenutno {count}.": [
    "The rune deck must contain 12 runes; currently {count}.",
    "Špil runa mora imati 12 runa; trenutno {count}.",
    "Il mazzo delle rune deve contenere 12 rune; attualmente {count}.",
  ],
  "Potrebna je tačno jedna Legend karta.": [
    "Exactly one Legend card is required.",
    "Potrebna je tačno jedna karta Legende.",
    "È richiesta esattamente una carta Leggenda.",
  ],
  "Odabrani champion mora biti Champion Unit.": [
    "The chosen champion must be a Champion Unit.",
    "Odabrani šampion mora biti šampionska jedinica.",
    "Il campione scelto deve essere un'unità Campione.",
  ],
  "Odabrani champion mora dijeliti champion tag s legendom.": [
    "The chosen champion must share a champion tag with the legend.",
    "Odabrani šampion mora deliti šampionsku oznaku sa legendom.",
    "Il campione scelto deve condividere un tag campione con la leggenda.",
  ],
  "Domene odabranog championa ne odgovaraju legendi.": [
    "The chosen champion's domains do not match the legend.",
    "Domeni odabranog šampiona ne odgovaraju legendi.",
    "I domini del campione scelto non corrispondono alla leggenda.",
  ],
  "Domene špila moraju odgovarati legendi.": [
    "Deck domains must match the legend.",
    "Domeni špila moraju odgovarati legendi.",
    "I domini del mazzo devono corrispondere alla leggenda.",
  ],
  "Navedi 1 bojište za ovaj Duel ili komplet od 3 različita bojišta.": [
    "Provide 1 battlefield for this Duel or a set of 3 different battlefields.",
    "Navedi 1 bojište za ovaj Duel ili komplet od 3 različita bojišta.",
    "Indica 1 campo di battaglia per questo Duello o un insieme di 3 campi di battaglia diversi.",
  ],
  "Odabrano bojište mora pripadati špilu.": [
    "The selected battlefield must belong to the deck.",
    "Odabrano bojište mora pripadati špilu.",
    "Il campo di battaglia selezionato deve appartenere al mazzo.",
  ],
  "Bojišta moraju biti različita.": [
    "Battlefields must be different.",
    "Bojišta moraju biti različita.",
    "I campi di battaglia devono essere diversi.",
  ],
  "Različita izdanja istog bojišta nisu različita bojišta.": [
    "Different editions of the same battlefield do not count as different battlefields.",
    "Različita izdanja istog bojišta nisu različita bojišta.",
    "Edizioni diverse dello stesso campo di battaglia non contano come campi di battaglia diversi.",
  ],
  "Karta nije Battlefield: {card}": [
    "Card is not a Battlefield: {card}",
    "Karta nije bojište: {card}",
    "La carta non è un campo di battaglia: {card}",
  ],
  "Domene ne odgovaraju legendi: {card}": [
    "Domains do not match the legend: {card}",
    "Domeni ne odgovaraju legendi: {card}",
    "I domini non corrispondono alla leggenda: {card}",
  ],
  "Karta ne pripada glavnom špilu: {card}": [
    "Card does not belong in the main deck: {card}",
    "Karta ne pripada glavnom špilu: {card}",
    "La carta non appartiene al mazzo principale: {card}",
  ],
  "Najviše 3 kopije iste karte, uključujući odabranog championa: {card} ({count}).":
    [
      "Maximum 3 copies of the same card, including the chosen champion: {card} ({count}).",
      "Najviše 3 kopije iste karte, uključujući odabranog šampiona: {card} ({count}).",
      "Massimo 3 copie della stessa carta, incluso il campione scelto: {card} ({count}).",
    ],
  "Dozvoljena je samo 1 Unique karta: {card}": [
    "Only 1 copy of a Unique card is allowed: {card}",
    "Dozvoljena je samo 1 kopija jedinstvene karte: {card}",
    "È consentita solo 1 copia di una carta Unica: {card}",
  ],
  "Signature karta ne odgovara legendi: {card}": [
    "Signature card does not match the legend: {card}",
    "Potpisna karta ne odgovara legendi: {card}",
    "La carta distintiva non corrisponde alla leggenda: {card}",
  ],
  "Špil može sadržati najviše 3 Signature karte ukupno.": [
    "The deck may contain at most 3 Signature cards in total.",
    "Špil može sadržati najviše 3 potpisne karte ukupno.",
    "Il mazzo può contenere al massimo 3 carte distintive in totale.",
  ],
  "Nevažeća runa za ovu legendu: {card}": [
    "Invalid rune for this legend: {card}",
    "Nevažeća runa za ovu legendu: {card}",
    "Runa non valida per questa leggenda: {card}",
  ],
  "Lista je prevelika (najviše 100.000 znakova).": [
    "The list is too large (maximum 100,000 characters).",
    "Lista je prevelika (najviše 100.000 znakova).",
    "La lista è troppo lunga (massimo 100.000 caratteri).",
  ],
  "Nepoznat format: {format}": [
    "Unknown format: {format}",
    "Nepoznat format: {format}",
    "Formato sconosciuto: {format}",
  ],
  "Količina mora biti cijeli broj od 1 do 40.": [
    "Quantity must be a whole number from 1 to 40.",
    "Količina mora biti ceo broj od 1 do 40.",
    "La quantità deve essere un numero intero da 1 a 40.",
  ],
  "Više karata odgovara nazivu „{card}”. Koristi ID: {ids}.": [
    "Multiple cards match the name “{card}”. Use an ID: {ids}.",
    "Više karata odgovara nazivu „{card}”. Koristi ID: {ids}.",
    "Più carte corrispondono al nome «{card}». Usa un ID: {ids}.",
  ],
  "Nepoznata karta: {card}": [
    "Unknown card: {card}",
    "Nepoznata karta: {card}",
    "Carta sconosciuta: {card}",
  ],
  "Karta {card} ne pripada sekciji {section}.": [
    "Card {card} does not belong in the {section} section.",
    "Karta {card} ne pripada sekciji {section}.",
    "La carta {card} non appartiene alla sezione {section}.",
  ],
  "Navedi tačno jednu kartu u sekciji Legend.": [
    "Provide exactly one card in the Legend section.",
    "Navedi tačno jednu kartu u sekciji Legenda.",
    "Indica esattamente una carta nella sezione Leggenda.",
  ],
  "Navedi tačno jednog odabranog championa u sekciji Champion.": [
    "Provide exactly one chosen champion in the Champion section.",
    "Navedi tačno jednog odabranog šampiona u sekciji Šampion.",
    "Indica esattamente un campione scelto nella sezione Campione.",
  ],
  "Dodaj sekciju Battlefields s bojištem.": [
    "Add a Battlefields section containing a battlefield.",
    "Dodaj sekciju Bojišta sa bojištem.",
    "Aggiungi una sezione Campi di battaglia contenente un campo di battaglia.",
  ],
  "Odabrani champion izdvojen je iz liste od 40 karata; u glavnom špilu ostaje 39.":
    [
      "The chosen champion was separated from the 40-card list; 39 cards remain in the main deck.",
      "Odabrani šampion izdvojen je iz liste od 40 karata; u glavnom špilu ostaje 39.",
      "Il campione scelto è stato separato dalla lista di 40 carte; nel mazzo principale ne rimangono 39.",
    ],
  "{champion} · uvezeni špil": [
    "{champion} · imported deck",
    "{champion} · uvezeni špil",
    "{champion} · mazzo importato",
  ],
  Moj: ["My", "Moj", "Il mio"],
  "Uvezeni špil": ["Imported deck", "Uvezeni špil", "Mazzo importato"],
  "Lokalno uvezena lista karata.": [
    "Locally imported card list.",
    "Lokalno uvezena lista karata.",
    "Lista di carte importata localmente.",
  ],
  Srednje: ["Medium", "Srednje", "Media"],
  "Vlastita lista": ["Custom list", "Sopstvena lista", "Lista personalizzata"],
  "Imported deck": ["Imported deck", "Uvezeni špil", "Mazzo importato"],
};
