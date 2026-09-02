export const PROJECT_INFO_BODY = `PIERRON — INFORMÁCIE O PROJEKTE
Verzia 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. znamená „PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK“,
alebo hovorovo CPDDC (Centralized Pool Decentralized Digital Currency).

Je to kryptomena na Solana, ktorá prostredníctvom kombinácie 49 odlišných mechanizmov vytvára autonómny, decentralizovaný ekosystém navrhnutý tak, aby poskytoval najvyššiu formu finančného zabezpečenia pre jednotlivého používateľa.

Projekt bol navrhnutý pre absolútnu transparentnosť smerom k používateľovi a tak, aby používateľ nemusel produktu dôverovať.

Pravidlá vložené do projektu sú konečné a nemožno ich meniť.

Ekosystém PIERRON je plne autonómny: nevyžaduje žiadneho správcu a ani žiadneho nemá. Projekt tiež nemá podporu ani zákaznícky servis. Za všetky rozhodnutia a akcie, ktoré vykoná používateľ v ekosystéme, zodpovedá výlučne používateľ. Tvorca projektu nezodpovedá za chybné rozhodnutia alebo chyby používateľa.

PIERRON má viac ako 2200 formálnych dôkazov bez vetiev obsahujúcich assume, admit, external_body, vacuity alebo nedostatočne špecifikovaných vetiev.

━━━━━━━━━━━━━━━━━━━━
1. ČO JE PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron je tokenový protokol na blockchaine Solana. Ekonomické pravidlá (limity, 1% príspevok do fondu, cooldown, redistribúcia, vernostný bonus, emisia a spaľovanie) sú presadzované v reťazci programami inteligentných zmlúv – nielen popísané v dokumentácii.

Token PIERRON (SPL Token-2022) kombinuje:

• oficiálne obchodovanie DEX s limitmi na jednotlivé obchody a cooldown,
• 1% príspevok do redistribučného fondu – vymáhateľný po cykle aktivity (nie „pokuta za obchodovanie“),
• cykly aktivít a nárokovanie si podielu z fondu,
• vernostný bonus na základe objemu,
• riadené emisie do fondu trhu plus plán spaľovania,
• poplatok SOL pri oficiálnych výmenách,
• Safe Send (viac súkromných prevodov) a Pierron Pay (platby obchodníkom).

Transakcie zostavovania mobilnej aplikácie a dapp. Zdrojom pravdy pre pravidlá je kód nasadený na Solana.

━━━━━━━━━━━━━━━━━━━━
2. PRINCÍPY NÁVRHU
━━━━━━━━━━━━━━━━━━━━

• Pravidlá v kóde – limity a vhodnosť sú kontrolované programom.
• Aktivita nad veľkoobchodnými špekuláciami – pevné limity na transakciu a na epochu.
• Podiel skupiny pre aktivitu v reálnom cykle, nie len pre nečinné držanie.
• Štrukturálna deflácia – veľká alokácia spaľovania a pevný plán spaľovania.
• Oddelené rizikové cesty – vyrovnanie a utajenie sú samostatné programy; výplaty v trezoroch vyžadujú platné poukážky.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMIKA (PONUKA)
━━━━━━━━━━━━━━━━━━━━

Jednotka: token používateľského rozhrania (6 desatinných miest v reťazci).

Celková ponuka: 150,000,000,000 PIERRON (150 miliárd)

Pridelenie:
• Trhový fond (escrow → DEX): 60B (40%)
• Peňaženka vývojára: 21 miliárd (14%)
• Vernostný bonus: 7 miliárd (~4.7%)
• Vypálenie (úschovňa + plán): 56 B (~37.3%)
• Treasury: 6 miliárd (4%)

Emisia: protokol v každej epoche uvoľňuje tokeny z escrow do fondu DEX podľa kvóty epochy — pri genesis vyššej, potom štandardnej.

Vypálenie: z trezoru na spálenie pevnou rýchlosťou počas približne 20 kalendárnych rokov epoch až do vyčerpania prideleného priestoru na vypálenie.

Dĺžka epochy: 21,600 sekúnd (6 hodín). Epocha 0 začína v časovej pečiatke genézy protokolu.

━━━━━━━━━━━━━━━━━━━━
4. ARCHITEKTÚRA (V skratke)
━━━━━━━━━━━━━━━━━━━━

• Program Pierron – účtovníctvo, limity DEX, obchodná kniha, vernostný bonus, prerozdelenie, tikety, spaľovanie, minimálna cena
• Transfer Hook — klasifikácia prenosu Token-2022; limity a 1% príspevok na oficiálnych cestách
• Settlement — výplaty trezorov (prerozdelenie, vernostný bonus, odmeny keeperom) po príprave poukážky
• Stealth — registrácia, odoslanie a nárokovanie (Safe Send)
• TradeBook / používateľský účet – aktivita, objem, lístky, bitová mapa epoch, počet nárokov
• Správcovia siete – posúvajú epochy, emisie/napaľovanie a ťahy; nenárokujú si redistribúciu ani ceny pre používateľov

━━━━━━━━━━━━━━━━━━━━
5. PRAVIDLÁ OBCHODOVANIA
━━━━━━━━━━━━━━━━━━━━

OFICIÁLNA CESTA
Obchodujte cez swap v aplikácii Pierron (pool DEX podľa protokolovej politiky) s inštrukciami limitu a transfer-hook. Prevody mimo povolených ciest môžu byť odmietnuté alebo klasifikované inak.

1% PRÍSPEVOK (VRÁTITEĽNÝ – NIE JE POKUTA)
1% oficiálneho objemu obchodu ide do zdieľaného prerozdeľovacieho fondu. Nejde o represívny poplatok ani o trvalé spálenie vašich finančných prostriedkov: s dostatočnou aktivitou ekosystému môžete po skončení cyklu získať späť svoj podiel z fondu.

Cyklus prerozdeľovania trvá 28 epoch. Pri 6-hodinových epochách je to 7 dní. Po uzavretí cyklu si oprávnení používatelia nárokujú svoj podiel z fondu v aplikácii.

Podmienka obnovy: dostatočná aktivita v cykle (vrátane najmenej 9 aktívnych epoch v 28-epochovej bitovej mape a udržiavania najmenej 10 PIERRON) – pozri Redistribúcia. Bez aktivity ekosystému neexistuje žiadny podiel v bazéne; s príspevkom plus aktivitou si obchodovanie vytvára právo na vrátenie zo skupiny – nielen náklady na obchodovanie.

Príspevok 1% nie je možné deaktivovať v nastaveniach — je súčasťou protokolu.

CENOVÁ HRANICA (SOL)
Oficiálne výmeny vyžadujú poplatok SOL úmerný objemu PIERRON (100 lamports za 1 PIERRON). Prostriedky idú do pokladnice s najnižšou cenou a môžu podporovať likviditu/dolnú hranicu.

LIMIT NA TRANSAKCIU
Maximálny počet PIERRON na transakciu závisí od prijatých prerozdelených nárokov:

• 0–24 nárokov: 13,000,000 PIERRON
• ≥ 25 nárokov: 16,000,000 PIERRON
• ≥ 75 nárokov: 19,000,000 PIERRON
• ≥ 175 nárokov: 24,000,000 PIERRON
• ≥ 375 nárokov: 34,000,000 PIERRON (strop)

VYCHLADNUTIE MEDZI VÝMENAMI
• 0–24 nárokov: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Skorý pokus o výmenu je odmietnutý v reťazci.

PRVÁ VÝMENA
Prvá oficiálna transakcia na účte musí byť aspoň 2 PIERRON.

GLOBÁLNY LIMIT PREDAJA ZA EPOCHU
Celkový počet predajov všetkých používateľov v epoche zdieľa strop, ktorý stúpa s celkovými nárokmi na protokol:

• menej ako 25 nárokov celkom: 2,000,000,000 PIERRON
• menej ako 75: 3,000,000,000
• menej ako 175: 5,000,000,000
• menej ako 375: 7,000,000,000
• 375+: 9,000,000,000

Uplatňujú sa aj obmedzenia objemu a transakcií na používateľa (vrátane až 100 txs na epochu a obmedzenia objemu na používateľa).

━━━━━━━━━━━━━━━━━━━━
6. REDISTRIBÚCIA – VRÁTENIE 1% PRÍSPEVKU
━━━━━━━━━━━━━━━━━━━━

PREČO EXISTUJE 1%
Každý oficiálny swap umiestni 1% do zdieľaného fondu. Po 28 epochách (7 dní pri 6-hodinových epochách) sa bazén rozdelí medzi ľudí, ktorí boli dostatočne aktívni v ekosystéme. Aktívne obchodovanie + aktivita cyklu = nárok na reklamáciu z fondu. Neaktivita = žiadne zdieľanie. Toto je mechanizmus vernosti/príspevku, nie trest za obchodovanie.

Príspevok 1% je navrhnutý tak, aby dočasne viazal časť kapitálu v ekosystéme a nepriamo odrádzal od útokov Sybil.

ZDROJ BAZÉNU
Príspevok 1% z oficiálnych swapov financuje prerozdeľovací trezor.

CYKLUS A ČASOVANIE
• cyklus: 28 epoch = 7 dní (epocha = 6 h),
• po uzavretí cyklu sa skupina rozdelí (podiel ≈ skupina / oprávnený počet),
• nárokovať v aplikácii po splnení oprávnenosti.

SPÔSOBILOSŤ (DOSTATEČNÁ AKTIVITA)
• aspoň 9 aktívnych epoch v 28-epochovej bitovej mape,
• udržiavať zostatok aspoň 10 PIERRON,
• aktivita rozpoznaná protokolom (oficiálne obchodné / protokolové cesty).

NÁROKOVANIE
• používateľ iniciuje nárokovanie v aplikácii (príprava → vyrovnanie → spotrebovanie),
• prevádzkovatelia nenárokujú za užívateľa,
• poukážky zostávajú v platnosti rádovo 28 epoch – nevyzdvihnuté môžu prepadnúť,
• poplatok protokolu za nárokovanie v PIERRON je 0; používateľ platí sieťový poplatok SOL,
• úspešné nárokovanie zvyšuje počítadlo nárokov → vyšší limit swapu a kratší cooldown.

━━━━━━━━━━━━━━━━━━━━
7. VERNOSTNÝ BONUS
━━━━━━━━━━━━━━━━━━━━

VSTUPENKY
• získané z oficiálneho objemu obchodu (hranica: 10 PIERRON objem → 1 tiket),
• maximálne 50 lístkov na používateľa na okno,
• kresliť okná každých 7 epoch v rámci 28-epochového cyklu.

ŽREBOVANIE
• správcovia predkladajú záväzky náhodnosti (commit–reveal),
• žrebovania vyžadujú minimálny počet odovzdaní (produkčné dno: 20) a minimálny počet tiketov,
• po okienku: žrebovanie alebo preskočenie (príliš málo lístkov),
• cena: 2,000,000 PIERRON za žrebovanie (z pridelenia vernostného bonusu),
• výplata: príprava → vyrovnanie → nárok víťaza.

PLATNOSŤ POUKAZU
Poukaz na uplatnenie lotériového airdropu je platný 7 epoch, potom prepadá.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND A PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Registrácia → odoslanie do tajného trezoru → nárok príjemcu. Reklamácia môže vyžadovať dve transakcie. Toto je súkromnejšia cesta prevodu – neobchádza swapové limity ani 1% príspevok.

PIERRON PAY
Platba na účet obchodníka s pokynom k platbe. Hák klasifikuje prevod ako Pay, nie ako normálny predaj DEX.

PRAVIDLÁ
• nepoužívajte tieto cesty na obchádzanie oficiálnych obchodných limitov alebo 1% príspevku,
• pred odoslaním vždy overte adresu príjemcu / QR — chyby na reťazci sú nezvratné.

━━━━━━━━━━━━━━━━━━━━
9. PRAVIDLÁ POUŽÍVANIA APLIKÁCIE
━━━━━━━━━━━━━━━━━━━━

1. Pripojte iba dôveryhodnú peňaženku. Nikdy nezdieľajte svoju počiatočnú frázu s „podporou“ alebo neznámymi ľuďmi.
2. Swap: schvaľte celú sekvenciu v peňaženke; nezatvárajte peňaženku uprostred podpisu.
3. Rešpektujte cooldown – opätovné poklepanie neprepíše pravidlá on-chain.
4. Nárok na redistribúciu / vernostný bonus: iba keď aplikácia ukáže pripravenosť; po úspechu počkajte na synchronizáciu siete pred ďalšou výmenou.
5. Na Android (agresívnych OEM): zostaňte v peňaženke do CONFIRM, potom sa vráťte do Pierron; nezabíjajte aplikáciu na pozadí.
6. Zakázané: útoky na programy, phishing pod menom Pierron, spam RPC, pokusy o urovnanie / zneužitie.

━━━━━━━━━━━━━━━━━━━━
10. EKONOMICKÁ SLUČKA
━━━━━━━━━━━━━━━━━━━━

Escrow uvoľňuje žetóny do fondu DEX každú epochu.
Obchodovanie umiestňuje 1% príspevok do redistribučného fondu (vymáhateľný po 7 dňoch / 28 epochách s dostatočnou aktivitou), vernostné bonusové lístky a poplatok SOL s minimálnou cenou.
Činnosť v 28-epochovom cykle vás oprávňuje získať späť podiel z fondu.
Vernostný bonus sa žrebuje v oknách 7 epoch.
Spaľovanie súbežne znižuje ponuku podľa harmonogramu.
Používatelia si sami žiadajú prerozdelenie a ceny; správcovia udržiavajú protokolové hodiny.

━━━━━━━━━━━━━━━━━━━━
11. RIZIKÁ
━━━━━━━━━━━━━━━━━━━━

• riziko inteligentnej zmluvy a aktualizácie,
• trhové riziko pre cenu PIERRON (bez zaručeného vzostupu napriek spáleniu / podlahe),
• poplatky SOL za neúspešné alebo opakované transakcie,
• žiadna garancia zisku — prerozdelenie a vernostný bonus nie sú depozitným produktom.

Používanie aplikácie znamená akceptovanie pravidiel v reťazci a vyššie uvedených rizík.

Pierron — transparentná tokenomika a skutočné použitie.`;
