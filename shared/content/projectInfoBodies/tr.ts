export const PROJECT_INFO_BODY = `PIERRON — PROJE BİLGİSİ
Sürüm 1.3 · Solana · Token-2022

P.I.E.R.R.O.N., “PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK” anlamına gelir,
veya halk dilinde CPDDC (Merkezi Havuz Merkezi Olmayan Dijital Para Birimi).

Solana üzerinde yer alan ve 49 farklı mekanizmanın birleşimi yoluyla, bireysel kullanıcıya en yüksek finansal güvenliği sağlamak üzere tasarlanmış özerk, merkezi olmayan bir ekosistem oluşturan bir kripto para birimidir.

Proje, kullanıcıya karşı mutlak şeffaflık sağlayacak şekilde tasarlandı ve böylece kullanıcının ürüne güvenmesine gerek kalmadı.

Projede yer alan kurallar nihaidir ve değiştirilemez.

PIERRON ekosistemi tamamen özerktir: yönetici gerektirmez ve yönetici gerektirmez. Projede ayrıca destek masası veya müşteri hizmetleri bulunmuyor. Bir kullanıcının ekosistemde aldığı tüm kararlar ve eylemler yalnızca kullanıcının sorumluluğundadır. Proje yaratıcısı, kullanıcının hatalı kararlarından veya hatalarından sorumlu değildir.

PIERRON, assume, admit, external_body, vacuity veya underspecified branches içermeyen 2200’den fazla biçimsel kanıta sahiptir.

━━━━━━━━━━━━━━━━━━━━
1. PIERRON NEDİR
━━━━━━━━━━━━━━━━━━━━

Pierron, Solana blok zincirindeki bir token protokolüdür. Ekonomik kurallar (limitler, 1% havuz katkısı, bekleme süresi, yeniden dağıtım, sadakat bonusu, emisyon ve yakma), yalnızca belgelerde açıklanmakla kalmayıp akıllı sözleşme programları tarafından zincir üzerinde uygulanır.

PIERRON jetonu (SPL Token-2022) şunları birleştirir:

• işlem başına limitler ve bekleme süresiyle resmi DEX ticareti,
• yeniden dağıtım havuzuna 1%'lik katkı — bir faaliyet döngüsünden sonra geri alınabilir ("ticaret cezası" değil),
• faaliyet döngüleri ve havuzdan pay talep etme,
• hacme dayalı sadakat bonusu,
• pazar havuzuna kontrollü emisyon artı bir yakma programı,
• resmi takaslarda SOL fiyat taban ücreti,
• Safe Send (daha fazla özel transfer) ve Pierron Pay (satıcı ödemeleri).

Mobil uygulama ve dapp işlemleri oluşturur. Kurallara ilişkin gerçeğin kaynağı, Solana üzerinde konuşlandırılan koddur.

━━━━━━━━━━━━━━━━━━━━
2. TASARIM İLKELERİ
━━━━━━━━━━━━━━━━━━━━

• Koddaki kurallar — sınırlar ve uygunluk program tarafından kontrol edilir.
• Toptan spekülasyon üzerinden faaliyet — işlem ve dönem başına hard caps.
• Yalnızca boşta bekletme için değil, gerçek döngü etkinliği için havuz paylaşımı.
• Yapısal deflasyon — büyük miktarda yakma tahsisi ve sabit bir yakma programı.
• Ayrılmış risk yolları — yerleşim ve gizlilik ayrı programlardır; Kasa ödemeleri geçerli kuponlar gerektirir.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMİKLER (TEDARİK)
━━━━━━━━━━━━━━━━━━━━

Birim: UI jetonu (zincir üzerinde 6 ondalık basamak).

Toplam arz: 150,000,000,000 PIERRON (150 milyar)

Tahsis:
• Piyasa havuzu (escrow → DEX): 60B (40%)
• Geliştirici cüzdanı: 21B (14%)
• Sadakat bonusu: 7 milyar (~4.7%)
• Yazma (kasa + program): 56B (~37.3%)
• Hazine: 6B (4%)

Emisyon: protokol her dönemde, dönem kotasına göre escrow’dan DEX havuzuna token salar — genesis aşamasında daha yüksek, ardından standart.

Yakma: Yakma tahsisi bitene kadar yaklaşık 20 takvim yılı boyunca sabit bir hızda yakma kasasından.

Dönem uzunluğu: 21,600 saniye (6 saat). Epoch 0, protokol oluşturma zaman damgasında başlar.

━━━━━━━━━━━━━━━━━━━━
4. MİMARLIK (KISA)
━━━━━━━━━━━━━━━━━━━━

• Pierron programı — muhasebe, DEX limitleri, ticaret defteri, sadakat bonusu, yeniden dağıtım, onay işaretleri, yakma, taban fiyat
• Transfer Hook — Token-2022 transfer sınıflandırması; resmi yollarda limitler ve 1% katkı
• Settlement — kupon hazırlandıktan sonra kasa ödemeleri (yeniden dağıtım, sadakat bonusu, keeper ödülleri)
• Stealth — kaydolun, gönderin ve talep edin (Safe Send)
• TradeBook / kullanıcı hesabı — etkinlik, hacim, biletler, dönem bit eşlemi, talep sayısı
• Ağ keepersı — ileri dönemler, emisyon/yanma ve çekilişler; kullanıcılardan yeniden dağıtım veya ödül talep etmezler

━━━━━━━━━━━━━━━━━━━━
5. TİCARET KURALLARI
━━━━━━━━━━━━━━━━━━━━

RESMİ YOL
Limit ve aktarım kancası talimatlarıyla Pierron uygulamasında (protokol politikası kapsamında DEX havuzu) takas yoluyla işlem yapın. İzin verilen yolların dışındaki transferler reddedilebilir veya farklı şekilde sınıflandırılabilir.

1% KATKI (GERİ ALINABİLİR – CEZA DEĞİL)
Resmi ticaret hacminin 1%'i ortak bir yeniden dağıtım havuzuna gidiyor. Bu, cezai bir ücret değildir ve fonlarınızın kalıcı olarak yakılması değildir: Yeterli ekosistem faaliyeti ile döngü sona erdikten sonra havuzdaki payınızı geri alabilirsiniz.

Bir yeniden dağıtım döngüsü 28 dönem sürer. 6 saatlik dönemlerle 7 gün eder. Döngü kapandıktan sonra uygun kullanıcılar uygulamadaki havuzdan paylarını alır.

Kurtarma koşulu: döngüde yeterli etkinlik (28 dönemlik bitmapte en az 9 aktif dönem dahil ve en az 10 PIERRON'nin sürdürülmesi) - bkz. Yeniden Dağıtım. Ekosistem faaliyeti olmadan havuz payı olmaz; Katkı artı faaliyet ile ticaret, yalnızca ticaretin maliyetini değil, havuzdan geri alma hakkını da oluşturur.

1%'lik katkı ayarlarda devre dışı bırakılamaz; bu, protokolün bir parçasıdır.

TABAN FİYAT (SOL)
Resmi takaslar, PIERRON hacmiyle orantılı bir SOL ücreti gerektirir (1 PIERRON başına 100 lamports). Fonlar fiyat tabanı hazinesine gider ve likiditeyi/tabanını destekleyebilir.

İŞLEM BAŞINA LİMİT
İşlem başına maksimum PIERRON, alınan yeniden dağıtılan taleplere bağlıdır:

• 0–24 talep: 13,000,000 PIERRON
• ≥ 25 talep: 16,000,000 PIERRON
• ≥ 75 talep: 19,000,000 PIERRON
• ≥ 175 talep: 24,000,000 PIERRON
• ≥ 375 talep: 34,000,000 PIERRON (sınır)

DEĞİŞTİRMELER ARASINDA BEKLEME SÜRESİ
• 0–24 talep: 120 sn
• ≥ 25: 90 sn
• ≥ 75: 75 sn
• ≥ 175: 60 sn
• ≥ 375: 40 sn

Zincir üzerinde erken takas girişimi reddedilir.

İLK DEĞİŞİM
Bir hesaptaki ilk resmi işlem en az 2 PIERRON olmalıdır.

KÜRESEL ÇAĞIR SATIŞ KAPASİTESİ
Bir çağdaki tüm kullanıcıların toplam satışları, toplam protokol talepleriyle birlikte yükselen bir tavanı paylaşıyor:

• altında 25 talep total: 2,000,000,000 PIERRON
• altında 75: 3,000,000,000
• altında 175: 5,000,000,000
• altında 375: 7,000,000,000
• 375+: 9,000,000,000

Kullanıcı başına dönem hacmi ve işlem sınırları da geçerlidir (dönem başına en fazla 100 txs ve kullanıcı başına hacim sınırı dahil).

━━━━━━━━━━━━━━━━━━━━
6. YENİDEN DAĞITIM — 1% KATKIYI GERİ ALMAK
━━━━━━━━━━━━━━━━━━━━

NEDEN 1% VAR
Her resmi takas 1%'ini ortak bir havuza yerleştirir. 28 dönem sonunda (6 saatlik dönemlerle 7 gün) havuz, ekosistemde yeterince aktif olan kişiler arasında paylaştırılır. Aktif işlem + döngü etkinliği = havuzdan talep etme hakkı. Hareketsizlik = paylaşım yok. Bu bir sadakat/katkı-geri alma mekanizmasıdır, ticaret için bir ceza değildir.

1%'lik katkı, ekosistemdeki sermayenin bir kısmını geçici olarak bağlamak ve Sybil saldırılarını dolaylı olarak caydırmak için tasarlanmıştır.

HAVUZ KAYNAĞI
Resmi takaslardan gelen 1%'lik katkı, yeniden dağıtım kasasını finanse ediyor.

DÖNGÜ VE ZAMANLAMA
• döngü: 28 dönem = 7 gün (dönem = 6 saat),
• döngü kapandıktan sonra havuz bölünür (paylaş ≈ havuz / uygun sayım),
• uygunluk karşılandığında uygulamada hak talebinde bulunun.

UYGUNLUK (YETERLİ ETKİNLİK)
• 28 dönemlik bitmapte en az 9 aktif dönem,
• en az 10 PIERRON bakiyesini koruyun,
• protokol tarafından tanınan aktivite (resmi ticaret / protokol yolları).

TALEP ETMEK
• kullanıcı uygulamada hak talebini başlatır (hazırlama → ödeme → tüketme),
• bakıcıların kullanıcı adına hak talebinde bulunmaması,
• Kuponlar 28 dönem boyunca geçerli kalır; talep edilmeyen kuponların geçerliliği sona erebilir,
• PIERRON'deki protokol talep ücreti 0'dır; kullanıcı SOL ağ ücretini öder,
• başarılı bir talep, talep sayacını yükseltir → daha yüksek takas limiti ve daha kısa bekleme süresi.

━━━━━━━━━━━━━━━━━━━━
7. SADAKAT BONUSU
━━━━━━━━━━━━━━━━━━━━

BİLETLER
• resmi işlem hacminden kazanılır (eşik: 10 PIERRON hacim → 1 bilet),
• pencere başına kullanıcı başına maksimum 50 bilet,
• 28 dönemlik döngü içerisinde her 7 dönemde bir pencere çizin.

ÇİZİM
• keepers rastgelelik taahhütleri gönderir (commit–reveal),
• çekilişler minimum taahhüt sayısını (üretim katı: 20) ve minimum bilet havuzunu gerektirir,
• pencereden sonra: çekiliş veya atlama (çok az bilet),
• ödül: çekiliş başına 2,000,000 PIERRON (sadakat bonusu tahsisinden),
• ödeme: hazırlık → ödeme → kazanan tarafından talep edilmesi.

Kuponun Geçerliliği
Piyango airdropunu talep etmek için kullanılan kupon 7 dönem boyunca geçerlidir ve sonrasında geçerliliği sona erer.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND VE PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Kaydol → gizli kasaya gönder → alıcı talebi. Talep iki işlem gerektirebilir. Bu daha özel bir transfer yoludur; takas limitlerini veya 1%'lik katkıyı atlamaz.

PIERRON ÖDEME
Ödeme talimatıyla bir satıcı hesabına ödeme. Kanca, transferi normal bir DEX satışı olarak değil, Pay olarak sınıflandırır.

KURALLAR
• resmi işlem limitlerini veya 1%'lik katkıyı aşmak için bu yolları kullanmayın,
• göndermeden önce daima alıcı adresini / QR doğrulayın — zincirdeki hatalar geri döndürülemez.

━━━━━━━━━━━━━━━━━━━━
9. UYGULAMA KULLANIM KURALLARI
━━━━━━━━━━━━━━━━━━━━

1. Yalnızca güvenilir bir cüzdanı bağlayın. Tohum cümlenizi asla “destek”le veya yabancılarla paylaşmayın.
2. Takas: M-cüzdandaki tüm sırayı onaylayın; İmzanın ortasında cüzdanı kapatmayın.
3. Bekleme süresine saygı gösterin; tekrar dokunmak zincir içi kuralları geçersiz kılmaz.
4. Yeniden dağıtım / sadakat bonusu talebi: yalnızca uygulama hazır olduğunu gösterdiğinde; Başarılı olduktan sonra bir sonraki takastan önce ağ senkronizasyonunu bekleyin.
5. Android'de (agresif OEM'ler): CONFIRM'ye kadar cüzdanda kalın, ardından Pierron'a dönün; Arka planda uygulamayı kapatmayın.
6. Yasak: programlara saldırılar, Pierron adı altında kimlik avı, RPC spam, çözüm/kancadan yararlanma girişimleri.

━━━━━━━━━━━━━━━━━━━━
10. EKONOMİK DÖNGÜ
━━━━━━━━━━━━━━━━━━━━

Escrow, her çağda DEX havuzuna tokenlar bırakır.
Ticaret, yeniden dağıtım havuzuna (yeterli etkinlikle 7 gün / 28 dönem sonunda geri alınabilir), sadakat bonus biletlerine ve SOL fiyat taban ücretine 1%'lik bir katkı koyar.
28 dönemlik döngüdeki etkinlik, havuzdan pay almanıza hak kazanır.
Sadakat bonusu 7 dönemlik pencerelerden yararlanır.
Burn, arzı programa paralel olarak azaltır.
Kullanıcılar yeniden dağıtımı ve ödülleri kendileri talep eder; Bekçiler protokol saatini korur.

━━━━━━━━━━━━━━━━━━━━
11. RİSKLER
━━━━━━━━━━━━━━━━━━━━

• akıllı sözleşme ve yükseltme riski,
• PIERRON fiyatı için piyasa riski (yanmaya/düşmeye rağmen yukarı yönlü garanti yok),
• Başarısız veya tekrarlanan işlemlere ilişkin SOL ücretleri,
• kâr garantisi yok — yeniden dağıtım ve sadakat bonusu, yatırılan bir ürün değildir.

Uygulamayı kullanmak, zincir içi kuralları ve yukarıdaki riskleri kabul etmek anlamına gelir.

Pierron - şeffaf tokenomik ve gerçek kullanım.`;
