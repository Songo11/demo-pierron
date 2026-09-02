export const PROJECT_INFO_BODY = `PIERRON — PROJEKTI INFO
Versioon 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. tähistab "PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK",
või kõnekeeles CPDDC (Centralized Pool Decentralized Digital Currency).

See on Solana krüptovaluuta, mis 49 erinevate mehhanismide kombinatsiooni kaudu moodustab autonoomse, detsentraliseeritud ökosüsteemi, mis on loodud pakkuma üksikule kasutajale kõrgeimat finantsturvalisust.

Projekti eesmärk oli tagada täielik läbipaistvus kasutaja suhtes ja nii, et kasutaja ei peaks toodet usaldama.

Projekti lisatud reeglid on lõplikud ja neid ei saa muuta.

PIERRON ökosüsteem on täielikult autonoomne: see ei vaja administraatorit ja tal pole ka ühtegi. Samuti puudub projektil tugipunkt ega klienditeenindus. Kõik kasutaja poolt ökosüsteemis tehtud otsused ja toimingud on ainuisikuliselt kasutaja vastutusel. Projekti looja ei vastuta kasutaja ekslike otsuste või vigade eest.

PIERRON-l on üle 2200 formaalse tõendi ilma assume, admit, external_body, vacuity või alamääratlemata harudeta.

━━━━━━━━━━━━━━━━━━━━
1. MIS ON PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron on plokiahela Solana märgiprotokoll. Majandusreegleid (limiidid,  1% kogumispanus, jahtumine, ümberjagamine, lojaalsusboonus, heitkogused ja põletamine) jõustavad nutika lepingu programmid ahelas – mitte ainult dokumentatsioonis kirjeldatud.

PIERRON märk (SPL Token-2022) ühendab endas:

• ametlik DEX kauplemine tehingute piirmäärade ja jahtumisega,
• 1% sissemakse ümberjaotuskogumisse – tagastatav pärast tegevustsüklit (mitte „trahv kauplemise eest“);
• tegevustsüklid ja basseiniosa taotlemine,
• mahupõhine lojaalsusboonus,
• kontrollitud heitkogused turubasseini pluss põlemisgraafik,
• ametlike vahetustehingute puhul SOL hinna-põhjatasu,
• Safe Send (rohkem privaatseid ülekandeid) ja Pierron Pay (kaupmehe maksed).

Mobiilirakendus ja dapp loovad tehinguid. Reeglite tõeallikaks on Solana-le juurutatud kood.

━━━━━━━━━━━━━━━━━━━━
2. KUJUNDAMISE PÕHIMÕTTED
━━━━━━━━━━━━━━━━━━━━

• Reeglid koodis – piiranguid ja sobivust kontrollib programm.
• Aktiivsus hulgimüügiga spekuleerimisest lähtuvalt – ranged piirangud tehingu ja ajastu kohta.
• Basseini osa reaalseks rattategevuseks, mitte üksi tühikäigul hoidmiseks.
• Struktuurne deflatsioon – suur põlemisjaotus ja fikseeritud põlemisgraafik.
• Eraldatud riskiteed – arveldamine ja stealth on eraldi programmid; võlvlaega väljamaksete tegemiseks on vaja kehtivaid vautšereid.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOOMIKA (pakkumine)
━━━━━━━━━━━━━━━━━━━━

Ühik: kasutajaliidese tunnus (6 kümnendkohad ahelas).

Kogu tarne:  150,000,000,000 PIERRON (150 miljardit)

Eraldamine:
• Turufond (escrow → DEX): 60B (40%)
• Arendaja rahakott:  21B (14%)
• Lojaalsusboonus:  7B (~4.7%)
• Põlemine (võlv + ajakava): 56B (~37.3%)
• Riigikassa:  6B (4%)

Emissioon: protokoll vabastab igal ajajärgul escrow’st DEX basseini žetoonid ajastu kvoodi alusel – suurem tekkehetkel, siis standardne.

Põlemine: põlemiskambrist fikseeritud kiirusega umbes 20 kalendriaastate epohhide jooksul, kuni põlemisjaotus on ammendatud.

Epohhi pikkus:  21,600 sekundit (6 tundi). Epoch 0 algab protokolli tekke ajatemplist.

━━━━━━━━━━━━━━━━━━━━
4. ARHITEKTUUR (LÜHIDALT)
━━━━━━━━━━━━━━━━━━━━

• Programm Pierron — raamatupidamine, DEX limiidid, kauplemisraamat, lojaalsusboonus, ümberjagamine, linnukesed, põletamine, alamhind
• Transfer Hook — Token-2022 ülekande klassifikatsioon; piirid ja 1% panus ametlikel radadel
• Settlement — varaväljamaksed (ümberjagamine, lojaalsusboonus, hoidja preemiad) pärast vautšeri ettevalmistamist
• Stealth — registreerige, saatke ja taotlege (Safe Send)
• TradeBook / kasutajakonto — tegevus, maht, piletid, epohhi bitmap, nõuete arv
• Võrguhoidjad — edenevad epohhid, emissioonid/põletused ja viigid; nad ei nõua kasutajatele ümberjagamist ega auhindu

━━━━━━━━━━━━━━━━━━━━
5. KAUPLEMISE REEGLID
━━━━━━━━━━━━━━━━━━━━

AMETLIK TEE
Kaubelge vahetustehingu kaudu rakenduses Pierron (DEX bassein protokollipoliitika alusel) koos limiidi- ja ülekandekonksu juhistega. Lubatud radadest väljapoole tehtud ülekanded võidakse tagasi lükata või liigitada erinevalt.

1% PANEKUS (TAGASI – EI OLE TRAHTI)
1% ametlikust kaubandusmahust läheb jagatud ümberjaotuskogumisse. See ei ole karistusmaks ega teie raha pidev põletamine: piisava ökosüsteemi aktiivsusega saate pärast tsükli lõppu oma osa basseinist tagasi nõuda.

Ümberjaotustsükkel kestab 28 ajastuid. 6-tunniste perioodidega, mis on 7 päeva. Pärast tsükli sulgemist taotlevad sobilikud kasutajad oma osa rakenduse kogumist.

Taastetingimus: piisav aktiivsus tsüklis (sealhulgas vähemalt 9 aktiivsed perioodid 28-ajastu bitmapil ja vähemalt 10 PIERRON säilitamine) – vt ümberjaotamist. Ilma ökosüsteemi tegevuseta pole basseini osakaalu; panuse ja tegevusega loob kauplemine õiguse kogumist tagasi nõuda – mitte ainult kauplemiskulu.

1% panust ei saa seadetes keelata – see on osa protokollist.

HIND PÕRAND (SOL)
Ametlikud vahetuslepingud nõuavad SOL tasu, mis on proportsionaalne PIERRON mahuga (100 lamports 1 PIERRON kohta). Vahendid lähevad alampiiri riigikassasse ja võivad toetada likviidsust / alampiiri.

TEHINGU ÜHINE LIIT
Maksimaalne PIERRON tehingu kohta sõltub saadud ümberjaotatud nõuetest:

•  0–24 nõuded: 13,000,000 PIERRON
• ≥ 25 nõuded: 16,000,000 PIERRON
• ≥ 75 nõuded: 19,000,000 PIERRON
• ≥ 175 nõuded: 24,000,000 PIERRON
• ≥ 375 nõuded: 34,000,000 PIERRON (kork)

VAHETUSTE VAHEL JAHUTAMINE
• 0–24 nõuded: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Varajane vahetuskatse lükatakse ahelas tagasi.

ESIMENE VAHETUS
Konto esimene ametlik tehing peab olema vähemalt 2 PIERRON.

GLOBAL EPOCH SELL CAP
Kõikide kasutajate müügi kogumaht ühel perioodil jagab ülemmäära, mis tõuseb koos protokollinõuete kogusummaga:

• 25 alusel esitatud nõuete kogusumma: 2,000,000,000 PIERRON
• 75: 3,000,000,000 all
• 175: 5,000,000,000 all
• 375: 7,000,000,000 all
• 375+: 9,000,000,000

Kehtivad ka kasutajapõhised perioodide mahu ja tehingute piirangud (sealhulgas kuni 100 txs epohhi kohta ja kasutajapõhine mahupiirang).

━━━━━━━━━━━━━━━━━━━━
6. ÜMBERLEOTAMINE — 1% OSALUSE TAASTAMINE
━━━━━━━━━━━━━━━━━━━━

MIKS 1% OLEMAS ON
Iga ametlik vahetus paigutab 1% jagatud basseini. Pärast 28 ajastuid (7 päevad 6-tunniste ajajärkude korral) jagatakse bassein inimeste vahel, kes olid ökosüsteemis piisavalt aktiivsed. Aktiivne kauplemine + tsüklitegevus = nõudeõigus basseinilt. Mitteaktiivsus = jagamine puudub. See on lojaalsuse / sissemaksete taastamise mehhanism, mitte kauplemise eest määratud karistus.

1% panus on loodud selleks, et ajutiselt siduda osa ökosüsteemi kapitalist ja kaudselt takistada Sybil rünnakuid.

BASSEINI ALLIKAS
Ametlikest vahetustehingutest saadav sissemakse 1% rahastab ümberjaotamise vara.

TÜKKEL JA AJASTUS
• tsükkel:  28 epohhid =  7 päeva (epohh = 6 h),
• pärast tsükli sulgemist jagatakse bassein kaheks (osakaal ≈ bassein / kõlblik arv),
• taotlege rakenduses, kui sobivus on täidetud.

KÕLBLIKKUS (PIISAVALT TEGEVUS)
• vähemalt 9 aktiivsed epohhid 28-ajastu bitmapil,
• säilitada vähemalt 10 PIERRON tasakaal,
• protokolliga tunnustatud tegevus (ametlikud kauplemis-/protokolliteed).

NÕUDED
• kasutaja algatab rakenduses nõude (valmista → arvelda → tarbi),
• hoidjad ei nõua kasutaja eest,
• vautšerid jäävad kehtima 28 epochide järjekorras – välja võtmata vautšerid võivad aeguda,
• protokollinõude tasu PIERRON on 0; kasutaja maksab SOL võrgutasu,
• edukas nõue tõstab kahjuloendurit → kõrgem vahetuslimiit ja lühem jahtumine.

━━━━━━━━━━━━━━━━━━━━
7. LOJAALSUSBOONUS
━━━━━━━━━━━━━━━━━━━━

PILETID
• teenitud ametlikust kaubavahetusest (lävi:  10 PIERRON maht → 1 pilet),
• maksimaalselt 50 pileteid kasutaja ja akna kohta
• joonistada aknaid iga 7 ajastu jooksul 28-ajastu tsüklis.

JOONISTA
• pidajad esitavad juhuslikkuse kohustused (commit–reveal),
• loosimised nõuavad minimaalset panuste arvu (tootmispõrand:  20) ja minimaalset piletite kogumit,
• pärast akent: loosi või jäta vahele (liiga vähe pileteid),
• auhind:  2,000,000 PIERRON loosimise kohta (lojaalsusboonuse eraldisest),
• väljamakse: valmista ette → arvelda → nõue võitja poolt.

VOUCHERI KEHTIVUS
Voucher loterii airdrop'i saamiseks kehtib 7 perioodide jaoks, seejärel aegub.

━━━━━━━━━━━━━━━━━━━━
8. OHUTU SAATMINE JA PIERRON MAKSA
━━━━━━━━━━━━━━━━━━━━

OHUTU SAATMINE
Registreeru → saada vargsalve → saaja nõue. Nõue võib nõuda kahte tehingut. See on privaatsem ülekandetee – see ei lähe mööda vahetuspiirangutest ega 1% panusest.

PIERRON PAY
Tasumine kaupmehekontole koos maksejuhisega. Konks liigitab ülekande makseks, mitte tavaliseks DEX müügiks.

REEGLID
• ärge kasutage neid teid ametlikest kauplemislimiitidest või 1% sissemaksest möödahiilimiseks,
• kontrollige alati enne saatmist adressaadi aadressi / QR – ahelasisesed vead on pöördumatud.

━━━━━━━━━━━━━━━━━━━━
9. RAKENDUSE KASUTAMISE REEGLID
━━━━━━━━━━━━━━━━━━━━

1. Ühendage ainult usaldusväärne rahakott. Ärge kunagi jagage oma algfraasi "toe" või võõrastega.
2. Vaheta: kinnitage kogu jada rahakotis; ärge sulgege rahakotti allkirja keskel.
3. Austage jahtumist – uuesti koputamine ei alista ketisiseseid reegleid.
4. Ümberjagamise / lojaalsusboonuse nõue: ainult siis, kui rakendus näitab valmisolekut; pärast õnnestumist oodake võrgu sünkroonimist enne järgmist vahetust.
5. Seadmel Android (agressiivsed OEM-d): püsige rahakotis kuni KINNITAMINE, seejärel naaske Pierron; ärge tapke rakendust taustal.
6. Keelatud: ründed programmide vastu, andmepüük nimega Pierron, RPC rämpspost, arveldamise / konksu ärakasutamise katsed.

━━━━━━━━━━━━━━━━━━━━
10. MAJANDUSLING
━━━━━━━━━━━━━━━━━━━━

Tingdepositoorium vabastab žetoonid DEX kogumisse igal ajastul.
Kauplemine paigutab 1% sissemakse ümberjagamiskogumisse (taastatakse pärast 7 päeva /  28 perioodid piisava aktiivsusega), lojaalsusboonuspiletid ja SOL hinna-põhjatasu.
Tegevus 28-epoch tsüklis võimaldab teil osa basseinist tagasi nõuda.
Lojaalsusboonus loositakse 7-ajastu akendes.
Burn vähendab varustust paralleelselt ajakava järgi.
Kasutajad nõuavad ise ümberjagamist ja auhindu; pidajad peavad protokolli kella.

━━━━━━━━━━━━━━━━━━━━
11. RISKID
━━━━━━━━━━━━━━━━━━━━

• arukate lepingute ja versiooniuuenduse risk,
• tururisk PIERRON hinna puhul (põlemisest/põrandast hoolimata ei ole tõusu garanteeritud),
• SOL tasud ebaõnnestunud või korduvate tehingute eest,
• kasumigarantii puudub – ümberjagamine ja lojaalsusboonus ei ole sissemaksetoode.

Rakenduse kasutamine tähendab ahelasiseste reeglite ja ülaltoodud riskidega nõustumist.

Pierron — läbipaistev tokenoomika ja reaalne kasutus.`;
