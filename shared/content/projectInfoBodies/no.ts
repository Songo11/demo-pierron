export const PROJECT_INFO_BODY = `PIERRON — PROSJEKTINFO
Versjon 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. står for "PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK",
eller i daglig tale CPDDC (Centralized Pool Decentralized Digital Currency).

Det er en kryptovaluta på Solana som, gjennom en kombinasjon av 49 distinkte mekanismer, danner et autonomt, desentralisert økosystem designet for å levere den høyeste formen for økonomisk sikkerhet for den enkelte bruker.

Prosjektet ble designet for absolutt åpenhet overfor brukeren og slik at brukeren ikke trenger å stole på produktet.

Reglene som er innebygd i prosjektet er endelige og kan ikke endres.

PIERRON-økosystemet er fullstendig autonomt: det krever ingen administrator og har ingen. Prosjektet har heller ingen støttedesk eller kundeservice. Alle beslutninger og handlinger tatt av en bruker i økosystemet er utelukkende brukerens ansvar. Prosjektskaperen er ikke ansvarlig for brukerens feilbeslutninger eller feil.

PIERRON har over 2200 formelle bevis uten assume, admit, external_body, vacuity eller underspecified branches.

━━━━━━━━━━━━━━━━━━━━
1. HVA ER PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron er en token-protokoll på Solana-blokkjeden. Økonomiske regler (grenser, 1% poolbidrag, nedkjøling, redistribuering, lojalitetsbonus, utslipp og forbrenning) håndheves på kjeden av smartkontraktsprogrammer – ikke bare beskrevet i dokumentasjonen.

PIERRON-tokenet (SPL Token-2022) kombinerer:

• offisiell DEX-handel med grenser per handel og nedkjøling,
• et bidrag på 1% til omfordelingspoolen – gjenvinnbart etter en aktivitetssyklus (ikke en «straff for handel»),
• aktivitetssykluser og krav på en andel av bassenget,
• en volumbasert lojalitetsbonus,
• kontrollert utslipp til markedspoolen pluss en brennplan,
• et SOL-gulvgebyr på offisielle bytteavtaler,
• Safe Send (flere private overføringer) og Pierron Pay (kjøpmannbetalinger).

Mobilappen og dapp bygger transaksjoner. Kilden til sannhet for regler er koden som er distribuert på Solana.

━━━━━━━━━━━━━━━━━━━━
2. DESIGNPRINSIPPER
━━━━━━━━━━━━━━━━━━━━

• Regler i kode — grenser og kvalifisering kontrolleres av programmet.
• Aktivitet over engrosspekulasjon — harde tak per transaksjon og per epoke.
• Bassengandel for ekte syklusaktivitet, ikke for tomgang alene.
• Strukturell deflasjon — stor forbrenningsallokering og en fast forbrenningsplan.
• Separerte risikobaner — oppgjør og stealth er separate programmer; hvelvutbetalinger krever gyldige kuponger.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMICS (LEVERANDØR)
━━━━━━━━━━━━━━━━━━━━

Enhet: UI-token (6 desimaler på kjeden).

Total forsyning: 150,000,000,000 PIERRON (150 milliarder)

Tildeling:
• Markedspool (escrow → DEX): 60B (40%)
• Utviklerlommebok: 21B (14%)
• Lojalitetsbonus: 7B (~4.7%)
• Brenn (hvelv + tidsplan): 56B (~37.3%)
• Treasury: 6B (4%)

Utslipp: hver epoke frigir protokollen token fra escrow til DEX-poolen etter en epokekvote — høyere ved genesis, deretter standard.

Forbrenning: fra brennhvelvet med fast hastighet over ca. 20 kalenderår med epoker til branntildelingen er oppbrukt.

Epokelengde: 21,600 sekunder (6 timer). Epoke 0 starter ved protokollens genesetidsstempel.

━━━━━━━━━━━━━━━━━━━━
4. ARKITEKTUR (KORT)
━━━━━━━━━━━━━━━━━━━━

• Pierron-program — regnskap, DEX-grenser, handelsbok, lojalitetsbonus, redistribuering, ticks, burn, prisgulv
• Transfer Hook — Token-2022 overføringsklassifisering; grenser og 1% bidrag på offisielle veier
• Settlement — hvelvutbetalinger (omfordeling, lojalitetsbonus, keeper-belønninger) etter at kupongen er klargjort
• Stealth — registrer, send og gjør krav (Safe Send)
• TradeBook / brukerkonto — aktivitet, volum, billetter, epoke punktgrafikk, antall krav
• Nettverksholdere — fremme epoker, emission/burn og draws; de krever ikke omfordeling eller premier for brukere

━━━━━━━━━━━━━━━━━━━━
5. HANDELSREGLER
━━━━━━━━━━━━━━━━━━━━

OFFISIELL VEI
Handle via swap i Pierron-appen (DEX-pool under protokollpolicy), med instruksjoner for grense og overføringskrok. Overføringer utenfor tillatte stier kan bli avvist eller klassifisert annerledes.

1% BIDRAG (KAN GJENNOMFØRES – IKKE EN STRAFF)
1% av det offisielle handelsvolumet går inn i en delt omfordelingspool. Dette er ikke en straffavgift og ikke en permanent forbrenning av midlene dine: med nok økosystemaktivitet kan du kreve tilbake din andel av bassenget etter at syklusen er over.

En omfordelingssyklus varer i 28 epoker. Med 6-timers epoker er det 7 dager. Etter at syklusen er avsluttet, krever kvalifiserte brukere sin andel fra bassenget i appen.

Gjenopprettingstilstand: tilstrekkelig aktivitet i syklusen (inkludert minst 9 aktive epoker i 28-epokens punktgrafikk og opprettholdelse av minst 10 PIERRON) — se Omfordeling. Uten økosystemaktivitet er det ingen poolandel; med bidraget pluss aktiviteten bygger handel opp en rett til å kreve tilbake fra poolen – ikke bare en handelskostnad.

Bidraget på 1% kan ikke deaktiveres i innstillingene – det er en del av protokollen.

PRISGULV (SOL)
Offisielle bytteavtaler krever en SOL-avgift proporsjonal med PIERRON-volum (100 lamports per 1 PIERRON). Midlene går til prisgulvets statskasse og kan støtte likviditet/gulv.

PER TRANSAKSJONSGRENSE
Maksimal PIERRON per transaksjon avhenger av omfordelte krav mottatt:

• 0–24 krav: 13,000,000 PIERRON
• ≥ 25 krav: 16,000,000 PIERRON
• ≥ 75 krav: 19,000,000 PIERRON
• ≥ 175 krav: 24,000,000 PIERRON
• ≥ 375 krav: 34,000,000 PIERRON (tak)

NEDKJØLING MELLOM BYTTER
• 0–24 krav: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Et tidlig bytteforsøk avvises på kjeden.

FØRSTE BYTT
Den første offisielle transaksjonen på en konto må være minst 2 PIERRON.

GLOBAL SALGSGRENSE PER EPOKE
Totalt antall salg av alle brukere i en epoke deler et tak som stiger med totale protokollkrav:

• under 25 krav total: 2,000,000,000 PIERRON
• under 75: 3,000,000,000
• under 175: 5,000,000,000
• under 375: 7,000,000,000
• 375+: 9,000,000,000

Volum- og transaksjonstak per bruker gjelder også (inkludert opptil 100 txs per epoke og et volumtak per bruker).

━━━━━━━━━━━━━━━━━━━━
6. REDISTRIBUSJON — GJENNINN BIDRAGET på 1%
━━━━━━━━━━━━━━━━━━━━

HVORFOR FINNES 1%
Hver offisiell swap plasserer 1% i en delt pool. Etter 28 epoker (7 dager ved 6-timers epoker) deles bassenget mellom mennesker som var aktive nok i økosystemet. Aktiv handel + syklusaktivitet = retten til å kreve fra poolen. Inaktivitet = ingen deling. Dette er en lojalitets-/bidragsgjenopprettingsmekanisme, ikke en straff for handel.

Bidraget på 1% er utformet for å binde en del av kapitalen i økosystemet midlertidig og indirekte motvirke Sybil-angrep.

KILDE TIL FONDET
Bidraget på 1% fra offisielle bytteavtaler finansierer omfordelingshvelvet.

SYKLUS OG TIDSPUNKT
• syklus: 28 epoker = 7 dager (epoke = 6 t),
• etter at syklusen er avsluttet deles bassenget (andel ≈ pool / kvalifisert antall),
• krav i appen når kvalifikasjonen er oppfylt.

KVALIFIKASJON (TILSTREKKELIG AKTIVITET)
• minst 9 aktive epoker i 28-epoker bitmap,
• opprettholde minst 10 PIERRON balanse,
• aktivitet gjenkjent av protokollen (offisielle handels-/protokollbaner).

INNLØSING
• brukeren starter krav i appen (forbered → gjøre opp → konsumere),
• innehavere gjør ikke krav på brukeren,
• kuponger forblir gyldige i størrelsesorden 28 epoker – uavhentede epoker kan utløpe,
• protokollkravsgebyr i PIERRON er 0; brukeren betaler SOL nettverksavgift,
• et vellykket krav øker kravtelleren → høyere byttegrense og kortere nedkjøling.

━━━━━━━━━━━━━━━━━━━━
7. LOJALITETSBONUS
━━━━━━━━━━━━━━━━━━━━

BILLETTER
• opptjent fra offisielt handelsvolum (terskel: 10 PIERRON volum → 1 billett),
• maks 50 billetter per bruker per vindu,
• tegne vinduer hver 7. epoke innenfor syklusen på 28 epoker.

TREKK
• keepers sender inn tilfeldighetsforpliktelser (commit–reveal),
• trekninger krever et minimum antall forpliktelser (produksjonsgulv: 20) og en minimumsbillettpott,
• etter vinduet: trekning eller hopp (for få billetter),
• premie: 2,000,000 PIERRON per trekning (fra lojalitetsbonustildelingen),
• utbetaling: forberede → gjøre opp → krav fra vinneren.

KUPONGENS GYLDIGHET
Kupongen for å kreve lotteriets airdrop er gyldig i 7 epoker, og utløper deretter.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND OG PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Registrer → send til stealth vault → mottakerkrav. Krav kan kreve to transaksjoner. Dette er en mer privat overføringsvei - den omgår ikke byttegrenser eller bidraget på 1%.

PIERRON PAY
Betaling til kjøpmannskonto med betalingsinstruks. Kroken klassifiserer overføringen som Pay, ikke som en vanlig DEX-salg.

REGLER
• ikke bruk disse banene til å omgå offisielle handelsgrenser eller bidraget på 1%,
• bekreft alltid mottakeradressen / QR før sending — feil i kjeden er irreversible.

━━━━━━━━━━━━━━━━━━━━
9. REGLER FOR APPBRUK
━━━━━━━━━━━━━━━━━━━━

1. Koble kun til en pålitelig lommebok. Del aldri frøsetningen din med "støtte" eller fremmede.
2. Bytt: godkjenne hele sekvensen i lommeboken; ikke lukk lommeboken midt i signaturen.
3. Respekter nedkjøling — å trykke på nytt overstyrer ikke regler i kjeden.
4. Omfordeling / lojalitetsbonuskrav: bare når appen viser beredskap; etter suksess vent på nettverkssynkronisering før neste bytte.
5. På Android (aggressive OEM-er): hold deg i lommeboken til CONFIRM, og gå deretter tilbake til Pierron; ikke drep appen i bakgrunnen.
6. Forbudt: angrep på programmer, phishing under Pierron-navnet, RPC spam, forsøk på oppgjør/haking.

━━━━━━━━━━━━━━━━━━━━
10. ØKONOMISK SLØYKE
━━━━━━━━━━━━━━━━━━━━

Escrow frigjør tokens i DEX-bassenget hver epoke.
Trading plasserer et bidrag på 1% til omfordelingspoolen (kan gjenvinnes etter 7 dager / 28 epoker med tilstrekkelig aktivitet), lojalitetsbonusbilletter og SOL-pris-gulvavgiften.
Aktivitet i den 28-epoke syklusen kvalifiserer deg til å ta tilbake en del av bassenget.
Lojalitetsbonusen trekker i 7-epoke vinduer.
Burn reduserer tilførselen parallelt etter planen.
Brukere krever omfordeling og premier selv; keepers opprettholder protokollklokken.

━━━━━━━━━━━━━━━━━━━━
11. RISIKO
━━━━━━━━━━━━━━━━━━━━

• smart-kontrakt og oppgraderingsrisiko,
• markedsrisiko for PIERRON-pris (ingen garantert oppside til tross for forbrenning/gulv),
• SOL-avgifter på mislykkede eller gjentatte transaksjoner,
• ingen fortjenestegaranti — omfordeling og lojalitetsbonusen er ikke et innskuddsprodukt.

Å bruke appen betyr å akseptere kjederegler og risikoene ovenfor.

Pierron — gjennomsiktig tokenomics og reell bruk.`;
