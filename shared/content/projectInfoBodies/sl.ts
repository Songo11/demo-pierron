export const PROJECT_INFO_BODY = `PIERRON — INFORMACIJE O PROJEKTU
Različica 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. pomeni "PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK",
ali pogovorno CPDDC (Centralized Pool Decentralized Digital Currency).

Gre za kriptovaluto na Solana, ki s kombinacijo različnih mehanizmov 49 tvori avtonomen, decentraliziran ekosistem, zasnovan za zagotavljanje najvišje oblike finančne varnosti za posameznega uporabnika.

Projekt je bil zasnovan za popolno transparentnost do uporabnika in tako, da uporabniku ni treba zaupati izdelku.

Pravila, vgrajena v projekt, so dokončna in jih ni mogoče spreminjati.

Ekosistem PIERRON je popolnoma avtonomen: ne potrebuje skrbnika in ga nima. Projekt tudi nima podporne službe ali službe za stranke. Vse odločitve in dejanja, ki jih sprejme uporabnik v ekosistemu, so izključno odgovornost uporabnika. Ustvarjalec projekta ne odgovarja za napačne odločitve ali napake uporabnika.

PIERRON ima več kot 2200 formalnih dokazil brez assume, admit, external_body, vacuity ali premalo določenih vej.

━━━━━━━━━━━━━━━━━━━━
1. KAJ JE PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron je žetonski protokol v verigi blokov Solana. Ekonomska pravila (omejitve, prispevki  1% v združenje, ohlajanje, prerazporeditev, bonus zvestobe, emisija in izgorevanje) se v verigi uveljavljajo s programi pametnih pogodb – niso le opisana v dokumentaciji.

Žeton PIERRON (SPL Token-2022) združuje:

• uradno trgovanje DEX z omejitvami na trgovanje in ohlajanjem,
• prispevek 1% v sklad za prerazporeditev – izterljiv po ciklu dejavnosti (ni »kazen za trgovanje«),
• cikli dejavnosti in zahtevanje deleža bazena,
• bonus zvestobe glede na količino,
• nadzorovane emisije v tržni bazen in urnik izgorevanja,
• provizija za najnižjo ceno SOL pri uradnih zamenjavah,
• Safe Send (več zasebnih prenosov) in Pierron Pay (plačila trgovcem).

Mobilna aplikacija in dapp gradita transakcije. Vir resnice za pravila je koda, nameščena na Solana.

━━━━━━━━━━━━━━━━━━━━
2. NAČELA OBLIKOVANJA
━━━━━━━━━━━━━━━━━━━━

• Pravila v kodi — omejitve in upravičenost preverja program.
• Dejavnost nad veleprodajnimi špekulacijami – stroge omejitve na transakcijo in na obdobje.
• Delež bazena za resnično ciklično aktivnost, ne samo za zadržanje v mirovanju.
• Strukturna deflacija — velika porazdelitev izgorevanja in fiksni urnik izgorevanja.
• Ločene poti tveganja — poravnava in prikriti sta ločena programa; izplačila v trezor zahtevajo veljavne bone.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMIKA (PONUDBA)
━━━━━━━━━━━━━━━━━━━━

Enota: žeton uporabniškega vmesnika (6 decimalna mesta v verigi).

Skupna ponudba:  150,000,000,000 PIERRON (150 milijarde)

Dodelitev:
• Market pool (deponirano → DEX): 60B (40%) (escrow)
• Denarnica za razvijalce:  21B (14%)
• Bonus zvestobe:  7B (~4.7%)
• Burn (trezor + urnik):  56B (~37.3%)
• Zakladnica:  6B (4%)

Emisija: vsako obdobje protokol sprosti žetone iz hrambe v bazen DEX v skladu s kvoto obdobja — višjo ob nastanku, nato standardno. (escrow)

Burn: iz trezorja za zapisovanje s fiksno hitrostjo v približno 20 koledarskih letih epoh, dokler se dodelitev za zapisovanje ne izčrpa.

Dolžina epohe:  21,600 sekund (6 ur). Epoha 0 se začne pri časovnem žigu geneze protokola.

━━━━━━━━━━━━━━━━━━━━
4. ARHITEKTURA (KRATKO)
━━━━━━━━━━━━━━━━━━━━

• Program Pierron — računovodstvo, limiti DEX, trgovalna knjiga, bonus zvestobe, prerazporeditev, kljukice, izgorevanje, spodnja cena
• Transfer Hook — Token-2022 klasifikacija prenosa; omejitve in prispevek 1% na službenih poteh
• Settlement — izplačila iz trezorja (prerazporeditev, bonus za zvestobo, nagrade za lastnike) po pripravi bona
• Stealth — registracija, pošiljanje in zahtevanje (Safe Send)
• TradeBook / uporabniški račun — dejavnost, količina, vstopnice, bitna slika epohe, število zahtevkov
• Oskrbniki omrežja — napredne epohe, emisije/izgorevanje in črpanja; ne zahtevajo redistribucije ali nagrad za uporabnike

━━━━━━━━━━━━━━━━━━━━
5. PRAVILA TRGOVANJA
━━━━━━━━━━━━━━━━━━━━

URADNA POT
Trgujte prek zamenjave v aplikaciji Pierron (zbirka DEX v skladu s politiko protokola), z navodili za omejitev in prenos. Prenosi zunaj dovoljenih poti so lahko zavrnjeni ali razvrščeni drugače. 

1% PRISPEVEK (POVTERLJIV – NI KAZEN)
1% uradnega obsega trgovanja gre v skupni sklad za prerazporeditev. To ni kaznovalna pristojbina in ni trajna poraba vaših sredstev: z dovolj ekosistemske aktivnosti lahko po koncu cikla povrnete svoj delež sklada.

Cikel redistribucije traja 28 epohe. Z 6-urnimi epohami je to 7 dni. Ko se cikel zaključi, upravičeni uporabniki zahtevajo svoj delež iz skupine v aplikaciji.

Pogoj obnovitve: zadostna aktivnost v ciklu (vključno z vsaj 9 aktivnimi obdobji v bitni sliki obdobij 28 in ohranjanjem vsaj 10 PIERRON) — glejte Prerazporeditev. Brez dejavnosti ekosistema ni deleža bazena; s prispevkom plus aktivnostjo trgovanje ustvari pravico do povračila iz sklada — ne le stroškov trgovanja.

Prispevka 1% ni mogoče onemogočiti v nastavitvah - je del protokola.

NAJNIŽJA CENA (SOL)
Uradne zamenjave zahtevajo provizijo SOL, sorazmerno z obsegom PIERRON (100 lamports na 1 PIERRON). Sredstva gredo v zakladnico najnižje cene in lahko podpirajo likvidnost/spodnjo mejo.

OMEJITEV NA TRANSAKCIJO
Največji znesek PIERRON na transakcijo je odvisen od prerazporejenih prejetih zahtevkov:

•  0–24 trdi:  13,000,000 PIERRON
• ≥ 25 trdi:  16,000,000 PIERRON
• ≥ 75 trdi:  19,000,000 PIERRON
• ≥ 175 trdi:  24,000,000 PIERRON
• ≥ 375 trdi:  34,000,000 PIERRON (pokrovček)

HLAJENJE MED ZAMENJAVAMI
• 0–24 trdi:  120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Zgodnji poskus zamenjave je v verigi zavrnjen.

PRVA MENJAVA
Prva uradna transakcija na računu mora biti vsaj 2 PIERRON.

GLOBAL EPOCH SELL CAP
Skupna prodaja vseh uporabnikov v epohi ima zgornjo mejo, ki narašča s skupnimi zahtevami glede protokola:

• pod 25 skupni zahtevki: 2,000,000,000 PIERRON
• pod 75: 3,000,000,000
• pod 175: 5,000,000,000
• pod 375: 7,000,000,000
• 375+: 9,000,000,000

Veljajo tudi omejitve obsega in transakcij na uporabnika v obdobju (vključno z do 100 tx-ji na obdobje in omejitvijo obsega na uporabnika).

━━━━━━━━━━━━━━━━━━━━
6. PREDISTRIBUCIJA — POVRAČILO PRISPEVKA 1%
━━━━━━━━━━━━━━━━━━━━

ZAKAJ 1% OBSTAJA
Vsaka uradna zamenjava postavi 1% v skupno skupino. Po 28 epohah (7 dni v 6-urnih epohah) se bazen razdeli med ljudi, ki so bili dovolj aktivni v ekosistemu. Aktivno trgovanje + aktivnost cikla = pravica do zahtevka iz sklada. Neaktivnost = brez deleža. To je mehanizem za zvestobo/vračilo prispevkov in ne kazen za trgovanje.

Prispevek 1% je zasnovan za začasno vezavo dela kapitala v ekosistemu in za posredno odvračanje od napadov Sybil.

IZVIR BAZENA
Prispevek 1% iz uradnih zamenjav financira trezor za prerazporeditev.

CIKLUS IN ČAS
• cikel: 28 epoh = 7 dni (epoha = 6 h),
• po zaključku cikla se skupina razdeli (delež ≈ skupina / primerno število),
• zahtevek v aplikaciji, ko je izpolnjena upravičenost.

UPRAVIČENOST (DOVOLJ AKTIVNOSTI)
• vsaj 9 aktivnih epoh v bitni sliki 28-epohe,
• vzdržujte vsaj 10 PIERRON ravnovesje,
• aktivnost, ki jo priznava protokol (uradne trgovalne / protokolarne poti).

TERJANJE
• uporabnik sproži zahtevek v aplikaciji (pripravi → poravnaj → porabi),
• skrbniki ne terjajo namesto uporabnika,
• boni ostanejo veljavni po vrstnem redu 28 epoh — neprevzeti lahko potečejo,
• pristojbina za zahtevek protokola v PIERRON je 0; uporabnik plača omrežnino SOL,
• uspešen zahtevek dvigne števec zahtevkov → višja omejitev zamenjave in krajše ohlajanje.

━━━━━━━━━━━━━━━━━━━━
7. BONUS ZVESTOBE
━━━━━━━━━━━━━━━━━━━━

VSTOPNICE
• zaslužek iz uradnega obsega trgovanja (prag: 10 PIERRON obseg → 1 vstopnica),
• največje število vstopnic 50 na uporabnika na okence,
• narišite okna vsake epohe 7 znotraj cikla epohe 28.

ŽREBANJE
• skrbniki predložijo naključne zaveze (commit–reveal),
• žrebanja zahtevajo najmanjše število potrditev (produkcijska etaža:  20) in najmanjši sklad vstopnic,
• po okencu: žrebanje ali preskok (premalo vstopnic),
• nagrada:  2,000,000 PIERRON na žrebanje (iz dodelitve bonusa zvestobe),
• izplačilo: pripravi → poravnava → zahtevek s strani zmagovalca.

VELJAVNOST BONA
Vavčer za uveljavljanje loterije velja za obdobja 7, nato poteče.

━━━━━━━━━━━━━━━━━━━━
8. VARNO POŠLJI IN PIERRON PLAČAJ
━━━━━━━━━━━━━━━━━━━━

VARNO POŠLJI
Registracija → pošlji v skriti trezor → zahtevek prejemnika. Zahtevek lahko zahteva dve transakciji. To je bolj zasebna pot prenosa — ne zaobide omejitev zamenjave ali prispevka 1%.

PIERRON PLAČ
Plačilo na račun trgovca s plačilnim navodilom. Kavelj klasificira prenos kot plačilo, ne kot običajno prodajo DEX.

PRAVILA
• teh poti ne uporabljajte za obhod uradnih omejitev trgovanja ali prispevka 1%,
• pred pošiljanjem vedno preverite naslov prejemnika / QR — napake v verigi so nepopravljive.

━━━━━━━━━━━━━━━━━━━━
9. PRAVILA UPORABE APLIKACIJE
━━━━━━━━━━━━━━━━━━━━

1. Povežite samo zaupanja vredno denarnico. Nikoli ne delite svoje semenske fraze s "podporo" ali neznanci.
2. Zamenjaj: odobri celotno zaporedje v denarnici; ne zapirajte denarnice sredi podpisa.
3. Upoštevajte ohlajanje — ponovno tapkanje ne preglasi pravil v verigi.
4. Zahtevek za prerazporeditev/bonus zvestobe: samo ko aplikacija pokaže pripravljenost; po uspehu počakajte na omrežno sinhronizacijo pred naslednjo zamenjavo.
5. Na Android (agresivni OEM): ostanite v denarnici do POTRDITVE, nato se vrnite na Pierron; ne uniči aplikacije v ozadju.
6. Prepovedano: napadi na programe, lažno predstavljanje pod imenom Pierron, neželena pošta RPC, poskusi poravnave / hook exploit.

━━━━━━━━━━━━━━━━━━━━
10. GOSPODARSKA ZANKA
━━━━━━━━━━━━━━━━━━━━

Escrow vsako obdobje sprosti žetone v nabor DEX.
Trgovanje umesti prispevek 1% v sklad za prerazporeditev (ki ga je mogoče povrniti po 7 dneh/ 28 obdobjih z zadostno aktivnostjo), vstopnice z bonusom zvestobe in provizijo za najnižjo ceno SOL.
Dejavnost v ciklu epohe 28 vas kvalificira, da ponovno zahtevate delež bazena.
Bonus zvestobe črpa v oknih 7-epohe.
Burn zmanjša dobavo vzporedno po urniku.
Uporabniki sami zahtevajo prerazporeditev in nagrade; skrbniki vzdržujejo protokolarno uro.

━━━━━━━━━━━━━━━━━━━━
11. TVEGANJA
━━━━━━━━━━━━━━━━━━━━

• tveganje pametne pogodbe in nadgradnje,
• tržno tveganje za ceno PIERRON (brez zajamčenega dviga kljub opeklini / dnu),
• provizije SOL za neuspele ali ponavljajoče se transakcije,
• brez jamstva za dobiček — prerazporeditev in bonus zvestobe nista depozitni produkt.

Uporaba aplikacije pomeni sprejetje pravil v verigi in zgoraj navedenih tveganj.

Pierron — pregledna tokenomika in resnična uporaba.`;
