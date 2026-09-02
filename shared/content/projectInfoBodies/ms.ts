export const PROJECT_INFO_BODY = `PIERRON — MAKLUMAT PROJEK
Versi 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. ialah singkatan bagi “PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK”,
atau secara umum CPDDC (Centralized Pool Decentralized Digital Currency).

Ia ialah mata wang kripto di Solana yang, melalui gabungan 49 mekanisme berbeza, membentuk ekosistem autonomi dan terdesentralisasi yang direka untuk memberikan tahap keselamatan kewangan tertinggi kepada pengguna individu.

Projek ini direka untuk ketelusan mutlak kepada pengguna dan supaya pengguna tidak perlu mempercayai produk tersebut.

Peraturan yang diterapkan dalam projek adalah muktamad dan tidak boleh diubah.

Ekosistem PIERRON adalah autonomi sepenuhnya: ia tidak memerlukan pentadbir dan tidak mempunyainya. Projek ini juga tiada meja bantuan atau khidmat pelanggan. Semua keputusan dan tindakan pengguna dalam ekosistem adalah tanggungjawab pengguna sepenuhnya. Pencipta projek tidak bertanggungjawab atas keputusan silap atau kesalahan pengguna.

PIERRON mempunyai lebih daripada 2200 bukti formal tanpa assume, admit, external_body, vacuity, atau cabang yang tidak ditentukan secukupnya.

━━━━━━━━━━━━━━━━━━━━
1. APA ITU PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron ialah protokol token pada blockchain Solana. Peraturan ekonomi (had, sumbangan pool 1%, cooldown, pengagihan semula, bonus kesetiaan, emisi dan burn) dikuatkuasakan secara on-chain oleh program kontrak pintar — bukan sekadar diterangkan dalam dokumentasi.

Token PIERRON (SPL Token-2022) menggabungkan:

• dagangan DEX rasmi dengan had setiap dagangan dan cooldown,
• sumbangan 1% kepada pool pengagihan semula — boleh diperoleh semula selepas kitaran aktiviti (bukan “penalti kerana berdagang”),
• kitaran aktiviti dan tuntutan bahagian pool,
• bonus kesetiaan berdasarkan volum,
• emisi terkawal ke dalam pool pasaran serta jadual burn,
• yuran lantai harga SOL pada swap rasmi,
• Safe Send (pemindahan yang lebih peribadi) dan Pierron Pay (pembayaran peniaga).

Aplikasi mudah alih dan dapp membina transaksi. Sumber kebenaran bagi peraturan ialah kod yang digunakan di Solana.

━━━━━━━━━━━━━━━━━━━━
2. PRINSIP REKA BENTUK
━━━━━━━━━━━━━━━━━━━━

• Peraturan dalam kod — had dan kelayakan diperiksa oleh program.
• Aktiviti mengatasi spekulasi borong — had keras bagi setiap transaksi dan setiap epoch.
• Bahagian pool untuk aktiviti kitaran sebenar, bukan untuk pegangan pasif semata-mata.
• Deflasi berstruktur — peruntukan burn yang besar dan jadual burn tetap.
• Laluan risiko berasingan — settlement dan stealth ialah program berasingan; pembayaran vault memerlukan baucar yang sah.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMICS (BEKALAN)
━━━━━━━━━━━━━━━━━━━━

Unit: token UI (6 tempat perpuluhan secara on-chain).

Jumlah bekalan: 150,000,000,000 PIERRON (150 bilion)

Peruntukan:
• Pool pasaran (escrow → DEX): 60B (40%)
• Dompet pembangun: 21B (14%)
• Bonus kesetiaan: 7B (~4.7%)
• Burn (vault + jadual): 56B (~37.3%)
• Perbendaharaan: 6B (4%)

Emisi: setiap epoch, protokol melepaskan token daripada escrow ke dalam pool DEX di bawah kuota epoch — lebih tinggi pada genesis, kemudian standard.

Burn: daripada burn vault pada kadar tetap selama kira-kira 20 tahun kalendar epoch sehingga peruntukan burn habis.

Tempoh epoch: 21,600 saat (6 jam). Epoch 0 bermula pada cap masa genesis protokol.

━━━━━━━━━━━━━━━━━━━━
4. SENI BINA (RINGKAS)
━━━━━━━━━━━━━━━━━━━━

• Program Pierron — perakaunan, had DEX, trade book, bonus kesetiaan, pengagihan semula, tick, burn, lantai harga
• Transfer Hook — pengelasan pemindahan Token-2022; had dan sumbangan 1% pada laluan rasmi
• Settlement — pembayaran vault (pengagihan semula, bonus kesetiaan, ganjaran keeper) selepas penyediaan baucar
• Stealth — daftar, hantar dan tuntut (Safe Send)
• TradeBook / akaun pengguna — aktiviti, volum, tiket, bitmap epoch, bilangan tuntutan
• Keeper rangkaian — memajukan epoch, emisi/burn dan cabutan; mereka tidak menuntut pengagihan semula atau hadiah bagi pihak pengguna

━━━━━━━━━━━━━━━━━━━━
5. PERATURAN DAGANGAN
━━━━━━━━━━━━━━━━━━━━

LALUAN RASMI
Berdagang melalui swap dalam aplikasi Pierron (pool DEX di bawah dasar protokol), dengan arahan had dan transfer-hook. Pemindahan di luar laluan yang dibenarkan mungkin ditolak atau dikelaskan secara berbeza.

SUMBANGAN 1% (BOLEH DIPEROLEH SEMULA — BUKAN PENALTI)
Sebanyak 1% daripada volum dagangan rasmi masuk ke dalam pool pengagihan semula bersama. Ini bukan yuran hukuman dan bukan burn kekal dana anda: dengan aktiviti ekosistem yang mencukupi, anda boleh mendapatkan semula bahagian anda daripada pool selepas kitaran tamat.

Satu kitaran pengagihan semula berlangsung selama 28 epoch. Dengan epoch 6 jam, tempohnya 7 hari. Selepas kitaran ditutup, pengguna yang layak menuntut bahagian mereka daripada pool dalam aplikasi.

Syarat pemulihan: aktiviti yang mencukupi dalam kitaran (termasuk sekurang-kurangnya 9 epoch aktif dalam bitmap 28 epoch dan mengekalkan sekurang-kurangnya 10 PIERRON) — lihat Pengagihan Semula. Tanpa aktiviti ekosistem, tiada bahagian pool; dengan sumbangan serta aktiviti, dagangan membina hak untuk mendapatkan semula daripada pool — bukan sekadar kos dagangan.

Sumbangan 1% tidak boleh dilumpuhkan dalam tetapan — ia sebahagian daripada protokol.

LANTAI HARGA (SOL)
Swap rasmi memerlukan yuran SOL yang berkadar dengan volum PIERRON (100 lamports bagi setiap 1 PIERRON). Dana masuk ke perbendaharaan lantai harga dan boleh menyokong kecairan / lantai.

HAD SETIAP TRANSAKSI
PIERRON maksimum bagi setiap transaksi bergantung pada tuntutan pengagihan semula yang diterima:

• 0–24 tuntutan: 13,000,000 PIERRON
• ≥ 25 tuntutan: 16,000,000 PIERRON
• ≥ 75 tuntutan: 19,000,000 PIERRON
• ≥ 175 tuntutan: 24,000,000 PIERRON
• ≥ 375 tuntutan: 34,000,000 PIERRON (had maksimum)

COOLDOWN ANTARA SWAP
• 0–24 tuntutan: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Percubaan swap terlalu awal ditolak secara on-chain.

SWAP PERTAMA
Transaksi rasmi pertama pada akaun mestilah sekurang-kurangnya 2 PIERRON.

HAD JUALAN EPOCH GLOBAL
Jumlah jualan semua pengguna dalam satu epoch berkongsi had yang meningkat bersama jumlah tuntutan protokol:

• di bawah 25 jumlah tuntutan: 2,000,000,000 PIERRON
• di bawah 75: 3,000,000,000
• di bawah 175: 5,000,000,000
• di bawah 375: 7,000,000,000
• 375+: 9,000,000,000

Had volum epoch dan transaksi setiap pengguna turut dikenakan (termasuk sehingga 100 txs setiap epoch dan had volum setiap pengguna).

━━━━━━━━━━━━━━━━━━━━
6. PENGAGIHAN SEMULA — MENDAPATKAN SEMULA SUMBANGAN 1%
━━━━━━━━━━━━━━━━━━━━

MENGAPA 1% WUJUD
Setiap swap rasmi meletakkan 1% ke dalam pool bersama. Selepas 28 epoch (7 hari dengan epoch 6 jam), pool dibahagikan antara mereka yang cukup aktif dalam ekosistem. Dagangan aktif + aktiviti kitaran = hak untuk menuntut daripada pool. Tidak aktif = tiada bahagian. Ini ialah mekanisme kesetiaan / pemulihan sumbangan, bukan penalti kerana berdagang.

Sumbangan 1% direka untuk mengikat sementara sebahagian modal dalam ekosistem dan secara tidak langsung menghalang serangan Sybil.

SUMBER POOL
Sumbangan 1% daripada swap rasmi membiayai vault pengagihan semula.

KITARAN DAN MASA
• kitaran: 28 epoch = 7 hari (epoch = 6 h),
• selepas kitaran ditutup, pool dibahagikan (bahagian ≈ pool / bilangan yang layak),
• tuntut dalam aplikasi sebaik sahaja kelayakan dipenuhi.

KELAYAKAN (AKTIVITI MENCUKUPI)
• sekurang-kurangnya 9 epoch aktif dalam bitmap 28 epoch,
• kekalkan baki sekurang-kurangnya 10 PIERRON,
• aktiviti yang diiktiraf oleh protokol (dagangan rasmi / laluan protokol).

PENUNTUTAN
• pengguna memulakan tuntutan dalam aplikasi (prepare → settle → consume),
• keeper tidak menuntut bagi pihak pengguna,
• baucar kekal sah sekitar 28 epoch — baucar yang tidak dituntut mungkin luput,
• yuran tuntutan protokol dalam PIERRON ialah 0; pengguna membayar yuran rangkaian SOL,
• tuntutan berjaya menaikkan pembilang tuntutan → had swap lebih tinggi dan cooldown lebih pendek.

━━━━━━━━━━━━━━━━━━━━
7. BONUS KESETIAAN
━━━━━━━━━━━━━━━━━━━━

TIKET
• diperoleh daripada volum dagangan rasmi (ambang: volum 10 PIERRON → 1 tiket),
• maksimum 50 tiket bagi setiap pengguna setiap tetingkap,
• tetingkap cabutan setiap 7 epoch dalam kitaran 28 epoch.

CABUTAN
• keeper menyerahkan komit rawak (commit–reveal),
• cabutan memerlukan bilangan komit minimum (lantai pengeluaran: 20) dan pool tiket minimum,
• selepas tetingkap: cabut atau langkau (tiket terlalu sedikit),
• hadiah: 2,000,000 PIERRON bagi setiap cabutan (daripada peruntukan bonus kesetiaan),
• pembayaran: prepare → settle → claim oleh pemenang.

TEMPOH SAH BAUCAR
Baucar untuk menuntut airdrop loteri sah selama 7 epoch, kemudian luput.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND DAN PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Daftar → hantar ke stealth vault → penerima menuntut. Tuntutan mungkin memerlukan dua transaksi. Ini laluan pemindahan yang lebih peribadi — ia tidak memintas had swap atau sumbangan 1%.

PIERRON PAY
Pembayaran kepada akaun peniaga dengan arahan pay. Hook mengelaskan pemindahan sebagai Pay, bukan sebagai jualan DEX biasa.

PERATURAN
• jangan gunakan laluan ini untuk memintas had dagangan rasmi atau sumbangan 1%,
• sentiasa sahkan alamat penerima / QR sebelum menghantar — kesilapan on-chain tidak boleh dipulihkan.

━━━━━━━━━━━━━━━━━━━━
9. PERATURAN PENGGUNAAN APLIKASI
━━━━━━━━━━━━━━━━━━━━

1. Sambungkan dompet yang dipercayai sahaja. Jangan sekali-kali berkongsi seed phrase anda dengan “sokongan” atau orang asing.
2. Swap: luluskan keseluruhan urutan dalam dompet; jangan tutup dompet semasa proses tandatangan.
3. Patuhi cooldown — mengetik lagi tidak mengatasi peraturan on-chain.
4. Tuntutan pengagihan semula / bonus kesetiaan: hanya apabila aplikasi menunjukkan kesediaan; selepas berjaya, tunggu penyegerakan rangkaian sebelum swap seterusnya.
5. Pada Android (OEM agresif): kekal dalam dompet sehingga CONFIRM, kemudian kembali ke Pierron; jangan matikan aplikasi di latar belakang.
6. Dilarang: serangan terhadap program, pancingan data atas nama Pierron, spam RPC, percubaan eksploitasi settlement / hook.

━━━━━━━━━━━━━━━━━━━━
10. KITARAN EKONOMI
━━━━━━━━━━━━━━━━━━━━

Escrow melepaskan token ke dalam pool DEX setiap epoch.
Dagangan memasukkan sumbangan 1% ke dalam pool pengagihan semula (boleh diperoleh semula selepas 7 hari / 28 epoch dengan aktiviti mencukupi), tiket bonus kesetiaan dan yuran lantai harga SOL.
Aktiviti dalam kitaran 28 epoch melayakkan anda mendapatkan semula bahagian pool.
Cabutan bonus kesetiaan berlangsung dalam tetingkap 7 epoch.
Burn mengurangkan bekalan secara selari mengikut jadual.
Pengguna menuntut sendiri pengagihan semula dan hadiah; keeper menyelenggara jam protokol.

━━━━━━━━━━━━━━━━━━━━
11. RISIKO
━━━━━━━━━━━━━━━━━━━━

• risiko kontrak pintar dan naik taraf,
• risiko pasaran bagi harga PIERRON (tiada jaminan kenaikan walaupun terdapat burn / lantai),
• yuran SOL bagi transaksi gagal atau berulang,
• tiada jaminan keuntungan — pengagihan semula dan bonus kesetiaan bukan produk deposit.

Menggunakan aplikasi bermakna menerima peraturan on-chain dan risiko di atas.

Pierron — tokenomics telus dan kegunaan sebenar.`;
