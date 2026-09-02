export const PROJECT_INFO_BODY = `PIERRON — PROJECTINFORMATIE
Versie 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. staat voor “PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK”,
of informeel CPDDC (Centralized Pool Decentralized Digital Currency).

Het is een cryptocurrency op Solana die door een combinatie van 49 verschillende mechanismen een autonoom, gedecentraliseerd ecosysteem vormt dat is ontworpen om de individuele gebruiker de hoogst mogelijke financiële veiligheid te bieden.

Het project is ontworpen met absolute transparantie tegenover de gebruiker en zodat de gebruiker het product niet hoeft te vertrouwen.

De regels die in het project zijn vastgelegd, zijn definitief en kunnen niet worden gewijzigd.

Het PIERRON-ecosysteem is volledig autonoom: het heeft geen beheerder nodig en heeft er ook geen. Het project heeft evenmin een helpdesk of klantenservice. Alle beslissingen en handelingen van een gebruiker binnen het ecosysteem vallen uitsluitend onder de verantwoordelijkheid van die gebruiker. De maker van het project is niet aansprakelijk voor verkeerde beslissingen of fouten van de gebruiker.

PIERRON heeft meer dan 2200 formele bewijzen zonder assume, admit, external_body, vacuity of underspecified branches.

━━━━━━━━━━━━━━━━━━━━
1. WAT IS PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron is een tokenprotocol op de Solana-blockchain. Economische regels (limieten, 1%-poolbijdrage, cooldown, herverdeling, loyaliteitsbonus, emissie en verbranding) worden on-chain afgedwongen door smartcontractprogramma's — ze staan niet alleen in documentatie beschreven.

De PIERRON-token (SPL Token-2022) combineert:

• officiële DEX-handel met limieten per transactie en cooldown,
• een bijdrage van 1% aan de herverdelingspool — terugvorderbaar na een activiteitencyclus (geen “straf voor handelen”),
• activiteitencycli en het claimen van een aandeel in de pool,
• een op volume gebaseerde loyaliteitsbonus,
• gecontroleerde emissie naar de marktpool plus een verbrandingsschema,
• een SOL-prijsvloerheffing op officiële swaps,
• Safe Send (meer private overdrachten) en Pierron Pay (betalingen aan handelaars).

De mobiele app en dapp bouwen transacties. De bron van waarheid voor de regels is de code die op Solana is geïmplementeerd.

━━━━━━━━━━━━━━━━━━━━
2. ONTWERPPRINCIPES
━━━━━━━━━━━━━━━━━━━━

• Regels in code — limieten en geschiktheid worden door het programma gecontroleerd.
• Activiteit boven grootschalige speculatie — harde maxima per transactie en per epoch.
• Een poolaandeel voor echte cyclusactiviteit, niet alleen voor passief bezit.
• Structurele deflatie — grote verbrandingstoewijzing en een vast verbrandingsschema.
• Gescheiden risicopaden — settlement en stealth zijn afzonderlijke programma's; uitbetalingen uit vaults vereisen geldige vouchers.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMICS (AANBOD)
━━━━━━━━━━━━━━━━━━━━

Eenheid: UI-token (6 decimalen on-chain).

Totaal aanbod: 150,000,000,000 PIERRON (150 miljard)

Toewijzing:
• Marktpool (escrow → DEX): 60B (40%)
• Ontwikkelaarswallet: 21B (14%)
• Loyaliteitsbonus: 7B (~4.7%)
• Verbranding (vault + schema): 56B (~37.3%)
• Treasury: 6B (4%)

Emissie: elk epoch geeft het protocol volgens een epochquotum tokens vrij vanuit escrow naar de DEX-pool — hoger bij genesis, daarna standaard.

Verbranding: vanuit de burn vault tegen een vast tempo gedurende ongeveer 20 kalenderjaren aan epochs, totdat de verbrandingstoewijzing is uitgeput.

Lengte epoch: 21,600 seconden (6 uur). Epoch 0 begint op de genesis-tijdstempel van het protocol.

━━━━━━━━━━━━━━━━━━━━
4. ARCHITECTUUR (KORT)
━━━━━━━━━━━━━━━━━━━━

• Pierron-programma — boekhouding, DEX-limieten, handelsregister, loyaliteitsbonus, herverdeling, ticks, verbranding, prijsvloer
• Transfer Hook — classificatie van Token-2022-overdrachten; limieten en 1%-bijdrage op officiële paden
• Settlement — uitbetalingen uit vaults (herverdeling, loyaliteitsbonus, keeperbeloningen) na voorbereiding van de voucher
• Stealth — registreren, verzenden en claimen (Safe Send)
• TradeBook / gebruikersaccount — activiteit, volume, tickets, epoch-bitmap, aantal claims
• Netwerkkeepers — laten epochs, emissie/verbranding en trekkingen doorgaan; ze claimen geen herverdeling of prijzen namens gebruikers

━━━━━━━━━━━━━━━━━━━━
5. HANDELSREGELS
━━━━━━━━━━━━━━━━━━━━

OFFICIEEL PAD
Handel via een swap in de Pierron-app (DEX-pool onder protocolbeleid), met limiet- en transfer-hook-instructies. Overdrachten buiten toegestane paden kunnen worden geweigerd of anders geclassificeerd.

1%-BIJDRAGE (TERUGVORDERBAAR — GEEN STRAF)
1% van het officiële handelsvolume gaat naar een gedeelde herverdelingspool. Dit is geen bestraffende heffing en geen permanente verbranding van je middelen: bij voldoende activiteit in het ecosysteem kun je na afloop van de cyclus jouw aandeel in de pool terugvorderen.

Een herverdelingscyclus duurt 28 epochs. Met epochs van 6 uur is dat 7 dagen. Nadat de cyclus sluit, claimen geschikte gebruikers hun aandeel uit de pool in de app.

Voorwaarde voor terugvordering: voldoende activiteit in de cyclus (waaronder ten minste 9 actieve epochs in de bitmap van 28 epochs en het aanhouden van ten minste 10 PIERRON) — zie Herverdeling. Zonder ecosysteemactiviteit is er geen poolaandeel; met de bijdrage plus activiteit bouwt handelen een recht op terugvordering uit de pool op — niet alleen handelskosten.

De 1%-bijdrage kan niet in de instellingen worden uitgeschakeld — ze maakt deel uit van het protocol.

PRIJSVLOER (SOL)
Officiële swaps vereisen een SOL-heffing die evenredig is aan het PIERRON-volume (100 lamports per 1 PIERRON). De middelen gaan naar de prijsvloer-treasury en kunnen de liquiditeit / vloer ondersteunen.

LIMIET PER TRANSACTIE
Het maximale aantal PIERRON per transactie hangt af van het aantal ontvangen herverdelingsclaims:

• 0–24 claims: 13,000,000 PIERRON
• ≥ 25 claims: 16,000,000 PIERRON
• ≥ 75 claims: 19,000,000 PIERRON
• ≥ 175 claims: 24,000,000 PIERRON
• ≥ 375 claims: 34,000,000 PIERRON (maximum)

COOLDOWN TUSSEN SWAPS
• 0–24 claims: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Een te vroege swappoging wordt on-chain geweigerd.

EERSTE SWAP
De eerste officiële transactie op een account moet ten minste 2 PIERRON bedragen.

GLOBALE VERKOOPLIMIET PER EPOCH
Alle verkopen door alle gebruikers in een epoch delen een plafond dat stijgt met het totale aantal protocolclaims:

• minder dan 25 claims total: 2,000,000,000 PIERRON
• minder dan 75: 3,000,000,000
• minder dan 175: 5,000,000,000
• minder dan 375: 7,000,000,000
• 375+: 9,000,000,000

Er gelden ook volume- en transactielimieten per gebruiker per epoch (waaronder maximaal 100 txs per epoch en een volumelimiet per gebruiker).

━━━━━━━━━━━━━━━━━━━━
6. HERVERDELING — DE 1%-BIJDRAGE TERUGVORDEREN
━━━━━━━━━━━━━━━━━━━━

WAAROM 1% BESTAAT
Elke officiële swap plaatst 1% in een gedeelde pool. Na 28 epochs (7 dagen bij epochs van 6 uur) wordt de pool verdeeld onder mensen die voldoende actief waren in het ecosysteem. Actief handelen + cyclusactiviteit = het recht om uit de pool te claimen. Inactiviteit = geen aandeel. Dit is een loyaliteits-/bijdrageterugvorderingsmechanisme, geen straf voor handelen.

De 1%-bijdrage is ontworpen om een deel van het kapitaal tijdelijk in het ecosysteem te binden en Sybil-aanvallen indirect te ontmoedigen.

BRON VAN DE POOL
De 1%-bijdrage uit officiële swaps financiert de herverdelingsvault.

CYCLUS EN TIMING
• cyclus: 28 epochs = 7 dagen (epoch = 6 h),
• nadat de cyclus sluit, wordt de pool verdeeld (aandeel ≈ pool / aantal geschikte deelnemers),
• claim in de app zodra aan de voorwaarden is voldaan.

GESCHIKTHEID (VOLDOENDE ACTIVITEIT)
• ten minste 9 actieve epochs in de bitmap van 28 epochs,
• een saldo van ten minste 10 PIERRON aanhouden,
• door het protocol erkende activiteit (officiële handel / protocolpaden).

CLAIMEN
• de gebruiker start de claim in de app (prepare → settle → consume),
• keepers claimen niet namens de gebruiker,
• vouchers blijven ongeveer 28 epochs geldig — niet-geclaimde vouchers kunnen verlopen,
• de protocolclaimheffing in PIERRON is 0; de gebruiker betaalt de SOL-netwerkvergoeding,
• een geslaagde claim verhoogt de claimteller → hogere swaplimiet en kortere cooldown.

━━━━━━━━━━━━━━━━━━━━
7. LOYALITEITSBONUS
━━━━━━━━━━━━━━━━━━━━

TICKETS
• verdiend via officieel handelsvolume (drempel: 10 PIERRON volume → 1 ticket),
• maximaal 50 tickets per gebruiker per venster,
• trekkingsvensters om de 7 epochs binnen de cyclus van 28 epochs.

TREKKING
• keepers dienen randomness commits in (commit–reveal),
• trekkingen vereisen een minimumaantal commits (productievloer: 20) en een minimale ticketpool,
• na het venster: trekken of overslaan (te weinig tickets),
• prijs: 2,000,000 PIERRON per trekking (uit de loyaliteitsbonustoewijzing),
• uitbetaling: prepare → settle → claim door de winnaar.

GELDIGHEID VOUCHER
De voucher om de lottery-airdrop te claimen is 7 epochs geldig en verloopt daarna.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND EN PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Registreren → verzenden naar stealth vault → claim door ontvanger. De claim kan twee transacties vereisen. Dit is een meer privaat overdrachtspad — het omzeilt de swaplimieten of de 1%-bijdrage niet.

PIERRON PAY
Betaling aan een handelaarsaccount met een pay-instructie. De hook classificeert de overdracht als Pay, niet als een normale DEX-verkoop.

REGELS
• gebruik deze paden niet om officiële handelslimieten of de 1%-bijdrage te omzeilen,
• controleer vóór verzending altijd het adres / de QR-code van de ontvanger — on-chain fouten zijn onomkeerbaar.

━━━━━━━━━━━━━━━━━━━━
9. REGELS VOOR APPGEBRUIK
━━━━━━━━━━━━━━━━━━━━

1. Verbind alleen een vertrouwde wallet. Deel je seed phrase nooit met “support” of vreemden.
2. Swap: keur de volledige reeks goed in de wallet; sluit de wallet niet tijdens het ondertekenen.
3. Respecteer de cooldown — opnieuw tikken omzeilt de on-chain regels niet.
4. Claim voor herverdeling / loyaliteitsbonus: alleen wanneer de app aangeeft dat alles gereed is; wacht na succes op netwerksynchronisatie vóór de volgende swap.
5. Op Android (agressieve OEM's): blijf in de wallet tot CONFIRM en keer dan terug naar Pierron; beëindig de app niet op de achtergrond.
6. Verboden: aanvallen op programma's, phishing onder de naam Pierron, RPC-spam, pogingen om settlement / hook te misbruiken.

━━━━━━━━━━━━━━━━━━━━
10. ECONOMISCHE CYCLUS
━━━━━━━━━━━━━━━━━━━━

Escrow geeft elk epoch tokens vrij aan de DEX-pool.
Handel plaatst een 1%-bijdrage in de herverdelingspool (terugvorderbaar na 7 dagen / 28 epochs bij voldoende activiteit), levert loyaliteitsbonustickets op en brengt de SOL-prijsvloerheffing in rekening.
Activiteit in de cyclus van 28 epochs kwalificeert je om een aandeel in de pool terug te vorderen.
De loyaliteitsbonustrekkingen vinden plaats in vensters van 7 epochs.
Verbranding verlaagt tegelijkertijd het aanbod volgens schema.
Gebruikers claimen zelf herverdeling en prijzen; keepers onderhouden de protocolklok.

━━━━━━━━━━━━━━━━━━━━
11. RISICO'S
━━━━━━━━━━━━━━━━━━━━

• risico van smart contracts en upgrades,
• marktrisico voor de PIERRON-prijs (geen gegarandeerde stijging ondanks verbranding / vloer),
• SOL-kosten voor mislukte of herhaalde transacties,
• geen winstgarantie — herverdeling en de loyaliteitsbonus zijn geen depositoproduct.

Gebruik van de app betekent dat je de on-chain regels en bovenstaande risico's accepteert.

Pierron — transparante tokenomics en echt gebruik.`;
