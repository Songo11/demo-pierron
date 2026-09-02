export const PROJECT_INFO_BODY = `PIERRON - AGAHIYA PROJEyê
Guhertoya 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. tê wateya "PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK",
an jî bi zimanî CPDDC (Centralized Pool Decentralized Digital Currency).

Ew li ser Solana pereyê krîpto ye ku, bi berhevkirina 49 mekanîzmayên cihêreng, ekosîstemek xweser, nenavendî ava dike ku ji bo peydakirina forma herî bilind a ewlehiya darayî ji bo bikarhênerek kesane hatî çêkirin.

Proje ji bo zelaliya bêkêmasî ya li hember bikarhêner hatî çêkirin û ji ber vê yekê ku bikarhêner ne hewce ye ku ji hilberê bawer bike.

Rêzikên ku di projeyê de cih digirin dawîn in û nayên guhertin.

Ekosîstema PIERRON bi tevahî xweser e: ew ne rêveberî hewce dike û ne jî heye. Di heman demê de proje maseya piştgiriyê an karûbarê xerîdar jî tune. Hemî biryar û tevgerên ku ji hêla bikarhênerek di ekosîstemê de têne girtin tenê berpirsiyariya bikarhêner e. Afirînerê projeyê ji ber biryar an xeletiyên xeletî yên bikarhêner ne berpirsiyar e.

PIERRON zêdetirî 2200 delîlên fermî hene bêyî assume, admit, external_body, vacuity, an şaxên underspecified.

━━━━━━━━━━━━━━━━━━━━
1. ÇI YE PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron li ser zincîra blokê Solana protokolek nîşanek e. Rêzikên aborî (sînor, 1% tevkariya hewzê, sarbûn, ji nû ve dabeşkirin, bonûsa dilsoziyê, belavbûn, û şewitandin) li ser zincîrê ji hêla bernameyên peyman-aqilmend ve têne bicîh kirin - ne tenê di belgeyan de têne diyar kirin.

Nîşana PIERRON (SPL Token-2022) yek dike:

• bazirganiya fermî DEX bi tixûbên bazirganî û sarbûnê,
• Beşdariyek 1% ji bo hewza ji nû ve dabeşkirinê - piştî çerxa çalakiyê (ne "cezayek ji bo bazirganiyê"),
• çerxên çalakiyê û parvekirina hewzê,
• Bonûsek dilsoziya li ser bingeha cildê,
• belavkirina kontrolkirî di hewza sûkê de û bernameyek şewitandinê,
• Xercek SOL nirx-qat li ser danûstendinên fermî,
• Safe Send (zêdetir veguheztinên taybet) û Pierron Pay (dravdanên bazirgan).

Serlêdana mobîl û dapp danûstendinan ava dikin. Çavkaniya rastiyê ya qaîdeyan koda ku li ser Solana hatî bicîh kirin e.

━━━━━━━━━━━━━━━━━━━━
2. Prensîbên DESIGN
━━━━━━━━━━━━━━━━━━━━

• Rêbazên di kodê de - sînor û destûr ji hêla bernameyê ve têne kontrol kirin.
• Çalakî li ser spekulasyonên pirfirotanê - ji her danûstendinê û ji bo serdemek sermayên dijwar.
• Parvekirina hewzê ji bo çalakiya çerxa rastîn, ne ji bo girtina betal tenê.
• Deflasyona strukturel - dabeşkirina şewitandina mezin û bernameyek şewitandinê ya rast.
• Riyên rîskê yên veqetandî - rûniştin û dizî bernameyên cihê ne; dayinên vault hewceyê vouchers derbasdar.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMICS (DAKIRIN)
━━━━━━━━━━━━━━━━━━━━

Yekîn: nîşana UI (6 cihên dehemîn ên li ser zincîrê).

Tevahiya peyda: 150,000,000,000 PIERRON (150 mîlyar)

Dabeşkirin:
• Hewza bazarê (escrow → DEX): 60B (40%)
• Qalîteya pêşdebiran: 21B (14%)
• Bonûsa dilsoziyê: 7B (~4.7%)
• Bişewitîne (kapo + bername): 56B (~37.3%)
• Xezîne: 6B (4%)

Weşandin: her serdemek protokol nîşanekan ji escrow berdide nav hewza DEX di bin kotayek serdemê de - di jenosê de bilindtir, paşê standard.

Şewitandin: ji kasa şewitandinê bi rêjeyek diyarkirî bi qasî 20 salên salnameyê yên serdeman heya ku dabeşkirina şewitandinê qediya.

Dirêjahiya serdemê: 21,600 saniye (6 saet). Epoch 0 di dema nîşana genesisê ya protokolê de dest pê dike.

━━━━━━━━━━━━━━━━━━━━
4. ARCHITECTURE (KURTE)
━━━━━━━━━━━━━━━━━━━━

• Bernameya Pierron - hesabkirin, DEX sînor, pirtûka bazirganiyê, bonusa dilsoziyê, ji nû ve dabeşkirin, tikandin, şewitandin, qata bihayê
• Transfer Hook - Token-2022 dabeşkirina veguhestinê; sînor û 1% beşdariya li ser rêyên fermî
• Settlement - dravdanên kelûpelê (ji nû vebelavkirin, bonûsa dilsoziyê, xelatên parêzger) piştî amadekirina qursê
• Stealth - qeyd bike, bişîne, û îdîa bike (Safe Send)
• TradeBook / hesabê bikarhêner - çalakî, cild, bilêt, bitmap, jimareya îdîayê
• Parêzvanên torê - serdemên pêşkeftî, belavbûn/şewitandin û kişandin; ew ji bo bikarhêneran ji nû ve dabeşkirin an xelatan naxwazin

━━━━━━━━━━━━━━━━━━━━
5. QADÊN BAZARIYÊ
━━━━━━━━━━━━━━━━━━━━

RÊYA FERMÎ
Bi guheztinê di sepana Pierron de (DEX hewza di bin polîtîkaya protokolê de), bi rêwerzên sînordar û veguheztinê re bazirganî bikin. Veguhastinên li derveyî rêyên destûr dikarin bêne red kirin an cûda bêne dabeş kirin.

1% BERXWEDAN (BÊ BIGIRIN - NE CEZA)
1% ji qebareya bazirganiya fermî diçe hewzek ji nû ve dabeşkirinê ya hevpar. Ev ne heqê cezakirinê ye û ne şewitandina daîmî ya fonên we ye: bi têra çalakiya ekosîstemê hûn dikarin piştî ku dewr bi dawî bibe para xwe ya hewzê ji nû ve bistînin.

Çêleka vebelavkirinê 28 serdeman dom dike. Bi 6-serdemên demjimêr ku 7 roj in. Piştî ku çerx biqede, bikarhênerên bijarte para xwe ji hewza di sepanê de digirin.

Rewşa vegerandinê: di çerxê de çalakiya têrker (bi kêmanî 9 serdemên çalak di 28-serdema bitmap de tê de heye û bi kêmî ve 10 PIERRON  dom dike) - Binêre Dabeşkirin. Bêyî çalakiya ekosîstemê parvekirina hewzê tune; bi tevkarî û çalakiyê re, bazirganî mafê vegerandina ji hewzê ava dike - ne tenê lêçûnek bazirganiyê.

Beşdariya 1% di mîhengan de nayê asteng kirin - ew beşek protokolê ye.

QATÊ BÎHAN (SOL)
Danûstandinên fermî bi SOL xerca bi PIERRON volume (100 lamports li ser 1 PIERRON hewce dike. Drav diçin xezîneya qata bihayê û dibe ku piştgirîya lîkîdît / qatê bikin.

SÎNORÊ PER-TANAKSYONÊ
Her danûstendinê ya herî zêde PIERRON bi daxwazên ji nû ve dabeşkirî yên hatine wergirtin ve girêdayî ye:

• 0–24 îdîa dike: 13,000,000 PIERRON
• ≥ 25 îdîa dike: 16,000,000 PIERRON
• ≥ 75 îdîa dike: 19,000,000 PIERRON
• ≥ 175 îdîa dike: 24,000,000 PIERRON
• ≥ 375 îdîa dike: 34,000,000 PIERRON (kap)

DI NAVBERA SWAPSÊ de sarbûn
• 0–24 îdîa dike: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Hewldanek guheztinê ya zû li ser zincîrê tê red kirin.

FIRST SWAP
Yekem danûstendina fermî ya li ser hesabek divê herî kêm 2 PIERRON be.

GLOBAL EPOCH SELL CAP
Tevahiya firotanên ji hêla hemî bikarhêneran ve di serdemekê de tavanek ku bi tevahî îdîayên protokolê zêde dibe parve dikin:

• li jêr 25 îdiayên tevahî: 2,000,000,000 PIERRON
• di bin 75: 3,000,000,000
• di bin 175: 5,000,000,000
• di bin 375: 7,000,000,000
• 375+: 9,000,000,000

Hêjmara serdem û danûstendinê ya her-bikarhênerî jî tê sepandin (di nav de heya 100 txs serê serdemê û sermayek qebareya her bikarhêner).

━━━━━━━━━━━━━━━━━━━━
6. PÊŞKIRINÊN - JI DESTPÊKIRINA 1% PÊKIRIN
━━━━━━━━━━━━━━━━━━━━

ÇIMA 1% HEYE
Her resmî 1% di nav hewzek hevpar de diguhezîne. Piştî 28 serdeman (7 rojan di serdemên 6-saetan de) hewz di nav mirovên ku di ekosîstemayê de têra xwe çalak bûn de parçe dibe. Bazirganiya çalak + çalakiya çerxê = mafê îdîaya ji hewzê. Bêçalaktî = bê parvekirin. Ev mekanîzmayek dilsozî / tevkarî-vegerandinê ye, ne cezayê bazirganiyê ye.

Beşdariya 1% hatiye dîzaynkirin ku bi demkî beşek ji sermayê di ekosîstemê de girêbide û bi awayekî nerasterast êrişên Sybil teşwîq bike.

ÇAVKANÎ HEVZÊ
Beşdariya 1% ji danûstendinên fermî fonên ji nû ve dabeşkirinê fînanse dike.

DÎKAR Û DEM
• çerxa: 28 serdem = 7 roj (serdem = 6 h),
• piştî ku çerx diqede hewz tê dabeş kirin (parvekirin ≈ hewz / hejmartina mafdar),
• îdiaya di sepanê de gava ku guncan pêk hat.

KIRTIN (ÇALAKIYA TÊR)
• bi kêmanî 9 serdemên çalak di bitmap-ê de 28,
• herî kêm balansa 10 PIERRON biparêze,
• çalakiya ku ji hêla protokolê ve hatî nas kirin (bazirganiya fermî / rêyên protokolê).

ÎDYA DIKE
• Bikarhêner di sepanê de îdîayê dide destpêkirin (amade bike → rûniştin → vexwarin),
• parêzger ji bo bikarhênerê îdîa nakin,
• voucher li ser fermana 28 serdeman derbasdar dimînin - yên nehatine daxwaz kirin dibe ku biqedin,
• Xerca doza protokolê di PIERRON de 0 ye; bikarhêner heqê torê SOL dide,
• îdiayek serketî jimareya îdiayê bilind dike → sînorê guhastina bilind û sarbûna kurttir.

━━━━━━━━━━━━━━━━━━━━
7. BONUS DIDELIYA
━━━━━━━━━━━━━━━━━━━━

TICKETS
• ji qebareya bazirganiyê ya fermî hatiye qezenckirin (biryar: 10 PIERRON cild → 1 bilêt),
• herî zêde 50 bilêtên her bikarhêner li ser pencereyê,
• di nav çerxa 28-serdema 7 de pencereyan de xêz bikin.

DRAW
• parêzger sozên rasthatî pêşkêş dikin (commit–reveal),
• xêzkirinên herî kêm jimarek peywirdarkirinê hewce dike (qata hilberînê: 20) û hewzek bilêtê ya hindiktirîn,
• piştî pencereyê: xêz bikin an jî derbikevin (bilêtên pir hindik),
• xelat: 2,000,000 PIERRON ji bo her kişandinê (ji dabeşkirina dilsoz-bonusê),
• dravdan: amade bikin → razandin → ji hêla serketî ve daxwaz bikin.

BERSÎVÊ VOUCHER
Kûçeya ku ji bo daxwaza avêtina hewayê ya lotoyê ji bo serdemên 7 derbasdar e, paşê diqede.

━━━━━━━━━━━━━━━━━━━━
8. SEND EWLE Û PIERRON DADÊ
━━━━━━━━━━━━━━━━━━━━

SEND SEND
Qeyd bikin → bişînin kasa dizî → îdîaya wergir. Dibe ku îdia du danûstandinan hewce bike. Ev rêyek veguheztinê ya taybet e - ew sînorên guheztinê an beşdariya 1% derbas nake.

PIERRON PAY
Tezmînata ji bo hesabek bazirganiyê bi rêwerzek mûçeyê. Hook veguheztinê wekî Pay, ne wekî firotek normal DEX dabeş dike.

RULES
• van rêyan bikar neynin da ku sînorên bazirganiya fermî an tevkariya 1% derbas bikin,
• Berî şandinê her gav navnîşana wergir / QR verast bikin - xeletiyên li ser zincîrê nayên vegerandin.

━━━━━━━━━━━━━━━━━━━━
9. RÊBAZÊN BIKARANÎNA APP
━━━━━━━━━━━━━━━━━━━━

1. Tenê berîka pêbawer ve girêdin. Tu carî hevoka tovê xwe bi "piştgirî" an biyan re parve nekin.
2. Swap: rêzika tevahî ya di berikê de pejirand; berîka nîv-îmza negire.
3. Ji sarbûnê re rêz bigirin - dîsa lêdan qaîdeyên li ser zincîrê derbas nake.
4. Daxwaza ji nû ve dabeşkirin / dilsozî-bonus: tenê gava ku sepan amadebûnê nîşan dide; piştî serketinê li benda hevdengkirina torê berî guheztina paşîn bisekinin.
5. Li ser Android (êrîşkar OEMs): di berîka xwe de bimînin heta PÊKIRIN, paşê vegerin Pierron; sepanê di paşerojê de nekujin.
6. Qedexe: êrîşên li ser bernameyan, phishing di bin navê Pierron de, spam RPC, hewildanên îstîsmarkirina niştecîh / hook.

━━━━━━━━━━━━━━━━━━━━
10. LOOP ABORÎ
━━━━━━━━━━━━━━━━━━━━

Escrow her serdemekê nîşanekan di hewza DEX de derdixe.
Bazirganî beşdariyek 1% di hewza ji nû ve dabeşkirinê de cih digire (piştî 7 rojan / 28 serdemên bi çalakiyek têr tê vegerandin), bilêtên dilsoz-bonus, û SOL heqê qata bihayê.
Çalakiya di çerxa 28-serdemê de we qayîl dike ku hûn parek hewzê ji nû ve bistînin.
Bonûsa dilsoziyê di pencereyên 7-serdemê de dikişîne.
Şewitandin li gorî bernameyê paralel peydakirinê kêm dike.
Bikarhêner ji nû ve dabeşkirin û xelatan bixwe dibêjin; parêzger demjimêra protokolê diparêzin.

━━━━━━━━━━━━━━━━━━━━
11. RISKS
━━━━━━━━━━━━━━━━━━━━

• Rîska peymana aqilmend û nûvekirinê,
• Rîska bazarê ji bo bihayê PIERRON (ligel şewat / qatê serûbinî garantî tune),
• SOL xercên li ser danûstendinên têkçûyî an dubare,
• garantiya qezencê tune - ji nû ve dabeşkirin û bonûsa dilsoziyê hilberek depoyê ne.

Bikaranîna sepanê tê wateya pejirandina qaîdeyên ser-zincîrê û xetereyên li jor.

Pierron - tokenomîkên zelal û karanîna rastîn.`;
