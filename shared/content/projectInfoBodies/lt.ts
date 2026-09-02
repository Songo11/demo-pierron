export const PROJECT_INFO_BODY = `PIERRON — PROJEKTO INFORMACIJA
Versija 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. reiškia „PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK“,
arba šnekamojoje kalboje CPDDC (Centralized Pool Decentralized Digital Currency).

Tai Solana kriptovaliuta, kuri, derindama skirtingus 49 mechanizmus, sudaro autonominę, decentralizuotą ekosistemą, sukurtą užtikrinti aukščiausią finansinį saugumą individualiam vartotojui.

Projektas buvo sukurtas siekiant visiško skaidrumo vartotojo atžvilgiu ir tam, kad vartotojui nereikėtų pasitikėti produktu.

Projekte įtvirtintos taisyklės yra galutinės ir negali būti keičiamos.

PIERRON ekosistema yra visiškai savarankiška: jai nereikia administratoriaus ir jo nėra. Projekte taip pat nėra palaikymo tarnybos ar klientų aptarnavimo. Už visus vartotojo sprendimus ir veiksmus ekosistemoje atsako tik vartotojas. Projekto kūrėjas neatsako už klaidingus vartotojo sprendimus ar klaidas.

PIERRON turi daugiau nei 2200 formalių įrodymų be assume, admit, external_body, vacuity ar nepakankamai nurodytų šakų.

━━━━━━━━━━━━━━━━━━━━
1. KAS YRA PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron yra žetonų protokolas Solana blokų grandinėje. Ekonominės taisyklės (ribos,  1% įnašas į fondą, atšalimas, perskirstymas, lojalumo premija, emisija ir deginimas) yra vykdomos grandinėje naudojant išmaniųjų sutarčių programas, o ne tik aprašytas dokumentuose.

Žetonas PIERRON (SPL Token-2022) sujungia:

• Oficiali DEX prekyba su prekybos limitais ir atšalimu,
• 1% įnašas į perskirstymo fondą – susigrąžintinas po veiklos ciklo (ne „nuobauda už prekybą“),
• veiklos ciklai ir reikalavimas gauti dalį fondo,
• lojalumo premija, pagrįsta apimtimi,
• kontroliuojamas išmetimas į rinkos baseiną ir degimo grafikas,
• SOL kainos ir žemiausios ribos mokestis už oficialius apsikeitimo sandorius,
• Safe Send (daugiau privačių pervedimų) ir Pierron Pay (prekybininkų mokėjimai).

Programėlė mobiliesiems ir „dapp“ kuria operacijas. Taisyklių tiesos šaltinis yra Solana įdiegtas kodas.

━━━━━━━━━━━━━━━━━━━━
2. PROJEKTAVIMO PRINCIPAI
━━━━━━━━━━━━━━━━━━━━

• Taisyklės kode – ribas ir tinkamumą tikrina programa.
• Veikla prieš didmeninę spekuliaciją – griežtos ribos vienai operacijai ir epochai.
• Baseino dalis skirta tikrajai veiklai dviračiu, o ne vien tik tuščiąja eiga.
• Struktūrinė defliacija – didelis degimo kiekis ir fiksuotas degimo grafikas.
• Atskirti rizikos keliai – atsiskaitymas ir slaptumas yra atskiros programos; Išmokėjimui saugykloje reikia galiojančių kuponų.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMIKA (TIEKIMAS)
━━━━━━━━━━━━━━━━━━━━

Matavimo vienetas: vartotojo sąsajos prieigos raktas (6 po kablelio grandinėje).

Visas tiekimas:  150,000,000,000 PIERRON (150 mlrd.)

Paskirstymas:
• Rinkos fondas (escrow → DEX): 60B (40%)
• Kūrėjo piniginė:  21B (14%)
• Lojalumo premija:  7B (~4.7%)
• Įdegimas (skliauto + tvarkaraštis):  56B (~37.3%)
• Iždas:  6B (4%)

Išmetimas: kiekvieną epochą protokolas išleidžia žetonus iš escrow į DEX telkinį pagal epochos kvotą – didesnę atsiradimo metu, tada standartinę.

Nudegimas: nuo degimo saugyklos fiksuotu greičiu maždaug per 20 kalendorinius epochų metus, kol išnaudotos degimo vietos.

Epochos ilgis:  21,600 sekundės (6 valandos). Epoch 0 prasideda nuo protokolo atsiradimo laiko žymos.

━━━━━━━━━━━━━━━━━━━━
4. ARCHITEKTŪRA (TRUMPAI)
━━━━━━━━━━━━━━━━━━━━

• Programa Pierron — apskaita, DEX limitai, prekybos knyga, lojalumo premija, perskirstymas, erkės, deginimas, žemiausios kainos
• Transfer Hook — Token-2022 perdavimo klasifikacija; ribos ir 1% indėlis oficialiuose keliuose
• Settlement – išmokėjimai saugykloje (perskirstymas, lojalumo premija, saugotojo apdovanojimai) paruošus kuponą
• Stealth – registruokite, siųskite ir reikalaukite (Safe Send)
• TradeBook / vartotojo paskyra – veikla, apimtis, bilietai, epochos taškinė schema, paraiškų skaičius
• Tinklo laikytojai – išankstinės epochos, emisija/deginimas ir lygiosios; jie nepretenduoja į perskirstymą ar prizus vartotojams

━━━━━━━━━━━━━━━━━━━━
5. PREKYBOS TAISYKLĖS
━━━━━━━━━━━━━━━━━━━━

OFICIALUS KELIAS
Prekiaukite apsikeitimo sandoriu programoje Pierron (DEX baseinas pagal protokolo politiką) su limito ir perdavimo kablio instrukcijomis. Pervedimai už leistinų kelių gali būti atmesti arba klasifikuojami kitaip.

1% ĮNAŠAS (ATGAUŽINAMAS – NE BAUDA)
1% oficialios prekybos apimties patenka į bendrą perskirstymo fondą. Tai nėra baudžiamasis mokestis ir ne nuolatinis jūsų lėšų deginimas: turėdami pakankamai ekosistemos veiklos, pasibaigus ciklui galite susigrąžinti savo fondo dalį.

Perskirstymo ciklas trunka 28 epochas. Su 6 valandų epochomis, tai yra 7 dienos. Pasibaigus ciklui, tinkami naudotojai pareikalauja savo dalies iš programos telkinio.

Atkūrimo sąlyga: pakankamas aktyvumas cikle (įskaitant bent 9 aktyvias epochas 28 epochos bitų schemoje ir bent 10 PIERRON palaikymą) – žr. Perskirstymą. Be ekosistemos veiklos nėra baseino dalies; su įnašu ir veikla, prekyba suteikia teisę susigrąžinti iš fondo, o ne tik prekybos išlaidas.

1% įnašo negalima išjungti nustatymuose – tai yra protokolo dalis.

Grindų kaina (SOL)
Oficialiam apsikeitimui reikalingas SOL mokestis, proporcingas PIERRON tūriui (100 lamports už 1 PIERRON). Lėšos patenka į žemiausios kainos iždą ir gali palaikyti likvidumą / žemiausią ribą.

VIENO SANDORIO LIMITAS
Maksimalus PIERRON per operaciją priklauso nuo gautų perskirstytų pretenzijų:

•  0–24 pretenzijos:  13,000,000 PIERRON
• ≥ 25 pretenzijos:  16,000,000 PIERRON
• ≥ 75 pretenzijos:  19,000,000 PIERRON
• ≥ 175 pretenzijos:  24,000,000 PIERRON
• ≥ 375 pretenzijos:  34,000,000 PIERRON (dangtelis)

ATŠALIMAS TARP KEITIMO
•  0–24 pretenzijos:  120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Ankstyvas apsikeitimo bandymas grandinėje atmetamas.

PIRMAS SWAP
Pirmoji oficiali operacija sąskaitoje turi būti bent 2 PIERRON.

GLOBAL EPOCH SELL CAP
Bendras visų naudotojų pardavimas per tam tikrą epochą turi viršutinę ribą, kuri didėja kartu su protokolo paraiškomis:

• pagal 25 bendra ieškinių suma: 2,000,000,000 PIERRON
• pagal 75: 3,000,000,000
• pagal 175: 5,000,000,000
• pagal 375: 7,000,000,000
• 375+: 9,000,000,000

Taip pat taikomi naudotojo epochos apimties ir operacijų apribojimai (įskaitant iki 100 txs per epochą ir vienam vartotojui taikomą apimties ribą).

━━━━━━━━━━━━━━━━━━━━
6. PASKIRSTYMAS – 1% ĮNAŠIO ATGAVIMAS
━━━━━━━━━━━━━━━━━━━━

KODĖL YRA 1%
Kiekvienas oficialus apsikeitimas įdeda 1% į bendrą baseiną. Po 28 epochų (7 dienų 6 valandų epochose) baseinas yra padalintas tarp žmonių, kurie buvo pakankamai aktyvūs ekosistemoje. Aktyvi prekyba + ciklo veikla = teisė reikalauti iš fondo. Neaktyvumas = nėra dalijimosi. Tai yra lojalumo / įmokų susigrąžinimo mechanizmas, o ne bauda už prekybą.

Įnašas 1% skirtas laikinai surišti dalį kapitalo ekosistemoje ir netiesiogiai atgrasyti nuo Sybil atakų.

BASEINO ŠALTINIS
1% įnašas iš oficialių apsikeitimo sandorių finansuoja perskirstymo saugyklą.

CIKLAS IR LAIKAS
• ciklas:  28 epochos = 7 dienos (epocha = 6 h),
• pasibaigus ciklui, fondas padalijamas (dalis ≈ baseinas / tinkamas skaičius),
• pareikalauti programoje, kai atitiks tinkamumą.

TINKAMUMAS (PAKANKAMA VEIKLA)
• bent 9 aktyvios epochos 28 epochos bitų schemoje,
• išlaikyti bent 10 PIERRON balansą,
• protokolu atpažįstama veikla (oficiali prekyba / protokolo keliai).

REIKALAVIMAS
• vartotojas programėlėje inicijuoja pretenziją (paruošti → atsiskaityti → vartoti),
• laikytojai nepretenduoja į vartotoją,
• kuponai lieka galioti 28 epochų eilės tvarka – nepaimti gali baigtis,
• protokolo ieškinio mokestis PIERRON yra 0; vartotojas moka SOL tinklo mokestį,
• sėkminga pretenzija padidina pretenzijų skaitiklį → didesnis apsikeitimo limitas ir trumpesnis atšalimas.

━━━━━━━━━━━━━━━━━━━━
7. LOJALUMO BONUSAS
━━━━━━━━━━━━━━━━━━━━

BILIETAI
• uždirbta iš oficialios prekybos apimties (slenkstis:  10 PIERRON apimtis → 1 bilietas),
• maks. 50 bilietų vienam vartotojui viename lange,
• piešti langus kiekvieną 7 epochą 28 epochos ciklo metu.

PIEŠTI
• laikytojai pateikia atsitiktinumo įsipareigojimus (commit–reveal),
• traukiant reikia minimalaus įsipareigojimų skaičiaus (gamybos aukštas:  20) ir minimalaus bilietų fondo,
• po lango: pieškite arba praleiskite (per mažai bilietų),
• prizas:  2,000,000 PIERRON per lošimą (iš lojalumo premijos paskirstymo),
• išmokėjimas: paruošti → atsiskaityti → reikalauti laimėtojo.

KUPONIO GALIOJIMAS
Kuponas, skirtas pretenduoti į loterijos oro lašą, galioja 7 epochas, tada baigiasi.

━━━━━━━━━━━━━━━━━━━━
8. SAUGU SIUNTI IR PIERRON MOKĖTI
━━━━━━━━━━━━━━━━━━━━

SAUGU SIUNTI
Registruotis → siųsti į slaptą saugyklą → gavėjo pretenzija. Reikalavimui gali prireikti dviejų sandorių. Tai labiau privatus perdavimo kelias – jis neapeina apsikeitimo limitų ar 1% įnašo.

PIERRON MOKĖJIMAS
Mokėjimas į prekybininko sąskaitą su mokėjimo nurodymu. Kablys klasifikuoja pervedimą kaip mokėjimą, o ne kaip įprastą DEX pardavimą.

TAISYKLĖS
• nesinaudokite šiais būdais norėdami apeiti oficialius prekybos limitus arba 1% įnašą,
• prieš siųsdami visada patikrinkite gavėjo adresą / QR – grandinės klaidos yra negrįžtamos.

━━━━━━━━━━━━━━━━━━━━
9. PROGRAMŲ NAUDOJIMO TAISYKLĖS
━━━━━━━━━━━━━━━━━━━━

1. Prijunkite tik patikimą piniginę. Niekada nesidalinkite savo pradine fraze su „parama“ ar nepažįstamais žmonėmis.
2. Swap: patvirtinkite visą seką piniginėje; neuždarykite piniginės viduryje parašo.
3. Gerbkite atvėsimą – bakstelėjimas dar kartą nepaiso grandinės taisyklių.
4. Perskirstymas / lojalumo premijos reikalavimas: tik tada, kai programa rodo pasirengimą; po sėkmės palaukite tinklo sinchronizavimo prieš kitą apsikeitimą.
5. Android (agresyvūs OEM): pasilikite piniginėje, kol PATVIRTINTI, tada grįžkite į Pierron; nežudykite programos fone.
6. Draudžiama: atakos prieš programas, sukčiavimas Pierron vardu, RPC šlamštas, atsiskaitymo / užsikabinimo išnaudojimo bandymai.

━━━━━━━━━━━━━━━━━━━━
10. EKONOMINĖ KILPA
━━━━━━━━━━━━━━━━━━━━

Escrow kiekvieną epochą išleidžia žetonus į DEX telkinį.
Prekyba perskirsto 1% įnašą (susigrąžinama po 7 dienų /  28 epochos, kai pakankamai aktyvus), lojalumo premijos bilietus ir SOL kainos žemiausios ribos mokestį.
28 epochos ciklo veikla leidžia susigrąžinti dalį baseino.
Lojalumo premija skiriama 7 epochos languose.
Burn sumažina tiekimą lygiagrečiai pagal grafiką.
Vartotojai patys pretenduoja į perskirstymą ir prizus; prižiūrėtojai tvarko protokolo laikrodį.

━━━━━━━━━━━━━━━━━━━━
11. RIZIKOS
━━━━━━━━━━━━━━━━━━━━

• išmaniųjų sutarčių sudarymo ir atnaujinimo rizika,
• rinkos rizika dėl PIERRON kainos (negarantuojama, kad pakils, nepaisant degimo / grindų),
• SOL mokesčiai už nepavykusias arba pasikartojančias operacijas,
• jokios pelno garantijos – perskirstymas ir lojalumo premija nėra indėlio produktas.

Programos naudojimas reiškia sutikti su grandinės taisyklėmis ir aukščiau nurodyta rizika.

Pierron – skaidri tokenomika ir tikras naudojimas.`;
