export const PROJECT_INFO_BODY = `PIERRON — INFORMAȚII PROIECT
Versiunea 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. înseamnă „PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK”,
sau colocvial CPDDC (Centralized Pool Decentralized Digital Currency).

Este o criptomonedă pe Solana care, printr-o combinație de 49 de mecanisme distincte, formează un ecosistem autonom și descentralizat, conceput pentru a oferi utilizatorului individual cea mai înaltă formă de securitate financiară.

Proiectul a fost conceput pentru o transparență absolută față de utilizator și astfel încât utilizatorul să nu aibă nevoie să aibă încredere în produs.

Regulile încorporate în proiect sunt definitive și nu pot fi modificate.

Ecosistemul PIERRON este complet autonom: nu necesită administrator și nu are niciunul. De asemenea, proiectul nu are birou de asistență sau serviciu pentru clienți. Toate deciziile și acțiunile luate de un utilizator în ecosistem sunt exclusiv responsabilitatea utilizatorului. Creatorul proiectului nu este responsabil pentru deciziile greșite sau erorile utilizatorului.

PIERRON are peste 2200 de dovezi formale fără ramuri care conțin assume, admit, external_body, vacuity sau ramuri insuficient specificate.

━━━━━━━━━━━━━━━━━━━━
1. CE ESTE PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron este un protocol token pe blockchain-ul Solana. Regulile economice (limite, 1% contribuția la pool, cooldown, redistribuire, bonus de loialitate, emisie și ardere) sunt aplicate în lanț de programele de contracte inteligente - nu doar descrise în documentație.

Jetonul PIERRON (SPL Token-2022) combină:

• tranzacționare oficială DEX cu limite per tranzacție și cooldown,
• o contribuție 1% la fondul de redistribuire – recuperabilă după un ciclu de activitate (nu o „penalizare pentru tranzacționare”);
• cicluri de activitate și revendicarea unei cote din fond,
• un bonus de loialitate bazat pe volum,
• emisie controlată în bazinul de piață plus un program de ardere;
• o taxă SOL de preț-plafon pentru schimburile oficiale,
• Safe Send (mai multe transferuri private) și Pierron Pay (plăți la comerciant).

Aplicația mobilă și dapp creează tranzacții. Sursa adevărului pentru reguli este codul implementat pe Solana.

━━━━━━━━━━━━━━━━━━━━
2. PRINCIPII DE PROIECTARE
━━━━━━━━━━━━━━━━━━━━

• Reguli în cod — limitele și eligibilitatea sunt verificate de program.
• Activitate în detrimentul speculațiilor cu ridicata — limite stricte pe tranzacție și pe epocă.
• Cota de pool pentru activitatea ciclului real, nu pentru ținerea inactivă.
• Deflație structurală — alocare mare de ardere și un program fix de ardere.
• Căi separate de risc — decontarea și stealth sunt programe separate; plățile seifului necesită vouchere valide.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMICĂ (Aprovizionare)
━━━━━━━━━━━━━━━━━━━━

Unitate: simbol UI (6 zecimale în lanț).

Oferta totală: 150,000,000,000 PIERRON (150 miliarde)

Alocare:
• Grup de piață (escrow → DEX): 60B (40%)
• Portofel pentru dezvoltatori: 21B (14%)
• Bonus de fidelitate: 7B (~4.7%)
• Ardere (seif + program): 56B (~37.3%)
• Trezorerie: 6B (4%)

Emisia: în fiecare epocă, protocolul eliberează jetoane din escrow în pool-ul DEX sub o cotă de epocă - mai mare la geneză, apoi standard.

Arderea: din bolta de ardere la o rată fixă ​​pe aproximativ 20 ani calendaristici de epoci până la epuizarea alocației de ardere.

Durata epocii: 21,600 secunde (6 ore). Epoca 0 începe la marcajul de timp al genezei protocolului.

━━━━━━━━━━━━━━━━━━━━
4. ARHITECTURA (SCURT)
━━━━━━━━━━━━━━━━━━━━

• Programul Pierron — contabilitate, limite DEX, carnet de tranzacții, bonus de fidelitate, redistribuire, ticks, burn, prag de preț
• Transfer Hook — Token-2022 clasificare transfer; limite și contribuția 1% pe căile oficiale
• Settlement — plăți din seif (redistribuire, bonus de loialitate, recompense pentru operatori) după pregătirea voucherului
• Stealth — înregistrați, trimiteți și revendicați (Safe Send)
• TradeBook / cont de utilizator — activitate, volum, bilete, bitmap de epocă, număr de revendicări
• Operatori de rețea — avansează epocile, emisia/arderea și extragerile; nu revendică redistribuirea sau premiile în numele utilizatorilor

━━━━━━━━━━━━━━━━━━━━
5. REGULI COMERCIALE
━━━━━━━━━━━━━━━━━━━━

CALEA OFICIALĂ
Tranzacționați prin swap în aplicația Pierron (grup DEX conform politicii de protocol), cu instrucțiuni de limită și de transfer. Transferurile în afara căilor permise pot fi respinse sau clasificate diferit.

1% CONTRIBUȚIA (RECUPERABILĂ — NU O PENALIZĂ)
1% din volumul comercial oficial intră într-un pool de redistribuire partajat. Aceasta nu este o taxă punitivă și nu o ardere permanentă a fondurilor dvs.: cu suficientă activitate a ecosistemului, vă puteți recupera partea din fond după încheierea ciclului.

Un ciclu de redistribuire durează 28 de epoci. Cu epoci de 6 ore, aceasta înseamnă 7 zile. După închiderea ciclului, utilizatorii eligibili își revendică partea din fond în aplicație.

Condiție de recuperare: activitate suficientă în ciclu (inclusiv cel puțin 9 epoci active în bitmap-ul celor 28 de epoci și menținerea unui sold de cel puțin 10 PIERRON) — consultați Redistribuirea. Fără activitate în ecosistem nu există cotă din fond; prin contribuție și activitate, tranzacționarea creează dreptul de a recupera din fond — nu doar un cost de tranzacționare.

Contribuția 1% nu poate fi dezactivată în setări - face parte din protocol.

PRAG DE PREȚ (SOL)
Schimburile oficiale necesită o taxă SOL proporțională cu volumul PIERRON (100 lamports pe 1 PIERRON). Fondurile merg la trezoreria de preț-placă și pot susține lichiditate/plafon.

LIMITA PER-TRANZACȚIE
Maximul PIERRON per tranzacție depinde de revendicările redistribuite primite:

• 0–24 revendicări: 13,000,000 PIERRON
• Revendicări ≥ 25: 16,000,000 PIERRON
• Revendicări ≥ 75: 19,000,000 PIERRON
• Revendicări ≥ 175: 24,000,000 PIERRON
• Revendicări ≥ 375: 34,000,000 PIERRON (capac)

RĂCIRE ÎNTRE SCHIMBURI
• 0–24 revendicări: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

O încercare de schimb timpurie este respinsă în lanț.

PRIMUL SCHIMB
Prima tranzacție oficială într-un cont trebuie să fie cel puțin 2 PIERRON.

LIMITĂ GLOBALĂ DE VÂNZARE PE EPOCĂ
Totalul vânzărilor de către toți utilizatorii într-o epocă împărtășește un plafon care crește odată cu revendicările totale ale protocolului:

• sub 25 revendicări totale: 2,000,000,000 PIERRON
• sub 75: 3,000,000,000
• sub 175: 5,000,000,000
• sub 375: 7,000,000,000
• 375+: 9,000,000,000

Se aplică, de asemenea, limite de volum pentru fiecare utilizator și de tranzacții (inclusiv până la 100 txs per epocă și un plafon de volum per utilizator).

━━━━━━━━━━━━━━━━━━━━
6. REDISTRIBUȚIE — RECUPERAREA CONTRIBUȚIEI 1%
━━━━━━━━━━━━━━━━━━━━

DE CE EXISTĂ 1%
Fiecare swap oficial plasează 1% într-un fond comun. După 28 de epoci (7 zile cu epoci de 6 ore), fondul este împărțit între persoanele care au fost suficient de active în ecosistem. Tranzacționare activă + activitate în ciclu = dreptul de a revendica din fond. Inactivitate = nicio cotă. Acesta este un mecanism de loialitate / recuperare a contribuției, nu o penalizare pentru tranzacționare.

Contribuția 1% este concepută pentru a lega temporar o parte a capitalului din ecosistem și pentru a descuraja indirect atacurile Sybil.

SURSA FONDULUI
Contribuția 1% din schimburile oficiale finanțează seiful de redistribuire.

CICLU SI CRONOMETRAJ
• ciclu: 28 epoci = 7 zile (epocă = 6 h),
• după închiderea ciclului, pool-ul este împărțit (part ≈ pool / număr eligibil),
• revendicare în aplicație odată ce eligibilitatea este îndeplinită.

ELIGIBILITATE (ACTIVITATE SUFICIENTĂ)
• cel puțin 9 epoci active în harta de biți 28-epoch,
• menține echilibrul cel puțin 10 PIERRON,
• activitate recunoscută de protocol (trading oficial / căi de protocol).

REVENDICAREA
• utilizatorul inițiază revendicarea în aplicație (pregătește → decontează → consumă),
• operatorii nu revendică în numele utilizatorului,
• voucherele rămân valabile pentru epocile 28 — cele nerevendicate pot expira,
• taxa de revendicare de protocol în PIERRON este 0; utilizatorul plătește taxa de rețea SOL,
• o revendicare reușită crește contorul de revendicare → limită de schimb mai mare și un timp de răcire mai scurt.

━━━━━━━━━━━━━━━━━━━━
7. BONUS DE FIDEALITATE
━━━━━━━━━━━━━━━━━━━━

BILETE
• câștigat din volumul comercial oficial (prag: 10 PIERRON volum → 1 bilet),
• bilete 50 maxime per utilizator pe fereastră,
• desenați ferestre în fiecare epocă 7 în cadrul ciclului de epocă 28.

EXTRAGERE
• operatorii trimit angajamente de aleatoriu (commit–reveal),
• extragerile necesită un număr minim de angajamente (etaj de producție: 20) și un grup minim de bilete,
• după fereastră: extragere sau săriți (prea puține bilete),
• premiu: 2,000,000 PIERRON per extragere (din alocarea bonusului de fidelitate),
• plată: pregătiți → soluționați → revendicare de către câștigător.

VALABILITATE VOUCHER
Voucherul pentru revendicarea airdrop-ului loteriei este valabil 7 epoci, apoi expiră.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND ȘI PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Înregistrare → trimite la seiful stealth → revendicare destinatarului. Revendicarea poate necesita două tranzacții. Aceasta este o cale de transfer mai privată — nu ocolește limitele de swap sau contribuția 1%.

PIERRON PAY
Plată către un cont de comerciant printr-o instrucțiune de plată. Hook-ul clasifică transferul drept Pay, nu drept o vânzare DEX obișnuită.

REGULI
• nu utilizați aceste căi pentru a ocoli limitele oficiale de tranzacționare sau contribuția 1%,
• verificați întotdeauna adresa destinatarului / QR înainte de a trimite — greșelile în lanț sunt ireversibile.

━━━━━━━━━━━━━━━━━━━━
9. REGULI DE UTILIZARE A APLICATIEI
━━━━━━━━━━━━━━━━━━━━

1. Conectați doar un portofel de încredere. Nu împărtășiți niciodată expresia de bază cu „sprijin” sau străini.
2. Schimbare: aprobați secvența completă în portofel; nu închide portofelul la mijlocul semnăturii.
3. Respectați timpul de răcire — atingerea din nou nu anulează regulile din lanț.
4. Redistribuire / revendicare bonus de loialitate: numai atunci când aplicația arată pregătită; după succes, așteptați sincronizarea rețelei înainte de următoarea schimbare.
5. Pe Android (OEM agresive): rămâneți în portofel până la CONFIRMARE, apoi reveniți la Pierron; nu ucideți aplicația în fundal.
6. Interzis: atacuri asupra programelor, phishing sub numele Pierron, spam RPC, tentative de exploatare de soluții/hook.

━━━━━━━━━━━━━━━━━━━━
10. BUCLA ECONOMICĂ
━━━━━━━━━━━━━━━━━━━━

Escrow eliberează jetoane în pool-ul DEX în fiecare epocă.
Tranzacționarea plasează o contribuție 1% în pool-ul de redistribuire (recuperabilă după 7 zile / 28 epoci cu activitate suficientă), bilete de bonus de fidelitate și taxa de preț SOL.
Activitatea din ciclul de epocă 28 vă califică să revendicați o parte din fond.
Bonusul de fidelitate atrage în ferestrele de epocă 7.
Arderea reduce în paralel oferta, conform programului.
Utilizatorii pretind ei înșiși redistribuirea și premiile; paznicii mențin ceasul de protocol.

━━━━━━━━━━━━━━━━━━━━
11. RISCURI
━━━━━━━━━━━━━━━━━━━━

• risc de contract inteligent și de upgrade,
• riscul de piață pentru prețul PIERRON (nu este garantat creșterea în ciuda arderii / podelei),
• SOL taxe pentru tranzacțiile eșuate sau repetate,
• nicio garanție de profit — redistribuirea și bonusul de fidelitate nu sunt produse de depozit.

Utilizarea aplicației înseamnă acceptarea regulilor în lanț și a riscurilor de mai sus.

Pierron — tokenomică transparentă și utilizare reală.`;
