export const PROJECT_INFO_BODY = `PIERRON — LAYİHƏ MƏLUMATI
Versiya 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. “PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK” deməkdir
və ya danışıq dilində CPDDC (Centralized Pool Decentralized Digital Currency).

Solana-də kriptovalyutadır ki, 49 fərqli mexanizmlərinin birləşməsi vasitəsilə fərdi istifadəçi üçün ən yüksək maliyyə təhlükəsizliyini təmin etmək üçün nəzərdə tutulmuş muxtar, mərkəzləşdirilməmiş ekosistem təşkil edir.

Layihə istifadəçiyə qarşı mütləq şəffaflıq üçün və istifadəçinin məhsula etibar etməməsi üçün nəzərdə tutulmuşdur.

Layihəyə daxil edilmiş qaydalar yekundur və dəyişdirilə bilməz.

PIERRON ekosistemi tam avtonomdur: o, idarəçi tələb etmir və heç biri yoxdur. Layihədə həmçinin dəstək masası və ya müştəri xidməti yoxdur. Ekosistemdə istifadəçi tərəfindən qəbul edilən bütün qərarlar və hərəkətlər yalnız istifadəçinin məsuliyyətidir. Layihənin yaradıcısı istifadəçinin səhv qərarlarına və ya səhvlərinə görə məsuliyyət daşımır.

PIERRON heç bir assume, admit, external_body, vacuity və ya dəqiqləşdirilməmiş filialları olmayan 2200-dən artıq formal sübutlara malikdir.

━━━━━━━━━━━━━━━━━━━━
1. PIERRON NƏDİR
━━━━━━━━━━━━━━━━━━━━

Pierron Solana blokçeynindəki əlamət protokoludur. İqtisadi qaydalar (məhdudiyyətlər,  1% hovuz töhfəsi, soyuducu müddət, yenidən bölüşdürmə, loyallıq bonusu, emissiya və yanma) smart-müqavilə proqramları tərəfindən zəncirvari şəkildə tətbiq edilir - sadəcə olaraq sənədlərdə təsvir olunmur.

PIERRON tokeni (SPL Token-2022) birləşdirir:

• hər ticarət limiti və soyuma müddəti ilə rəsmi DEX ticarəti,
• Yenidən bölüşdürmə hovuzuna 1% töhfəsi — fəaliyyət dövründən sonra bərpa edilə bilən (“ticarət üçün cərimə” deyil),
• fəaliyyət dövrləri və hovuzdan pay tələb etmək,
• həcmə əsaslanan loyallıq bonusu,
• bazar hovuzuna nəzarət edilən emissiya və yanma cədvəli,
• rəsmi svoplarda SOL qiymət-mərtəbə haqqı,
• Safe Send (daha çox şəxsi köçürmələr) və Pierron Pay (ticarət ödənişləri).

Mobil proqram və dapp əməliyyatlar qurur. Qaydalar üçün həqiqət mənbəyi Solana-də yerləşdirilmiş koddur.

━━━━━━━━━━━━━━━━━━━━
2. DİZAYN PRİNSİPLƏRİ
━━━━━━━━━━━━━━━━━━━━

• Koddakı qaydalar — məhdudiyyətlər və uyğunluq proqram tərəfindən yoxlanılır.
• Topdansatış spekulyasiyası üzrə fəaliyyət — hər bir əməliyyat və dövr üzrə sərt həddlər.
• Tək boş saxlama üçün deyil, real dövr fəaliyyəti üçün hovuz payı.
• Struktur deflyasiya — böyük yanma bölgüsü və sabit yanma cədvəli.
• Ayrılmış risk yolları — hesablaşma və gizlilik ayrı proqramlardır; kassa ödənişləri etibarlı çeklər tələb edir.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMİKA (TƏMİNAT)
━━━━━━━━━━━━━━━━━━━━

Vahid: UI nişanı (zəncirdə 6 onluq yerləri).

Ümumi tədarük:  150,000,000,000 PIERRON (150 milyard)

Bölmə:
• Bazar hovuzu (eskrow → DEX): 60B (40%) (escrow)
• Tərtibatçı pul kisəsi:  21B (14%)
• Loyallıq bonusu: 7B (~4.7%)
• Yandırma (göstərmə + cədvəl):  56B (~37.3%)
• Xəzinədarlıq: 6B (4%)

Emissiya: hər dövr protokol epox kvotasına uyğun olaraq DEX hovuzuna əmanətdən tokenlər buraxır - genezisdə daha yüksək, sonra standart. (escrow)

Yanma: yanma anbarından təqribən 20 təqvim illərində yanıq payı tükənənə qədər sabit bir sürətlə.

Dövrün uzunluğu:  21,600 saniyə (6 saat). Epoch 0 protokolun yaranma zaman damğasında başlayır.

━━━━━━━━━━━━━━━━━━━━
4. MEMARLIQ (QISA)
━━━━━━━━━━━━━━━━━━━━

• Pierron proqramı — mühasibat uçotu, DEX limitləri, ticarət kitabı, loyallıq bonusu, yenidən bölüşdürmə, gənələr, yandırma, qiymət mərtəbəsi
• Transfer Hook — Token-2022 transfer təsnifatı; məhdudiyyətlər və rəsmi yollarda 1% töhfəsi
• Settlement — vauçer hazırlandıqdan sonra kassa ödənişləri (yenidən bölüşdürülmə, loyallıq bonusu, qoruyucu mükafatları)
• Stealth — qeydiyyatdan keçin, göndərin və iddia edin (Safe Send)
• TradeBook / istifadəçi hesabı — fəaliyyət, həcm, biletlər, dövr bitmapı, iddiaların sayı
• Şəbəkə qoruyucuları — qabaqcıl dövrlər, emissiya/yandırma və çəkilişlər; onlar istifadəçilər üçün yenidən paylanma və ya mükafat tələb etmirlər

━━━━━━━━━━━━━━━━━━━━
5. TİCARƏT QAYDALARI
━━━━━━━━━━━━━━━━━━━━

RƏSMİ YOLU
Limit və köçürmə çəngəl təlimatları ilə Pierron tətbiqində (protokol siyasəti altında DEX hovuzu) svop vasitəsilə ticarət edin. İcazə verilən yollardan kənar köçürmələr rədd edilə və ya fərqli şəkildə təsnif edilə bilər.

1% TƏHVİQ (BƏRPA OLABİLƏN — CƏZA DEYİL)
1% rəsmi ticarət həcminin paylaşılan yenidən bölüşdürmə hovuzuna daxil olur. Bu cəza haqqı deyil və vəsaitlərinizin daimi yanması deyil: kifayət qədər ekosistem fəaliyyəti ilə dövr başa çatdıqdan sonra hovuzdakı payınızı geri ala bilərsiniz.

Yenidən bölüşdürmə dövrü 28 dövrləri davam edir. 6-saat dövrləri ilə, yəni 7 günləri. Döngə bağlandıqdan sonra uyğun istifadəçilər tətbiqdəki hovuzdan öz paylarını iddia edirlər.

Bərpa vəziyyəti: sikldə kifayət qədər aktivlik (28-epox bitmapında ən azı 9 aktiv dövrləri daxil olmaqla və ən azı 10 PIERRON saxlanılması) — Bax Yenidən bölüşdürmə. Ekosistem fəaliyyəti olmadan heç bir hovuz payı yoxdur; töhfə üstəgəl fəaliyyətlə, ticarət hovuzdan geri tələb etmək hüququ yaradır - yalnız ticarətin dəyəri deyil.

1% töhfəsi parametrlərdə deaktiv edilə bilməz — bu, protokolun bir hissəsidir.

MƏRTƏBƏ (SOL)
Rəsmi svoplar PIERRON həcminə mütənasib SOL haqqı tələb edir (1 PIERRON üçün 100 lamports). Vəsaitlər qiymət mərtəbəsi xəzinəsinə gedir və likvidliyi / mərtəbəni dəstəkləyə bilər.

ƏMƏLİYYAT HƏDİYYƏSİ
Hər tranzaksiya üçün maksimum PIERRON alınan yenidən bölüşdürülmüş iddialardan asılıdır:

• 0–24 iddiaları: 13,000,000 PIERRON
• ≥ 25 iddiaları: 16,000,000 PIERRON
• ≥ 75 iddiaları: 19,000,000 PIERRON
• ≥ 175 iddiaları: 24,000,000 PIERRON
• ≥ 375 iddiaları: 34,000,000 PIERRON (qapaq)

SWAPS ARASINDA BEKLEME MÜDDƏTİ
• 0–24 iddiaları: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Zəncirdə erkən dəyişdirmə cəhdi rədd edilir.

İLK SWAP
Hesab üzrə ilk rəsmi əməliyyat ən azı 2 PIERRON olmalıdır.

QLOBAL EPOCH SATIŞ KAP
Bir dövrdə bütün istifadəçilər tərəfindən ümumi satışlar ümumi protokol iddiaları ilə yüksələn bir tavanı bölüşür:

• 25 üzrə ümumi iddialar:  2,000,000,000 PIERRON
• 75: 3,000,000,000 altında
• 175: 5,000,000,000 altında
• 375: 7,000,000,000 altında
• 375+: 9,000,000,000

İstifadəçi başına dövr həcmi və tranzaksiya hədləri də tətbiq edilir (o cümlədən hər dövr üçün 100 txs və istifadəçi başına həcm həddi).

━━━━━━━━━━━━━━━━━━━━
6. YENİDƏN PAYLAŞMA — 1% TƏHVİFİNİN BƏRPA EDİLMƏSİ
━━━━━━━━━━━━━━━━━━━━

NİYƏ 1% MÖVCUDDUR
Hər rəsmi mübadilə 1%-ni ortaq hovuza yerləşdirir. 28 dövrlərindən sonra (6-saat dövrlərində 7 günlər) hovuz ekosistemdə kifayət qədər aktiv olan insanlar arasında bölünür. Aktiv ticarət + dövriyyə fəaliyyəti = hovuzdan tələb etmək hüququ. Fəaliyyətsizlik = paylaşım yoxdur. Bu, ticarət üçün cəza deyil, loyallıq / töhfə-bərpa mexanizmidir.

1% töhfəsi ekosistemdə kapitalın bir hissəsini müvəqqəti bağlamaq və dolayı yolla Sybil hücumlarının qarşısını almaq üçün nəzərdə tutulub.

HAVUZ MƏNBƏSİ
Rəsmi svoplardan 1% töhfəsi yenidən bölüşdürmə anbarını maliyyələşdirir.

DÖVR VƏ VAXT
• dövr: 28 dövrləri = 7 günlər (epox = 6 h),
• sikl bağlandıqdan sonra hovuz bölünür (pay ≈ hovuz / uyğun sayı),
• uyğunluq təmin edildikdən sonra tətbiqdə iddia.

UYĞUNLUQ (KƏFƏRLİ FƏALİYYƏT)
• 28-epox bitmapında ən azı 9 aktiv dövrləri,
• ən azı 10 PIERRON balansını saxlamaq,
• protokol tərəfindən tanınan fəaliyyət (rəsmi ticarət/protokol yolları).

İDDİA
• istifadəçi tətbiqdə iddiaya başlayır (hazırla → həll et → istehlak et),
• qoruyucular istifadəçi üçün tələb etmirlər,
• çeklər 28 dövrlərinin sifarişi ilə qüvvədə qalır — tələb olunmayanların müddəti bitə bilər,
• PIERRON-də protokol iddiası haqqı 0-dir; istifadəçi SOL şəbəkə haqqını ödəyir,
• uğurlu iddia iddia sayğacını artırır → daha yüksək dəyişdirmə limiti və daha qısa soyutma.

━━━━━━━━━━━━━━━━━━━━
7. LOYALLIQ BONUSU
━━━━━━━━━━━━━━━━━━━━

BİLETLƏR
• rəsmi ticarət həcmindən qazanılmış (həddi:  10 PIERRON həcmi → 1 bilet),
• hər bir istifadəçi üçün maksimum 50 biletləri,
• 28-epox dövrü ərzində hər 7 dövrlərində pəncərələr çəkin.

ÇİZİM
• gözətçilər təsadüfi öhdəliklər təqdim edir (commit–reveal),
• tirajlar minimum öhdəliyin sayı (istehsal sahəsi:  20) və minimum bilet hovuzu tələb edir,
• pəncərədən sonra: çəkin və ya atlayın (çox az bilet),
• mükafat:  2,000,000 PIERRON hər tiraj üçün (loyallıq bonusunun ayrılmasından),
• ödəniş: hazırla → həll et → qalib tərəfindən iddia.

VUÇERİN QÜDÜRLÜYÜ
Lotereya airdropunu iddia etmək üçün çek 7 dövrləri üçün etibarlıdır, sonra müddəti başa çatır.

━━━━━━━━━━━━━━━━━━━━
8. TƏHLÜKƏSİZ GÖNDƏRİLİR VƏ PIERRON ÖDƏNİN
━━━━━━━━━━━━━━━━━━━━

TƏHLÜKƏSİZ GÖNDƏRİLMƏ
Qeydiyyatdan keçin → gizli kassaya göndərin → alıcı iddiası. İddia iki əməliyyat tələb edə bilər. Bu, daha özəl ötürmə yoludur – o, dəyişdirmə məhdudiyyətlərini və ya 1% töhfəsini keçmir.

PIERRON ÖDƏNİŞ
Ödəniş təlimatı ilə tacir hesabına ödəniş. Qarmaq transferi normal DEX satışı kimi deyil, Ödəniş kimi təsnif edir.

QAYDALAR
• rəsmi ticarət limitlərini və ya 1% töhfəsini keçmək üçün bu yollardan istifadə etməyin,
• Göndərməzdən əvvəl həmişə alıcının ünvanını / QR yoxlayın — zəncirdəki səhvlər geri dönməzdir.

━━━━━━━━━━━━━━━━━━━━
9. TƏTBİQ İSTİFADƏ QAYDALARI
━━━━━━━━━━━━━━━━━━━━

1. Yalnız etibarlı cüzdanı birləşdirin. Əsas ifadənizi heç vaxt “dəstək” və ya yad adamlarla paylaşmayın.
2. Mübadilə: cüzdandakı tam ardıcıllığı təsdiqləyin; pul kisəsini bağlamayın orta imza.
3. Soyuma müddətinə hörmət edin — yenidən toxunmaq zəncirdə olan qaydaları ləğv etmir.
4. Yenidən bölüşdürmə / loyallıq-bonus iddiası: yalnız proqram hazır olduğunu göstərdikdə; müvəffəqiyyətdən sonra növbəti mübadilədən əvvəl şəbəkə sinxronizasiyasını gözləyin.
5. Android-də (aqressiv OEM-lər): TƏSDİQ edənə qədər pul kisəsində qalın, sonra Pierron-ə qayıdın; proqramı fonda öldürməyin.
6. Qadağandır: proqramlara hücumlar, Pierron adı altında fişinq, RPC spam, hesablaşma/qanca istismar cəhdləri.

━━━━━━━━━━━━━━━━━━━━
10. İQTİSADİ DÖVQƏ
━━━━━━━━━━━━━━━━━━━━

Escrow hər dövr DEX hovuzuna tokenlər buraxır.
Ticarət yenidən bölüşdürmə hovuzuna 1% töhfəsini (kifayət qədər aktivliyə malik 7 günlərindən /  28 dövrlərindən sonra bərpa edilə bilər), sadiqlik bonus biletlərinə və SOL qiymət rüsumuna yerləşdirir.
28-epoch dövründəki fəaliyyət hovuzun payını geri almağa icazə verir.
Sadiqlik bonusu 7-epoch pəncərələrində çəkilir.
Burn cədvəl üzrə paralel olaraq təchizatı azaldır.
İstifadəçilər yenidən bölüşdürmə və mükafatları özləri iddia edirlər; gözətçilər protokol saatını saxlayırlar.

━━━━━━━━━━━━━━━━━━━━
11. RİSKLƏR
━━━━━━━━━━━━━━━━━━━━

• ağıllı müqavilə və təkmilləşdirmə riski,
• PIERRON qiyməti üçün bazar riski (yanmağa / döşəməyə baxmayaraq zəmanət verilmir),
• Uğursuz və ya təkrar əməliyyatlar üzrə SOL haqları,
• mənfəət zəmanəti yoxdur — yenidən bölüşdürmə və sadiqlik bonusu depozit məhsulu deyil.

Tətbiqdən istifadə zəncirvari qaydaları və yuxarıdakı riskləri qəbul etmək deməkdir.

Pierron — şəffaf tokenomika və real istifadə.`;
