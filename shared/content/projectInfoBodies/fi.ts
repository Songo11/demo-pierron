export const PROJECT_INFO_BODY = `PIERRON — PROJEKTIN TIEDOT
Versio 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. on lyhenne sanoista "PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK",
tai puhekielessä CPDDC (Centralized Pool Decentralized Digital Currency).

Se on Solanan kryptovaluutta, joka 49 erillisen mekanismin yhdistelmän kautta muodostaa itsenäisen, hajautetun ekosysteemin, joka on suunniteltu tarjoamaan korkeimman mahdollisen taloudellisen turvan yksittäiselle käyttäjälle.

Projekti on suunniteltu ehdottoman läpinäkyväksi käyttäjää kohtaan ja siten, että käyttäjän ei tarvitse luottaa tuotteeseen.

Projektiin upotetut säännöt ovat lopulliset, eikä niitä voi muuttaa.

Pierronin ekosysteemi on täysin itsenäinen: se ei vaadi ylläpitäjää eikä sillä ole sellaista. Projektissa ei myöskään ole tukipalvelua tai asiakaspalvelua. Kaikki käyttäjän ekosysteemissä tekemät päätökset ja toimet ovat yksinomaan käyttäjän vastuulla. Projektin luoja ei ole vastuussa käyttäjän virheellisistä päätöksistä tai virheistä.

PIERRONilla on yli 2200 formaalia todistusta ilman assume-, admit-, external_body-, vacuity- tai underspecified branches -haaroja.

━━━━━━━━━━━━━━━━━━━━
1. MIKÄ ON PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron on Solana-lohkoketjun tokenprotokolla. Taloudelliset säännöt (rajat, 1%:n poolimaksu, odotusaika, uudelleenjako, kanta-asiakasbonus, emissio ja poltto) pannaan täytäntöön ketjussa älysopimusohjelmilla — niitä ei ole vain kuvattu dokumentaatiossa.

PIERRON-token (SPL Token-2022) yhdistää:

• virallinen DEX-kaupankäynti kauppakohtaisilla rajoituksilla ja jäähdytyksellä,
• 1%: n rahoitusosuus uudelleenjakopooliin — palautettavissa toimintasyklin jälkeen (ei "rangaistus kaupankäynnistä"),
• aktiviteettisyklit ja uima-altaan osuuden vaatiminen,
• volyymipohjainen kanta-asiakasbonus,
• hallitun emission markkinapooliin sekä polttoaikataulun,
• SOL-hintalattiamaksun virallisissa swapeissa,
• Safe Send (enemmän yksityisiä siirtoja) ja Pierron Pay (kauppiasmaksut).

Mobiilisovellus ja dapp muodostavat transaktiot. Sääntöjen ensisijainen lähde on Solanaan käyttöönotettu koodi.

━━━━━━━━━━━━━━━━━━━━
2. SUUNNITTELUPERIAATTEET
━━━━━━━━━━━━━━━━━━━━

• Koodin säännöt — ohjelma tarkistaa rajoitukset ja kelpoisuuden.
• Aktiviteetti laajamittaisen keinottelun edelle — tiukat rajat transaktiota ja epookkia kohti.
• Pooliosuus syklin todellisesta aktiivisuudesta, ei pelkästä passiivisesta hallussapidosta.
• Rakenteellinen deflaatio — suuri poltto-osuus ja kiinteä polttoaikataulu.
• Erilliset riskipolut — Settlement ja Stealth ovat erillisiä ohjelmia; holvin maksut edellyttävät voimassa olevia tositteita.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMIIKKA (TARJONTA)
━━━━━━━━━━━━━━━━━━━━

Yksikkö: UI-token (6 desimaalia ketjussa).

Kokonaistarjonta: 150,000,000,000 PIERRON (150 miljardia)

Jako:
• Markkinapooli (escrow → DEX): 60B (40%)
• Kehittäjien lompakko: 21B (14%)
• Kanta-asiakasbonus: 7B (~4.7%)
• Poltto (holvi + aikataulu): 56B (~37.3%)
• Treasury: 6B (4%)

Emissio: protokolla vapauttaa jokaisella aikakaudella tokeneita escrow-tililtä DEX-pooliin aikakausikiintiön mukaisesti — enemmän genesis-vaiheessa ja sen jälkeen vakiomäärän.

Poltto: polttoholvista kiinteällä nopeudella noin 20 kalenterivuoden epookkien ajan, kunnes poltto-osuus on käytetty loppuun.

Epookin pituus: 21,600 sekuntia (6 tuntia). Epookki 0 alkaa protokollan genesis-aikaleimasta.

━━━━━━━━━━━━━━━━━━━━
4. ARKKITEHTUURI (LYHYT)
━━━━━━━━━━━━━━━━━━━━

• Pierron-ohjelma — kirjanpito, DEX-rajat, TradeBook, kanta-asiakasbonus, uudelleenjako, ticks, poltto, hintalattia
• Transfer Hook — Token-2022-siirtojen luokittelu; rajat ja 1%:n osuus virallisilla poluilla
• Settlement — holvimaksut (uudelleenjako, kanta-asiakasbonus, keeper-palkkiot) tositteen valmistelun jälkeen
• Stealth — rekisteröi, lähetä ja lunasta (Safe Send)
• TradeBook / käyttäjätili — toiminta, volyymi, liput, aikakauden bittikartta, lunastusten määrä
• Verkon keeperit — edistävät epookkeja, emissiota/polttoa ja arvontoja; ne eivät lunasta uudelleenjakoa tai palkintoja käyttäjien puolesta

━━━━━━━━━━━━━━━━━━━━
5. KAUPANKÄYNTISÄÄNNÖT
━━━━━━━━━━━━━━━━━━━━

VIRALLINEN POLKU
Käy kauppaa Pierron-sovelluksen swap-toiminnolla (protokollan käytäntöjen alainen DEX-pooli) käyttäen raja- ja Transfer Hook -ohjeita. Sallittujen reittien ulkopuoliset siirrot voidaan hylätä tai luokitella eri tavalla.

1%:N MAKSUOSUUS (PALAUTETTAVISSA — EI RANGAISTUS)
1% virallisesta kaupan määrästä menee jaettuun uudelleenjakopooliin. Tämä ei ole rankaiseva maksu eikä rahojesi pysyvä polttaminen: riittävällä ekosysteemitoiminnalla voit saada takaisin osuutesi poolista syklin päätyttyä.

Uudelleenjakosykli kestää 28 aikakautta. 6 tunnin aikakausilla se on 7 päivää. Syklin päätyttyä kelpuutetut käyttäjät lunastavat osuutensa sovelluksen poolista.

Palautusehto: riittävä aktiivisuus syklin aikana (mukaan lukien vähintään 9 aktiivista epookkia 28 epookin bittikartassa ja vähintään 10 PIERRON-tokenin saldo) — katso Uudelleenjako. Ilman ekosysteemiaktiivisuutta ei ole pooliosuutta; maksuosuus ja aktiivisuus yhdessä synnyttävät oikeuden palautukseen poolista — kyse ei ole vain kaupankäyntikulusta.

1%:n maksuosuutta ei voi poistaa käytöstä asetuksissa — se on osa protokollaa.

HINNAN ALARAJA (SOL)
Viralliset swapit edellyttävät PIERRON-volyymiin suhteutettua SOL-maksua (100 lamports per 1 PIERRON). Varat menevät hintalattian treasuryyn, ja niitä voidaan käyttää likviditeetin tai hintalattian tukemiseen.

TRANSAKTIOKOHTAINEN RAJA
PIERRON-tokenien enimmäismäärä transaktiota kohti riippuu saatujen uudelleenjakolunastusten määrästä:

• 0–24 lunastusta: 13,000,000 PIERRON
• ≥ 25 lunastusta: 16,000,000 PIERRON
• ≥ 75 lunastusta: 19,000,000 PIERRON
• ≥ 175 lunastusta: 24,000,000 PIERRON
• ≥ 375 lunastusta: 34,000,000 PIERRON (enimmäismäärä)

SWAPIEN VÄLINEN ODOTUSAIKA
• 0–24 lunastusta: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Aikainen vaihtoyritys hylätään ketjussa.

ENSIMMÄINEN SWAP
Ensimmäisen virallisen tapahtuman tilillä on oltava vähintään 2 PIERRON.

GLOBAALI EPOOKKIKOHTAINEN MYYNTIRAJA
Kaikkien käyttäjien kokonaismyynnillä on epookkikohtainen yhteinen yläraja, joka nousee protokollan lunastusten kokonaismäärän myötä:

• alle 25 lunastusta yhteensä: 2,000,000,000 PIERRON
• alle 75: 3,000,000,000
• alle 175: 5,000,000,000
• alle 375: 7,000,000,000
• 375+: 9,000,000,000

Myös käyttäjäkohtaiset epookkivolyymin ja transaktioiden enimmäismäärät ovat voimassa (mukaan lukien enintään 100 transaktiota epookkia kohti ja käyttäjäkohtainen volyymiraja).

━━━━━━━━━━━━━━━━━━━━
6. UUDELLEENJAKO — 1%:N MAKSUOSUUDEN PALAUTTAMINEN
━━━━━━━━━━━━━━━━━━━━

MIKSI 1% ON OLEMASSA
Jokainen virallinen swap siirtää 1% jaettuun pooliin. 28 epookin jälkeen (7 päivää 6 tunnin epookeilla) pooli jaetaan ekosysteemissä riittävän aktiivisten henkilöiden kesken. Aktiivinen kaupankäynti + sykliaktiivisuus = oikeus lunastaa poolista. Passiivisuus = ei osuutta. Tämä on kanta-asiakkuus- ja maksuosuuden palautusmekanismi, ei rangaistus kaupankäynnistä.

1%:n maksuosuus on suunniteltu sitomaan väliaikaisesti osa ekosysteemin pääomasta ja ehkäisemään epäsuorasti Sybil-hyökkäyksiä.

POOLIN LÄHDE
Virallisten swapien 1%:n maksuosuus rahoittaa uudelleenjakoholvin.

SYKLI JA AJOITUS
• sykli: 28 epookkia = 7 päivää (epookki = 6 h),
• syklin sulkeuduttua pooli jaetaan (osuus ≈ pooli / kelpoisten määrä),
• lunasta sovelluksessa, kun kelpoisuus on täytetty.

KELPOISUUS (RIITTÄVÄ TOIMINTA)
• vähintään 9 aktiivista epookkia 28 epookin bittikartassa,
• vähintään 10 PIERRON-tokenin saldo,
• protokollan tunnustama toiminta (viralliset kaupankäynti- / protokollareitit).

LUNASTAMINEN
• käyttäjä käynnistää lunastuksen sovelluksessa (prepare → settle → consume),
• keeperit eivät lunasta käyttäjän puolesta,
• tositteet ovat voimassa noin 28 epookkia — lunastamattomat tositteet voivat vanhentua,
• protokollan lunastusmaksu PIERRON-tokenina on 0; käyttäjä maksaa SOL-verkkokulun,
• onnistunut lunastus kasvattaa lunastuslaskuria → suurempi swap-raja ja lyhyempi odotusaika.

━━━━━━━━━━━━━━━━━━━━
7. KANTA-ASIAKASBONUS
━━━━━━━━━━━━━━━━━━━━

Liput
• ansaitaan virallisesta kaupankäyntivolyymista (kynnys: 10 PIERRON volyymia → 1 lippu),
• enintään 50 lippua käyttäjää ja ikkunaa kohti,
• arvontaikkunat 7 aikakauden välein 28 aikakauden syklin aikana.

ARVONTA
• keeperit lähettävät satunnaisuuden sitoumukset (commit–reveal),
• arvonnat edellyttävät sitoumusten vähimmäismäärää (tuotannon alaraja: 20) ja lippupoolin vähimmäiskokoa,
• ikkunan jälkeen: arvonta tai ohitus (liian vähän lippuja),
• palkinto: 2,000,000 PIERRON per arvonta (kanta-asiakasbonusosuudesta),
• maksu: prepare → settle → voittajan lunastus.

TOSITTEEN VOIMASSAOLO
Arpajais-airdropin lunastamiseen käytettävä tosite on voimassa 7 epookkia, minkä jälkeen se vanhenee.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND JA PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Rekisteröidy → lähetä Stealth-holviin → vastaanottaja lunastaa. Lunastus voi edellyttää kahta transaktiota. Tämä on yksityisempi siirtopolku — se ei ohita swap-rajoja eikä 1%:n maksuosuutta.

PIERRON PAY
Maksu kauppiaan tilille pay-ohjeella. Hook luokittelee siirron Pay-siirroksi, ei tavalliseksi DEX-myynniksi.

Säännöt
• älä käytä näitä reittejä virallisten kaupankäyntirajojen tai 1%:n maksuosuuden ohittamiseen,
• Vahvista aina vastaanottajan osoite / QR ennen lähettämistä — ketjun virheet ovat peruuttamattomia.

━━━━━━━━━━━━━━━━━━━━
9. SOVELLUKSEN KÄYTTÖSÄÄNNÖT
━━━━━━━━━━━━━━━━━━━━

1. Yhdistä vain luotettu lompakko. Älä koskaan jaa palautuslausettasi ”tuen” tai tuntemattomien kanssa.
2. Vaihda: hyväksy koko järjestys lompakossa; älä sulje lompakkoa allekirjoituksen puolivälissä.
3. Kunnioita jäähdytystä — uudelleen napauttaminen ei ohita ketjun sääntöjä.
4. Uudelleenjaon / kanta-asiakasbonuksen lunastus: vain kun sovellus näyttää sen olevan valmis; odota onnistumisen jälkeen verkon synkronointia ennen seuraavaa swapia.
5. Androidilla (aggressiiviset OEM-valmistajat): pysy lompakossa, CONFIRM-tilaan asti, ja palaa sitten Pierroniin; älä tapa sovellusta taustalla.
6. Kielletty: ohjelmiin kohdistuvat hyökkäykset, tietojenkalastelu Pierron-nimellä, RPC-roskaposti sekä Settlement- tai Hook-haavoittuvuuksien hyödyntämisyritykset.

━━━━━━━━━━━━━━━━━━━━
10. TALOUDELLINEN SILMUKKA
━━━━━━━━━━━━━━━━━━━━

Escrow vapauttaa tokeneita DEX-pooliin jokaisella epookilla.
Kaupankäynti tuottaa 1%:n maksuosuuden uudelleenjakopooliin (palautettavissa 7 päivän / 28 epookin jälkeen riittävällä aktiivisuudella), kanta-asiakasbonuslippuja sekä SOL-hintalattiamaksun.
Aktiivisuus 28 epookin syklissä oikeuttaa lunastamaan osuuden poolista.
Kanta-asiakasbonuksen arvonnat järjestetään 7 epookin ikkunoissa.
Poltto vähentää tarjontaa samanaikaisesti aikataulun mukaisesti.
Käyttäjät lunastavat uudelleenjaon ja palkinnot itse; keeperit ylläpitävät protokollan kelloa.

━━━━━━━━━━━━━━━━━━━━
11. RISKIT
━━━━━━━━━━━━━━━━━━━━

• älysopimus- ja päivitysriski,
• PIERRON-hinnan markkinariski (poltosta tai hintalattiasta huolimatta arvonnousua ei taata),
• epäonnistuneiden tai toistettujen transaktioiden SOL-maksut,
• ei voittotakuuta — uudelleenjako ja kanta-asiakasbonus eivät ole talletustuotteita.

Sovelluksen käyttö tarkoittaa ketjun sääntöjen ja yllä olevien riskien hyväksymistä.

Pierron — läpinäkyvä tokenomiikka ja todellinen käyttö.`;
