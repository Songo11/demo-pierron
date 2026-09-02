export const PROJECT_INFO_BODY = `PIERRON — INFO PROYEK
Versi 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. adalah singkatan dari “PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK”,
atau dalam bahasa sehari-hari CPDDC (Centralized Pool Decentralized Digital Currency).

Ini adalah mata uang kripto di Solana yang, melalui kombinasi 49 mekanisme berbeda, membentuk ekosistem otonom dan terdesentralisasi yang dirancang untuk memberikan tingkat keamanan finansial tertinggi bagi pengguna individu.

Proyek ini dirancang untuk transparansi mutlak terhadap pengguna dan agar pengguna tidak perlu memercayai produk.

Aturan yang tertanam dalam proyek bersifat final dan tidak dapat diubah.

Ekosistem PIERRON sepenuhnya otonom: tidak memerlukan administrator dan tidak memilikinya. Proyek ini juga tidak memiliki meja bantuan atau layanan pelanggan. Semua keputusan dan tindakan pengguna dalam ekosistem sepenuhnya menjadi tanggung jawab pengguna. Pembuat proyek tidak bertanggung jawab atas keputusan keliru atau kesalahan pengguna.

PIERRON memiliki lebih dari 2200 bukti formal tanpa assume, admit, external_body, vacuity, atau cabang yang spesifikasinya tidak lengkap.

━━━━━━━━━━━━━━━━━━━━
1. APA ITU PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron adalah protokol token pada blockchain Solana. Aturan ekonomi (batas, kontribusi pool 1%, cooldown, redistribusi, bonus loyalitas, emisi, dan burn) diberlakukan secara on-chain oleh program smart contract — bukan sekadar dijelaskan dalam dokumentasi.

Token PIERRON (SPL Token-2022) menggabungkan:

• perdagangan DEX resmi dengan batas per transaksi dan cooldown,
• kontribusi 1% ke pool redistribusi — dapat diperoleh kembali setelah siklus aktivitas (bukan “hukuman karena berdagang”),
• siklus aktivitas dan klaim bagian dari pool,
• bonus loyalitas berdasarkan volume,
• emisi terkendali ke pool pasar beserta jadwal burn,
• biaya batas bawah harga dalam SOL pada swap resmi,
• Safe Send (transfer yang lebih privat) dan Pierron Pay (pembayaran pedagang).

Aplikasi seluler dan dapp menyusun transaksi. Sumber kebenaran aturan adalah kode yang di-deploy di Solana.

━━━━━━━━━━━━━━━━━━━━
2. PRINSIP DESAIN
━━━━━━━━━━━━━━━━━━━━

• Aturan dalam kode — batas dan kelayakan diperiksa oleh program.
• Aktivitas di atas spekulasi besar-besaran — batas keras per transaksi dan per epoch.
• Bagian pool untuk aktivitas siklus nyata, bukan hanya menyimpan secara pasif.
• Deflasi struktural — alokasi burn besar dan jadwal burn tetap.
• Jalur risiko terpisah — settlement dan stealth merupakan program terpisah; pembayaran vault memerlukan voucher yang valid.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMICS (SUPLAI)
━━━━━━━━━━━━━━━━━━━━

Unit: token UI (6 tempat desimal secara on-chain).

Total suplai: 150,000,000,000 PIERRON (150 miliar)

Alokasi:
• Pool pasar (escrow → DEX): 60B (40%)
• Dompet pengembang: 21B (14%)
• Bonus loyalitas: 7B (~4.7%)
• Burn (vault + jadwal): 56B (~37.3%)
• Treasury: 6B (4%)

Emisi: setiap epoch, protokol melepaskan token dari escrow ke pool DEX berdasarkan kuota epoch — lebih tinggi saat genesis, lalu standar.

Burn: dari burn vault dengan laju tetap selama sekitar 20 tahun kalender dalam epoch hingga alokasi burn habis.

Durasi epoch: 21,600 detik (6 jam). Epoch 0 dimulai pada timestamp genesis protokol.

━━━━━━━━━━━━━━━━━━━━
4. ARSITEKTUR (SINGKAT)
━━━━━━━━━━━━━━━━━━━━

• Program Pierron — akuntansi, batas DEX, trade book, bonus loyalitas, redistribusi, tick, burn, batas bawah harga
• Transfer Hook — klasifikasi transfer Token-2022; batas dan kontribusi 1% pada jalur resmi
• Settlement — pembayaran vault (redistribusi, bonus loyalitas, imbalan keeper) setelah persiapan voucher
• Stealth — mendaftar, mengirim, dan mengklaim (Safe Send)
• TradeBook / akun pengguna — aktivitas, volume, tiket, bitmap epoch, jumlah klaim
• Keeper jaringan — memajukan epoch, emisi/burn, dan pengundian; mereka tidak mengklaim redistribusi atau hadiah untuk pengguna

━━━━━━━━━━━━━━━━━━━━
5. ATURAN PERDAGANGAN
━━━━━━━━━━━━━━━━━━━━

JALUR RESMI
Berdagang melalui swap di aplikasi Pierron (pool DEX di bawah kebijakan protokol), dengan instruksi batas dan transfer-hook. Transfer di luar jalur yang diizinkan dapat ditolak atau diklasifikasikan secara berbeda.

KONTRIBUSI 1% (DAPAT DIPEROLEH KEMBALI — BUKAN HUKUMAN)
Sebanyak 1% dari volume perdagangan resmi masuk ke pool redistribusi bersama. Ini bukan biaya hukuman dan bukan burn permanen atas dana Anda: dengan aktivitas ekosistem yang cukup, Anda dapat memperoleh kembali bagian Anda dari pool setelah siklus berakhir.

Satu siklus redistribusi berlangsung selama 28 epoch. Dengan epoch 6 jam, durasinya 7 hari. Setelah siklus ditutup, pengguna yang memenuhi syarat mengklaim bagian mereka dari pool di aplikasi.

Syarat pemulihan: aktivitas yang cukup dalam siklus (termasuk setidaknya 9 epoch aktif dalam bitmap 28 epoch dan mempertahankan setidaknya 10 PIERRON) — lihat Redistribusi. Tanpa aktivitas ekosistem, tidak ada bagian pool; dengan kontribusi plus aktivitas, perdagangan membangun hak untuk memperoleh kembali dari pool — bukan sekadar biaya perdagangan.

Kontribusi 1% tidak dapat dinonaktifkan di pengaturan — ini bagian dari protokol.

BATAS BAWAH HARGA (SOL)
Swap resmi memerlukan biaya SOL yang sebanding dengan volume PIERRON (100 lamports per 1 PIERRON). Dana masuk ke treasury batas bawah harga dan dapat mendukung likuiditas / batas bawah.

BATAS PER TRANSAKSI
Jumlah maksimum PIERRON per transaksi bergantung pada klaim redistribusi yang diterima:

• 0–24 klaim: 13,000,000 PIERRON
• ≥ 25 klaim: 16,000,000 PIERRON
• ≥ 75 klaim: 19,000,000 PIERRON
• ≥ 175 klaim: 24,000,000 PIERRON
• ≥ 375 klaim: 34,000,000 PIERRON (batas maksimum)

COOLDOWN ANTAR-SWAP
• 0–24 klaim: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Percobaan swap terlalu dini ditolak secara on-chain.

SWAP PERTAMA
Transaksi resmi pertama pada suatu akun harus setidaknya 2 PIERRON.

BATAS PENJUALAN EPOCH GLOBAL
Total penjualan semua pengguna dalam satu epoch berbagi batas maksimum yang meningkat seiring jumlah total klaim protokol:

• di bawah 25 total klaim: 2,000,000,000 PIERRON
• di bawah 75: 3,000,000,000
• di bawah 175: 5,000,000,000
• di bawah 375: 7,000,000,000
• 375+: 9,000,000,000

Batas volume epoch dan transaksi per pengguna juga berlaku (termasuk hingga 100 txs per epoch dan batas volume per pengguna).

━━━━━━━━━━━━━━━━━━━━
6. REDISTRIBUSI — MEMPEROLEH KEMBALI KONTRIBUSI 1%
━━━━━━━━━━━━━━━━━━━━

MENGAPA ADA 1%
Setiap swap resmi menempatkan 1% ke dalam pool bersama. Setelah 28 epoch (7 hari dengan epoch 6 jam), pool dibagi di antara orang-orang yang cukup aktif dalam ekosistem. Perdagangan aktif + aktivitas siklus = hak untuk mengklaim dari pool. Tidak aktif = tidak mendapat bagian. Ini adalah mekanisme loyalitas / pemulihan kontribusi, bukan hukuman karena berdagang.

Kontribusi 1% dirancang untuk mengikat sementara sebagian modal dalam ekosistem dan secara tidak langsung menghambat serangan Sybil.

SUMBER POOL
Kontribusi 1% dari swap resmi mendanai vault redistribusi.

SIKLUS DAN WAKTU
• siklus: 28 epoch = 7 hari (epoch = 6 h),
• setelah siklus ditutup, pool dibagi (bagian ≈ pool / jumlah yang memenuhi syarat),
• klaim di aplikasi setelah persyaratan kelayakan terpenuhi.

KELAYAKAN (AKTIVITAS YANG CUKUP)
• setidaknya 9 epoch aktif dalam bitmap 28 epoch,
• mempertahankan saldo setidaknya 10 PIERRON,
• aktivitas yang dikenali protokol (perdagangan resmi / jalur protokol).

KLAIM
• pengguna memulai klaim di aplikasi (prepare → settle → consume),
• keeper tidak mengklaim untuk pengguna,
• voucher tetap valid kira-kira selama 28 epoch — yang tidak diklaim dapat kedaluwarsa,
• biaya klaim protokol dalam PIERRON adalah 0; pengguna membayar biaya jaringan SOL,
• klaim berhasil menaikkan penghitung klaim → batas swap lebih tinggi dan cooldown lebih singkat.

━━━━━━━━━━━━━━━━━━━━
7. BONUS LOYALITAS
━━━━━━━━━━━━━━━━━━━━

TIKET
• diperoleh dari volume perdagangan resmi (ambang: volume 10 PIERRON → 1 tiket),
• maksimum 50 tiket per pengguna per jendela,
• jendela pengundian setiap 7 epoch dalam siklus 28 epoch.

PENGUNDIAN
• keeper mengirim commit keacakan (commit–reveal),
• pengundian memerlukan jumlah commit minimum (batas produksi: 20) dan pool tiket minimum,
• setelah jendela: undi atau lewati (tiket terlalu sedikit),
• hadiah: 2,000,000 PIERRON per pengundian (dari alokasi bonus loyalitas),
• pembayaran: prepare → settle → claim oleh pemenang.

MASA BERLAKU VOUCHER
Voucher untuk mengklaim airdrop lotre berlaku selama 7 epoch, lalu kedaluwarsa.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND DAN PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Daftar → kirim ke stealth vault → penerima mengklaim. Klaim mungkin memerlukan dua transaksi. Ini adalah jalur transfer yang lebih privat — tidak melewati batas swap atau kontribusi 1%.

PIERRON PAY
Pembayaran ke akun pedagang dengan instruksi pay. Hook mengklasifikasikan transfer sebagai Pay, bukan sebagai penjualan DEX biasa.

ATURAN
• jangan gunakan jalur ini untuk melewati batas perdagangan resmi atau kontribusi 1%,
• selalu verifikasi alamat penerima / QR sebelum mengirim — kesalahan on-chain tidak dapat dibatalkan.

━━━━━━━━━━━━━━━━━━━━
9. ATURAN PENGGUNAAN APLIKASI
━━━━━━━━━━━━━━━━━━━━

1. Hubungkan hanya dompet tepercaya. Jangan pernah membagikan seed phrase Anda kepada “dukungan” atau orang asing.
2. Swap: setujui seluruh rangkaian di dompet; jangan tutup dompet di tengah proses tanda tangan.
3. Patuhi cooldown — mengetuk lagi tidak mengesampingkan aturan on-chain.
4. Klaim redistribusi / bonus loyalitas: hanya saat aplikasi menunjukkan kesiapan; setelah berhasil, tunggu sinkronisasi jaringan sebelum swap berikutnya.
5. Di Android (OEM agresif): tetap di dompet hingga CONFIRM, lalu kembali ke Pierron; jangan hentikan aplikasi di latar belakang.
6. Dilarang: serangan terhadap program, phishing atas nama Pierron, spam RPC, percobaan eksploitasi settlement / hook.

━━━━━━━━━━━━━━━━━━━━
10. SIKLUS EKONOMI
━━━━━━━━━━━━━━━━━━━━

Escrow melepaskan token ke pool DEX setiap epoch.
Perdagangan memasukkan kontribusi 1% ke pool redistribusi (dapat diperoleh kembali setelah 7 hari / 28 epoch dengan aktivitas yang cukup), tiket bonus loyalitas, dan biaya batas bawah harga SOL.
Aktivitas dalam siklus 28 epoch membuat Anda memenuhi syarat untuk memperoleh kembali bagian dari pool.
Pengundian bonus loyalitas berlangsung dalam jendela 7 epoch.
Burn mengurangi suplai secara paralel sesuai jadwal.
Pengguna mengklaim sendiri redistribusi dan hadiah; keeper memelihara waktu protokol.

━━━━━━━━━━━━━━━━━━━━
11. RISIKO
━━━━━━━━━━━━━━━━━━━━

• risiko smart contract dan upgrade,
• risiko pasar terhadap harga PIERRON (tidak ada jaminan kenaikan meskipun ada burn / batas bawah),
• biaya SOL pada transaksi gagal atau berulang,
• tidak ada jaminan keuntungan — redistribusi dan bonus loyalitas bukan produk simpanan.

Menggunakan aplikasi berarti menerima aturan on-chain dan risiko di atas.

Pierron — tokenomics transparan dan penggunaan nyata.`;
