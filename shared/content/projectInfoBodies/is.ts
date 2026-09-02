export const PROJECT_INFO_BODY = `PIERRON — VERKEFNISUPPLÝSINGAR
Útgáfa 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. stendur fyrir "PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK",
eða í daglegu tali CPDDC (Centralized Pool Decentralized Digital Currency).

Það er dulritunargjaldmiðill á Solana sem, með blöndu af 49 aðgreindum aðferðum, myndar sjálfstætt, dreifð vistkerfi sem er hannað til að veita einstakan notanda hámarks fjárhagslegt öryggi.

Verkefnið var hannað fyrir algjört gagnsæi gagnvart notandanum og þannig að notandinn þurfi ekki að treysta vörunni.

Reglurnar sem felast í verkefninu eru endanlegar og er ekki hægt að breyta þeim.

PIERRON vistkerfið er algjörlega sjálfstætt: það þarf engan stjórnanda og hefur engan. Verkefnið hefur heldur hvorki þjónustuborð né þjónustu við viðskiptavini. Allar ákvarðanir og aðgerðir sem notandi tekur í vistkerfinu eru eingöngu á ábyrgð notandans. Höfundur verkefnisins er ekki ábyrgur fyrir röngum ákvörðunum eða villum notandans.

PIERRON hefur yfir 2200 formlegar sannanir án assume, admit, external_body, vacuity eða vanskilgreindra útibúa.

━━━━━━━━━━━━━━━━━━━━
1. HVAÐ ER PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron er táknsamskiptareglur á Solana blockchain. Efnahagsreglum (takmörk,  1% laug framlag, kæling, endurdreifing, tryggðarbónus, losun og brennsla) er framfylgt á keðju með snjallsamningaforritum - ekki aðeins lýst í skjölum.

PIERRON táknið (SPL Token-2022) sameinar:

• Opinber DEX viðskipti með takmörkun á viðskiptum og kælingu,
• 1% framlag til endurúthlutunarsafnsins — endurheimtanlegt eftir virknilotu (ekki „viðurlög fyrir viðskipti“),
• virknilotur og tilkall til hlutdeildar í lauginni,
• tryggðarbónus sem byggir á magni,
• stýrð losun í markaðssafnið auk brunaáætlunar,
• SOL verðhæðargjald á opinberum skiptum,
• Safe Send (meiri einkafærslur) og Pierron Pay (greiðslur kaupmanna).

Farsímaforritið og dapp byggja viðskipti. Uppspretta sannleika reglna er kóðinn sem notaður er á Solana.

━━━━━━━━━━━━━━━━━━━━
2. HÖNNUNARREGLUR
━━━━━━━━━━━━━━━━━━━━

• Reglur í kóða — takmörk og hæfi er athugað af forritinu.
• Virkni yfir heildsöluspekúlasjónum — hörð mörk fyrir hverja færslu og á tímabili.
• Laugarhlutdeild fyrir alvöru hringrásarvirkni, ekki til að halda aðgerðalausri eingöngu.
• Uppbyggingarverðhjöðnun — stór brunaúthlutun og fast brunaáætlun.
• Aðskildar áhættuleiðir — uppgjör og laumuspil eru aðskilin forrit; Útborganir í hirslum krefjast gildra fylgiskjala.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMICS (FRAMBOÐ)
━━━━━━━━━━━━━━━━━━━━

Eining: HÍ tákn (6 aukastafir í keðjunni).

Heildarframboð:  150,000,000,000 PIERRON (150 milljarðar)

Úthlutun:
• Markaðshópur (escrow → DEX): 60B (40%)
• Þróunarveski: 21B (14%)
• Tryggðarbónus: 7B (~4.7%)
• Brenna (hvelfing + dagskrá): 56B (~37.3%)
• Ríkissjóður:  6B (4%)

Losun: á hverju tímabili sem samskiptareglur gefa út tákn frá vörslu í DEX laugina undir tímabilskvóta - hærra við upphaf, þá staðlað. (escrow)

Brennsla: frá brunahvelfingunni á föstum hraða yfir u.þ.b. 20 almanaksár tímabila þar til brunaúthlutunin er uppurin.

Lengd tímabils:  21,600 sekúndur (6 klukkustundir). Tímabil 0 byrjar á tímastimpli fyrir tilurð samskiptareglur.

━━━━━━━━━━━━━━━━━━━━
4. ARKITEKTÚR (STUTT)
━━━━━━━━━━━━━━━━━━━━

• Pierron forrit — bókhald, DEX takmörk, viðskiptabók, tryggðarbónus, endurdreifing, merkingar, brennsla, verðhæð
• Transfer Hook — Token-2022 flutningsflokkun; takmörk og 1% framlag á opinberum slóðum
• Settlement — gröf útborganir (endurúthlutun, tryggðarbónus, umbun umsjónarmanns) eftir að útbúið er skírteini
• Stealth — skrá, sendu og krefjast (Safe Send)
• TradeBook / notendareikningur — virkni, magn, miðar, bitamynd tímabils, fjölda krafna
• Netvörður — fara fram tímabil, losun/brennslu og teikning; þeir gera ekki tilkall til endurdreifingar eða verðlauna fyrir notendur

━━━━━━━━━━━━━━━━━━━━
5. VIÐSKIPTAREGLUR
━━━━━━━━━━━━━━━━━━━━

OPINBER leið
Verslun með skiptum í Pierron appinu (DEX laug samkvæmt samskiptareglu), með leiðbeiningum um takmörkun og flutningshók. Millifærslum utan leyfilegra slóða getur verið hafnað eða flokkað á annan hátt.

1% FRAMLAG (ER ENDURKRÆGT — EKKI VEIT)
1% af opinberu viðskiptamagni fer í sameiginlegan endurdreifingarpott. Þetta er ekki refsigjald og ekki varanleg brennsla á fjármunum þínum: með nægri vistkerfisvirkni geturðu endurheimt þinn hluta af lauginni eftir að lotunni lýkur.

Endurdreifingarlota varir 28 tímabil. Með 6-klukkutímatímabilum sem eru 7 dagar. Eftir að lotunni lýkur krefjast gjaldgengir notendur hlut sinn úr lauginni í appinu.

Endurheimtarástand: nægjanleg virkni í hringrásinni (þar á meðal að minnsta kosti 9 virk tímabil í bitamynd 28 tímabilsins og viðhalda að minnsta kosti 10 PIERRON) — sjá Endurdreifingu. Án vistkerfisvirkni er engin laugarhlutdeild; með framlagi plús virkni, byggja viðskipti upp rétt til að endurheimta úr sjóðnum - ekki bara kostnað við viðskipti.

Ekki er hægt að slökkva á 1% framlaginu í stillingum - það er hluti af samskiptareglunum.

VERÐHÆÐ (SOL)
Opinber skipti krefjast SOL gjalds í hlutfalli við PIERRON rúmmál (100 lamports á 1 PIERRON). Fjármunir fara í verðlagssjóði og geta staðið undir lausafjárstöðu/gólfi.

FYRIR FYRIR VIÐSKIPTI
Hámark PIERRON fyrir hverja færslu fer eftir endurdreifðum kröfum sem berast:

• 0–24 kröfur: 13,000,000 PIERRON
• ≥ 25 kröfur: 16,000,000 PIERRON
• ≥ 75 kröfur: 19,000,000 PIERRON
• ≥ 175 kröfur: 24,000,000 PIERRON
• ≥ 375 kröfur: 34,000,000 PIERRON (hetta)

KLÆÐING Á MILLI skipta
• 0–24 kröfur: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Snemmbúin skiptitilraun er hafnað á keðjunni.

FYRSTA skipta
Fyrsta opinbera færslan á reikningi verður að vera að minnsta kosti 2 PIERRON.

GLOBAL EPOCH SELL CAP
Heildarsölur af öllum notendum á tímabili deila þaki sem hækkar með heildarkröfum um samskiptareglur:

• undir 25 heildarkröfur: 2,000,000,000 PIERRON
• undir 75: 3,000,000,000
• undir 175: 5,000,000,000
• undir 375: 7,000,000,000
• 375+: 9,000,000,000

Rúmmáls- og viðskiptatakmörk fyrir hverja notanda eiga einnig við (þar á meðal allt að 100 txs á tímabili og rúmmálshöft fyrir hvern notanda).

━━━━━━━━━━━━━━━━━━━━
6. ENDURDREIFING — AÐ ENDA 1% FRAMLAG
━━━━━━━━━━━━━━━━━━━━

AF HVERJU 1% ER TIL
Sérhver opinber skipti setur 1% í sameiginlega laug. Eftir 28 tímabil (7 dagar á 6 tímaskeiðum) skiptist laugin á milli fólks sem var nógu virkt í vistkerfinu. Virk viðskipti + hringrás starfsemi = réttur til að krefjast úr lauginni. Óvirkni = engin deila. Þetta er hollusta / endurheimt framlagskerfis, ekki refsing fyrir viðskipti.

1% framlagið er hannað til að binda tímabundið hluta fjármagns í vistkerfinu og til að draga óbeint úr Sybil árásum.

LAUGARHEIM
1% framlag frá opinberum skiptasamningum fjármagnar endurdreifingarhvelfinguna.

HLJÓS OG TÍMASETNING
• lota: 28 tímabil = 7 dagar (tímabil = 6 klst),
• eftir að lotunni lýkur er lauginni skipt (hlutdeild ≈ sjóður / gjaldgengur fjöldi),
• kröfu í appinu þegar hæfi er uppfyllt.

Hæfi (fullnægjandi virkni)
• að minnsta kosti 9 virk tímabil í punktamynd 28 tímabilsins,
• viðhalda að minnsta kosti 10 PIERRON jafnvægi,
• starfsemi sem er viðurkennd af bókuninni (opinber viðskipti / siðareglur slóðir).

KREFUR
• notandinn byrjar kröfu í appinu (undirbúa → gera upp → neyta),
• umráðamenn gera ekki tilkall til notanda,
• afsláttarmiðar halda gildi sínu í röð 28 tímabila — ósóttir geta runnið út,
• kröfugjald fyrir siðareglur í PIERRON er 0; notandinn greiðir SOL netgjaldið,
• árangursrík krafa hækkar kröfuteljarann → hærri skiptamörk og styttri niðurköl.

━━━━━━━━━━━━━━━━━━━━
7. hollustu Bónus
━━━━━━━━━━━━━━━━━━━━

MIÐAR
• aflað af opinberu viðskiptamagni (þröskuldur: 10 PIERRON bindi → 1 miði),
• hámarks 50 miða á hvern notanda í hverjum glugga,
• teikna glugga á hvert 7 tímabil innan 28 tímabilsins.

DREIKA
• umráðamenn leggja fram handahófsskuldbindingar (commit–reveal),
• útdrættir krefjast lágmarks fjölda skuldbindinga (framleiðslugólf:  20) og lágmarks miðafjölda,
• á eftir glugganum: draga eða sleppa (of fáir miðar),
• verðlaun: 2,000,000 PIERRON fyrir hvern útdrátt (frá úthlutun vildarbónus),
• útborgun: undirbúa → gera upp → krafa sigurvegarans.

GILDISSVIÐARSKIPTI
Skírteini til að krefjast lottóflugsins gildir fyrir 7 tímabil og rennur síðan út.

━━━━━━━━━━━━━━━━━━━━
8. ÖRYGGI SENDING OG PIERRON GREIÐIÐ
━━━━━━━━━━━━━━━━━━━━

ÖRYGGI SENDING
Skráðu þig → senda í laumuhvelfingu → krafa viðtakanda. Krafa getur krafist tveggja viðskipta. Þetta er persónulegri flutningsleið - hún fer ekki framhjá skiptamörkum eða 1% framlaginu.

PIERRON GREIÐA
Greiðsla inn á sölureikning með launafyrirmælum. Krókurinn flokkar millifærsluna sem borga, ekki sem venjulega DEX sölu.

REGLUR
• ekki nota þessar leiðir til að komast framhjá opinberum viðskiptamörkum eða 1% framlaginu,
• Staðfestu alltaf heimilisfang viðtakanda / QR áður en þú sendir — mistök í keðju eru óafturkræf.

━━━━━━━━━━━━━━━━━━━━
9. NOTKUNARREGLUR APPS
━━━━━━━━━━━━━━━━━━━━

1. Tengdu aðeins traust veski. Aldrei deila fræsetningunni þinni með „stuðningi“ eða ókunnugum.
2. Skipta: samþykkja alla röðina í veskinu; ekki loka veskinu mid-signature.
3. Virðið kælingu — að slá aftur hnekkir ekki reglum um keðju.
4. Endurdreifing / tryggðarbónus krafa: aðeins þegar appið sýnir tilbúið; eftir árangur bíddu eftir netsamstillingu áður en næsta skipti.
5. Á Android (árásargjarn OEM): vertu í veskinu þar til STEFNA, farðu síðan aftur í Pierron; ekki drepa appið í bakgrunni.
6. Bannað: árásir á forrit, vefveiðar undir nafninu Pierron, RPC ruslpóstur, tilraunir til uppgjörs / krókanotkunar.

━━━━━━━━━━━━━━━━━━━━
10. Efnahagsleg LOOP
━━━━━━━━━━━━━━━━━━━━

Escrow gefur út tákn í DEX laugina á hverju tímabili.
Viðskipti leggja 1% framlag í endurdreifingarpottinn (endurheimtanlegt eftir 7 daga / 28 tímabil með nægri virkni), vildarbónusmiða og SOL verðhæðargjald.
Virkni í 28-tímabilslotunni gefur þér rétt til að endurheimta hluta af lauginni.
Tryggðarbónusinn dregur í 7-tímabilsgluggum.
Brennsla minnkar framboð samhliða áætlun.
Notendur krefjast endurdreifingar og verðlauna sjálfir; umsjónarmenn viðhalda samskiptaklukkunni.

━━━━━━━━━━━━━━━━━━━━
11. ÁHÆTTA
━━━━━━━━━━━━━━━━━━━━

• snjallsamninga og uppfærsluáhættu,
• markaðsáhætta fyrir PIERRON verð (engin tryggð upphækkun þrátt fyrir bruna/gólf),
• SOL gjöld fyrir misheppnuð eða endurtekin viðskipti,
• engin gróðatrygging — endurdreifing og tryggðarbónus eru ekki innlánsvara.

Notkun appsins þýðir að samþykkja reglur um keðju og áhættuna hér að ofan.

Pierron — gagnsæ táknfræði og raunveruleg notkun.`;
