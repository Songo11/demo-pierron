export const PROJECT_INFO_BODY = `PIERRON — INFO PËR PROJEKTIN
Versioni 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. do të thotë "PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK",
ose bisedore CPDDC (Centralized Pool Decentralized Digital Currency).

Është një kriptomonedhë në Solana që, nëpërmjet një kombinimi të mekanizmave të veçantë 49, formon një ekosistem autonom dhe të decentralizuar, i krijuar për të ofruar formën më të lartë të sigurisë financiare për përdoruesin individual.

Projekti është krijuar për transparencë absolute ndaj përdoruesit dhe në mënyrë që përdoruesi të mos ketë nevojë t'i besojë produktit.

Rregullat e përfshira në projekt janë përfundimtare dhe nuk mund të ndryshohen.

Ekosistemi PIERRON është plotësisht autonom: nuk kërkon administrator dhe nuk ka asnjë. Projekti gjithashtu nuk ka tavolinë mbështetëse ose shërbim ndaj klientit. Të gjitha vendimet dhe veprimet e marra nga një përdorues në ekosistem janë vetëm përgjegjësi e përdoruesit. Krijuesi i projektit nuk është përgjegjës për vendimet ose gabimet e gabuara të përdoruesit.

PIERRON ka mbi 2200 prova zyrtare pa assume, admit, external_body, vacuity ose degë të nënspecifikuara.

━━━━━━━━━━━━━━━━━━━━
1. ÇFARË ËSHTË PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron është një protokoll token në zinxhirin bllokues Solana. Rregullat ekonomike (kufijtë, kontributi i grupit  1%, ftohja, rishpërndarja, bonusi i besnikërisë, emetimi dhe djegia) zbatohen në zinxhir nga programet e kontratës inteligjente - jo thjesht të përshkruara në dokumentacion.

Shenja PIERRON (SPL Token-2022) kombinon:

• Tregtimi zyrtar i DEX me kufizime për tregti dhe ftohje,
• një kontribut 1% në grupin e rishpërndarjes — i rikuperueshëm pas një cikli aktiviteti (jo një "gjobë për tregtimin"),
• ciklet e aktivitetit dhe pretendimi i një pjese të grupit,
• një bonus besnikërie bazuar në vëllim,
• emetimi i kontrolluar në pishinën e tregut plus një orar djegieje,
• një tarifë SOL për këmbimet zyrtare,
• Safe Send (më shumë transferta private) dhe Pierron Pay (pagesat e tregtarëve).

Aplikacioni celular dhe dapp ndërtojnë transaksione. Burimi i së vërtetës për rregullat është kodi i vendosur në Solana.

━━━━━━━━━━━━━━━━━━━━
2. PARIMET E PROJEKTIMIT
━━━━━━━━━━━━━━━━━━━━

• Rregullat në kod — kufizimet dhe përshtatshmëria kontrollohen nga programi.
• Aktiviteti mbi spekulimet me shumicë - kufizime të forta për transaksion dhe për epokë.
• Ndarja e grupit për aktivitetin e ciklit real, jo vetëm për mbajtjen boshe.
• Deflacioni strukturor — alokim i madh i djegies dhe një orar fiks i djegies.
• Rrugët e ndara të rrezikut — zgjidhja dhe fshehtësia janë programe të veçanta; pagesat e kasafortës kërkojnë kupona të vlefshëm.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMICS (FURNIZIM)
━━━━━━━━━━━━━━━━━━━━

Njësia: Token UI (6 shifra dhjetore në zinxhir).

Furnizimi total: 150,000,000,000 PIERRON (150 miliardë)

Shpërndarja:
• Pishina e tregut (ruajtje → DEX): 60B (40%) (escrow)
• Portofoli i zhvilluesit: 21B (14%)
• Bonus besnikërie:  7B (~4.7%)
• Burn (kasafortë + orari): 56B (~37.3%)
• Thesari: 6B (4%)

Emetimi: çdo epokë protokolli lëshon shenja nga ruajtje në grupin DEX nën një kuotë epoke — më e lartë në zanafillë, pastaj standarde. (escrow)

Djegia: nga kasaforta e djegies me një normë fikse gjatë rreth viteve kalendarike 20 të epokave deri në mbarimin e alokimit të djegies.

Kohëzgjatja e epokës:  21,600 sekonda (6 orë). Epoka 0 fillon në vulën kohore të gjenezës së protokollit.

━━━━━━━━━━━━━━━━━━━━
4. ARKITEKTURA (SHKURTËR)
━━━━━━━━━━━━━━━━━━━━

• Programi Pierron — kontabiliteti, kufijtë e DEX, libri tregtar, bonusi i besnikërisë, rishpërndarja, rriqrat, djegia, dyshemeja e çmimit
• Transfer Hook — Token-2022 klasifikimi i transfertave; kufijtë dhe kontributi 1% në shtigjet zyrtare
• Settlement — pagesat e kasafortës (rishpërndarja, bonusi i besnikërisë, shpërblimet e mbajtësit) pas përgatitjes së kuponit
• Stealth — regjistrohu, dërgo dhe pretendo (Safe Send)
• TradeBook / llogaria e përdoruesit — aktiviteti, vëllimi, biletat, harta e epokës, numri i pretendimeve
• Mbajtësit e rrjetit — epokat e avancuara, emetimi/djegia dhe tërheqjet; ata nuk pretendojnë rishpërndarje ose çmime për përdoruesit

━━━━━━━━━━━━━━━━━━━━
5. RREGULLAT E TREGTIMIT
━━━━━━━━━━━━━━━━━━━━

RUGA ZYRTARE
Tregtoni nëpërmjet shkëmbimit në aplikacionin Pierron (pishinë DEX sipas politikës së protokollit), me udhëzime për kufizimin dhe lidhjen e transferimit. Transfertat jashtë shtigjeve të lejuara mund të refuzohen ose klasifikohen ndryshe. KONTRIBUTI 

1% (I RIKURTUESHËM — JO GJËNIM) 
1% i vëllimit zyrtar të tregtisë shkon në një grup të përbashkët rishpërndarjeje. Kjo nuk është një tarifë ndëshkuese dhe as një djegie e përhershme e fondeve tuaja: me aktivitet të mjaftueshëm të ekosistemit ju mund të rikuperoni pjesën tuaj të pishinës pas përfundimit të ciklit.

Një cikël rishpërndarjeje zgjat epoka 28. Me epokat e orës 6 që janë ditë 7. Pas mbylljes së ciklit, përdoruesit e kualifikuar kërkojnë pjesën e tyre nga grupi në aplikacion.

Kushti i rikuperimit: aktivitet i mjaftueshëm në cikël (duke përfshirë të paktën epokat aktive 9 në bitmap-in e epokës 28 dhe mbajtjen e të paktën 10 PIERRON) - shihni Rishpërndarjen. Pa aktivitetin e ekosistemit nuk ka pjesë të grupit; me kontributin plus aktivitetin, tregtimi ndërton të drejtën për të kërkuar nga grupi - jo vetëm një kosto tregtimi.

Kontributi 1% nuk mund të çaktivizohet në cilësime - është pjesë e protokollit.

KATI I ÇMIMIT (SOL)
Shkëmbimet zyrtare kërkojnë një tarifë SOL proporcionale me vëllimin PIERRON (100 lamports për 1 PIERRON). Fondet shkojnë në thesarin e çmimit dhe mund të mbështesin likuiditetin / dyshemenë.

KUFITI PËR TRANSAKSION
PIERRON maksimale për transaksion varet nga pretendimet e rishpërndara të marra:

• 0–24 pretendimet: 13,000,000 PIERRON
• Pretendimet e ≥ 25: 16,000,000 PIERRON
• Pretendimet e ≥ 75: 19,000,000 PIERRON
• Pretendimet e ≥ 175: 24,000,000 PIERRON
• Pretendimet e ≥ 375: 34,000,000 PIERRON (kapak)

FTOHET MES SHËBIMIT
• 0–24 pretendon: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Një përpjekje e hershme e shkëmbimit refuzohet në zinxhir.

SHKËMBIMI I PARË
Transaksioni i parë zyrtar në një llogari duhet të jetë së paku 2 PIERRON.

EPOKA GLOBAL SHITJE KAPAK
Totali i shitjeve nga të gjithë përdoruesit në një epokë ndajnë një tavan që rritet me pretendimet totale të protokollit:

• sipas kërkesave totale të 25: 2,000,000,000 PIERRON
• nën 75: 3,000,000,000
• nën 175: 5,000,000,000
• nën 375: 7,000,000,000
• 375+: 9,000,000,000

Zbatohen gjithashtu kufijtë e epokës së epokës për përdorues (duke përfshirë deri në 100 txs për epokë dhe një kufi vëllimi për përdorues).

━━━━━━━━━━━━━━━━━━━━
6. RISHPËRNDARJE — RIKUJTIMI I KONTRIBUTIT 1%
━━━━━━━━━━━━━━━━━━━━

PSE EKZISTON 1%
Çdo shkëmbim zyrtar e vendos 1% në një pishinë të përbashkët. Pas epokave 28 (ditët 7 në epokat me orë 6) pishina ndahet midis njerëzve që ishin mjaft aktivë në ekosistem. Tregtimi aktiv + aktivitet cikli = e drejta për të kërkuar nga grupi. Inaktivitet = pa aksion. Ky është një mekanizëm i besnikërisë / rikuperimit të kontributit, jo një ndëshkim për tregtimin.

Kontributi 1% është krijuar për të lidhur përkohësisht një pjesë të kapitalit në ekosistem dhe për të dekurajuar në mënyrë indirekte sulmet Sybil.

BURIMI I PISHINËS
Kontributi 1% nga këmbimet zyrtare financon kasafortën e rishpërndarjes.

CIKLI DHE KOHA
• cikli: 28 epokat = 7 ditë (epoka = 6 h),
• pas mbylljes së ciklit, grupi ndahet (aksioni ≈ grupi / numërimi i pranueshëm),
• pretendoni në aplikacion pasi të plotësohet kualifikimi.

PRANUESHMËRIA (AKTIVITET I MJAFTUESHËM)
• të paktën epoka aktive 9 në bitmap-in e epokës 28,
• të mbajë të paktën ekuilibrin 10 PIERRON,
• Aktiviteti i njohur nga protokolli (tregtimi zyrtar/shtigjet e protokollit).

PRETENDIMI
• përdoruesi fillon pretendimin në aplikacion (përgatit → zgjidh → konsumo),
• mbajtësit nuk pretendojnë për përdoruesin,
• Kuponët mbeten të vlefshëm sipas rendit të epokave 28 - ato të padeklaruara mund të skadojnë,
• Tarifa e kërkesës së protokollit në PIERRON është 0; përdoruesi paguan tarifën e rrjetit SOL,
• një pretendim i suksesshëm ngre numëruesin e pretendimeve → kufiri më i lartë i shkëmbimit dhe ftohja më e shkurtër.

━━━━━━━━━━━━━━━━━━━━
7. BONUS BESNIKRISE
━━━━━━━━━━━━━━━━━━━━

BILETA
• fituar nga vëllimi zyrtar i tregtisë (pragu: 10 PIERRON vëllimi →  1 bileta),
• maksimumi i biletave 50 për përdorues për dritare,
• vizatoni dritaret çdo epokë 7 brenda ciklit të epokës 28.

SHOKAT
• mbajtësit paraqesin komisione rastësie (commit–reveal),
• shortet kërkojnë një numër minimal të angazhimit (kati i prodhimit: 20) dhe një grup minimal biletash,
• pas dritares: vizatoni ose kaloni (shumë pak bileta),
• çmimi: 2,000,000 PIERRON për barazim (nga shpërndarja e bonusit të besnikërisë),
• pagesa: përgatit → zgjidh → pretendim nga fituesi.

VLEFSHMËRIA E VOUCHERIT
Kuponi për të kërkuar llotarinë ajrore është i vlefshëm për epokat 7 dhe më pas skadon.

━━━━━━━━━━━━━━━━━━━━
8. DËRGIMI I SIGURT DHE PAGUAJI PIERRON
━━━━━━━━━━━━━━━━━━━━

DËRGIMI I SIGURT
Regjistrohu → dërgo në kasafortën e fshehtë → pretendim për marrësin. Pretendimi mund të kërkojë dy transaksione. Kjo është një rrugë më private e transferimit - nuk anashkalon kufijtë e shkëmbimit ose kontributin 1%.

PIERRON PAGUAJ
Pagesa në një llogari tregtare me një udhëzim pagese. Hook e klasifikon transferimin si Pay, jo si një shitje normale DEX.

RREGULLAT
• mos i përdorni këto shtigje për të anashkaluar kufijtë zyrtarë të tregtimit ose kontributin 1%,
• verifikoni gjithmonë adresën e marrësit / QR përpara se të dërgoni - gabimet në zinxhir janë të pakthyeshme.

━━━━━━━━━━━━━━━━━━━━
9. RREGULLAT E PËRDORIMIT TË APLIKACIONIT
━━━━━━━━━━━━━━━━━━━━

1. Lidhni vetëm një portofol të besuar. Asnjëherë mos e ndani frazën tuaj fillestare me "mbështetje" ose të huaj.
2. Swap: miratoni sekuencën e plotë në portofol; mos e mbyllni portofolin në mes të nënshkrimit.
3. Respektoni ftohjen - trokitja përsëri nuk anashkalon rregullat e zinxhirit.
4. Kërkesa për rishpërndarje / bonus besnikërie: vetëm kur aplikacioni tregon gatishmëri; pas suksesit prisni për sinkronizimin e rrjetit përpara shkëmbimit të radhës.
5. Në Android (OEM agresive): qëndroni në portofol deri në CONFIRM, më pas kthehuni te Pierron; mos e vrisni aplikacionin në sfond.
6. Të ndaluara: sulme ndaj programeve, phishing nën emrin Pierron, RPC spam, përpjekje për shfrytëzimin e shlyerjeve/hook.

━━━━━━━━━━━━━━━━━━━━
10. LAKTI EKONOMIK
━━━━━━━━━━━━━━━━━━━━

Escrow lëshon shenja në grupin DEX çdo epokë.
Tregtimi vendos një kontribut 1% në grupin e rishpërndarjes (i rikuperueshëm pas ditëve 7 / 28 me aktivitet të mjaftueshëm), biletat e bonusit të besnikërisë dhe tarifën bazë të çmimit SOL.
Aktiviteti në ciklin e epokës 28 ju kualifikon për të rimarrë një pjesë të grupit.
Bonusi i besnikërisë tërheq në dritaret e epokës 7.
Burn zvogëlon furnizimin paralelisht sipas planit.
Përdoruesit pretendojnë vetë rishpërndarjen dhe çmimet; mbajtësit mbajnë orën e protokollit.

━━━━━━━━━━━━━━━━━━━━
11. RREZIQET
━━━━━━━━━━━━━━━━━━━━

• Rreziku i kontratës së zgjuar dhe përmirësimit,
• rreziku i tregut për çmimin PIERRON (nuk është e garantuar përmbys pavarësisht djegies / dyshemesë),
• Tarifat SOL për transaksionet e dështuara ose të përsëritura,
• pa garanci fitimi — rishpërndarja dhe bonusi i besnikërisë nuk janë produkt depozitimi.

Përdorimi i aplikacionit do të thotë të pranosh rregullat në zinxhir dhe rreziqet e mësipërme.

Pierron — tokenomikë transparente dhe përdorim real.`;
