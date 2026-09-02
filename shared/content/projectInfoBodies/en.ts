export const PROJECT_INFO_BODY = `PIERRON — PROJECT INFO
Version 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. stands for “PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK”,
or colloquially CPDDC (Centralized Pool Decentralized Digital Currency).

It is a cryptocurrency on Solana that, through a combination of 49 distinct mechanisms, forms an autonomous, decentralized ecosystem designed to deliver the highest form of financial security for the individual user.

The project was designed for absolute transparency toward the user and so that the user does not need to trust the product.

The rules embedded in the project are final and cannot be changed.

The PIERRON ecosystem is fully autonomous: it requires no administrator and has none. The project also has no support desk or customer service. All decisions and actions taken by a user in the ecosystem are solely the user’s responsibility. The project creator is not liable for the user’s mistaken decisions or errors.

PIERRON has over 2200 formal proofs with no assume, admit, external_body, vacuity, or underspecified branches.

━━━━━━━━━━━━━━━━━━━━
1. WHAT IS PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron is a token protocol on the Solana blockchain. Economic rules (limits, 1% pool contribution, cooldown, redistribution, loyalty bonus, emission, and burn) are enforced on-chain by smart-contract programs — not merely described in documentation.

The PIERRON token (SPL Token-2022) combines:

• official DEX trading with per-trade limits and cooldown,
• a 1% contribution to the redistribution pool — recoverable after an activity cycle (not a “penalty for trading”),
• activity cycles and claiming a share of the pool,
• a volume-based loyalty bonus,
• controlled emission into the market pool plus a burn schedule,
• a SOL price-floor fee on official swaps,
• Safe Send (more private transfers) and Pierron Pay (merchant payments).

The mobile app and dapp build transactions. The source of truth for rules is the code deployed on Solana.

━━━━━━━━━━━━━━━━━━━━
2. DESIGN PRINCIPLES
━━━━━━━━━━━━━━━━━━━━

• Rules in code — limits and eligibility are checked by the program.
• Activity over wholesale speculation — hard caps per transaction and per epoch.
• Pool share for real cycle activity, not for idle holding alone.
• Structural deflation — large burn allocation and a fixed burn schedule.
• Separated risk paths — settlement and stealth are separate programs; vault payouts require valid vouchers.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMICS (SUPPLY)
━━━━━━━━━━━━━━━━━━━━

Unit: UI token (6 decimal places on-chain).

Total supply: 150,000,000,000 PIERRON (150 billion)

Allocation:
• Market pool (escrow → DEX): 60B (40%)
• Developer wallet: 21B (14%)
• Loyalty bonus: 7B (~4.7%)
• Burn (vault + schedule): 56B (~37.3%)
• Treasury: 6B (4%)

Emission: each epoch the protocol releases tokens from escrow into the DEX pool under an epoch quota — higher at genesis, then standard.

Burn: from the burn vault at a fixed rate over about 20 calendar years of epochs until the burn allocation is exhausted.

Epoch length: 21,600 seconds (6 hours). Epoch 0 starts at the protocol genesis timestamp.

━━━━━━━━━━━━━━━━━━━━
4. ARCHITECTURE (BRIEF)
━━━━━━━━━━━━━━━━━━━━

• Pierron program — accounting, DEX limits, trade book, loyalty bonus, redistribution, ticks, burn, price floor
• Transfer Hook — Token-2022 transfer classification; limits and 1% contribution on official paths
• Settlement — vault payouts (redistribution, loyalty bonus, keeper rewards) after voucher prepare
• Stealth — register, send, and claim (Safe Send)
• TradeBook / user account — activity, volume, tickets, epoch bitmap, claim count
• Network keepers — advance epochs, emission/burn, and draws; they do not claim redistribution or prizes for users

━━━━━━━━━━━━━━━━━━━━
5. TRADING RULES
━━━━━━━━━━━━━━━━━━━━

OFFICIAL PATH
Trade via swap in the Pierron app (DEX pool under protocol policy), with limit and transfer-hook instructions. Transfers outside allowed paths may be rejected or classified differently.

1% CONTRIBUTION (RECOVERABLE — NOT A PENALTY)
1% of official trade volume goes into a shared redistribution pool. This is not a punitive fee and not a permanent burn of your funds: with enough ecosystem activity you can reclaim your share of the pool after the cycle ends.

A redistribution cycle lasts 28 epochs. With 6-hour epochs that is 7 days. After the cycle closes, eligible users claim their share from the pool in the app.

Recovery condition: sufficient activity in the cycle (including at least 9 active epochs in the 28-epoch bitmap and maintaining at least 10 PIERRON) — see Redistribution. Without ecosystem activity there is no pool share; with the contribution plus activity, trading builds a right to reclaim from the pool — not just a cost of trading.

The 1% contribution cannot be disabled in settings — it is part of the protocol.

PRICE FLOOR (SOL)
Official swaps require a SOL fee proportional to PIERRON volume (100 lamports per 1 PIERRON). Funds go to the price-floor treasury and may support liquidity / floor.

PER-TRANSACTION LIMIT
Maximum PIERRON per transaction depends on redistributed claims received:

• 0–24 claims: 13,000,000 PIERRON
• ≥ 25 claims: 16,000,000 PIERRON
• ≥ 75 claims: 19,000,000 PIERRON
• ≥ 175 claims: 24,000,000 PIERRON
• ≥ 375 claims: 34,000,000 PIERRON (cap)

COOLDOWN BETWEEN SWAPS
• 0–24 claims: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

An early swap attempt is rejected on-chain.

FIRST SWAP
The first official transaction on an account must be at least 2 PIERRON.

GLOBAL EPOCH SELL CAP
Total sells by all users in an epoch share a ceiling that rises with total protocol claims:

• under 25 total claims: 2,000,000,000 PIERRON
• under 75: 3,000,000,000
• under 175: 5,000,000,000
• under 375: 7,000,000,000
• 375+: 9,000,000,000

Per-user epoch volume and transaction caps also apply (including up to 100 txs per epoch and a per-user volume cap).

━━━━━━━━━━━━━━━━━━━━
6. REDISTRIBUTION — RECOVERING THE 1% CONTRIBUTION
━━━━━━━━━━━━━━━━━━━━

WHY 1% EXISTS
Every official swap places 1% into a shared pool. After 28 epochs (7 days at 6-hour epochs) the pool is split among people who were active enough in the ecosystem. Active trading + cycle activity = the right to claim from the pool. Inactivity = no share. This is a loyalty / contribution-recovery mechanism, not a penalty for trading.

The 1% contribution is designed to temporarily bind part of capital in the ecosystem and to indirectly discourage Sybil attacks.

POOL SOURCE
The 1% contribution from official swaps funds the redistribution vault.

CYCLE AND TIMING
• cycle: 28 epochs = 7 days (epoch = 6 h),
• after the cycle closes the pool is split (share ≈ pool / eligible count),
• claim in the app once eligibility is met.

ELIGIBILITY (SUFFICIENT ACTIVITY)
• at least 9 active epochs in the 28-epoch bitmap,
• maintain at least 10 PIERRON balance,
• activity recognized by the protocol (official trading / protocol paths).

CLAIMING
• the user initiates claim in the app (prepare → settle → consume),
• keepers do not claim for the user,
• vouchers remain valid on the order of 28 epochs — unclaimed ones may expire,
• protocol claim fee in PIERRON is 0; the user pays the SOL network fee,
• a successful claim raises the claim counter → higher swap limit and shorter cooldown.

━━━━━━━━━━━━━━━━━━━━
7. LOYALTY BONUS
━━━━━━━━━━━━━━━━━━━━

TICKETS
• earned from official trade volume (threshold: 10 PIERRON volume → 1 ticket),
• max 50 tickets per user per window,
• draw windows every 7 epochs within the 28-epoch cycle.

DRAW
• keepers submit randomness commits (commit–reveal),
• draws require a minimum commit count (production floor: 20) and a minimum ticket pool,
• after the window: draw or skip (too few tickets),
• prize: 2,000,000 PIERRON per draw (from the loyalty-bonus allocation),
• payout: prepare → settle → claim by the winner.

VOUCHER VALIDITY
The voucher to claim the lottery airdrop is valid for 7 epochs, then expires.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND AND PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Register → send to stealth vault → recipient claim. Claim may require two transactions. This is a more private transfer path — it does not bypass swap limits or the 1% contribution.

PIERRON PAY
Payment to a merchant account with a pay instruction. The hook classifies the transfer as Pay, not as a normal DEX sell.

RULES
• do not use these paths to bypass official trading limits or the 1% contribution,
• always verify the recipient address / QR before sending — on-chain mistakes are irreversible.

━━━━━━━━━━━━━━━━━━━━
9. APP USAGE RULES
━━━━━━━━━━━━━━━━━━━━

1. Connect only a trusted wallet. Never share your seed phrase with “support” or strangers.
2. Swap: approve the full sequence in the wallet; do not close the wallet mid-signature.
3. Respect cooldown — tapping again does not override on-chain rules.
4. Redistribution / loyalty-bonus claim: only when the app shows readiness; after success wait for network sync before the next swap.
5. On Android (aggressive OEMs): stay in the wallet until CONFIRM, then return to Pierron; do not kill the app in the background.
6. Forbidden: attacks on programs, phishing under the Pierron name, RPC spam, settlement / hook exploit attempts.

━━━━━━━━━━━━━━━━━━━━
10. ECONOMIC LOOP
━━━━━━━━━━━━━━━━━━━━

Escrow releases tokens into the DEX pool each epoch.
Trading places a 1% contribution into the redistribution pool (recoverable after 7 days / 28 epochs with sufficient activity), loyalty-bonus tickets, and the SOL price-floor fee.
Activity in the 28-epoch cycle qualifies you to reclaim a share of the pool.
The loyalty bonus draws in 7-epoch windows.
Burn reduces supply in parallel on schedule.
Users claim redistribution and prizes themselves; keepers maintain the protocol clock.

━━━━━━━━━━━━━━━━━━━━
11. RISKS
━━━━━━━━━━━━━━━━━━━━

• smart-contract and upgrade risk,
• market risk for PIERRON price (no guaranteed upside despite burn / floor),
• SOL fees on failed or repeated transactions,
• no profit guarantee — redistribution and the loyalty bonus are not a deposit product.

Using the app means accepting on-chain rules and the risks above.

Pierron — transparent tokenomics and real use.`;
