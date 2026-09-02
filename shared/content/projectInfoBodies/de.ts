export const PROJECT_INFO_BODY = `PIERRON — PROJEKTINFO
Version 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. steht für „PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK“,
oder umgangssprachlich CPDDC (Centralized Pool Decentralized Digital Currency).

Es ist eine Kryptowährung auf Solana, die durch die Kombination von 49 verschiedenen Mechanismen ein autonomes, dezentralisiertes Ökosystem bildet, das dem einzelnen Nutzer die höchstmögliche Form finanzieller Sicherheit bieten soll.

Das Projekt wurde für absolute Transparenz gegenüber dem Nutzer gestaltet und so, dass der Nutzer dem Produkt nicht vertrauen muss.

Die im Projekt verankerten Regeln sind endgültig und können nicht geändert werden.

Das PIERRON-Ökosystem ist vollständig autonom: Es benötigt keinen Administrator und hat keinen. Das Projekt hat auch keinen Support und keinen Kundenservice. Alle Entscheidungen und Handlungen eines Nutzers im Ökosystem liegen ausschließlich in seiner Verantwortung. Der Projektschöpfer haftet nicht für fehlerhafte Entscheidungen oder Irrtümer des Nutzers.

PIERRON verfügt über mehr als 2200 formale Beweise ohne assume, admit, external_body, vacuity oder underspecified branches.

━━━━━━━━━━━━━━━━━━━━
1. WAS IST PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron ist ein Token-Protokoll auf der Solana-Blockchain. Ökonomische Regeln (Limits, 1%-Poolbeitrag, Cooldown, Redistribution, Loyalitätsbonus, Emission und Burn) werden on-chain durch Smart-Contract-Programme durchgesetzt — nicht nur in der Dokumentation beschrieben.

Der PIERRON-Token (SPL Token-2022) verbindet:

• offiziellen DEX-Handel mit Limits und Cooldown pro Trade,
• einen 1%-Beitrag zum Redistributionspool — nach einem Aktivitätszyklus rückforderbar (keine „Strafe fürs Handeln“),
• Aktivitätszyklen und das Einfordern eines Poolanteils,
• einen volumensbasierten Loyalitätsbonus,
• kontrollierte Emission in den Marktpool sowie einen Burn-Zeitplan,
• eine SOL-Price-Floor-Gebühr bei offiziellen Swaps,
• Safe Send (privatere Transfers) und Pierron Pay (Händlerzahlungen).

Die Mobile-App und das Dapp bauen Transaktionen. Die Quelle der Wahrheit für Regeln ist der auf Solana deployte Code.

━━━━━━━━━━━━━━━━━━━━
2. DESIGNPRINZIPIEN
━━━━━━━━━━━━━━━━━━━━

• Regeln im Code — Limits und Anspruch werden vom Programm geprüft.
• Aktivität statt Großspekulation — harte Caps pro Transaktion und Epoche.
• Poolanteil für echte Zyklusaktivität, nicht allein fürs Halten.
• Strukturelle Deflation — große Burn-Allokation und fester Burn-Zeitplan.
• Getrennte Risikopfade — Settlement und Stealth sind getrennte Programme; Vault-Auszahlungen erfordern gültige Voucher.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMIK (SUPPLY)
━━━━━━━━━━━━━━━━━━━━

Einheit: UI-Token (6 Dezimalstellen on-chain).

Gesamtangebot: 150,000,000,000 PIERRON (150 Milliarden)

Allokation:
• Marktpool (escrow → DEX): 60B (40%)
• Entwickler-Wallet: 21B (14%)
• Loyalitätsbonus: 7B (~4.7%)
• Burn (Vault + Zeitplan): 56B (~37.3%)
• Treasury: 6B (4%)

Emission: In jeder Epoche gibt das Protokoll gemäß einer Epochenquote Token aus escrow in den DEX-Pool frei — bei Genesis höher, danach standardmäßig.

Burn: aus dem Burn-Vault mit fester Rate über etwa 20 Kalenderjahre an Epochen, bis die Burn-Allokation erschöpft ist.

Epochenlänge: 21,600 Sekunden (6 Stunden). Epoche 0 beginnt zum Protokoll-Genesis-Zeitstempel.

━━━━━━━━━━━━━━━━━━━━
4. ARCHITEKTUR (KURZ)
━━━━━━━━━━━━━━━━━━━━

• Pierron-Programm — Accounting, DEX-Limits, Trade Book, Loyalitätsbonus, Redistribution, Ticks, Burn, Price Floor
• Transfer Hook — Token-2022-Transferklassifikation; Limits und 1%-Beitrag auf offiziellen Pfaden
• Settlement — Vault-Auszahlungen (Redistribution, Loyalitätsbonus, keeper-Belohnungen) nach Voucher-Prepare
• Stealth — Registrieren, Senden und Claim (Safe Send)
• TradeBook / Nutzerkonto — Aktivität, Volumen, Tickets, Epochen-Bitmap, Claim-Zähler
• Netzwerk-keeper — schieben Epochen, Emission/Burn und Ziehungen vor; sie claimen keine Redistribution oder Preise für Nutzer

━━━━━━━━━━━━━━━━━━━━
5. HANDELSREGELN
━━━━━━━━━━━━━━━━━━━━

OFFIZIELLER PFAD
Handel über Swap in der Pierron-App (DEX-Pool gemäß Protokollpolitik), mit Limit- und Transfer-Hook-Instruktionen. Transfers außerhalb erlaubter Pfade können abgelehnt oder anders klassifiziert werden.

1%-BEITRAG (RÜCKFORDERBAR — KEINE STRAFE)
1% des offiziellen Handelsvolumens fließt in einen gemeinsamen Redistributionspool. Das ist keine Strafgebühr und kein dauerhaftes Verbrennen Ihrer Mittel: bei ausreichender Ökosystemaktivität können Sie Ihren Poolanteil nach Zyklusende zurückfordern.

Ein Redistributionszyklus dauert 28 Epochen. Bei 6-Stunden-Epochen sind das 7 Tage. Nach Zyklusende claimen berechtigte Nutzer ihren Anteil in der App.

Rückforderungsbedingung: ausreichende Aktivität im Zyklus (u. a. mindestens 9 aktive Epochen in der 28-Epochen-Bitmap und mindestens 10 PIERRON) — siehe Redistribution. Ohne Ökosystemaktivität gibt es keinen Poolanteil; mit Beitrag plus Aktivität begründet der Handel ein Recht auf Rückforderung aus dem Pool — nicht nur Handelskosten.

Der 1%-Beitrag lässt sich in den Einstellungen nicht deaktivieren — er ist Teil des Protokolls.

PRICE FLOOR (SOL)
Offizielle Swaps erfordern eine SOL-Gebühr proportional zum PIERRON-Volumen (100 lamports pro 1 PIERRON). Mittel gehen in die Price-Floor-Treasury und können Liquidität / Floor stützen.

LIMIT PRO TRANSAKTION
Maximales PIERRON pro Transaktion hängt von erhaltenen Redistributions-Claims ab:

• 0–24 Claims: 13,000,000 PIERRON
• ≥ 25 Claims: 16,000,000 PIERRON
• ≥ 75 Claims: 19,000,000 PIERRON
• ≥ 175 Claims: 24,000,000 PIERRON
• ≥ 375 Claims: 34,000,000 PIERRON (Cap)

COOLDOWN ZWISCHEN SWAPS
• 0–24 Claims: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Ein zu früher Swap-Versuch wird on-chain abgelehnt.

ERSTER SWAP
Die erste offizielle Transaktion auf einem Konto muss mindestens 2 PIERRON betragen.

GLOBALES EPOCHEN-VERKAUFSLIMIT
Die Summe aller Nutzerverkäufe in einer Epoche teilt sich eine Decke, die mit der Gesamtzahl der Protokoll-Claims steigt:

• unter 25 Claims total: 2,000,000,000 PIERRON
• unter 75: 3,000,000,000
• unter 175: 5,000,000,000
• unter 375: 7,000,000,000
• 375+: 9,000,000,000

Zusätzlich gelten Volumen- und Transaktionslimits pro Nutzer und Epoche (u. a. bis 100 Tx / Epoche sowie ein Volumen-Cap pro Nutzer).

━━━━━━━━━━━━━━━━━━━━
6. REDISTRIBUTION — RÜCKFORDERUNG DES 1%-BEITRAGS
━━━━━━━━━━━━━━━━━━━━

WARUM 1% EXISTIERT
Jeder offizielle Swap legt 1% in einen gemeinsamen Pool. Nach 28 Epochen (7 Tage bei 6-Stunden-Epochen) wird der Pool unter Personen aufgeteilt, die im Ökosystem ausreichend aktiv waren. Aktiver Handel + Zyklusaktivität = Anspruch auf Claim aus dem Pool. Inaktivität = kein Anteil. Das ist ein Loyalitäts-/Beitragsrückforderungsmechanismus, keine Strafe für Trading.

Der 1%-Beitrag soll Kapital zeitweise im Ökosystem binden und Sybil-Angriffe indirekt erschweren.

POOLQUELLE
Der 1%-Beitrag aus offiziellen Swaps speist den Redistributions-Vault.

ZYKLUS UND ZEITPLAN
• Zyklus: 28 Epochen = 7 Tage (Epoche = 6 h),
• nach Zyklusende wird der Pool geteilt (Anteil ≈ Pool / Anzahl Berechtigter),
• Claim in der App, sobald die Qualifikation erfüllt ist.

QUALIFIKATION (AUSREICHENDE AKTIVITÄT)
• mindestens 9 aktive Epochen in der 28-Epochen-Bitmap,
• mindestens 10 PIERRON Saldo halten,
• vom Protokoll anerkannte Aktivität (offizieller Handel / Protokollpfade).

CLAIM
• der Nutzer startet den Claim in der App (prepare → settle → consume),
• keeper claimen nicht für den Nutzer,
• Voucher bleiben in der Größenordnung von 28 Epochen gültig — nicht abgeholte können verfallen,
• Protokoll-Claim-Gebühr in PIERRON ist 0; der Nutzer zahlt die SOL-Netzwerkgebühr,
• ein erfolgreicher Claim erhöht den Claim-Zähler → höheres Swap-Limit und kürzerer Cooldown.

━━━━━━━━━━━━━━━━━━━━
7. LOYALITÄTSBONUS
━━━━━━━━━━━━━━━━━━━━

TICKETS
• aus offiziellem Handelsvolumen (Schwelle: 10 PIERRON Volumen → 1 Ticket),
• max. 50 Tickets pro Nutzer und Fenster,
• Ziehungsfenster alle 7 Epochen innerhalb des 28-Epochen-Zyklus.

ZIEHUNG
• keeper reichen Zufalls-Commits ein (commit–reveal),
• Ziehungen erfordern eine Mindestzahl an Commits (Produktionsuntergrenze: 20) und ein Mindest-Ticketpool,
• nach dem Fenster: Draw oder Skip (zu wenige Tickets),
• Preis: 2,000,000 PIERRON pro Draw (aus der Loyalitätsbonus-Allokation),
• Auszahlung: prepare → settle → Claim durch den Gewinner.

VOUCHER-GÜLTIGKEIT
Der Voucher zum Claim des Lotterie-Airdrops ist 7 Epochen gültig und verfällt danach.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND UND PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Registrieren → Senden in den Stealth-Vault → Claim durch Empfänger. Claim kann zwei Transaktionen erfordern. Das ist ein privaterer Transferpfad — er umgeht weder Swap-Limits noch den 1%-Beitrag.

PIERRON PAY
Zahlung an ein Händlerkonto mit Pay-Instruktion. Der Hook klassifiziert den Transfer als Pay, nicht als normalen DEX-Verkauf.

REGELN
• nutzen Sie diese Pfade nicht, um offizielle Handelslimits oder den 1%-Beitrag zu umgehen,
• prüfen Sie vor dem Senden immer Adresse / QR des Empfängers — on-chain-Fehler sind unumkehrbar.

━━━━━━━━━━━━━━━━━━━━
9. NUTZUNGSREGELN DER APP
━━━━━━━━━━━━━━━━━━━━

1. Verbinden Sie nur eine vertrauenswürdige Wallet. Teilen Sie Ihre Seed Phrase niemals mit „Support“ oder Fremden.
2. Swap: genehmigen Sie die volle Sequenz in der Wallet; schließen Sie die Wallet nicht mitten in der Signatur.
3. Respektieren Sie den Cooldown — erneutes Tippen überstimmt keine on-chain-Regeln.
4. Redistributions-/Loyalitätsbonus-Claim: erst wenn die App Bereitschaft anzeigt; nach Erfolg auf Netzwerksync warten vor dem nächsten Swap.
5. Auf Android (aggressive OEMs): bleiben Sie in der Wallet bis CONFIRM, kehren Sie dann zu Pierron zurück; beenden Sie die App nicht im Hintergrund.
6. Verboten: Angriffe auf Programme, Phishing unter dem Pierron-Namen, RPC-Spam, Settlement-/Hook-Exploit-Versuche.

━━━━━━━━━━━━━━━━━━━━
10. ÖKONOMISCHE SCHLEIFE
━━━━━━━━━━━━━━━━━━━━

Escrow gibt jede Epoche Token in den DEX-Pool frei.
Handel legt einen 1%-Beitrag in den Redistributionspool (rückforderbar nach 7 Tagen / 28 Epochen bei ausreichender Aktivität), Loyalitätsbonus-Tickets und die SOL-Price-Floor-Gebühr.
Aktivität im 28-Epochen-Zyklus qualifiziert zum Rückfordern eines Poolanteils.
Der Loyalitätsbonus zieht in 7-Epochen-Fenstern.
Burn reduziert das Angebot parallel nach Zeitplan.
Nutzer claimen Redistribution und Preise selbst; keeper halten die Protokolluhr.

━━━━━━━━━━━━━━━━━━━━
11. RISIKEN
━━━━━━━━━━━━━━━━━━━━

• Smart-Contract- und Upgrade-Risiko,
• Marktrisiko des PIERRON-Preises (keine garantierte Aufwärtsbewegung trotz Burn / Floor),
• SOL-Gebühren bei fehlgeschlagenen oder wiederholten Transaktionen,
• keine Gewinngarantie — Redistribution und Loyalitätsbonus sind kein Anlageprodukt.

Die Nutzung der App bedeutet die Annahme der on-chain durchgesetzten Regeln und der oben genannten Risiken.

Pierron — transparente Tokenomik und echte Nutzung.`;
