export const PROJECT_INFO_BODY = `PIERRON — INFORMAZIONI SUL PROGETTO
Versione 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. sta per “PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK”,
o colloquialmente CPDDC (valuta digitale decentralizzata del pool centralizzato).

È una criptovaluta su Solana che, attraverso una combinazione di 49 meccanismi distinti, forma un ecosistema autonomo e decentralizzato progettato per fornire la massima forma di sicurezza finanziaria per il singolo utente.

Il progetto è stato pensato per garantire assoluta trasparenza verso l'utente e in modo che l'utente non debba fidarsi del prodotto.

Le regole incorporate nel progetto sono definitive e non possono essere modificate.

L'ecosistema PIERRON è completamente autonomo: non richiede amministratore e non ne ha. Il progetto inoltre non dispone di un banco di supporto o di un servizio clienti. Tutte le decisioni e le azioni intraprese da un utente nell'ecosistema sono di esclusiva responsabilità dell'utente. L’ideatore del progetto non è responsabile per decisioni errate o errori dell’utente.

PIERRON dispone di oltre 2200 prove formali senza assume, admit, external_body, vacuity o underspecified branches.

━━━━━━━━━━━━━━━━━━━━
1. CHE COS'È PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron è un protocollo token sulla blockchain Solana. Le regole economiche (limiti, contributo del pool dell'1%, cooldown, ridistribuzione, bonus fedeltà, emissione e burn) vengono applicate on-chain da programmi di contratto intelligente, non semplicemente descritti nella documentazione.

Il token PIERRON (SPL Token-2022) combina:

• trading ufficiale DEX con limiti per operazione e cooldown,
• un contributo dell'1% al pool di ridistribuzione, recuperabile dopo un ciclo di attività (non una “penalità per la negoziazione”),
• cicli di attività e rivendicazione di una quota del pool,
• un premio fedeltà basato sul volume,
• emissioni controllate nel market pool più un programma di combustione,
• una commissione di prezzo minimo SOL sugli swap ufficiali,
• Safe Send (più trasferimenti privati) e Pierron Pay (pagamenti ai commercianti).

L'app mobile e la dapp creano transazioni. La fonte della verità per le regole è il codice distribuito su Solana.

━━━━━━━━━━━━━━━━━━━━
2. PRINCIPI DI PROGETTAZIONE
━━━━━━━━━━━━━━━━━━━━

• Regole nel codice: i limiti e l'idoneità vengono controllati dal programma.
• Attività sulla speculazione all'ingrosso: limiti rigidi per transazione e per epoca.
• Quota del pool per l'attività del ciclo reale, non solo per il mantenimento inattivo.
• Deflazione strutturale: grandi allocazioni e un programma di combustione fisso.
• Percorsi di rischio separati: regolamento e azione furtiva sono programmi separati; i pagamenti nel caveau richiedono voucher validi.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMICS (OFFERTA)
━━━━━━━━━━━━━━━━━━━━

Unità: token UI (6 cifre decimali sulla catena).

Offerta totale: 150,000,000,000 PIERRON (150 miliardi)

Assegnazione:
• Pool di mercato (escrow → DEX): 60 miliardi (40%)
• Portafoglio sviluppatore: 21 miliardi (14%)
• Bonus fedeltà: 7 miliardi (~4.7%)
• Masterizzazione (archivio + pianificazione): 56B (~37.3%)
• Tesoro: 6 miliardi (4%)

Emissione: a ogni epoca il protocollo rilascia token da escrow nel pool DEX secondo una quota per epoca — più alta alla genesi, poi standard.

Bruciatura: dalla camera di combustione a ritmo fisso nell'arco di circa 20 anni solari di epoche fino all'esaurimento della dotazione di bruciatura.

Durata dell'epoca: 21,600 secondi (6 ore). L'epoca 0 inizia al timestamp di genesi del protocollo.

━━━━━━━━━━━━━━━━━━━━
4. ARCHITETTURA (BREVE)
━━━━━━━━━━━━━━━━━━━━

• Programma Pierron: contabilità, limiti DEX, book commerciale, bonus fedeltà, ridistribuzione, tick, burn, prezzo minimo
• Transfer Hook — Gancio di trasferimento: classificazione di trasferimento Token-2022; limiti e contributo 1% sui percorsi ufficiali
• Settlement — Liquidazione: pagamenti del caveau (ridistribuzione, bonus fedeltà, ricompense per i keeper) dopo la preparazione del voucher
• Stealth — Stealth: registra, invia e richiedi (Safe Send)
• TradeBook/account utente: attività, volume, ticket, bitmap dell'epoca, conteggio delle richieste
• keepers della rete: epoche avanzate, emissione/bruciore e prelievi; non pretendono ridistribuzioni o premi per gli utenti

━━━━━━━━━━━━━━━━━━━━
5. REGOLE DI NEGOZIAZIONE
━━━━━━━━━━━━━━━━━━━━

PERCORSO UFFICIALE
Fai trading tramite swap nell'app Pierron (pool DEX secondo la policy del protocollo), con istruzioni di limite e transfer-hook. I trasferimenti al di fuori dei percorsi consentiti potrebbero essere rifiutati o classificati diversamente.

CONTRIBUTO DELL'1% (RECUPERABILE - NON UNA PENALITÀ)
L’1% del volume commerciale ufficiale finisce in un pool di ridistribuzione condiviso. Non si tratta di una commissione punitiva né di un consumo permanente dei tuoi fondi: con una sufficiente attività dell'ecosistema puoi recuperare la tua quota del pool al termine del ciclo.

Un ciclo di ridistribuzione dura 28 epoche. Con epoche di 6 ore ovvero 7 giorni. Una volta chiuso il ciclo, gli utenti idonei richiedono la loro quota dal pool nell'app.

Condizione di recupero: attività sufficiente nel ciclo (incluse almeno 9 epoche attive nella bitmap di 28 epoche e mantenimento di almeno 10 PIERRON) — vedere Ridistribuzione. Senza l’attività dell’ecosistema non vi è alcuna condivisione del pool; con il contributo più l’attività, il trading crea un diritto di recupero dal pool, non solo un costo di trading.

Il contributo dell'1% non può essere disabilitato nelle impostazioni: fa parte del protocollo.

PREZZO INFERIORE (SOL)
Gli swap ufficiali richiedono una commissione SOL proporzionale al volume PIERRON (100 lamports per 1 PIERRON). I fondi vanno alla tesoreria del prezzo minimo e possono supportare la liquidità/minimo.

LIMITE PER TRANSAZIONE
Il numero massimo di PIERRON per transazione dipende dalle richieste ridistribuite ricevute:

• 0–24 claim: 13,000,000 PIERRON
• ≥ 25 claim: 16,000,000 PIERRON
• ≥ 75 claim: 19,000,000 PIERRON
• ≥ 175 claim: 24,000,000 PIERRON
• ≥ 375 claim: 34,000,000 PIERRON (cap)

TEMPO DI ATTESA TRA GLI SWAP
• 0–24 richieste: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Un tentativo di scambio anticipato viene rifiutato in catena.

PRIMO SCAMBIO
La prima transazione ufficiale su un conto deve essere di almeno 2 PIERRON.

CAP. DI VENDITA D'EPOCA GLOBALE
Le vendite totali di tutti gli utenti in un'epoca condividono un tetto che aumenta con le dichiarazioni totali del protocollo:

• meno di 25 richieste total: 2,000,000,000 PIERRON
• meno di 75: 3,000,000,000
• meno di 175: 5,000,000,000
• meno di 375: 7,000,000,000
• 375+: 9,000,000,000

Si applicano anche limiti di volume e transazioni per epoca per utente (inclusi fino a 100 tx per epoca e un limite di volume per utente).

━━━━━━━━━━━━━━━━━━━━
6. REDISTRIBUZIONE – RECUPERO DEL CONTRIBUTO DELL'1%.
━━━━━━━━━━━━━━━━━━━━

PERCHÉ ESISTE L'1%
Ogni scambio ufficiale colloca l'1% in un pool condiviso. Dopo 28 epoche (7 giorni in epoche di 6 ore) il pool viene diviso tra le persone che erano sufficientemente attive nell'ecosistema. Trading attivo + attività ciclica = diritto di reclamare dal pool. Inattività = nessuna condivisione. Si tratta di un meccanismo di fidelizzazione/recupero contributi, non di penalizzazione per le negoziazioni.

Il contributo dell’1% è pensato per vincolare temporaneamente parte del capitale nell’ecosistema e per scoraggiare indirettamente gli attacchi Sybil.

FONTE DEL FONDO
Il contributo dell’1% degli swap ufficiali finanzia la cassaforte della ridistribuzione.

CICLO E TEMPI
• ciclo: 28 epoche = 7 giorni (epoca = 6 h),
• dopo la chiusura del ciclo il pool viene suddiviso (quota ≈ pool / conteggio idoneo),
• richiesta nell'app una volta soddisfatta l'idoneità.

IDONEITÀ (ATTIVITÀ SUFFICIENTE)
• almeno 9 epoche attive nella bitmap da 28 epoche,
• mantenere almeno 10 PIERRON saldo,
• attività riconosciuta dal protocollo (negoziazione ufficiale/percorsi protocollo).

RECLAMI
• l'utente avvia il reclamo nell'app (preparare → liquidare → consumare),
• i detentori non reclamano per l'utente,
• i voucher rimangono validi nell'ordine di 28 epoche: quelli non reclamati potrebbero scadere,
• la tariffa per la richiesta di protocollo in PIERRON è 0; l'utente paga la tariffa di rete SOL,
• una richiesta accettata aumenta il contatore delle richieste → limite di scambio più alto e tempo di recupero più breve.

━━━━━━━━━━━━━━━━━━━━
7. BONUS FEDELTÀ
━━━━━━━━━━━━━━━━━━━━

BIGLIETTI
• guadagnato dal volume degli scambi ufficiali (soglia: 10 PIERRON volume → 1 ticket),
• max 50 biglietti per utente per sportello,
• disegnare finestre ogni 7 epoche all'interno del ciclo di 28 epoche.

ESTRAZIONE
• i keepers inviano commit casuali (commit–reveal),
• le estrazioni richiedono un numero minimo di impegni (piano di produzione: 20) e un pool minimo di ticket,
• dopo la finestra: pesca o salta (troppi pochi biglietti),
• premio: 2,000,000 PIERRON per estrazione (dall'assegnazione del bonus fedeltà),
• pagamento: preparare → liquidare → richiedere al vincitore.

VALIDITÀ DEL VOUCHER
Il buono per richiedere l'airdrop della lotteria è valido per 7 epoche, poi scade.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND E PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Registrati → invia al caveau stealth → richiesta del destinatario. Il reclamo può richiedere due transazioni. Si tratta di un percorso di trasferimento più privato: non aggira i limiti di swap o il contributo dell'1%.

PIERRON PAY
Pagamento su un conto commerciante con un'istruzione di pagamento. L'hook classifica il trasferimento come Pay, non come una normale vendita DEX.

REGOLE
• non utilizzare questi percorsi per aggirare i limiti ufficiali di negoziazione o il contributo dell'1%,
• verificare sempre l'indirizzo del destinatario / QR prima dell'invio: gli errori on-chain sono irreversibili.

━━━━━━━━━━━━━━━━━━━━
9. REGOLE DI UTILIZZO DELL'APP
━━━━━━━━━━━━━━━━━━━━

1. Connetti solo un portafoglio affidabile. Non condividere mai la tua frase seed con "supporto" o estranei.
2. Swap: approva l'intera sequenza nel portafoglio; non chiudere il portafoglio a metà firma.
3. Rispetta il tempo di recupero: toccare nuovamente non annulla le regole della catena.
4. Ridistribuzione/richiesta bonus fedeltà: solo quando l'app risulta pronta; dopo il successo attendere la sincronizzazione della rete prima dello scambio successivo.
5. Su Android (OEM aggressivi): rimani nel portafoglio fino a CONFIRM, quindi torna a Pierron; non uccidere l'app in background.
6. Vietato: attacchi a programmi, phishing con il nome Pierron, spam RPC, tentativi di exploit di transazione/hook.

━━━━━━━━━━━━━━━━━━━━
10. CICLO ECONOMICO
━━━━━━━━━━━━━━━━━━━━

L'impegno rilascia token nel pool DEX in ogni epoca.
Il trading inserisce un contributo dell'1% nel pool di ridistribuzione (recuperabile dopo 7 giorni/28 epoche con attività sufficiente), biglietti bonus fedeltà e commissione di prezzo minimo SOL.
L'attività nel ciclo di 28 epoche ti qualifica a reclamare una quota del pool.
Il bonus fedeltà è disegnato in finestre di 7 epoche.
Burn riduce la fornitura in parallelo nei tempi previsti.
Gli utenti rivendicano essi stessi la ridistribuzione e i premi; i keepers mantengono l'orologio del protocollo.

━━━━━━━━━━━━━━━━━━━━
11. RISCHI
━━━━━━━━━━━━━━━━━━━━

• contratto intelligente e rischio di upgrade,
• rischio di mercato per il prezzo PIERRON (nessun rialzo garantito nonostante burn/floor),
• Commissioni SOL su transazioni fallite o ripetute,
• Nessuna garanzia di profitto: la ridistribuzione e il bonus fedeltà non sono un prodotto di deposito.

Utilizzare l'app significa accettare le regole della catena e i rischi di cui sopra.

Pierron: tokenomics trasparente e utilizzo reale.`;
