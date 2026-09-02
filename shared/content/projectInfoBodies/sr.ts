export const PROJECT_INFO_BODY = `PIERRON — INFORMACIJE O PROJEKTU
Verzija 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. je skraćenica za „PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK“,
ili kolokvijalno CPDDC (Centralized Pool Decentralized Digital Currency).

To je kriptovaluta na Solana koja, kroz kombinaciju različitih mehanizama 49, formira autonomni, decentralizovani ekosistem dizajniran da pruži najviši oblik finansijske sigurnosti za pojedinačnog korisnika.

Projekat je dizajniran za apsolutnu transparentnost prema korisniku i tako da korisnik ne mora da veruje proizvodu.

Pravila ugrađena u projekat su konačna i ne mogu se menjati.

Ekosistem PIERRON je potpuno autonoman: ne zahteva administratora i nema ga. Projekat takođe nema službu za podršku ili korisničku podršku. Sve odluke i radnje koje korisnik preduzme u ekosistemu su isključivo odgovornost korisnika. Kreator projekta nije odgovoran za pogrešne odluke ili greške korisnika.

PIERRON ima više od 2200 formalnih dokaza bez assume, admit, external_body, vacuity ili nedovoljno specificiranih grana.

━━━━━━━━━━━━━━━━━━━━
1. ŠTA JE PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron je protokol tokena na blokčejnu Solana. Ekonomska pravila (ograničenja, doprinos  1% skupu, hlađenje, redistribucija, bonus za lojalnost, emisija i spaljivanje) se primenjuju na lancu pomoću programa pametnih ugovora — ne samo opisani u dokumentaciji.

Token PIERRON (SPL Token-2022) kombinuje:

• zvanično trgovanje DEX sa ograničenjima po trgovini i hlađenjem,
• doprinos 1% grupi za redistribuciju — nadoknadiv nakon ciklusa aktivnosti (ne „kazna za trgovanje“),
• ciklusi aktivnosti i traženje udela u fondu,
• bonus lojalnosti zasnovan na obimu,
• kontrolisane emisije u pijacu plus raspored spaljivanja,
• SOL naknada za minimalnu cenu za zvanične zamene,
• Safe Send (više privatnih transfera) i Pierron Pay (trgovačka plaćanja).

Mobilna aplikacija i dapp grade transakcije. Izvor istine za pravila je kod postavljen na Solana.

━━━━━━━━━━━━━━━━━━━━
2. PRINCIPI DIZAJNA
━━━━━━━━━━━━━━━━━━━━

• Pravila u kodu — ograničenja i podobnost proveravaju program.
• Aktivnost nad veleprodajnim špekulacijama — stroga ograničenja po transakciji i po epohi.
• Udeo u grupi za realnu aktivnost ciklusa, a ne samo za držanje u praznom hodu.
• Strukturna deflacija — velika alokacija sagorevanja i fiksni raspored sagorevanja.
• Razdvojeni putevi rizika — poravnanje i stealth su odvojeni programi; isplate u trezoru zahtevaju važeće vaučere.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMIKA (NABAVKA)
━━━━━━━━━━━━━━━━━━━━

Jedinica: UI token (6 decimalna mesta u lancu).

Ukupna ponuda:  150,000,000,000 PIERRON (150 milijardi)

Alokacija:
• Tržišni skup (despon → DEX): 60B (40%) (escrow)
• Novčanik za programere:  21B (14%)
• Bonus lojalnosti:  7B (~4.7%)
• Narezivanje (trezor + raspored): 56B (~37.3%)
• Trezor:  6B (4%)

Emisija: svaka epoha protokola oslobađa tokene sa deponovanja u fond DEX pod kvotom epohe — većom u nastanku, a zatim standardnom. (escrow)

Spaljivanje: iz trezora sagorevanja po fiksnoj stopi tokom oko 20 kalendarskih godina epoha dok se ne iscrpi alokacija sagorevanja.

Dužina epohe:  21,600 sekundi (6 sati). Epoha 0 počinje sa vremenskom oznakom geneze protokola.

━━━━━━━━━━━━━━━━━━━━
4. ARHITEKTURA (KRATKO)
━━━━━━━━━━━━━━━━━━━━

• Pierron program — računovodstvo, DEX limiti, trgovačka knjiga, bonus lojalnosti, redistribucija, tikovi, spaljivanje, donji prag cena
• Transfer Hook — Token-2022 klasifikacija prenosa; granice i doprinos 1% na službenim putevima
• Settlement — isplate u trezoru (preraspodela, bonus lojalnosti, nagrade čuvara) nakon pripreme vaučera
• Stealth — registrujte se, pošaljite i zatražite (Safe Send)
• TradeBook / korisnički nalog — aktivnost, obim, karte, bitmap epohe, broj zahteva
• Čuvari mreže — napredne epohe, emisija/sagorevanje i izvlačenje; ne zahtevaju redistribuciju ili nagrade za korisnike

━━━━━━━━━━━━━━━━━━━━
5. PRAVILA TRGOVANjA
━━━━━━━━━━━━━━━━━━━━

ZVANIČNI PUT
Trgujte putem razmene u aplikaciji Pierron (skup DEX prema politici protokola), sa uputstvima za ograničenje i zakačivanje za prenos. Transferi izvan dozvoljenih putanja mogu biti odbijeni ili drugačije klasifikovani. 

1% DOPRINOS (POTVRDIVI — NE KAZNA) 
1% zvaničnog obima trgovine ide u zajednički fond za redistribuciju. Ovo nije kaznena naknada i nije trajno spaljivanje vaših sredstava: uz dovoljno aktivnosti ekosistema možete povratiti svoj udeo u bazenu nakon završetka ciklusa.

Ciklus redistribucije traje 28 epohe. Sa 6-satnim epohama to je 7 dana. Nakon što se ciklus zatvori, korisnici koji ispunjavaju uslove traže svoj udeo iz grupe u aplikaciji.

Uslov oporavka: dovoljna aktivnost u ciklusu (uključujući najmanje 9 aktivne epohe u bitmapu epohe 28 i održavanje najmanje 10 PIERRON) — videti Redistribuciju. Bez aktivnosti ekosistema nema udela u bazenu; uz doprinos plus aktivnost, trgovanje gradi pravo na povraćaj iz fonda — ne samo trošak trgovanja.

Doprinos 1% se ne može onemogućiti u podešavanjima — to je deo protokola.

POD CENA (SOL)
Zvanične zamene zahtevaju naknadu za SOL proporcionalnu zapremini PIERRON (100 lamports po 1 PIERRON). Sredstva idu u blagajnu najniže cene i mogu da podrže likvidnost / prag.

OGRANIČENjE PO TRANSAKCIJI
Maksimalni PIERRON po transakciji zavisi od primljenih redistribuiranih potraživanja:

• 0–24 tvrdi:  13,000,000 PIERRON
• ≥ 25 tvrdnje:  16,000,000 PIERRON
• ≥ 75 tvrdnje:  19,000,000 PIERRON
• ≥ 175 tvrdnje:  24,000,000 PIERRON
• ≥ 375 tvrdnje:  34,000,000 PIERRON (cap)

HLAĐENjE IZMEĐU ZAMENA
• 0–24 tvrdi:  120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Rani pokušaj zamene je odbijen na lancu.

FIRST SVAP
Prva zvanična transakcija na računu mora biti najmanje 2 PIERRON.

GLOBALNA EPOHA PRODAJA KAP
Ukupna prodaja svih korisnika u epohi deli plafon koji raste sa ukupnim zahtevima za protokol:

• pod 25 ukupno potraživanja:  2,000,000,000 PIERRON
• pod 75: 3,000,000,000
• pod 175: 5,000,000,000
• pod 375: 7,000,000,000
• 375+: 9,000,000,000

Primenjuju se i ograničenja obima i transakcija za epohu po korisniku (uključujući do 100 tks po epohi i ograničenje obima po korisniku).

━━━━━━━━━━━━━━━━━━━━
6. REDISTRIBUCIJA — POVRATAK DOPRINOSA 1%
━━━━━━━━━━━━━━━━━━━━

ZAŠTO 1% POSTOJI
Svaka zvanična zamena smešta 1% u zajednički skup. Nakon 28 epoha (7 dana u 6-časovnim epohama) skup se deli na ljude koji su bili dovoljno aktivni u ekosistemu. Aktivno trgovanje + aktivnost ciklusa = pravo potraživanja iz fonda. Neaktivnost = nema udela. Ovo je mehanizam lojalnosti/povraćaja doprinosa, a ne kazna za trgovanje.

1% doprinos je dizajniran da privremeno veže deo kapitala u ekosistemu i da indirektno obeshrabruje Sybil napade.

POOL SOURCE
Doprinos 1% iz zvaničnih svopova finansira trezor za redistribuciju.

CIKLUS I TIMING
• ciklus: 28 epohe = 7 dana (epoha = 6 h),
• nakon što se ciklus zatvori, grupa se deli (udeo ≈ fond / broj prihvatljivih),
• zahtevajte u aplikaciji kada ispunite uslove.

ISPRAVNOST (DOVOLjNA AKTIVNOST)
• najmanje 9 aktivne epohe u bitmapi epohe 28,
• održavati najmanje 10 PIERRON ravnotežu,
• aktivnost koja je priznata protokolom (zvanični trgovački / protokolarni putevi).

CLAIMING
• korisnik pokreće zahtev u aplikaciji (pripremi → podmiri → potroši),
• čuvari ne polažu pravo na korisnika,
• vaučeri ostaju važeći po redosledu 28 epoha — oni koji nisu zatraženi mogu isteći,
• naknada za zahtev za protokol u PIERRON je 0; korisnik plaća SOL mrežnu naknadu,
• uspešan zahtev podiže brojač potraživanja → viši limit razmene i kraće hlađenje.

━━━━━━━━━━━━━━━━━━━━
7. LOIALTI BONUS
━━━━━━━━━━━━━━━━━━━━

ULAZNICE
• zarađen od zvaničnog obima trgovine (prag:  10 PIERRON obim → 1 tiket),
• maksimalno 50 ulaznica po korisniku po prozoru,
• crtati prozore svake 7 epohe u okviru ciklusa 28-epohe.

DRAV
• čuvari predaju urezivanje nasumice (commit–reveal),
• izvlačenja zahtevaju minimalni broj obavezivanja (proizvodni nivo:  20) i minimalni fond ulaznica,
• posle prozora: izvucite ili preskočite (premalo karata),
• nagrada: 2,000,000 PIERRON po izvlačenju (od alokacije bonusa za lojalnost),
• isplata: pripremi → podmiri → potraživanje od pobednika.

VAŽENjE VAUČERA
Vaučer za preuzimanje lutrije važi za 7 epohe, a zatim ističe.

━━━━━━━━━━━━━━━━━━━━
8. SIGURNO POŠALjI I PIERRON PLATI
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Registrujte se → pošaljite u skriveni trezor → zahtev primaoca. Zahtev može zahtevati dve transakcije. Ovo je privatniji put prenosa — ne zaobilazi ograničenja razmene ili doprinos 1%.

PIERRON PAI
Uplata na račun trgovca sa uputom za plaćanje. Hook klasifikuje transfer kao Pai, a ne kao normalnu prodaju DEX.

PRAVILA
• ne koristite ove putanje da biste zaobišli zvanična ograničenja trgovanja ili doprinos 1%,
• uvek proverite adresu primaoca / QR pre slanja — greške u lancu su nepovratne.

━━━━━━━━━━━━━━━━━━━━
9. PRAVILA KORIŠĆENjA APLIKACIJE
━━━━━━━━━━━━━━━━━━━━

1. Povežite samo pouzdani novčanik. Nikada ne delite svoju početnu frazu sa „podrškom“ ili strancima.
2. Zamena: odobri punu sekvencu u novčaniku; ne zatvarajte novčanik u sredini potpisa.
3. Poštujte hlađenje — ponovno tapkanje ne zamenjuje pravila lanca.
4. Zahtev za redistribuciju/bonus lojalnosti: samo kada aplikacija pokaže spremnost; nakon uspeha sačekajte mrežnu sinhronizaciju pre sledeće zamene.
5. Na Android (agresivni OEMs): ostanite u novčaniku do POTVRDE, a zatim se vratite na Pierron; ne ubijaj aplikaciju u pozadini.
6. Zabranjeno: napadi na programe, phishing pod imenom Pierron, RPC neželjena pošta, pokušaji naplate/hook eksploatacije.

━━━━━━━━━━━━━━━━━━━━
10. EKONOMSKA PETLjA
━━━━━━━━━━━━━━━━━━━━

Escrov oslobađa tokene u DEX bazen svake epohe. (Escrow)
Trgovanje stavlja doprinos 1% u fond za redistribuciju (koji se može nadoknaditi nakon 7 dana / 28 epoha sa dovoljnom aktivnošću), tikete za bonus lojalnosti i SOL minimalnu cenu.
Aktivnost u ciklusu 28-epohe vas kvalifikuje da povratite udeo u fondu.
Bonus lojalnosti izvlači u prozorima 7-epohe.
Burn smanjuje snabdevanje paralelno prema rasporedu.
Korisnici sami traže redistribuciju i nagrade; čuvari održavaju sat protokola.

━━━━━━━━━━━━━━━━━━━━
11. RIZICI
━━━━━━━━━━━━━━━━━━━━

• rizik od pametnog ugovora i nadogradnje,
• tržišni rizik za cenu PIERRON (bez zagarantovanog porasta uprkos gorenju/podu),
• SOL naknade za neuspele ili ponovljene transakcije,
• bez garancije dobiti — redistribucija i bonus lojalnosti nisu depozitni proizvod.

Korišćenje aplikacije znači prihvatanje pravila na lancu i gorenavedenih rizika.

Pierron — transparentna tokenomika i stvarna upotreba.`;
