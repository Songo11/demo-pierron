export const PROJECT_INFO_BODY = `PIERRON — PROJEKTINFO
Version 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. står för "PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK",
eller i vardagsspråk CPDDC (Centralized Pool Decentralized Digital Currency).

Det är en kryptovaluta på Solana som, genom en kombination av 49 distinkta mekanismer, bildar ett autonomt, decentraliserat ekosystem designat för att leverera den högsta formen av ekonomisk säkerhet för den enskilda användaren.

Projektet utformades för absolut transparens gentemot användaren och så att användaren inte behöver lita på produkten.

Reglerna som är inbäddade i projektet är slutgiltiga och kan inte ändras.

PIERRON-ekosystemet är helt autonomt: det kräver ingen administratör och har ingen. Projektet har inte heller någon supportdesk eller kundtjänst. Alla beslut och åtgärder som tas av en användare i ekosystemet är enbart användarens ansvar. Projektskaparen är inte ansvarig för användarens felaktiga beslut eller fel.

PIERRON har över 2200 formella bevis utan assume, admit, external_body, vacuity eller underspecified branches.

━━━━━━━━━━━━━━━━━━━━
1. VAD ÄR PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron är ett tokenprotokoll på blockkedjan Solana. Ekonomiska regler (gränser, 1% poolbidrag, nedkylning, omfördelning, lojalitetsbonus, utsläpp och förbränning) upprätthålls i kedjan av smarta kontraktsprogram – inte bara beskrivna i dokumentationen.

PIERRON token (SPL Token-2022) kombinerar:

• officiell DEX-handel med gränser per handel och nedkylning,
• ett bidrag på 1% till omfördelningspoolen — återvinningsbart efter en aktivitetscykel (inte en "påföljd för handel")
• aktivitetscykler och göra anspråk på en andel av poolen,
• en volymbaserad lojalitetsbonus,
• kontrollerat utsläpp till marknadspoolen plus ett förbränningsschema,
• en SOL bottenavgift på officiella swappar,
• Safe Send (fler privata överföringar) och Pierron Pay (handlarbetalningar).

Mobilappen och dapp bygger transaktioner. Källan till sanning för regler är koden som distribueras på Solana.

━━━━━━━━━━━━━━━━━━━━
2. DESIGNPRINCIPER
━━━━━━━━━━━━━━━━━━━━

• Regler i kod – gränser och behörighet kontrolleras av programmet.
• Aktivitet över grossistspekulation — hårda tak per transaktion och per epok.
• Poolandel för riktig cykelaktivitet, inte för att hålla i tomgång ensam.
• Strukturell deflation — stor förbränningstilldelning och ett fast förbränningsschema.
• Separerade riskvägar – avveckling och smyg är separata program; valvutbetalningar kräver giltiga kuponger.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMICS (UTSÖKNING)
━━━━━━━━━━━━━━━━━━━━

Enhet: UI-token (6 decimaler i kedjan).

Totalt utbud: 150,000,000,000 PIERRON (150 miljarder)

Tilldelning:
• Marknadspool (escrow → DEX): 60B (40%)
• Utvecklarplånbok: 21B (14%)
• Lojalitetsbonus: 7B (~4.7%)
• Bränning (valv + schema): 56B (~37.3%)
• Treasury: 6B (4%)

Emission: varje epok frigör protokollet token från escrow till DEX-poolen enligt en epokkvot — högre vid genesis, därefter standard.

Bränning: från brinnvalvet med fast takt över cirka 20 kalenderår av epoker tills brinntilldelningen är uttömd.

Epoklängd: 21,600 sekunder (6 timmar). Epok 0 startar vid protokollets uppkomsttidsstämpel.

━━━━━━━━━━━━━━━━━━━━
4. ARKITEKTUR (KORTHET)
━━━━━━━━━━━━━━━━━━━━

• Pierron-program — bokföring, DEX-gränser, handelsbok, lojalitetsbonus, omfördelning, tick, burn, prisgolv
• Transfer Hook — Token-2022 överföringsklassificering; gränser och 1% bidrag på officiella vägar
• Settlement — valvutbetalningar (omfördelning, lojalitetsbonus, keeper-belöningar) efter att kupongen har förberetts
• Stealth — registrera, skicka och göra anspråk (Safe Send)
• TradeBook / användarkonto — aktivitet, volym, biljetter, epokbitmapp, antal anspråk
• Nätverkshållare — förflytta epoker, emission/burn, och draws; de gör inte anspråk på omfördelning eller priser för användare

━━━━━━━━━━━━━━━━━━━━
5. HANDELSREGLER
━━━━━━━━━━━━━━━━━━━━

OFFICIELL VÄG
Handla via swap i Pierron-appen (DEX pool enligt protokollpolicy), med instruktioner för limit och transfer-hook. Överföringar utanför tillåtna banor kan avvisas eller klassificeras på annat sätt.

1% BIDRAG (ÅTERTAGNINGSBAR – INTE EN STRAFF)
1% av den officiella handelsvolymen går till en delad omfördelningspool. Detta är inte en straffavgift och inte en permanent förbränning av dina pengar: med tillräckligt med ekosystemaktivitet kan du återta din del av poolen efter att cykeln är slut.

En omfördelningscykel varar i 28 epoker. Med 6-timmars epoker är det 7 dagar. När cykeln har avslutats gör kvalificerade användare anspråk på sin andel från poolen i appen.

Återställningsvillkor: tillräcklig aktivitet i cykeln (inklusive minst 9 aktiva epoker i bitmappen på 28 epoker och bibehållande av minst 10 PIERRON) — se Omfördelning. Utan ekosystemaktivitet finns det ingen poolandel; med bidraget plus aktiviteten bygger handel upp en rätt att återkräva från poolen – inte bara en handelskostnad.

Bidraget på 1% kan inte inaktiveras i inställningarna – det är en del av protokollet.

PRISGOLV (SOL)
Officiella byten kräver en SOL-avgift som är proportionell mot volymen PIERRON (100 lamports per 1 PIERRON). Medel går till pris-golvets statskassan och kan stödja likviditet/golv.

GRÄNS PER TRANSAKTION
Maximalt PIERRON per transaktion beror på mottagna omfördelade anspråk:

• 0–24 anspråk: 13,000,000 PIERRON
• ≥ 25 anspråk: 16,000,000 PIERRON
• ≥ 75 anspråk: 19,000,000 PIERRON
• ≥ 175 anspråk: 24,000,000 PIERRON
• ≥ 375 anspråk: 34,000,000 PIERRON (tak)

VÄNTETID MELLAN SWAPS
• 0–24 anspråk: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Ett tidigt bytesförsök avvisas på kedjan.

FÖRSTA BYTE
Den första officiella transaktionen på ett konto måste vara minst 2 PIERRON.

GLOBAL EPOCH SÄLJ CAP
Totala försäljningar av alla användare under en epok delar ett tak som stiger med totala protokollanspråk:

• under 25 anspråk total: 2,000,000,000 PIERRON
• under 75: 3,000,000,000
• under 175: 5,000,000,000
• under 375: 7,000,000,000
• 375+: 9,000,000,000

Volym- och transaktionstak per användare gäller också (inklusive upp till 100 txs per epok och ett volymtak per användare).

━━━━━━━━━━━━━━━━━━━━
6. OMDISTRIBUTION — ATT ÅTERHÄLLA 1% BIDRAG
━━━━━━━━━━━━━━━━━━━━

VARFÖR FINNS 1%
Varje officiellt byte placerar 1% i en delad pool. Efter 28 epoker (7 dagar vid 6-timmarsepoker) är poolen uppdelad mellan människor som var tillräckligt aktiva i ekosystemet. Aktiv handel + cykelaktivitet = rätten till anspråk från poolen. Inaktivitet = ingen delning. Detta är en lojalitets-/bidragsåtervinningsmekanism, inte en påföljd för handel.

Bidraget på 1% är utformat för att tillfälligt binda en del av kapitalet i ekosystemet och för att indirekt motverka Sybil-attacker.

POOL KÄLLA
Bidraget på 1% från officiella swappar finansierar omfördelningsvalvet.

CYKEL OCH TID
• cykel: 28 epoker = 7 dagar (epok = 6 timmar),
• efter att cykeln har avslutats delas poolen (andel ≈ pool / kvalificerat antal),
• gör anspråk i appen när kvalificeringen är uppfylld.

BEHÖRIGHET (TILLRÄCKLIG AKTIVITET)
• minst 9 aktiva epoker i bitmappen på 28 epoker,
• upprätthålla minst 10 PIERRON balans,
• aktivitet som känns igen av protokollet (officiella handels-/protokollvägar).

UTTAG
• användaren initierar anspråk i appen (förbered → kvitta → konsumera),
• innehavare gör inte anspråk på användaren,
• kuponger förblir giltiga i storleksordningen 28 epoker — outtagna kan löpa ut,
• protokollavgiften i PIERRON är 0; användaren betalar SOL nätverksavgift,
• ett framgångsrikt anspråk höjer anspråksräknaren → högre bytesgräns och kortare nedkylning.

━━━━━━━━━━━━━━━━━━━━
7. LOJALITETSBONUS
━━━━━━━━━━━━━━━━━━━━

BILJETTER
• tjänat från officiell handelsvolym (tröskel: 10 PIERRON volym → 1 biljett),
• max 50 biljetter per användare och fönster,
• rita fönster var 7:e epoker inom 28-epokens cykel.

DRAG
• keepers skickar in slumpmässiga commits (commit–reveal),
• dragningar kräver ett lägsta antal åtaganden (produktionsgolv: 20) och en lägsta biljettpott,
• efter fönstret: dra eller hoppa över (för få lotter),
• pris: 2,000,000 PIERRON per dragning (från lojalitetsbonustilldelningen),
• utbetalning: förbered → avgör → anspråk av vinnaren.

KUPONGENS GILTIGHET
Kupongen för att hämta lotteriets airdrop är giltig i 7 epoker och löper sedan ut.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND OCH PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Registrera → skicka till stealth vault → mottagaren anspråk. Anspråk kan kräva två transaktioner. Detta är en mer privat överföringsväg – den kringgår inte bytesgränser eller bidraget på 1%.

PIERRON PAY
Betalning till ett handelskonto med betalningsinstruktion. Kroken klassificerar överföringen som Pay, inte som en normal DEX försäljning.

REGLER
• använd inte dessa vägar för att kringgå officiella handelsgränser eller bidraget på 1%,
• verifiera alltid mottagaradressen / QR innan du skickar — misstag i kedjan är oåterkalleliga.

━━━━━━━━━━━━━━━━━━━━
9. REGLER FÖR ANVÄNDNING AV APPEN
━━━━━━━━━━━━━━━━━━━━

1. Anslut endast en pålitlig plånbok. Dela aldrig din fröfras med "support" eller främlingar.
2. Byt: godkänn hela sekvensen i plånboken; stäng inte plånboken mitt i signaturen.
3. Respektera nedkylning — att trycka igen åsidosätter inte reglerna i kedjan.
4. Omfördelning / lojalitetsbonusanspråk: endast när appen visar beredskap; efter framgång vänta på nätverkssynkronisering innan nästa byte.
5. På Android (aggressiva OEM-tillverkare): stanna i plånboken tills CONFIRM, återvänd sedan till Pierron; döda inte appen i bakgrunden.
6. Förbjudet: attacker mot program, nätfiske under Pierron-namnet, RPC spam, uppgörelse / hook exploit-försök.

━━━━━━━━━━━━━━━━━━━━
10. EKONOMISK LOOP
━━━━━━━━━━━━━━━━━━━━

Escrow släpper ut tokens i DEX-poolen varje epok.
Vid handel placeras ett bidrag på 1% till omfördelningspoolen (återställbart efter 7 dagar / 28 epoker med tillräcklig aktivitet), lojalitetsbonusbiljetter och SOL-pris-minimiavgiften.
Aktivitet i 28-epokens cykel kvalificerar dig att återta en del av poolen.
Lojalitetsbonusen drar i 7-epokfönster.
Burn minskar utbudet parallellt enligt schemat.
Användare gör anspråk på omfördelning och priser själva; keepers underhåller protokollklockan.

━━━━━━━━━━━━━━━━━━━━
11. RISKER
━━━━━━━━━━━━━━━━━━━━

• smarta kontrakt och uppgraderingsrisk,
• marknadsrisk för PIERRON pris (ingen garanterad uppsida trots brännskador/golv),
• SOL avgifter för misslyckade eller upprepade transaktioner,
• ingen vinstgaranti — omfördelning och lojalitetsbonus är inte en insättningsprodukt.

Att använda appen innebär att acceptera on-chain-regler och riskerna ovan.

Pierron — transparent tokenomics och verklig användning.`;
