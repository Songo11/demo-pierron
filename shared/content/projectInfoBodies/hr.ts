export const PROJECT_INFO_BODY = `PIERRON — INFORMACIJE O PROJEKTU
Verzija 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. je kratica za "PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK",
ili kolokvijalno CPDDC (Centralized Pool Decentralized Digital Currency).

To je kriptovaluta na Solana koja kombinacijom 49 različitih mehanizama tvori autonoman, decentraliziran ekosustav osmišljen da pojedinačnom korisniku pruži najviši oblik financijske sigurnosti.

Projekt je osmišljen za apsolutnu transparentnost prema korisniku te da korisnik ne mora vjerovati proizvodu.

Pravila ugrađena u projekt su konačna i ne mogu se mijenjati.

PIERRON ekosustav potpuno je autonoman: ne zahtijeva administratora i nema ga. Projekt također nema podršku ili službu za korisnike. Sve odluke i radnje koje poduzima korisnik u ekosustavu isključivo su odgovornost korisnika. Kreator projekta ne odgovara za pogrešne odluke ili pogreške korisnika.

PIERRON ima više od 2200 formalnih dokaza bez grana koje sadrže assume, admit, external_body, vacuity ili nedovoljno specificiranih grana.

━━━━━━━━━━━━━━━━━━━━
1. ŠTO JE PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron je token protokol na Solana blockchainu. Ekonomska pravila (ograničenja, doprinos 1% skupu, hlađenje, redistribucija, bonus vjernosti, emisija i sagorijevanje) provode se u lancu programima pametnih ugovora — a ne samo da su opisana u dokumentaciji.

PIERRON token (SPL Token-2022) kombinira:

• službeno trgovanje DEX s ograničenjima po trgovini i hlađenjem,
• doprinos 1% fondu za redistribuciju — nadoknadiv nakon ciklusa aktivnosti (nije "kazna za trgovanje"),
• ciklusi aktivnosti i traženje udjela u bazenu,
• bonus za vjernost na temelju količine,
• kontrolirana emisija u tržišni bazen plus raspored sagorijevanja,
• SOL naknada za najnižu cijenu za službene zamjene,
• Safe Send (više privatnih prijenosa) i Pierron Pay (trgovačka plaćanja).

Mobilna aplikacija i dapp grade transakcije. Izvor istine za pravila je kod postavljen na Solana.

━━━━━━━━━━━━━━━━━━━━
2. NAČELA DIZAJNA
━━━━━━━━━━━━━━━━━━━━

• Pravila u kodu — ograničenja i prihvatljivost provjerava program.
• Aktivnost nad veleprodajnim špekulacijama — stroga ograničenja po transakciji i po epohi.
• Dio bazena za stvarnu aktivnost ciklusa, a ne samo za držanje u mirovanju.
• Strukturna deflacija — velika raspodjela sagorijevanja i fiksni raspored sagorijevanja.
• Odvojeni putovi rizika — nagodba i stealth su odvojeni programi; isplate iz trezora zahtijevaju važeće kupone.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMIKA (PONUDA)
━━━━━━━━━━━━━━━━━━━━

Jedinica: UI token (6 decimalna mjesta u lancu).

Ukupna ponuda: 150,000,000,000 PIERRON (150 milijardi)

Dodjela:
• Market pool (escrow → DEX): 60B (40%)
• Novčanik za programere: 21B (14%)
• Bonus vjernosti: 7B (~4.7%)
• Spaljivanje (trezor + raspored): 56B (~37.3%)
• Riznica: 6B (4%)

Emisija: svake epohe protokol oslobađa tokene iz escrow u DEX skup prema kvoti epohe — višoj pri genezi, a zatim standardnoj.

Spaljivanje: iz trezora spaljivanja fiksnom stopom tijekom otprilike 20 kalendarskih godina epoha dok se ne potroši alokacija spaljivanja.

Duljina epohe: 21,600 sekundi (6 sati). Epoha 0 počinje vremenskom oznakom nastanka protokola.

━━━━━━━━━━━━━━━━━━━━
4. ARHITEKTURA (KRATKO)
━━━━━━━━━━━━━━━━━━━━

• Pierron program — računovodstvo, DEX limiti, trgovačka knjiga, bonus vjernosti, redistribucija, tikovi, spaljivanje, donja cijena
• Transfer Hook — Token-2022 klasifikacija prijenosa; ograničenja i doprinos 1% na službenim stazama
• Settlement — isplate iz trezora (preraspodjela, bonus za vjernost, nagrade za čuvare) nakon pripreme vaučera
• Stealth — registrirajte, pošaljite i zatražite (Safe Send)
• TradeBook / korisnički račun — aktivnost, količina, ulaznice, bitmapa epohe, broj zahtjeva
• Čuvari mreže — napredne epohe, emisija/sagorijevanje i izvlačenja; ne zahtijevaju redistribuciju ili nagrade za korisnike

━━━━━━━━━━━━━━━━━━━━
5. PRAVILA TRGOVANJA
━━━━━━━━━━━━━━━━━━━━

SLUŽBENI PUT
Trgujte putem swapa u aplikaciji Pierron (DEX skup prema pravilima protokola), s uputama o ograničenju i prijenosu. Prijenosi izvan dopuštenih putova mogu biti odbijeni ili drugačije klasificirani.

1% DOPRINOS (MOŽE SE POVRATITI — NIJE KAZNA)
1% službenog volumena trgovine ide u zajednički skup redistribucije. Ovo nije kaznena naknada niti trajno trošenje vaših sredstava: uz dovoljno aktivnosti ekosustava možete povratiti svoj udio u bazenu nakon završetka ciklusa.

Ciklus redistribucije traje 28 epoha. Sa 6-satnim epohama to je 7 dana. Nakon što se ciklus zatvori, korisnici koji ispunjavaju uvjete traže svoj udio u skupu u aplikaciji.

Uvjet oporavka: dovoljna aktivnost u ciklusu (uključujući najmanje 9 aktivne epohe u bitmapi 28-epohe i održavanje najmanje 10 PIERRON) — pogledajte Redistribuciju. Bez aktivnosti ekosustava nema udjela u bazenu; s doprinosom plus aktivnost, trgovanje gradi pravo na povrat iz skupa — ne samo trošak trgovanja.

Doprinos 1% ne može se onemogućiti u postavkama — on je dio protokola.

NAJNIŽA CIJENA (SOL)
Za službene zamjene potrebna je SOL naknada proporcionalna volumenu PIERRON (100 lamports po 1 PIERRON). Sredstva idu u riznicu najniže cijene i mogu podržati likvidnost/donji prag.

OGRANIČENJE PO TRANSAKCIJI
Maksimalni PIERRON po transakciji ovisi o primljenim redistribuiranim zahtjevima:

• 0–24 zahtjeva: 13,000,000 PIERRON
• ≥ 25 zahtjeva: 16,000,000 PIERRON
• ≥ 75 zahtjeva: 19,000,000 PIERRON
• ≥ 175 zahtjeva: 24,000,000 PIERRON
• ≥ 375 zahtjeva: 34,000,000 PIERRON (gornja granica)

HLAĐENJE IZMEĐU ZAMJENA
• 0–24 zahtjeva: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Rani pokušaj zamjene odbijen je u lancu.

PRVA ZAMJENA
Prva službena transakcija na računu mora biti najmanje 2 PIERRON.

GLOBALNO OGRANIČENJE PRODAJE PO EPOHI
Ukupna prodaja svih korisnika u epohi dijeli gornju granicu koja raste s ukupnim zahtjevima za protokol:

• pod 25 ukupnim zahtjevima: 2,000,000,000 PIERRON
• pod 75: 3,000,000,000
• pod 175: 5,000,000,000
• pod 375: 7,000,000,000
• 375+: 9,000,000,000

Također se primjenjuju ograničenja količine i transakcija po korisniku u epohi (uključujući do 100 txs po epohi i ograničenje količine po korisniku).

━━━━━━━━━━━━━━━━━━━━
6. PRERADISTRIBUCIJA — POVRAT DOPRINOSA 1%
━━━━━━━━━━━━━━━━━━━━

ZAŠTO 1% POSTOJI
Svaki službeni swap stavlja 1% u zajednički skup. Nakon 28 epoha (7 dana u 6-satnim epohama) skup se dijeli između ljudi koji su bili dovoljno aktivni u ekosustavu. Aktivno trgovanje + aktivnost ciklusa = pravo na potraživanje iz skupa. Neaktivnost = nema dijeljenja. Ovo je mehanizam lojalnosti/povrata doprinosa, a ne kazna za trgovanje.

Doprinos 1% osmišljen je da privremeno veže dio kapitala u ekosustavu i neizravno obeshrabri napade Sybil.

IZVOR SKUPA
Doprinos 1% iz službenih zamjena financira trezor za redistribuciju.

CIKLUS I VRIJEME
• ciklus: 28 epoha = 7 dana (epoha = 6 h),
• nakon zatvaranja ciklusa skup se dijeli (udio ≈ skup / prihvatljivi broj),
• zahtjev u aplikaciji kada se ispuni uvjete.

PRIHVATLJIVOST (DOVOLJNO AKTIVNOSTI)
• najmanje 9 aktivnih epoha u bitmapi 28-epohe,
• održavajte najmanje 10 PIERRON ravnotežu,
• aktivnost priznata protokolom (službeni putevi trgovanja/protokola).

POTRAŽIVANJE
• korisnik pokreće zahtjev u aplikaciji (pripremi → podmiri → konzumiraj),
• čuvari ne polažu prava za korisnika,
• vaučeri ostaju valjani približno 28 epoha — oni koji nisu iskorišteni mogu isteći,
• naknada za potraživanje protokola u PIERRON je 0; korisnik plaća SOL mrežnu naknadu,
• uspješan zahtjev podiže brojač zahtjeva → viši limit zamjene i kraće vrijeme hlađenja.

━━━━━━━━━━━━━━━━━━━━
7. BONUS VJERNOSTI
━━━━━━━━━━━━━━━━━━━━

ULAZNICE
• zarađen od službene količine trgovine (prag: 10 PIERRON količina → 1 ulaznica),
• najviše 50 ulaznica po korisniku po prozoru,
• nacrtati prozore svake 7 epohe unutar ciklusa 28-epoha.

IZVLAČENJE
• čuvari podnose slučajnost obveza (commit–reveal),
• izvlačenja zahtijevaju minimalni broj obveza (produkcijski pod: 20) i minimalni fond ulaznica,
• nakon prozora: izvlačenje ili preskakanje (premalo ulaznica),
• nagrada: 2,000,000 PIERRON po izvlačenju (od dodjele bonusa za vjernost),
• isplata: priprema → nagodba → potraživanje od strane pobjednika.

VALJANOST BONOVA
Vaučer za preuzimanje lutrijskog airdropa vrijedi 7 epoha, a zatim istječe.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND I PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Registrirajte se → pošaljite u skriveni trezor → zahtjev primatelja. Potraživanje može zahtijevati dvije transakcije. Ovo je privatniji put prijenosa — ne zaobilazi ograničenja zamjene ili doprinos 1%.

PIERRON PAY
Plaćanje na račun trgovca s instrukcijom za plaćanje. Hook klasificira prijenos kao Pay, a ne kao uobičajenu DEX prodaju.

PRAVILA
• nemojte koristiti ove putove za zaobilaženje službenih ograničenja trgovanja ili doprinosa 1%,
• uvijek provjerite adresu primatelja / QR prije slanja — greške u lancu su nepopravljive.

━━━━━━━━━━━━━━━━━━━━
9. PRAVILA KORIŠTENJA APLIKACIJE
━━━━━━━━━━━━━━━━━━━━

1. Povežite samo pouzdan novčanik. Nikada ne dijelite svoju početnu frazu s "podrškom" ili strancima.
2. Zamijeni: odobri cijeli niz u novčaniku; ne zatvarajte novčanik sredinom potpisa.
3. Poštujte hlađenje — ponovno dodirivanje ne poništava pravila u lancu.
4. Potraživanje preraspodjele/bonusa vjernosti: samo kada aplikacija pokaže spremnost; nakon uspjeha pričekajte mrežnu sinkronizaciju prije sljedeće izmjene.
5. Na Android (agresivni OEM): ostanite u novčaniku do POTVRDE, zatim se vratite na Pierron; nemojte ugasiti aplikaciju u pozadini.
6. Zabranjeno: napadi na programe, krađa identiteta pod imenom Pierron, RPC neželjena pošta, pokušaji iskorištavanja nagodbe / kuke.

━━━━━━━━━━━━━━━━━━━━
10. GOSPODARSKA PETLJA
━━━━━━━━━━━━━━━━━━━━

Escrow oslobađa tokene u skup DEX svake epohe.
Trgovanje stavlja doprinos 1% u fond za redistribuciju (nadoknadiv nakon 7 dana / 28 epohe s dovoljno aktivnosti), bonus ulaznice za vjernost i SOL naknadu za minimalnu cijenu.
Aktivnost u ciklusu 28-epohe kvalificira vas da povratite dio skupa.
Bonus za vjernost izvlači se u prozorima 7-epohe.
Spaljivanje istodobno smanjuje ponudu prema rasporedu.
Korisnici sami traže redistribuciju i nagrade; čuvari održavaju protokolarni sat.

━━━━━━━━━━━━━━━━━━━━
11. RIZICI
━━━━━━━━━━━━━━━━━━━━

• rizik pametnog ugovora i nadogradnje,
• tržišni rizik za cijenu PIERRON (nema zajamčenog porasta usprkos paljenju/donjem),
• SOL naknade za neuspjele ili ponovljene transakcije,
• nema jamstva profita — redistribucija i bonus vjernosti nisu depozitni proizvod.

Korištenje aplikacije znači prihvaćanje pravila u lancu i gore navedenih rizika.

Pierron — transparentna tokenomika i stvarna upotreba.`;
