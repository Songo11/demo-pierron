export const PROJECT_INFO_BODY = `PIERRON — INFO O PROJEKCIE
Wersja 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. to „PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK”,
lub potocznie CPDDC (Centralized Pool Decentralized Digital Currency).

To kryptowaluta na bazie Solany, która poprzez połączenie 49 różnych mechanizmów tworzy autonomiczny, zdecentralizowany ekosystem mający za zadanie zapewnienie najwyższej formy bezpieczeństwa finansowego dla pojedynczego użytkownika.

Projekt został zaprojektowany tak, by prezentował absolutną transparentność wobec użytkownika oraz nie wymagał zaufania użytkownika wobec produktu.

Reguły zawarte w projekcie są ostateczne i nie podlegają możliwości zmiany.

Ekosystem PIERRON jest w pełni autonomiczny i nie wymaga żadnego zarządcy oraz takowego nie posiada. Projekt również nie posiada żadnego supportu czy obsługi klienta. Wszelkie decyzje i działania podejmowane w ekosystemie przez użytkownika obejmują odpowiedzialnością tylko i wyłącznie użytkownika. Twórca projektu nie odpowiada za błędne decyzje oraz pomyłki użytkownika.

PIERRON posiada ponad 2200 dowodów formalnych bez assume, admit, external_body, vacuity oraz underspecified branchów.

━━━━━━━━━━━━━━━━━━━━
1. CZYM JEST PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron to protokół tokena na blockchainie Solana. Reguły ekonomiczne (limity, składka 1% do puli, cooldown, redystrybucja, bonus lojalnościowy, emisja i spalanie) są egzekwowane on-chain przez programy smart contract — nie tylko opisane w dokumentacji.

Token PIERRON (SPL Token-2022) łączy:

• oficjalny handel na DEX z limitem i cooldownem,
• składkę 1% do puli redystrybucji — odzyskiwalną po cyklu aktywności (nie „karę za handel”),
• cykle aktywności i odbiór udziału z puli,
• bonus lojalnościowy oparty o wolumen handlu,
• kontrolowaną emisję do puli rynkowej oraz harmonogram spalania,
• opłatę SOL (price floor) przy oficjalnych swapach,
• Safe Send (prywatniejsze transfery) oraz Pierron Pay (płatności).

Aplikacja mobilna i dapp budują transakcje. Źródłem prawdy dla reguł jest kod wdrożony na Solanie.

━━━━━━━━━━━━━━━━━━━━
2. ZAŁOŻENIA
━━━━━━━━━━━━━━━━━━━━

• Reguły w kodzie — limity i kwalifikacja są sprawdzane przez program.
• Aktywność ponad hurtową spekulację — twarde limity na transakcję i epokę.
• Udział w puli za realną aktywność w cyklu, nie za samo trzymanie.
• Deflacja strukturalna — duża alokacja burn i stały harmonogram spalania.
• Rozdzielone ścieżki ryzyka — settlement i stealth to osobne programy; wypłaty z vaultów tylko przy ważnych voucherach.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMIKA (SUPPLY)
━━━━━━━━━━━━━━━━━━━━

Jednostka: token UI (6 miejsc po przecinku on-chain).

Całkowita podaż: 150 000 000 000 PIERRON (150 mld)

Podział:
• Pula rynkowa (escrow → DEX): 60 mld (40%)
• Portfel deweloperski: 21 mld (14%)
• Bonus lojalnościowy: 7 mld (~4,7%)
• Burn (vault + harmonogram): 56 mld (~37,3%)
• Treasury: 6 mld (4%)

Emisja: w każdej epoce protokół uwalnia tokeny z escrow do puli DEX według kwoty epokowej — wyższej na starcie (genesis), potem standardowej.

Spalanie: z vaultu burn według stałej stawki przez ok. 20 lat kalendarzowych epok, aż do wyczerpania alokacji burn.

Długość epoki: 21 600 sekund (6 godzin). Epoka 0 zaczyna się w momencie genesis zapisanym w stanie protokołu.

━━━━━━━━━━━━━━━━━━━━
4. ARCHITEKTURA (SKRÓT)
━━━━━━━━━━━━━━━━━━━━

• Program Pierron — accounting, limity DEX, trade book, bonus lojalnościowy, redystrybucja, ticki, burn, price floor
• Transfer Hook — klasyfikacja transferów Token-2022; limity i składka 1% na ścieżkach oficjalnych
• Settlement — wypłaty z vaultów (redystrybucja, bonus lojalnościowy, nagrody keeperów) po przygotowaniu vouchera
• Stealth — rejestracja, wysyłka i odbiór (Safe Send)
• TradeBook / konto użytkownika — aktywność, wolumen, tickety, bitmapa epok, liczba claimów
• Keeperzy sieciowi — przesuwają epoki, emisję/burn i losowania; nie odbierają redystrybucji ani wygranych za użytkownika

━━━━━━━━━━━━━━━━━━━━
5. HANDEL — ZASADY
━━━━━━━━━━━━━━━━━━━━

OFICJALNA ŚCIEŻKA
Handel odbywa się przez swap w aplikacji Pierron (pula DEX zgodna z polityką protokołu), z instrukcjami limitu i transfer hooka. Transfery poza dozwolonymi ścieżkami mogą zostać odrzucone lub inaczej sklasyfikowane.

SKŁADKA 1% (ODZYSKIWALNA — TO NIE KARA)
1% wartości oficjalnego obrotu trafia do wspólnej puli redystrybucji. To nie jest opłata „za karę” ani spalenie Twoich środków na zawsze: przy wystarczającej aktywności w ekosystemie możesz odzyskać swój udział z puli po zakończeniu cyklu.

Cykl redystrybucji trwa 28 epok. Przy epoce 6-godzinnej to 7 dni. Po domknięciu cyklu uprawnieni użytkownicy odbierają udział z puli (claim w aplikacji).

Warunek odzyskania: wystarczająca aktywność w cyklu (m.in. co najmniej 9 aktywnych epok w bitmapie 28 oraz utrzymanie minimum 10 PIERRON) — szczegóły w sekcji Redystrybucja. Bez aktywności w ekosystemie udział z puli się nie należy; ze składką i aktywnością handel buduje prawo do zwrotu z puli, a nie tylko koszt transakcji.

Składki 1% nie da się wyłączyć w ustawieniach — jest częścią protokołu.

PRICE FLOOR (SOL)
Przy oficjalnym swapie wymagana jest opłata SOL proporcjonalna do wolumenu PIERRON (100 lamportów na 1 PIERRON). Środki trafiają do skarbca price floor i mogą wspierać płynność / poziom floora.

LIMIT JEDNEJ TRANSAKCJI
Maksimum PIERRON na jedną transakcję zależy od liczby odebranych claimów redystrybucji:

• 0–24 claimów: 13 000 000 PIERRON
• ≥ 25 claimów: 16 000 000 PIERRON
• ≥ 75 claimów: 19 000 000 PIERRON
• ≥ 175 claimów: 24 000 000 PIERRON
• ≥ 375 claimów: 34 000 000 PIERRON (maksimum)

COOLDOWN MIĘDZY SWAPAMI
• 0–24 claimów: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Próba wcześniejszego swapu kończy się odrzuceniem transakcji on-chain.

PIERWSZY SWAP
Pierwsza oficjalna transakcja na koncie musi mieć co najmniej 2 PIERRON.

LIMIT SPRZEDAŻY W EPOCE (GLOBALNY)
Suma sprzedaży wszystkich użytkowników w epoce ma wspólny sufit, rosnący wraz z łączną liczbą claimów w protokole:

• poniżej 25 claimów łącznie: 2 000 000 000 PIERRON
• poniżej 75: 3 000 000 000
• poniżej 175: 5 000 000 000
• poniżej 375: 7 000 000 000
• 375 i więcej: 9 000 000 000

Dodatkowo obowiązują limity wolumenu i liczby transakcji na użytkownika w epoce (m.in. do 100 tx / epokę oraz cap wolumenu per user).

━━━━━━━━━━━━━━━━━━━━
6. REDYSTRYBUCJA — ODZYSKANIE SKŁADKI 1%
━━━━━━━━━━━━━━━━━━━━

PO CO JEST 1%
Każdy oficjalny swap odkłada 1% do wspólnej puli. Po 28 epokach (7 dniach przy epoce 6 h) pula jest dzielona między osoby, które były wystarczająco aktywne w ekosystemie. Aktywny handel + aktywność w cyklu = prawo do claimu z puli. Bezczynność = brak udziału. To mechanizm lojalności i zwrotu składki, nie kara za trading.

Składka 1% ma za zadanie przywiązywać czasowo część kapitału w ekosystemie oraz zniechęcać pośrednio do ataków Sybil.

ŹRÓDŁO PULI
Składka 1% z oficjalnych swapów zasila vault redystrybucji.

CYKL I TERMIN
• cykl: 28 epok = 7 dni (epoka = 6 h),
• po domknięciu cyklu pula jest dzielona (udział ≈ pula / liczba uprawnionych),
• odbiór w aplikacji po spełnieniu warunków kwalifikacji.

KWALIFIKACJA (WYSTARCZAJĄCA AKTYWNOŚĆ)
• co najmniej 9 aktywnych epok w bitmapie cyklu 28,
• utrzymanie minimum 10 PIERRON na koncie,
• aktywność uznana przez protokół (oficjalny handel / ścieżki protokołu).

ODBIÓR (CLAIM)
• użytkownik sam inicjuje odbiór w aplikacji (prepare → settle → consume),
• keeper nie odbiera środków za użytkownika,
• voucher ma ważność rzędu 28 epok — nieodebrany może wygasnąć,
• opłata protokołu w PIERRON przy claimie wynosi 0; użytkownik płaci opłatę sieciową SOL,
• udany claim zwiększa licznik claimów → wyższy limit swapu i krótszy cooldown.

━━━━━━━━━━━━━━━━━━━━
7. BONUS LOJALNOŚCIOWY
━━━━━━━━━━━━━━━━━━━━

TICKETY
• naliczane z oficjalnego wolumenu handlu (próg: 10 PIERRON wolumenu → 1 ticket),
• maksymalnie 50 ticketów na użytkownika w oknie,
• okna losowań co 7 epok w ramach cyklu 28.

LOSOWANIE
• keeperzy składają commit losowości (commit–reveal),
• do losowania wymagane jest m.in. minimum commitów (próg produkcyjny: 20) oraz minimalna liczba ticketów w puli,
• po oknie: draw albo skip (za mało ticketów),
• nagroda: 2 000 000 PIERRON na draw (z alokacji bonusu lojalnościowego),
• wypłata: prepare → settle → claim przez zwycięzcę.

WAŻNOŚĆ VOUCHERA
Voucher na odbiór loteryjnego airdropu jest ważny 7 epok, po czym wygasa.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND I PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Rejestracja → wysyłka do vaultu stealth → odbiór przez adresata. Claim może wymagać dwóch transakcji. To ścieżka prywatniejszego transferu — nie obchodzi limitu swapu ani składki 1%.

PIERRON PAY
Płatność na konto merchanta z instrukcją pay. Hook klasyfikuje transfer jako płatność, nie jako zwykłą sprzedaż DEX.

ZASADY
• nie używaj tych ścieżek do obchodzenia limitu lub składki 1% oficjalnego handlu,
• przed wysyłką zawsze sprawdzaj adres / kod QR odbiorcy — błędy on-chain są nieodwracalne.

━━━━━━━━━━━━━━━━━━━━
9. ZASADY UŻYTKOWANIA APLIKACJI
━━━━━━━━━━━━━━━━━━━━

1. Łącz wyłącznie zaufany portfel. Nigdy nie podawaj seed phrase „wsparciu” ani obcym.
2. Swap: zatwierdź pełną sekwencję w portfelu; nie zamykaj portfela w trakcie podpisu.
3. Szanuj cooldown — ponowne klikanie nie przyspiesza reguł on-chain.
4. Claim redystrybucji / bonusu lojalnościowego: dopiero gdy aplikacja pokazuje gotowość; po sukcesie odczekaj synchronizację sieci przed kolejnym swapem.
5. Na Androidzie (m.in. agresywne OEM): podczas podpisu w portfelu zostań w portfelu do POTWIERDŹ, potem wróć do Pierron; nie zabijaj aplikacji w tle.
6. Zakaz: ataki na programy, phishing pod Pierron, spam RPC, próby exploitów settlement / hook.

━━━━━━━━━━━━━━━━━━━━
10. PĘTLA EKONOMICZNA
━━━━━━━━━━━━━━━━━━━━

Escrow uwalnia tokeny do puli DEX każdej epoki.
Handel odkłada składkę 1% do puli redystrybucji (odzyskiwalną po 7 dniach / 28 epokach przy wystarczającej aktywności), tickety bonusu lojalnościowego i opłatę SOL (price floor).
Aktywność w cyklu 28 epok kwalifikuje do odzyskania udziału z puli.
Bonus lojalnościowy losuje w oknach 7-epokowych.
Burn równolegle zmniejsza podaż według harmonogramu.
Użytkownicy sami claimują redystrybucję i wygrane; keeperzy utrzymują zegar protokołu.

━━━━━━━━━━━━━━━━━━━━
11. RYZYKA
━━━━━━━━━━━━━━━━━━━━

• ryzyko smart contractów i upgrade’ów,
• ryzyko rynkowe ceny PIERRON (brak gwarancji wzrostu mimo burn / floor),
• opłaty SOL przy nieudanych lub powtórzonych transakcjach,
• brak gwarancji zysku — redystrybucja i bonus lojalnościowy nie są lokatą.

Korzystanie z aplikacji oznacza akceptację reguł egzekwowanych on-chain oraz ryzyk powyżej.

Pierron — budujemy przejrzystą tokenomikę i realne użytkowanie.`;
