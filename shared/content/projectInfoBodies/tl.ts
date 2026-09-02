export const PROJECT_INFO_BODY = `PIERRON — IMPORMASYON NG PROYEKTO
Bersyon 1.3 · Solana · Token-2022

Ang P.I.E.R.R.O.N. ay nangangahulugang “PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK”,
o kolokyal na CPDDC (Centralized Pool Decentralized Digital Currency).

Ito ay isang cryptocurrency sa Solana na, sa pamamagitan ng kombinasyon ng 49 natatanging mekanismo, ay bumubuo ng isang autonomous, desentralisadong ecosystem na idinisenyo upang maihatid ang pinakamataas na anyo ng seguridad sa pananalapi para sa indibidwal na gumagamit.

Ang proyekto ay idinisenyo para sa ganap na transparency tungo sa user at upang hindi na kailanganin ng user na magtiwala sa produkto.

Ang mga panuntunang naka-embed sa proyekto ay pinal at hindi na mababago.

Ang PIERRON ecosystem ay ganap na autonomous: hindi ito nangangailangan ng administrator at wala itong administrator. Wala rin itong support desk o customer service. Ang lahat ng desisyon at aksyon ng user sa ecosystem ay tanging responsibilidad ng user. Hindi mananagot ang gumawa ng proyekto sa mga maling desisyon o pagkakamali ng user.

May higit sa 2200 formal proofs ang PIERRON na walang assume, admit, external_body, vacuity, o underspecified na mga sanga.

━━━━━━━━━━━━━━━━━━━━
1. ANO ANG PIERRON
━━━━━━━━━━━━━━━━━━━━

Ang Pierron ay isang token protocol sa Solana blockchain. Ang mga panuntunang pang-ekonomiya (mga limitasyon, 1% pool contribution, cooldown, redistribution, loyalty bonus, emission, at burn) ay ipinapatupad on-chain ng mga smart-contract program — hindi lamang inilarawan sa dokumentasyon.

Pinagsasama ng PIERRON token (SPL Token-2022) ang:

• opisyal na DEX trading na may mga limitasyon sa bawat trade at cooldown,
• 1% contribution sa redistribution pool — mababawi pagkatapos ng activity cycle (hindi “parusa sa pag-trade”),
• mga activity cycle at pag-claim ng bahagi ng pool,
• volume-based loyalty bonus,
• controlled emission papunta sa market pool kasama ang burn schedule,
• SOL price-floor fee sa mga opisyal na swap,
• Safe Send (mas pribadong transfer) at Pierron Pay (merchant payments).

Ang mobile app at dapp ang gumagawa ng mga transaction. Ang source of truth para sa mga panuntunan ay ang code na naka-deploy sa Solana.

━━━━━━━━━━━━━━━━━━━━
2. MGA PRINSIPYO NG DISENYO
━━━━━━━━━━━━━━━━━━━━

• Mga panuntunan sa code — sinusuri ng program ang mga limitasyon at eligibility.
• Activity sa halip na wholesale speculation — mahigpit na cap sa bawat transaction at bawat epoch.
• Pool share para sa tunay na cycle activity, hindi para sa idle holding lang.
• Structural deflation — malaking burn allocation at fixed burn schedule.
• Hiwalay na risk paths — hiwalay na programa ang settlement at stealth; kailangan ng valid voucher para sa vault payout.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMICS (SUPPLY)
━━━━━━━━━━━━━━━━━━━━

Unit: UI token (6 decimal places on-chain).

Kabuuang supply: 150,000,000,000 PIERRON (150 bilyon)

Allocation:
• Market pool (escrow → DEX): 60B (40%)
• Developer wallet: 21B (14%)
• Loyalty bonus: 7B (~4.7%)
• Burn (vault + schedule): 56B (~37.3%)
• Treasury: 6B (4%)

Emission: sa bawat epoch, naglalabas ang protocol ng token mula sa escrow papunta sa DEX pool sa ilalim ng epoch quota — mas mataas sa genesis, pagkatapos ay standard.

Burn: mula sa burn vault sa fixed rate sa loob ng humigit-kumulang 20 calendar years ng epoch hanggang maubos ang burn allocation.

Haba ng epoch: 21,600 segundo (6 oras). Nagsisimula ang Epoch 0 sa protocol genesis timestamp.

━━━━━━━━━━━━━━━━━━━━
4. ARKITEKTURA (MAIKSI)
━━━━━━━━━━━━━━━━━━━━

• Pierron program — accounting, DEX limits, trade book, loyalty bonus, redistribution, ticks, burn, price floor
• Transfer Hook — Token-2022 transfer classification; limits at 1% contribution sa opisyal na path
• Settlement — vault payout (redistribution, loyalty bonus, keeper rewards) pagkatapos ng voucher prepare
• Stealth — register, send, at claim (Safe Send)
• TradeBook / user account — activity, volume, tickets, epoch bitmap, claim count
• Network keepers — nagpapasulong ng epoch, emission/burn, at draw; hindi sila nagcla-claim ng redistribution o prize para sa mga user

━━━━━━━━━━━━━━━━━━━━
5. MGA PANUNTUNAN SA TRADING
━━━━━━━━━━━━━━━━━━━━

OPISYAL NA PATH
Mag-trade sa pamamagitan ng swap sa Pierron app (DEX pool sa ilalim ng protocol policy), na may limit at transfer-hook instruction. Ang mga transfer sa labas ng pinapayagang path ay maaaring ma-reject o mauri nang iba.

1% CONTRIBUTION (MABABAWI — HINDI PARUSA)
Ang 1% ng opisyal na trade volume ay pumapasok sa shared redistribution pool. Hindi ito punitive fee at hindi permanenteng burn ng iyong pondo: sa sapat na ecosystem activity, mababawi mo ang iyong share ng pool pagkatapos magtapos ang cycle.

Ang redistribution cycle ay tumatagal ng 28 epoch. Sa 6-hour epoch, iyon ay 7 araw. Pagkatapos magsara ang cycle, nagcla-claim ang mga eligible user ng kanilang share mula sa pool sa app.

Kondisyon sa pagbawi: sapat na activity sa cycle (kabilang ang hindi bababa sa 9 active epoch sa 28-epoch bitmap at pagpapanatili ng hindi bababa sa 10 PIERRON) — tingnan ang Redistribution. Kung walang ecosystem activity, walang pool share; sa contribution kasama ang activity, ang trading ay bumubuo ng karapatan na mabawi mula sa pool — hindi lang gastos sa trading.

Hindi maidi-disable ang 1% contribution sa settings — bahagi ito ng protocol.

PRICE FLOOR (SOL)
Ang mga opisyal na swap ay nangangailangan ng SOL fee na proporsyonal sa PIERRON volume (100 lamports bawat 1 PIERRON). Pumupunta ang pondo sa price-floor treasury at maaaring sumuporta sa liquidity / floor.

LIMITASYON SA BAWAT TRANSACTION
Ang maximum na PIERRON bawat transaction ay depende sa natanggap na redistributed claims:

• 0–24 claims: 13,000,000 PIERRON
• ≥ 25 claims: 16,000,000 PIERRON
• ≥ 75 claims: 19,000,000 PIERRON
• ≥ 175 claims: 24,000,000 PIERRON
• ≥ 375 claims: 34,000,000 PIERRON (cap)

COOLDOWN SA PAGITAN NG MGA SWAP
• 0–24 claims: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Ang maagang pagtatangkang mag-swap ay nire-reject on-chain.

UNANG SWAP
Ang unang opisyal na transaction sa isang account ay dapat hindi bababa sa 2 PIERRON.

GLOBAL EPOCH SELL CAP
Ang kabuuang benta ng lahat ng user sa isang epoch ay may shared ceiling na tumataas kasama ang total protocol claims:

• wala pang 25 total claims: 2,000,000,000 PIERRON
• wala pang 75: 3,000,000,000
• wala pang 175: 5,000,000,000
• wala pang 375: 7,000,000,000
• 375+: 9,000,000,000

Mayroon ding per-user epoch volume at transaction caps (kabilang ang hanggang 100 tx bawat epoch at per-user volume cap).

━━━━━━━━━━━━━━━━━━━━
6. REDISTRIBUTION — PAGBAWI NG 1% CONTRIBUTION
━━━━━━━━━━━━━━━━━━━━

BAKIT MAY 1%
Bawat opisyal na swap ay naglalagay ng 1% sa shared pool. Pagkatapos ng 28 epoch (7 araw sa 6-hour epoch), hinahati ang pool sa mga sapat na aktibo sa ecosystem. Aktibong trading + cycle activity = karapatang mag-claim mula sa pool. Inactivity = walang share. Ito ay loyalty / contribution-recovery mechanism, hindi parusa sa pag-trade.

Ang 1% contribution ay idinisenyo upang pansamantalang itali ang bahagi ng kapital sa ecosystem at hindi direktang hadlangan ang Sybil attacks.

PINAGMULAN NG POOL
Ang 1% contribution mula sa mga opisyal na swap ang nagpo-pondo sa redistribution vault.

CYCLE AT TIMING
• cycle: 28 epoch = 7 araw (epoch = 6 h),
• pagkatapos magsara ang cycle, hinahati ang pool (share ≈ pool / eligible count),
• mag-claim sa app kapag naabot ang eligibility.

ELIGIBILITY (SAPAT NA ACTIVITY)
• hindi bababa sa 9 active epoch sa 28-epoch bitmap,
• panatilihin ang hindi bababa sa 10 PIERRON balance,
• activity na kinikilala ng protocol (opisyal na trading / protocol paths).

PAG-CLAIM
• sinisimulan ng user ang claim sa app (prepare → settle → consume),
• hindi nagcla-claim ang keepers para sa user,
• nananatiling valid ang voucher nang humigit-kumulang 28 epoch — maaaring mag-expire ang hindi na-claim,
• ang protocol claim fee sa PIERRON ay 0; binabayaran ng user ang SOL network fee,
• ang matagumpay na claim ay nagpapataas ng claim counter → mas mataas na swap limit at mas maikling cooldown.

━━━━━━━━━━━━━━━━━━━━
7. LOYALTY BONUS
━━━━━━━━━━━━━━━━━━━━

TICKETS
• nakukuha mula sa opisyal na trade volume (threshold: 10 PIERRON volume → 1 ticket),
• max 50 tickets bawat user bawat window,
• draw windows tuwing 7 epoch sa loob ng 28-epoch cycle.

DRAW
• nagsumite ang keepers ng randomness commits (commit–reveal),
• kailangan ng draw ang minimum commit count (production floor: 20) at minimum ticket pool,
• pagkatapos ng window: draw o skip (napakakaunting ticket),
• prize: 2,000,000 PIERRON bawat draw (mula sa loyalty-bonus allocation),
• payout: prepare → settle → claim ng nanalo.

VALIDITY NG VOUCHER
Ang voucher para i-claim ang lottery airdrop ay valid nang 7 epoch, pagkatapos ay mag-e-expire.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND AT PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Register → send sa stealth vault → claim ng recipient. Maaaring kailanganin ng claim ang dalawang transaction. Ito ay mas pribadong transfer path — hindi nito nilalampasan ang swap limits o ang 1% contribution.

PIERRON PAY
Bayad sa merchant account gamit ang pay instruction. Inuuri ng hook ang transfer bilang Pay, hindi bilang normal na DEX sell.

MGA PANUNTUNAN
• huwag gamitin ang mga path na ito para lampasan ang opisyal na trading limits o ang 1% contribution,
• palaging beripikahin ang recipient address / QR bago magpadala — hindi na mababawi ang mga on-chain na pagkakamali.

━━━━━━━━━━━━━━━━━━━━
9. MGA PANUNTUNAN SA PAGGAMIT NG APP
━━━━━━━━━━━━━━━━━━━━

1. Magkonekta lang ng trusted wallet. Huwag kailanman ibahagi ang seed phrase sa “support” o sa mga estranghero.
2. Swap: aprubahan ang buong sequence sa wallet; huwag isara ang wallet habang nasa gitna ng signature.
3. Igalang ang cooldown — ang paulit-ulit na pag-tap ay hindi nagbabago ng on-chain rules.
4. Redistribution / loyalty-bonus claim: kung handa na ayon sa app; pagkatapos ng success, maghintay ng network sync bago ang susunod na swap.
5. Sa Android (aggressive OEM): manatili sa wallet hanggang CONFIRM, tapos bumalik sa Pierron; huwag patayin ang app sa background.
6. Bawal: atake sa mga program, phishing sa pangalan ng Pierron, RPC spam, settlement / hook exploit attempts.

━━━━━━━━━━━━━━━━━━━━
10. ECONOMIC LOOP
━━━━━━━━━━━━━━━━━━━━

Naglalabas ang escrow ng token papunta sa DEX pool sa bawat epoch.
Ang trading ay naglalagay ng 1% contribution sa redistribution pool (mababawi pagkatapos ng 7 araw / 28 epoch na may sapat na activity), loyalty-bonus tickets, at SOL price-floor fee.
Ang activity sa 28-epoch cycle ang nagiging dahilan upang maging eligible kang mabawi ang share ng pool.
Ang loyalty bonus ay may draw sa 7-epoch windows.
Binabawasan ng burn ang supply nang parallel ayon sa schedule.
Ang mga user mismo ang nagcla-claim ng redistribution at prizes; pinapanatili ng keepers ang protocol clock.

━━━━━━━━━━━━━━━━━━━━
11. MGA PANGANIB
━━━━━━━━━━━━━━━━━━━━

• smart-contract at upgrade risk,
• market risk para sa presyo ng PIERRON (walang guaranteed upside sa kabila ng burn / floor),
• SOL fees sa failed o paulit-ulit na transaction,
• walang profit guarantee — ang redistribution at loyalty bonus ay hindi deposit product.

Ang paggamit ng app ay nangangahulugang tinatanggap ang on-chain rules at ang mga panganib sa itaas.

Pierron — transparent tokenomics at tunay na paggamit.`;
