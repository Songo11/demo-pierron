export const PROJECT_INFO_BODY = `PIERRON — INFORMACE O PROJEKTU
Verze 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. znamená „PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK“,
nebo hovorově CPDDC (Centralized Pool Decentralized Digital Currency).

Jde o kryptoměnu na Solana, která prostřednictvím kombinace 49 odlišných mechanismů tvoří autonomní, decentralizovaný ekosystém navržený tak, aby poskytoval nejvyšší formu finančního zabezpečení pro jednotlivé uživatele.

Projekt byl navržen pro absolutní transparentnost vůči uživateli a tak, aby uživatel nemusel produktu důvěřovat.

Pravidla vložená do projektu jsou konečná a nelze je měnit.

Ekosystém PIERRON je plně autonomní: nevyžaduje žádného správce a žádného nemá. Projekt také nemá žádnou podporu ani zákaznický servis. Za veškerá rozhodnutí a akce provedené uživatelem v ekosystému nese výhradní odpovědnost uživatel. Tvůrce projektu nenese odpovědnost za chybná rozhodnutí nebo chyby uživatele.

PIERRON má více než 2200 formálních důkazů bez větví obsahujících assume, admit, external_body, vacuity nebo nedostatečně specifikovaných větví.

━━━━━━━━━━━━━━━━━━━━
1. CO JE PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron je tokenový protokol na blockchainu Solana. Ekonomická pravidla (limity, 1% příspěvek do fondu, cooldown, přerozdělení, věrnostní bonus, emise a spalování) jsou vynucována v řetězci pomocí programů inteligentních smluv – nejen popisovaných v dokumentaci.

Token PIERRON (SPL Token-2022) kombinuje:

• oficiální obchodování DEX s limity na jednotlivé obchody a cooldownem,
• 1% příspěvek do redistribučního fondu – vymahatelný po cyklu aktivity (nikoli „trest za obchodování“),
• cykly aktivit a nárokování podílu na fondu,
• věrnostní bonus na základě objemu,
• řízené emise do fondu trhu plus plán spalování,
• minimální cena SOL za oficiální swapy,
• Safe Send (více soukromých převodů) a Pierron Pay (platby obchodníkům).

Mobilní aplikace a dapp sestavují transakce. Zdrojem pravdy pro pravidla je kód nasazený na Solana.

━━━━━━━━━━━━━━━━━━━━
2. PRINCIPY NÁVRHU
━━━━━━━━━━━━━━━━━━━━

• Pravidla v kódu — limity a způsobilost jsou kontrolovány programem.
• Aktivita nad velkoobchodními spekulacemi – pevné limity na transakci a epochu.
• Podíl ve fondu pro aktivitu skutečného cyklu, nikoli pro samotné nečinné držení.
• Strukturální deflace – velká alokace vypalování a pevný plán vypalování.
• Oddělené cesty rizika – vypořádání a utajení jsou samostatné programy; k výplatě trezoru jsou potřeba platné poukázky.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMIKA (NABÍDKA)
━━━━━━━━━━━━━━━━━━━━

Jednotka: token uživatelského rozhraní (6 desetinných míst v řetězci).

Celková nabídka: 150,000,000,000 PIERRON (150 miliard)

Přidělení:
• Tržní fond (escrow → DEX): 60B (40%)
• Peněženka vývojáře: 21B (14%)
• Věrnostní bonus: 7B (~4.7%)
• Spalování (trezor + harmonogram): 56B (~37.3%)
• Pokladna: 6B (4%)

Emise: protokol v každé epoše uvolňuje tokeny z escrow do poolu DEX podle kvóty epochy — při genesis vyšší, poté standardní.

Spalování: ze spalovacího trezoru pevnou rychlostí po dobu přibližně 20 kalendářních let epoch, dokud se alokace pro spalování nevyčerpá.

Délka epochy: 21,600 sekund (6 hodin). Epocha 0 začíná v časovém razítku genesis protokolu.

━━━━━━━━━━━━━━━━━━━━
4. ARCHITEKTURA (KRÁTCE)
━━━━━━━━━━━━━━━━━━━━

• Program Pierron — účetnictví, limity DEX, obchodní kniha, věrnostní bonus, redistribuce, tiky, spalování, cenové minimum
• Transfer Hook — klasifikace převodů Token-2022; limity a 1% příspěvek na oficiálních cestách
• Settlement — výplaty z trezoru (redistribuce, věrnostní bonus, odměny správcům) po přípravě poukazu
• Stealth — registrace, odeslání a nárokování (Safe Send)
• TradeBook / uživatelský účet — aktivita, objem, tikety, bitmapa epoch, počet nároků
• Správci sítě — posouvají epochy, emise/spalování a losování; nenárokují redistribuci ani výhry za uživatele

━━━━━━━━━━━━━━━━━━━━
5. PRAVIDLA OBCHODOVÁNÍ
━━━━━━━━━━━━━━━━━━━━

OFICIÁLNÍ CESTA
Obchodujte pomocí swapu v aplikaci Pierron (pool DEX podle zásad protokolu), s instrukcemi limitu a Transfer Hook. Převody mimo povolené cesty mohou být odmítnuty nebo klasifikovány odlišně.

1% PŘÍSPĚVEK (VRÁTITELNÝ – NENÍ POKUTA)
1% oficiálního objemu obchodů jde do sdíleného redistribučního fondu. Nejedná se o sankční poplatek ani o trvalé spálení vašich prostředků: při dostatečné aktivitě v ekosystému můžete po skončení cyklu získat zpět svůj podíl na fondu.

Cyklus přerozdělování trvá 28 epoch. S 6hodinovými epochami to je 7 dní. Po uzavření cyklu si způsobilí uživatelé nárokují svůj podíl z fondu v aplikaci.

Podmínka obnovy: dostatečná aktivita v cyklu (včetně alespoň 9 aktivních epoch v bitmapě 28 epoch a zachování alespoň 10 PIERRON) — viz Redistribuce. Bez aktivity ekosystému neexistuje žádný společný podíl; s příspěvkem plus aktivitou vytváří obchodování právo na vrácení z fondu – nejen náklady na obchodování.

Příspěvek 1% nelze vypnout v nastavení — je součástí protokolu.

PODMÍNKA CENY (SOL)
Oficiální swapy vyžadují poplatek SOL úměrný objemu PIERRON (100 lamports za 1 PIERRON). Prostředky směřují do pokladny cenového minima a mohou podporovat likviditu / cenové minimum.

LIMIT NA TRANSAKCI
Maximální množství PIERRON na transakci závisí na počtu obdržených redistribučních nároků:

• 0–24 nároků: 13,000,000 PIERRON
• ≥ 25 nároků: 16,000,000 PIERRON
• ≥ 75 nároků: 19,000,000 PIERRON
• ≥ 175 nároků: 24,000,000 PIERRON
• ≥ 375 nároků: 34,000,000 PIERRON (strop)

VYCHLAZENÍ MEZI SWAPY
• 0–24 nároků: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Předčasný pokus o výměnu je v řetězci odmítnut.

PRVNÍ VÝMĚNA
První oficiální transakce na účtu musí být alespoň 2 PIERRON.

GLOBÁLNÍ LIMIT PRODEJŮ ZA EPOCHU
Celkové prodeje všech uživatelů v jedné epoše podléhají společnému stropu, který roste s celkovým počtem nároků v protokolu:

• méně než 25 nároků celkem: 2,000,000,000 PIERRON
• méně než 75: 3,000,000,000
• méně než 175: 5,000,000,000
• méně než 375: 7,000,000,000
• 375+: 9,000,000,000

Platí také omezení objemu a transakcí na uživatele (včetně až 100 txs na epochu a omezení objemu na uživatele).

━━━━━━━━━━━━━━━━━━━━
6. REDISTRIBUCE — ZÍSKÁNÍ 1% PŘÍSPĚVKU
━━━━━━━━━━━━━━━━━━━━

PROČ EXISTUJE 1%
Každý oficiální swap vloží 1% do sdíleného fondu. Po 28 epochách (7 dní při 6hodinových epochách) se fond rozdělí mezi osoby, které byly v ekosystému dostatečně aktivní. Aktivní obchodování + aktivita v cyklu = právo nárokovat prostředky z fondu. Neaktivita = žádný podíl. Jde o mechanismus věrnosti / navrácení příspěvku, nikoli o trest za obchodování.

Příspěvek 1% je navržen tak, aby dočasně vázal část kapitálu v ekosystému a nepřímo odrazoval útoky Sybil.

ZDROJ FONDU
Příspěvek 1% z oficiálních swapů financuje redistribuční trezor.

CYKLUS A ČASOVÁNÍ
• cyklus: 28 epoch = 7 dní (epocha = 6 h),
• po uzavření cyklu se fond rozdělí (sdílení ≈ fond / počet oprávněných),
• nárokovat v aplikaci, jakmile je splněna způsobilost.

ZPŮSOBILOST (DOSTATEČNÁ AKTIVITA)
• alespoň 9 aktivních epoch v 28epochové bitmapě,
• udržovat rovnováhu alespoň 10 PIERRON,
• činnost rozpoznaná protokolem (oficiální obchodní / protokolové cesty).

NÁROKOVÁNÍ
• uživatel zahájí nárokování v aplikaci (připravit → vypořádat → spotřebovat),
• správci nenárokují prostředky za uživatele,
• poukazy zůstávají platné přibližně 28 epoch — nevyzvednuté mohou propadnout,
• poplatek protokolu za nárokování v PIERRON je 0; uživatel platí síťový poplatek SOL,
• úspěšné nárokování zvýší počítadlo nároků → vyšší limit swapu a kratší cooldown.

━━━━━━━━━━━━━━━━━━━━
7. VĚRNOSTNÍ BONUS
━━━━━━━━━━━━━━━━━━━━

VSTUPENKY
• získané z oficiálního objemu obchodu (práh: 10 PIERRON objem → 1 tiket),
• maximálně 50 vstupenek na uživatele na okno,
• kreslit okna každých 7 epoch v rámci cyklu 28 epoch.

KRESLENÍ
• správci předkládají závazky náhodnosti (commit–reveal),
• losování vyžaduje minimální počet odevzdání (produkční minimum: 20) a minimální počet tiketů,
• po okně: losujte nebo přeskočte (příliš málo lístků),
• cena: 2,000,000 PIERRON za losování (z přidělení věrnostního bonusu),
• výplata: připravit → vypořádat → nárok výherce.

PLATNOST POUKAZU
Poukaz k uplatnění loterijního airdropu je platný 7 epoch, poté propadá.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND A PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Registrovat → odeslat do tajného trezoru → nárok příjemce. Reklamace může vyžadovat dvě transakce. Jedná se o soukromější přenosovou cestu – neobchází swapové limity ani 1% příspěvek.

PIERRON PAY
Platba na účet obchodníka s platebním příkazem. Háček klasifikuje převod jako Pay, ne jako normální prodej DEX.

PRAVIDLA
• nepoužívejte tyto cesty k obcházení oficiálních obchodních limitů nebo 1% příspěvku,
• vždy před odesláním ověřte adresu příjemce / QR — chyby na řetězci jsou nevratné.

━━━━━━━━━━━━━━━━━━━━
9. PRAVIDLA POUŽÍVÁNÍ APLIKACE
━━━━━━━━━━━━━━━━━━━━

1. Připojte pouze důvěryhodnou peněženku. Nikdy nesdílejte svou počáteční frázi s „podporou“ nebo cizími lidmi.
2. Swap: schválit celou sekvenci v peněžence; nezavírejte peněženku uprostřed podpisu.
3. Respektujte cooldown — opětovné klepnutí nepřepíše pravidla on-chain.
4. Nárok na přerozdělení / věrnostní bonus: pouze když aplikace ukáže připravenost; po úspěchu počkejte na synchronizaci sítě před další výměnou.
5. Na Android (agresivní OEM): zůstaňte v peněžence do CONFIRM, poté se vraťte do Pierron; nezabíjejte aplikaci na pozadí.
6. Zakázáno: útoky na programy, phishing pod jménem Pierron, spamování RPC, pokusy o zneužití vypořádání / hooku.

━━━━━━━━━━━━━━━━━━━━
10. EKONOMICKÁ SMYČKA
━━━━━━━━━━━━━━━━━━━━

Úschova uvolňuje tokeny do fondu DEX každou epochu.
Obchodování vkládá 1% příspěvek do redistribučního fondu (obnovitelný po 7 dnech / 28 epochách s dostatečnou aktivitou), věrnostní bonusové vstupenky a poplatek SOL.
Aktivita v 28-epochovém cyklu vás opravňuje k tomu, abyste získali zpět podíl z fondu.
Věrnostní bonus se losuje v oknech 7 epoch.
Spalování souběžně snižuje nabídku podle harmonogramu.
Uživatelé si sami nárokují přerozdělení a ceny; správci udržují protokolové hodiny.

━━━━━━━━━━━━━━━━━━━━
11. RIZIKA
━━━━━━━━━━━━━━━━━━━━

• riziko inteligentních smluv a upgradu,
• tržní riziko pro cenu PIERRON (žádný zaručený vzestup navzdory spalování / podlaze),
• poplatky SOL za neúspěšné nebo opakované transakce,
• žádná garance zisku — přerozdělení a věrnostní bonus nejsou depozitním produktem.

Používání aplikace znamená přijetí pravidel on-chain a výše uvedených rizik.

Pierron — transparentní tokenomika a reálné použití.`;
