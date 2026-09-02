export const PROJECT_INFO_BODY = `PIERRON — PROJEKTINFORMÁCIÓ
1.3-as verzió · Solana · Token-2022

A P.I.E.R.R.O.N. a „PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK” rövidítése,
vagy köznyelvben CPDDC (Centralized Pool Decentralized Digital Currency).

Ez egy kriptovaluta a Solana-n, amely 49 különböző mechanizmus kombinációján keresztül önálló, decentralizált ökoszisztémát alkot, amelynek célja, hogy a legmagasabb pénzügyi biztonságot nyújtsa az egyes felhasználók számára.

A projektet úgy alakították ki, hogy a felhasználó felé abszolút átlátható legyen, és hogy a felhasználónak ne kelljen megbíznia a termékben.

A projektbe beágyazott szabályok véglegesek és nem módosíthatók.

A PIERRON ökoszisztéma teljesen autonóm: nem igényel rendszergazdát, és nincs is. A projektnek nincs ügyfélszolgálata vagy ügyfélszolgálata. A felhasználó által az ökoszisztémában meghozott minden döntés és tevékenység kizárólag a felhasználó felelőssége. A projekt készítője nem vállal felelősséget a felhasználó hibás döntéseiért vagy hibáiért.

A A PIERRON több mint 2200 formális bizonyítással rendelkezik assume, admit, external_body, vacuity és underspecified branches nélkül.

━━━━━━━━━━━━━━━━━━━━
1. MI A PIERRON
━━━━━━━━━━━━━━━━━━━━

A Pierron egy token protokoll a Solana blokkláncon. A gazdasági szabályokat (limitek, 1%-os poolhozzájárulás, lehűlés, újraelosztás, hűségbónusz, kibocsátás és égés) az intelligens szerződéses programok láncon belül kényszerítik ki – nem csupán a dokumentációban írják le.

A PIERRON token (SPL Token-2022) a következőket tartalmazza:

• hivatalos DEX kereskedés kereskedésenkénti limitekkel és cooldownnal,
• 1%-os hozzájárulás az újraelosztási poolhoz – egy tevékenységi ciklus után visszaigényelhető (nem „kereskedési büntetés”),
• tevékenységi ciklusok és a medence részesedésének igénylése,
• mennyiség alapú hűségbónusz,
• szabályozott kibocsátás a piaci medencébe, valamint égési ütemterv,
• hivatalos csereügyleteknél SOL ár-küszöbdíj,
• Safe Send (több privát átutalás) és Pierron Pay (kereskedői fizetés).

A mobilalkalmazás és a dapp tranzakciókat készít. A szabályok igazságának forrása a Solana-n telepített kód.

━━━━━━━━━━━━━━━━━━━━
2. TERVEZÉSI ALAPELVEK
━━━━━━━━━━━━━━━━━━━━

• Szabályok a kódban – a limiteket és a jogosultságot a program ellenőrzi.
• A nagykereskedelmi spekulációval szembeni tevékenység – tranzakciónkénti és korszakonkénti kemény korlátok.
• A medence megosztása valós ciklustevékenységhez, nem csak üresjárathoz.
• Strukturális defláció – nagy égéskiosztás és rögzített égési ütemterv.
• Elkülönített kockázati utak – az elszámolás és a lopakodás külön programok; páncélszekrényes kifizetésekhez érvényes utalványok szükségesek.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMICS (ELLÁTÁS)
━━━━━━━━━━━━━━━━━━━━

Mértékegysége: UI token (6 tizedesjegy a láncon).

Teljes kínálat: 150,000,000,000 PIERRON (150 milliárd)

Kiosztás:
• Piac pool (escrow → DEX): 60B (40%)
• Fejlesztői pénztárca: 21B (14%)
• Hűségbónusz: 7 milliárd (~4.7%)
• Égés (boltozat + ütemezés): 56B (~37.3%)
• Kincstár: 6B (4%)

Kibocsátás: a protokoll minden korszakban tokeneket bocsát ki az escrow-ból a DEX-poolba egy korszakkvóta szerint — a genesis idején többet, majd a szokásos mennyiséget.

Égés: az égési tárolóból rögzített ütemben körülbelül 20 naptári évnyi korszakon keresztül, amíg az égési allokáció ki nem merül.

Epocha hossza: 21,600 másodperc (6 óra). A 0. korszak a protokoll keletkezésének időbélyegzőjével kezdődik.

━━━━━━━━━━━━━━━━━━━━
4. ÉPÍTÉSZET (RÖVID)
━━━━━━━━━━━━━━━━━━━━

• Pierron program – könyvelés, DEX limitek, kereskedelmi könyv, hűségbónusz, újraelosztás, tick, égés, ár minimum
• Transfer Hook — Token-2022 transzfer besorolás; korlátok és 1%-os hozzájárulás a hivatalos utakon
• Settlement — az utalvány elkészítése után a trezor kifizetései (újraelosztás, hűségbónusz, keeper-jutalmak)
• Stealth — regisztráljon, küldjön és igényeljen (Safe Send)
• TradeBook / felhasználói fiók – tevékenység, mennyiség, jegyek, korszak bittérkép, követelések száma
• Hálózatőrzők – előrehaladó korszakok, emisszió/égés és húzások; nem igényelnek újraelosztást vagy nyereményeket a felhasználók számára

━━━━━━━━━━━━━━━━━━━━
5. KERESKEDÉSI SZABÁLYOK
━━━━━━━━━━━━━━━━━━━━

HIVATALOS ÚT
Kereskedjen swapon keresztül a Pierron alkalmazásban (DEX pool a protokoll szabályzata alatt), limit és transfer-hook utasításokkal. A megengedett útvonalakon kívüli transzferek elutasíthatók vagy eltérően osztályozhatók.

1% HOZZÁJÁRULÁS (VISSZAJÁRULHATÓ – NEM BÜNTETÉS)
A hivatalos kereskedelmi volumen 1%-a megosztott újraelosztási készletbe kerül. Ez nem büntetődíj, és nem a pénzeszközök állandó elégetése: elegendő ökoszisztéma-aktivitással a ciklus vége után visszakövetelheti a medencéből való részesedését.

Egy újraelosztási ciklus 28 korszakot tart. 6 órás korszakokkal ez 7 nap. A ciklus lezárása után a jogosult felhasználók igényt tarthatnak a részükre az alkalmazásban lévő készletből.

Helyreállítási feltétel: elegendő aktivitás a ciklusban (beleértve legalább 9 aktív korszakot a 28 korszakos bittérképen és legalább 10 PIERRON fenntartását) – lásd: Újraelosztás. Ökoszisztéma-tevékenység nélkül nincs készletrészesedés; a hozzájárulás plusz tevékenységgel a kereskedés jogot teremt a poolból való visszaigényléshez – nem csak a kereskedés költségeihez.

Az 1%-os hozzájárulást nem lehet letiltani a beállításokban – ez a protokoll része.

ALAPÁR (SOL)
A hivatalos csereügyletekhez a PIERRON mennyiségével arányos SOL díjat kell fizetni (100 lamports 1 PIERRON-ként). A pénzeszközök az ár-küszöb kincstárba kerülnek, és támogathatják a likviditást / minimumot.

TRANZAKCIÓNkénti LIMIT
A tranzakciónkénti maximális PIERRON a beérkezett újraelosztott követelésektől függ:

• 0–24 követelés: 13,000,000 PIERRON
• ≥ 25 követelés: 16,000,000 PIERRON
• ≥ 75 követelés: 19,000,000 PIERRON
• ≥ 175 követelés: 24,000,000 PIERRON
• ≥ 375 követelés: 34,000,000 PIERRON (sapka)

HŰTÉS CSERE KÖZÖTT
• 0–24 követelés: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

A korai cserekísérlet a láncon belül elutasításra kerül.

ELSŐ CSERE
A számlán az első hivatalos tranzakciónak legalább 2 PIERRON értékűnek kell lennie.

GLOBÁLIS EPOCHÁNKÉNTI ELADÁSI LIMIT
Az összes felhasználó összes eladása egy korszakban megosztja a plafont, amely az összes protokollköveteléssel nő:

• kevesebb mint 25 igénylés total: 2,000,000,000 PIERRON
• kevesebb mint 75: 3,000,000,000
• kevesebb mint 175: 5,000,000,000
• kevesebb mint 375: 7,000,000,000
• 375+: 9,000,000,000

Felhasználónkénti korszak- és tranzakciókorlátok is érvényesek (beleértve a legfeljebb 100 tx-t korszakonként és a felhasználónkénti mennyiségkorlátot).

━━━━━━━━━━━━━━━━━━━━
6. ÚJRAELosztás – AZ 1%-OS HOZZÁJÁRULÁS VISSZAJÁRULÁSA
━━━━━━━━━━━━━━━━━━━━

MIÉRT LÉTEZIK 1%?
Minden hivatalos csere 1%-ot tesz egy megosztott poolba. 28 korszak után (7 nap 6 órás korszakokban) a medence felosztódik az ökoszisztémában kellően aktív emberek között. Aktív kereskedés + ciklustevékenység = igénylési jog a poolból. Inaktivitás = nincs megosztás. Ez egy hűség-/járulék-visszatérítési mechanizmus, nem pedig a kereskedési büntetés.

Az 1%-os hozzájárulás célja, hogy átmenetileg lekösse a tőke egy részét az ökoszisztémában, és közvetve visszatartsa a Sybil támadásokat.

MEDENCE FORRÁS
A hivatalos csereügyletek 1%-os hozzájárulása az újraelosztási értéktárat finanszírozza.

CIKLUS ÉS IDŐZÍTÉS
• ciklus: 28 korszak = 7 nap (korszak = 6 óra),
• a ciklus lezárása után a készlet felosztásra kerül (részesedés ≈ pool / jogosult szám),
• igénylés az alkalmazásban, ha a jogosultság teljesül.

JOGOSULTSÁG (ELŐ TEVÉKENYSÉG)
• legalább 9 aktív korszak a 28 korszakos bittérképen,
• tartson fenn legalább 10 PIERRON egyenleget,
• a protokoll által felismert tevékenység (hivatalos kereskedés / protokoll útvonalak).

IGÉNYEZÉS
• a felhasználó igényt kezdeményez az alkalmazásban (előkészítés → elszámolás → fogyasztás),
• az üzemeltetők nem követelnek a felhasználó helyett,
• az utalványok 28 korszakig érvényesek – az át nem vettek lejárhatnak,
• a PIERRON-ben a protokoll igénylési díja 0; a felhasználó fizeti a SOL hálózati díjat,
• a sikeres követelés megemeli a kárszámlálót → magasabb swap limit és rövidebb cooldown.

━━━━━━━━━━━━━━━━━━━━
7. HŰSÉGBÓNUSZ
━━━━━━━━━━━━━━━━━━━━

JEGYEK
• hivatalos kereskedési volumenből keresett (küszöb: 10 PIERRON mennyiség → 1 jegy),
• legfeljebb 50 jegy felhasználónként ablakonként,
• rajzoljon ablakokat 7 korszakonként a 28 korszakos cikluson belül.

SORSOLÁS
• az keepers véletlenszerű commitokat (commit–reveal) adnak be,
• a sorsoláshoz minimális kötelezettségvállalási szám (gyártási szint: 20) és minimális jegykészlet szükséges,
• az ablak után: sorsolj vagy ugorj (túl kevés jegy),
• nyeremény: 2,000,000 PIERRON sorsolásonként (a hűségbónuszból),
• kifizetés: előkészítés → elszámolás → a nyertes követelése.

UTALVÉNY ÉRVÉNYESSÉGE
A lottó airdrop igénylésére szolgáló utalvány 7 ideig érvényes, majd lejár.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND ÉS PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Regisztráció → küldés a lopakodó tárolóba → címzett követelés. A követelés két tranzakciót igényelhet. Ez egy privát transzferút – nem kerüli meg a swap limiteket vagy az 1%-os hozzájárulást.

PIERRON PAY
Fizetés kereskedői számlára fizetési utasítással. A horog az átutalást Pay-ként osztályozza, nem pedig normál DEX eladásnak.

SZABÁLYOK
• ne használja ezeket az utakat a hivatalos kereskedési limitek vagy az 1%-os hozzájárulás megkerülésére,
• küldés előtt mindig ellenőrizze a címzett címét / QR – a láncon belüli hibák visszafordíthatatlanok.

━━━━━━━━━━━━━━━━━━━━
9. ALKALMAZÁSI SZABÁLYOK
━━━━━━━━━━━━━━━━━━━━

1. Csak megbízható pénztárcát csatlakoztasson. Soha ne ossza meg magvú kifejezését „támogatással” vagy idegenekkel.
2. Csere: hagyja jóvá a teljes sorozatot a tárcában; ne zárja be a tárcát aláírás közben.
3. Tartsa tiszteletben a lehűlést – az ismételt koppintás nem írja felül a láncon belüli szabályokat.
4. Újraelosztás / hűségbónusz igény: csak akkor, ha az alkalmazás készen áll; siker után várja meg a hálózati szinkronizálást a következő csere előtt.
5. Android (agresszív OEM-ek): maradjon a pénztárcában CONFIRM-ig, majd térjen vissza Pierronhoz; ne öld meg az alkalmazást a háttérben.
6. Tilos: programok elleni támadások, Pierron név alatti adathalászat, RPC spam, rendezési/hook kihasználási kísérletek.

━━━━━━━━━━━━━━━━━━━━
10. GAZDASÁGI KÖR
━━━━━━━━━━━━━━━━━━━━

A Letéti minden korszakban tokeneket bocsát ki a DEX készletbe.
A kereskedés 1%-os hozzájárulást helyez a redisztribúciós készletbe (7 nap / 28 korszak elegendő aktivitás után visszaigényelhető), hűségbónusz jegyek, valamint a SOL ár-minimáldíj.
A 28 korszakos ciklusban végzett tevékenység feljogosítja Önt a medence egy részének visszaszerzésére.
A hűségbónusz 7 korszakos ablakokból származik.
A Burn az ütemterv szerint párhuzamosan csökkenti az ellátást.
A felhasználók maguk igényelhetik az újraelosztást és a nyereményeket; az őrök vezetik a protokollórát.

━━━━━━━━━━━━━━━━━━━━
11. KOCKÁZATOK
━━━━━━━━━━━━━━━━━━━━

• intelligens szerződéskötés és frissítés kockázata,
• piaci kockázat a PIERRON ár esetében (nincs garantált felfelé mutató égés/padló ellenére),
• SOL díjak sikertelen vagy ismétlődő tranzakciók esetén,
• nincs profitgarancia – az újraelosztás és a hűségbónusz nem betéti termék.

Az alkalmazás használata a láncon belüli szabályok és a fenti kockázatok elfogadását jelenti.

Pierron – átlátszó tokenomika és valós használat.`;
