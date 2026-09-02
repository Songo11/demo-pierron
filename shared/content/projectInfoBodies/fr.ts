export const PROJECT_INFO_BODY = `PIERRON — INFORMATIONS SUR LE PROJET
Version 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. signifie « PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK »,
ou familièrement CPDDC (Monnaie numérique décentralisée de pool centralisé).

Il s'agit d'une crypto-monnaie sur Solana qui, grâce à une combinaison de 49 mécanismes distincts, forme un écosystème autonome et décentralisé conçu pour offrir la forme la plus élevée de sécurité financière à l'utilisateur individuel.

Le projet a été conçu dans un souci de transparence absolue envers l'utilisateur et pour que celui-ci n'ait pas besoin de faire confiance au produit.

Les règles intégrées dans le projet sont définitives et ne peuvent être modifiées.

L'écosystème PIERRON est totalement autonome : il ne nécessite aucun administrateur et n'en possède aucun. Le projet ne dispose pas non plus d'un service d'assistance ni de service client. Toutes les décisions et actions prises par un utilisateur dans l’écosystème relèvent de la seule responsabilité de l’utilisateur. Le créateur du projet n’est pas responsable des décisions erronées ou des erreurs de l’utilisateur.

PIERRON possède plus de 2200 preuves formelles sans assume, admit, external_body, vacuity ni underspecified branches.

━━━━━━━━━━━━━━━━━━━━
1. QU'EST-CE QUE PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron est un protocole de token sur la blockchain Solana. Les règles économiques (limites, contribution au pool de 1%, temps de recharge, redistribution, bonus de fidélité, émission et brûlage) sont appliquées en chaîne par des programmes de contrats intelligents – et pas seulement décrites dans la documentation.

Le token PIERRON (SPL Token-2022) combine :

• Trading officiel DEX avec limites par transaction et temps de recharge,
• une contribution de 1% au pool de redistribution — récupérable après un cycle d'activité (et non une « pénalité pour trading »),
• cycles d'activité et revendication d'une part du pool,
• une prime de fidélité basée sur le volume,
• émission contrôlée dans le pool de marché et programme de combustion,
• une commission de prix plancher SOL sur les swaps officiels,
• Safe Send (plus de transferts privés) et Pierron Pay (paiements marchands).

L'application mobile et le dapp créent des transactions. La source de vérité des règles est le code déployé sur Solana.

━━━━━━━━━━━━━━━━━━━━
2. PRINCIPES DE CONCEPTION
━━━━━━━━━━━━━━━━━━━━

• Règles dans le code — les limites et l'éligibilité sont vérifiées par le programme.
• Activité liée à la spéculation de gros – plafonds stricts par transaction et par époque.
• Partage de pool pour l'activité du cycle réel, et non pour la seule détention inutilisée.
• Déflation structurelle – allocation de brûlage importante et calendrier de brûlage fixe.
• Des parcours de risque séparés : le règlement et la furtivité sont des programmes distincts ; Les paiements du coffre-fort nécessitent des bons valides.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMIQUE (APPROVISIONNEMENT)
━━━━━━━━━━━━━━━━━━━━

Unité : jeton d'interface utilisateur (6 décimales sur la chaîne).

Offre totale : 150,000,000,000 PIERRON (150 milliards)

Attribution :
• Pool de marché (escrow → DEX) : 60 B (40%)
• Portefeuille de développeur : 21 B (14%)
• Bonus de fidélité : 7B (~4.7%)
• Brûlage (coffre + planning) : 56B (~37.3%)
• Trésorerie : 6 milliards (4%)

Émission : à chaque époque, le protocole libère des jetons depuis escrow vers le pool DEX selon un quota d’époque — plus élevé à la genèse, puis standard.

Brûlage : depuis le coffre-fort de brûlage à un taux fixe sur environ 20 années civiles jusqu'à ce que l'allocation de brûlage soit épuisée.

Durée de l'époque : 21,600 secondes (6 heures). L'époque 0 commence à l'horodatage de la genèse du protocole.

━━━━━━━━━━━━━━━━━━━━
4. ARCHITECTURE (BREF)
━━━━━━━━━━━━━━━━━━━━

• Programme Pierron — comptabilité, limites DEX, trade book, prime de fidélité, redistribution, ticks, burn, prix plancher
• Transfer Hook — classification de transfert Token-2022 ; limites et contribution de 1% sur les sentiers officiels
• Settlement — Règlement : paiements du coffre-fort (redistribution, bonus de fidélité, récompenses de keeper) après la préparation des bons
• Stealth — Furtif : enregistrement, envoi et réclamation (Safe Send)
• TradeBook/compte utilisateur : activité, volume, tickets, bitmap d'époque, nombre de réclamations
• keepers du réseau : avancez les époques, les émissions/brûlures et les tirages ; ils ne réclament pas de redistribution ni de prix pour les utilisateurs

━━━━━━━━━━━━━━━━━━━━
5. RÈGLES DE COMMERCE
━━━━━━━━━━━━━━━━━━━━

CHEMIN OFFICIEL
Tradez via swap dans l'application Pierron (pool DEX sous politique protocolaire), avec instructions de limite et de transfert. Les transferts en dehors des chemins autorisés peuvent être rejetés ou classés différemment.

CONTRIBUTION DE 1% (RÉCUPÉRABLE — PAS UNE PÉNALITÉ)
1% du volume officiel des échanges est reversé à un pool de redistribution partagé. Il ne s’agit pas de frais punitifs ni d’une consommation permanente de vos fonds : avec suffisamment d’activité dans l’écosystème, vous pouvez récupérer votre part du pool une fois le cycle terminé.

Un cycle de redistribution dure 28 époques. Avec des époques de 6 heures, cela fait 7 jours. Une fois le cycle terminé, les utilisateurs éligibles réclament leur part du pool dans l'application.

Condition de récupération : activité suffisante dans le cycle (y compris au moins 9 époques actives dans le bitmap de 28 époques et maintien d'au moins 10 PIERRON) — voir Redistribution. Sans activité écosystémique, il n’y a pas de partage du pool ; avec la contribution plus l'activité, le trading crée un droit à récupérer sur le pool – et pas seulement un coût de trading.

La contribution de 1% ne peut pas être désactivée dans les paramètres : elle fait partie du protocole.

PRIX PLANCHER (SOL)
Les échanges officiels nécessitent des frais SOL proportionnels au volume de PIERRON (100 lamports pour 1 PIERRON). Les fonds vont à la trésorerie du prix plancher et peuvent soutenir la liquidité/le plancher.

LIMITE PAR TRANSACTION
Le montant maximum de PIERRON par transaction dépend des réclamations redistribuées reçues :

• 0–24 claims : 13,000,000 PIERRON
• ≥ 25 claims : 16,000,000 PIERRON
• ≥ 75 claims : 19,000,000 PIERRON
• ≥ 175 claims : 24,000,000 PIERRON
• ≥ 375 claims : 34,000,000 PIERRON (plafond)

TEMPS DE RÉCUPÉRATION ENTRE LES ÉCHANGES
• 0–24 réclamations : 120 s
• ≥ 25 : 90 s
• ≥ 75 : 75 s
• ≥ 175 : 60 s
• ≥ 375 : 40 s

Une tentative d'échange précoce est rejetée en chaîne.

PREMIER ÉCHANGE
La première transaction officielle sur un compte doit être d'au moins 2 PIERRON.

PLAFOND GLOBAL DES VENTES PAR ÉPOQUE
Le total des ventes réalisées par tous les utilisateurs au cours d'une époque partage un plafond qui augmente avec le total des revendications du protocole :

• moins de 25 réclamations total: 2,000,000,000 PIERRON
• moins de 75: 3,000,000,000
• moins de 175: 5,000,000,000
• moins de 375: 7,000,000,000
• 375+: 9,000,000,000

Des plafonds de volume et de transactions par utilisateur s'appliquent également (y compris jusqu'à 100 tx par époque et un plafond de volume par utilisateur).

━━━━━━━━━━━━━━━━━━━━
6. REDISTRIBUTION — RÉCUPÉRATION DE LA CONTRIBUTION DE 1%
━━━━━━━━━━━━━━━━━━━━

POURQUOI 1% EXISTE
Chaque échange officiel place 1% dans un pool partagé. Après 28 époques (7 jours à 6 heures), le bassin est réparti entre les personnes suffisamment actives dans l'écosystème. Trading actif + activité de cycle = le droit de réclamer du pool. Inactivité = pas de partage. Il s'agit d'un mécanisme de fidélité/récupération de contributions, et non d'une pénalité pour les échanges.

La contribution de 1% est destinée à lier temporairement une partie du capital dans l'écosystème et à décourager indirectement les attaques Sybil.

SOURCE DU FONDS
La contribution de 1% des swaps officiels finance le coffre-fort de redistribution.

CYCLE ET CALENDRIER
• cycle : 28 époques = 7 jours (époque = 6 h),
• après la clôture du cycle, le pool est divisé (part ≈ pool / nombre éligible),
• réclamez dans l'application une fois l'éligibilité remplie.

ADMISSIBILITÉ (ACTIVITÉ SUFFISANTE)
• au moins 9 époques actives dans le bitmap de 28 époques,
• maintenir au moins 10 équilibre PIERRON,
• activité reconnue par le protocole (traces officielles de trading / protocole).

RÉCLAMATION
• l'utilisateur initie une réclamation dans l'application (préparer → régler → consommer),
• les détenteurs ne réclament pas pour l'utilisateur,
• les bons restent valables de l'ordre de 28 époques — ceux non réclamés peuvent expirer,
• Les frais de réclamation du protocole dans PIERRON sont de 0 ; l'utilisateur paie les frais de réseau SOL,
• Une réclamation réussie fait augmenter le compteur de réclamation → limite d'échange plus élevée et temps de recharge plus court.

━━━━━━━━━━━━━━━━━━━━
7. PRIME DE FIDÉLITÉ
━━━━━━━━━━━━━━━━━━━━

BILLETS
• gagné grâce au volume commercial officiel (seuil : 10 volumes PIERRON → 1 ticket),
• max 50 tickets par utilisateur et par fenêtre,
• dessiner des fenêtres toutes les 7 époques dans le cycle de 28 époques.

TIRAGE
• les keepers soumettent des commits aléatoires (commit–reveal),
• les tirages nécessitent un nombre minimum de commits (niveau de production : 20) et un pool minimum de tickets,
• après le guichet : tirage au sort ou saut (trop peu de tickets),
• prix : 2,000,000 PIERRON par tirage (sur l'attribution du bonus de fidélité),
• paiement : préparer → régler → réclamer par le gagnant.

VALIDITÉ DU BON
Le bon pour réclamer le parachutage de loterie est valable pendant 7 époques, puis expire.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND ET PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
S'inscrire → envoyer au coffre-fort furtif → réclamation du destinataire. La réclamation peut nécessiter deux transactions. Il s'agit d'une voie de transfert plus privée : elle ne contourne pas les limites de swap ni la contribution de 1%.

PIERRON PAY
Paiement sur un compte marchand avec une instruction de paiement. Le crochet classe le transfert comme Pay, et non comme une vente DEX normale.

RÈGLES
• ne pas utiliser ces voies pour contourner les limites officielles de négociation ou la contribution de 1%,
• Vérifiez toujours l'adresse du destinataire / QR avant l'envoi — les erreurs en chaîne sont irréversibles.

━━━━━━━━━━━━━━━━━━━━
9. RÈGLES D'UTILISATION DE L'APPLICATION
━━━━━━━━━━━━━━━━━━━━

1. Connectez uniquement un portefeuille de confiance. Ne partagez jamais votre phrase de départ avec du « support » ou des inconnus.
2. Swap : approuvez la séquence complète dans le portefeuille ; ne fermez pas le portefeuille à mi-signature.
3. Respectez le temps de recharge : appuyer à nouveau n'annule pas les règles en chaîne.
4. Redistribution/réclamation de bonus de fidélité : uniquement lorsque l'application montre qu'elle est prête ; après le succès, attendez la synchronisation du réseau avant le prochain échange.
5. Sur Android (OEM agressifs) : rester dans le portefeuille jusqu'à CONFIRM, puis revenir chez Pierron ; ne tuez pas l'application en arrière-plan.
6. Interdits : attaques de programmes, phishing sous le nom Pierron, spam RPC, tentatives de règlement/hook exploit.

━━━━━━━━━━━━━━━━━━━━
10. BOUCLE ÉCONOMIQUE
━━━━━━━━━━━━━━━━━━━━

Escrow libère des jetons dans le pool DEX à chaque époque.
Le trading place une contribution de 1% dans le pool de redistribution (récupérable après 7 jours / 28 époques avec une activité suffisante), des billets bonus de fidélité et des frais de prix plancher SOL.
L'activité dans le cycle de 28 époques vous qualifie pour récupérer une part du pool.
Le bonus de fidélité est tiré dans des fenêtres de 7 époques.
Burn réduit l’offre en parallèle dans les délais.
Les utilisateurs réclament eux-mêmes la redistribution et les prix ; les keepers maintiennent l’horloge protocolaire.

━━━━━━━━━━━━━━━━━━━━
11. RISQUES
━━━━━━━━━━━━━━━━━━━━

• risque de contrat intelligent et de mise à niveau,
• risque de marché sur le cours PIERRON (pas de hausse garantie malgré burn / floor),
• Frais SOL sur transactions échouées ou répétées,
• garantie d'absence de profit — la redistribution et le bonus de fidélité ne sont pas un produit de dépôt.

Utiliser l'application signifie accepter les règles en chaîne et les risques ci-dessus.

Pierron — tokenomique transparente et utilisation réelle.`;
