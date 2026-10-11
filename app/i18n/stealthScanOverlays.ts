import type { AppLocale } from '../../shared/core/config';

/** Web-only Scan QR modal / display strings (missing from mobile packs). */
export type StealthScanStrings = {
  qrDisplayBundleHint: string;
  qrDisplayPaymentHint: string;
  scanQrBundle: string;
  scanQrCamera: string;
  scanQrHintCamera: string;
  scanQrHintScreen: string;
  scanQrPayment: string;
  scanQrPickSource: string;
  scanQrScanning: string;
  scanQrScreen: string;
  scanQrTitleBundle: string;
  scanQrTitlePayment: string;
  showPaymentQr: string;
};

const EN: StealthScanStrings = {
  qrDisplayBundleHint:
    'Show this QR to another device (camera) or leave it on screen and scan with “PC screen”.',
  qrDisplayPaymentHint: 'Show this QR to the recipient — camera scan or PC screen capture.',
  scanQrBundle: 'Scan bundle QR',
  scanQrCamera: 'Phone / webcam camera',
  scanQrHintCamera: 'Phone or laptop with a camera: point it at the QR on the other device.',
  scanQrHintScreen:
    'PC: click, pick the window or screen showing the QR; the app finds the code automatically.',
  scanQrPayment: 'Scan payment QR',
  scanQrPickSource: 'Choose how to scan:',
  scanQrScanning: 'Looking for a QR code… keep it in frame.',
  scanQrScreen: 'PC screen (Exodus-style)',
  scanQrTitleBundle: 'Scan recipient bundle QR',
  scanQrTitlePayment: 'Scan payment notification QR',
  showPaymentQr: 'Show notification as QR',
};

/** pl/en live in dappOverlay; every other AppLocale gets an overlay here. */
export const STEALTH_SCAN_BY_LOCALE: Partial<Record<AppLocale, StealthScanStrings>> = {
  de: {
    qrDisplayBundleHint:
      'Zeigen Sie diesen QR einem anderen Gerät (Kamera) oder lassen Sie ihn auf dem Bildschirm und scannen Sie mit „PC-Bildschirm“.',
    qrDisplayPaymentHint:
      'Zeigen Sie diesen QR dem Empfänger — Kamera-Scan oder Bildschirmaufnahme am PC.',
    scanQrBundle: 'Bundle-QR scannen',
    scanQrCamera: 'Telefon- / Webcam-Kamera',
    scanQrHintCamera:
      'Telefon oder Laptop mit Kamera: auf den QR auf dem anderen Gerät richten.',
    scanQrHintScreen:
      'PC: klicken, Fenster oder Bildschirm mit sichtbarem QR wählen; die App findet den Code selbst.',
    scanQrPayment: 'Zahlungs-QR scannen',
    scanQrPickSource: 'Scanmethode wählen:',
    scanQrScanning: 'Suche QR-Code… QR im Bild behalten.',
    scanQrScreen: 'PC-Bildschirm (wie Exodus)',
    scanQrTitleBundle: 'Empfänger-Bundle-QR scannen',
    scanQrTitlePayment: 'Zahlungsbenachrichtigungs-QR scannen',
    showPaymentQr: 'Benachrichtigung als QR zeigen',
  },
  es: {
    qrDisplayBundleHint:
      'Muestra este QR a otro dispositivo (cámara) o déjalo en pantalla y escanea con «Pantalla del PC».',
    qrDisplayPaymentHint:
      'Muestra este QR al destinatario — escaneo con cámara o captura de pantalla del PC.',
    scanQrBundle: 'Escanear QR del bundle',
    scanQrCamera: 'Cámara del teléfono / webcam',
    scanQrHintCamera:
      'Teléfono o portátil con cámara: apúntala al QR del otro dispositivo.',
    scanQrHintScreen:
      'PC: haz clic, elige la ventana o pantalla con el QR visible; la app encuentra el código sola.',
    scanQrPayment: 'Escanear QR de pago',
    scanQrPickSource: 'Elige cómo escanear:',
    scanQrScanning: 'Buscando un código QR… manténlo en el encuadre.',
    scanQrScreen: 'Pantalla del PC (estilo Exodus)',
    scanQrTitleBundle: 'Escanear QR del bundle del destinatario',
    scanQrTitlePayment: 'Escanear QR de notificación de pago',
    showPaymentQr: 'Mostrar notificación como QR',
  },
  pt: {
    qrDisplayBundleHint:
      'Mostre este QR a outro dispositivo (câmara) ou deixe-o no ecrã e digitalize com «Ecrã do PC».',
    qrDisplayPaymentHint:
      'Mostre este QR ao destinatário — digitalização com câmara ou captura de ecrã no PC.',
    scanQrBundle: 'Digitalizar QR do bundle',
    scanQrCamera: 'Câmara do telemóvel / webcam',
    scanQrHintCamera:
      'Telemóvel ou portátil com câmara: aponte para o QR no outro dispositivo.',
    scanQrHintScreen:
      'PC: clique, escolha a janela ou ecrã com o QR visível; a app encontra o código sozinha.',
    scanQrPayment: 'Digitalizar QR de pagamento',
    scanQrPickSource: 'Escolha como digitalizar:',
    scanQrScanning: 'A procurar um código QR… mantenha-o no enquadramento.',
    scanQrScreen: 'Ecrã do PC (estilo Exodus)',
    scanQrTitleBundle: 'Digitalizar QR do bundle do destinatário',
    scanQrTitlePayment: 'Digitalizar QR de notificação de pagamento',
    showPaymentQr: 'Mostrar notificação como QR',
  },
  ru: {
    qrDisplayBundleHint:
      'Покажите этот QR другому устройству (камера) или оставьте на экране и отсканируйте режимом «Экран ПК».',
    qrDisplayPaymentHint:
      'Покажите этот QR получателю — сканирование камерой или захват экрана на ПК.',
    scanQrBundle: 'Сканировать QR bundle',
    scanQrCamera: 'Камера телефона / веб-камера',
    scanQrHintCamera:
      'Телефон или ноутбук с камерой: наведите на QR на другом устройстве.',
    scanQrHintScreen:
      'ПК: нажмите, выберите окно или экран с видимым QR; приложение найдёт код само.',
    scanQrPayment: 'Сканировать QR платежа',
    scanQrPickSource: 'Выберите способ сканирования:',
    scanQrScanning: 'Ищем QR-код… держите его в кадре.',
    scanQrScreen: 'Экран ПК (как Exodus)',
    scanQrTitleBundle: 'Сканировать QR recipient bundle',
    scanQrTitlePayment: 'Сканировать QR уведомления о платеже',
    showPaymentQr: 'Показать уведомление как QR',
  },
  zh: {
    qrDisplayBundleHint:
      '将此二维码出示给另一台设备（摄像头），或留在屏幕上并用“电脑屏幕”模式扫描。',
    qrDisplayPaymentHint: '将此二维码出示给收款方——用摄像头扫描或在电脑上截取屏幕。',
    scanQrBundle: '扫描 Bundle 二维码',
    scanQrCamera: '手机 / 网络摄像头',
    scanQrHintCamera: '带摄像头的手机或笔记本：对准另一台设备上的二维码。',
    scanQrHintScreen:
      '电脑：点击后选择显示二维码的窗口或屏幕（例如另一窗口 / 镜中的手机），应用会自动识别。',
    scanQrPayment: '扫描付款二维码',
    scanQrPickSource: '选择扫描方式：',
    scanQrScanning: '正在查找二维码…请保持在画面内。',
    scanQrScreen: '电脑屏幕（类似 Exodus）',
    scanQrTitleBundle: '扫描收款方 Bundle 二维码',
    scanQrTitlePayment: '扫描付款通知二维码',
    showPaymentQr: '以二维码显示通知',
  },
  ja: {
    qrDisplayBundleHint:
      'このQRを別の端末（カメラ）に見せるか、画面に表示したまま「PC画面」でスキャンしてください。',
    qrDisplayPaymentHint:
      'このQRを受取人に見せてください — カメラ、またはPCの画面キャプチャでスキャン。',
    scanQrBundle: 'バンドルQRをスキャン',
    scanQrCamera: 'スマホ / Webカメラ',
    scanQrHintCamera: 'カメラ付きのスマホやノートPC：もう一方の端末のQRに向けます。',
    scanQrHintScreen:
      'PC：クリックしてQRが見えるウィンドウまたは画面を選ぶと、アプリが自動でコードを検出します。',
    scanQrPayment: '支払いQRをスキャン',
    scanQrPickSource: 'スキャン方法を選択：',
    scanQrScanning: 'QRコードを探しています…枠内に収めてください。',
    scanQrScreen: 'PC画面（Exodus風）',
    scanQrTitleBundle: '受取人バンドルQRをスキャン',
    scanQrTitlePayment: '支払い通知QRをスキャン',
    showPaymentQr: '通知をQRで表示',
  },
  cs: {
    qrDisplayBundleHint:
      'Ukažte tento QR jinému zařízení (kamera) nebo nechte na obrazovce a naskenujte režimem „Obrazovka PC“.',
    qrDisplayPaymentHint:
      'Ukažte tento QR příjemci — sken kamerou nebo zachycení obrazovky na PC.',
    scanQrBundle: 'Skenovat QR bundle',
    scanQrCamera: 'Kamera telefonu / webkamera',
    scanQrHintCamera: 'Telefon nebo notebook s kamerou: naměřte na QR na druhém zařízení.',
    scanQrHintScreen:
      'PC: klikněte, vyberte okno nebo obrazovku s viditelným QR; aplikace kód najde sama.',
    scanQrPayment: 'Skenovat platební QR',
    scanQrPickSource: 'Vyberte způsob skenování:',
    scanQrScanning: 'Hledám QR kód… držte ho v záběru.',
    scanQrScreen: 'Obrazovka PC (jako Exodus)',
    scanQrTitleBundle: 'Skenovat QR recipient bundle',
    scanQrTitlePayment: 'Skenovat QR platebního oznámení',
    showPaymentQr: 'Zobrazit oznámení jako QR',
  },
  sq: {
    qrDisplayBundleHint:
      'Tregoje këtë QR një pajisjeje tjetër (kamera) ose lëre në ekran dhe skanoje me «Ekrani i PC».',
    qrDisplayPaymentHint:
      'Tregoje këtë QR marrësit — skanim me kamerë ose kapje ekrani në PC.',
    scanQrBundle: 'Skano QR e bundle',
    scanQrCamera: 'Kamera e telefonit / webcam',
    scanQrHintCamera:
      'Telefon ose laptop me kamerë: drejtojeni te QR në pajisjen tjetër.',
    scanQrHintScreen:
      'PC: kliko, zgjidh dritaren ose ekranin me QR të dukshëm; aplikacioni e gjen kodin vetë.',
    scanQrPayment: 'Skano QR e pagesës',
    scanQrPickSource: 'Zgjidh mënyrën e skanimit:',
    scanQrScanning: 'Po kërkoj kod QR… mbaje në kuadër.',
    scanQrScreen: 'Ekrani i PC (si Exodus)',
    scanQrTitleBundle: 'Skano QR e recipient bundle',
    scanQrTitlePayment: 'Skano QR e njoftimit të pagesës',
    showPaymentQr: 'Trego njoftimin si QR',
  },
  sr: {
    qrDisplayBundleHint:
      'Pokažite ovaj QR drugom uređaju (kamera) ili ostavite na ekranu i skenirajte režimom „Ekran PC“.',
    qrDisplayPaymentHint:
      'Pokažite ovaj QR primaocu — sken kamerom ili snimanje ekrana na PC-u.',
    scanQrBundle: 'Skeniraj QR bundle',
    scanQrCamera: 'Kamera telefona / veb kamera',
    scanQrHintCamera:
      'Telefon ili laptop sa kamerom: usmerite na QR na drugom uređaju.',
    scanQrHintScreen:
      'PC: kliknite, izaberite prozor ili ekran sa vidljivim QR; aplikacija sama pronađe kod.',
    scanQrPayment: 'Skeniraj QR plaćanja',
    scanQrPickSource: 'Izaberite način skeniranja:',
    scanQrScanning: 'Tražim QR kod… držite ga u kadru.',
    scanQrScreen: 'Ekran PC (kao Exodus)',
    scanQrTitleBundle: 'Skeniraj QR recipient bundle',
    scanQrTitlePayment: 'Skeniraj QR obaveštenja o plaćanju',
    showPaymentQr: 'Prikaži obaveštenje kao QR',
  },
  fa: {
    qrDisplayBundleHint:
      'این QR را به دستگاه دیگر (دوربین) نشان دهید یا روی صفحه بگذارید و با «صفحه رایانه» اسکن کنید.',
    qrDisplayPaymentHint:
      'این QR را به گیرنده نشان دهید — اسکن با دوربین یا ضبط صفحه در رایانه.',
    scanQrBundle: 'اسکن QR باندل',
    scanQrCamera: 'دوربین گوشی / وب‌کم',
    scanQrHintCamera: 'گوشی یا لپ‌تاپ با دوربین: به QR روی دستگاه دیگر نشانه بروید.',
    scanQrHintScreen:
      'رایانه: کلیک کنید، پنجره یا صفحه‌ای با QR نمایان را انتخاب کنید؛ برنامه خودش کد را پیدا می‌کند.',
    scanQrPayment: 'اسکن QR پرداخت',
    scanQrPickSource: 'نحوه اسکن را انتخاب کنید:',
    scanQrScanning: 'در حال جستجوی کد QR… آن را در کادر نگه دارید.',
    scanQrScreen: 'صفحه رایانه (مانند Exodus)',
    scanQrTitleBundle: 'اسکن QR باندل گیرنده',
    scanQrTitlePayment: 'اسکن QR اعلان پرداخت',
    showPaymentQr: 'نمایش اعلان به‌صورت QR',
  },
  vi: {
    qrDisplayBundleHint:
      'Hiện mã QR này cho thiết bị khác (camera) hoặc để trên màn hình và quét bằng «Màn hình PC».',
    qrDisplayPaymentHint:
      'Hiện mã QR này cho người nhận — quét bằng camera hoặc chụp màn hình trên PC.',
    scanQrBundle: 'Quét QR bundle',
    scanQrCamera: 'Camera điện thoại / webcam',
    scanQrHintCamera: 'Điện thoại hoặc laptop có camera: hướng vào QR trên thiết bị kia.',
    scanQrHintScreen:
      'PC: bấm, chọn cửa sổ hoặc màn hình có QR; ứng dụng tự tìm mã.',
    scanQrPayment: 'Quét QR thanh toán',
    scanQrPickSource: 'Chọn cách quét:',
    scanQrScanning: 'Đang tìm mã QR… giữ trong khung hình.',
    scanQrScreen: 'Màn hình PC (kiểu Exodus)',
    scanQrTitleBundle: 'Quét QR bundle người nhận',
    scanQrTitlePayment: 'Quét QR thông báo thanh toán',
    showPaymentQr: 'Hiện thông báo dạng QR',
  },
  ms: {
    qrDisplayBundleHint:
      'Tunjukkan QR ini kepada peranti lain (kamera) atau biarkan di skrin dan imbas dengan «Skrin PC».',
    qrDisplayPaymentHint:
      'Tunjukkan QR ini kepada penerima — imbasan kamera atau tangkapan skrin PC.',
    scanQrBundle: 'Imbas QR bundle',
    scanQrCamera: 'Kamera telefon / webcam',
    scanQrHintCamera:
      'Telefon atau komputer riba dengan kamera: halakan ke QR pada peranti lain.',
    scanQrHintScreen:
      'PC: klik, pilih tetingkap atau skrin yang menunjukkan QR; apl akan mencari kod sendiri.',
    scanQrPayment: 'Imbas QR pembayaran',
    scanQrPickSource: 'Pilih cara mengimbas:',
    scanQrScanning: 'Mencari kod QR… kekalkan dalam bingkai.',
    scanQrScreen: 'Skrin PC (gaya Exodus)',
    scanQrTitleBundle: 'Imbas QR bundle penerima',
    scanQrTitlePayment: 'Imbas QR pemberitahuan pembayaran',
    showPaymentQr: 'Tunjuk pemberitahuan sebagai QR',
  },
  ar: {
    qrDisplayBundleHint:
      'اعرض رمز QR هذا لجهاز آخر (كاميرا) أو اتركه على الشاشة وامسحه بوضع «شاشة الكمبيوتر».',
    qrDisplayPaymentHint:
      'اعرض رمز QR هذا للمستلم — مسح بالكاميرا أو التقاط شاشة على الكمبيوتر.',
    scanQrBundle: 'مسح QR الحزمة',
    scanQrCamera: 'كاميرا الهاتف / الويب',
    scanQrHintCamera: 'هاتف أو حاسوب محمول بكاميرا: وجّهها نحو QR على الجهاز الآخر.',
    scanQrHintScreen:
      'الكمبيوتر: انقر واختر النافذة أو الشاشة التي يظهر فيها QR؛ يجد التطبيق الرمز تلقائيًا.',
    scanQrPayment: 'مسح QR الدفع',
    scanQrPickSource: 'اختر طريقة المسح:',
    scanQrScanning: 'جارٍ البحث عن رمز QR… أبقِه داخل الإطار.',
    scanQrScreen: 'شاشة الكمبيوتر (بأسلوب Exodus)',
    scanQrTitleBundle: 'مسح QR حزمة المستلم',
    scanQrTitlePayment: 'مسح QR إشعار الدفع',
    showPaymentQr: 'عرض الإشعار كـ QR',
  },
  ro: {
    qrDisplayBundleHint:
      'Arată acest QR altui dispozitiv (cameră) sau lasă-l pe ecran și scanează cu „Ecran PC”.',
    qrDisplayPaymentHint:
      'Arată acest QR destinatarului — scanare cu camera sau captură de ecran pe PC.',
    scanQrBundle: 'Scanează QR bundle',
    scanQrCamera: 'Cameră telefon / webcam',
    scanQrHintCamera:
      'Telefon sau laptop cu cameră: îndreaptă spre QR de pe celălalt dispozitiv.',
    scanQrHintScreen:
      'PC: click, alege fereastra sau ecranul cu QR vizibil; aplicația găsește codul singură.',
    scanQrPayment: 'Scanează QR de plată',
    scanQrPickSource: 'Alege modul de scanare:',
    scanQrScanning: 'Caut un cod QR… ține-l în cadru.',
    scanQrScreen: 'Ecran PC (ca Exodus)',
    scanQrTitleBundle: 'Scanează QR recipient bundle',
    scanQrTitlePayment: 'Scanează QR notificare plată',
    showPaymentQr: 'Arată notificarea ca QR',
  },
  fr: {
    qrDisplayBundleHint:
      'Montrez ce QR à un autre appareil (caméra) ou laissez-le à l’écran et scannez avec « Écran PC ».',
    qrDisplayPaymentHint:
      'Montrez ce QR au destinataire — scan caméra ou capture d’écran sur PC.',
    scanQrBundle: 'Scanner le QR du bundle',
    scanQrCamera: 'Caméra téléphone / webcam',
    scanQrHintCamera:
      'Téléphone ou ordinateur portable avec caméra : pointez vers le QR sur l’autre appareil.',
    scanQrHintScreen:
      'PC : cliquez, choisissez la fenêtre ou l’écran affichant le QR ; l’appli trouve le code seule.',
    scanQrPayment: 'Scanner le QR de paiement',
    scanQrPickSource: 'Choisissez comment scanner :',
    scanQrScanning: 'Recherche d’un code QR… gardez-le dans le cadre.',
    scanQrScreen: 'Écran PC (style Exodus)',
    scanQrTitleBundle: 'Scanner le QR du bundle destinataire',
    scanQrTitlePayment: 'Scanner le QR de notification de paiement',
    showPaymentQr: 'Afficher la notification en QR',
  },
  sv: {
    qrDisplayBundleHint:
      'Visa denna QR för en annan enhet (kamera) eller lämna den på skärmen och skanna med ”PC-skärm”.',
    qrDisplayPaymentHint:
      'Visa denna QR för mottagaren — kameraskanning eller skärminspelning på PC.',
    scanQrBundle: 'Skanna bundle-QR',
    scanQrCamera: 'Telefon- / webbkamera',
    scanQrHintCamera:
      'Telefon eller bärbar dator med kamera: rikta mot QR:n på den andra enheten.',
    scanQrHintScreen:
      'PC: klicka, välj fönstret eller skärmen med synlig QR; appen hittar koden själv.',
    scanQrPayment: 'Skanna betalnings-QR',
    scanQrPickSource: 'Välj hur du skannar:',
    scanQrScanning: 'Söker QR-kod… håll den i bilden.',
    scanQrScreen: 'PC-skärm (som Exodus)',
    scanQrTitleBundle: 'Skanna mottagarens bundle-QR',
    scanQrTitlePayment: 'Skanna betalningsaviseringens QR',
    showPaymentQr: 'Visa avisering som QR',
  },
  fi: {
    qrDisplayBundleHint:
      'Näytä tämä QR toiselle laitteelle (kamera) tai jätä näytölle ja skannaa tilassa ”PC-näyttö”.',
    qrDisplayPaymentHint:
      'Näytä tämä QR vastaanottajalle — kameraskannaus tai näytönkaappaus PC:llä.',
    scanQrBundle: 'Skannaa bundle-QR',
    scanQrCamera: 'Puhelimen / web-kamera',
    scanQrHintCamera:
      'Puhelin tai kannettava kamera: osoita QR:ään toisessa laitteessa.',
    scanQrHintScreen:
      'PC: napsauta, valitse ikkuna tai näyttö jossa QR näkyy; sovellus löytää koodin itse.',
    scanQrPayment: 'Skannaa maksu-QR',
    scanQrPickSource: 'Valitse skannaustapa:',
    scanQrScanning: 'Etsitään QR-koodia… pidä se kehyksessä.',
    scanQrScreen: 'PC-näyttö (kuten Exodus)',
    scanQrTitleBundle: 'Skannaa vastaanottajan bundle-QR',
    scanQrTitlePayment: 'Skannaa maksuilmoituksen QR',
    showPaymentQr: 'Näytä ilmoitus QR:nä',
  },
  hu: {
    qrDisplayBundleHint:
      'Mutasd ezt a QR-t másik eszköznek (kamera), vagy hagyd a képernyőn, és olvasd be „PC képernyő” móddal.',
    qrDisplayPaymentHint:
      'Mutasd ezt a QR-t a címzettnek — kamera vagy PC képernyőfelvétel.',
    scanQrBundle: 'Bundle QR beolvasása',
    scanQrCamera: 'Telefon / webkamera',
    scanQrHintCamera:
      'Kamerás telefon vagy laptop: irányítsd a másik eszközön lévő QR-re.',
    scanQrHintScreen:
      'PC: kattints, válaszd ki az ablakot vagy képernyőt a látható QR-rel; az app magától megtalálja.',
    scanQrPayment: 'Fizetési QR beolvasása',
    scanQrPickSource: 'Válaszd ki a beolvasás módját:',
    scanQrScanning: 'QR-kód keresése… tartsd a keretben.',
    scanQrScreen: 'PC képernyő (Exodus-szerű)',
    scanQrTitleBundle: 'Címzett bundle QR beolvasása',
    scanQrTitlePayment: 'Fizetési értesítés QR beolvasása',
    showPaymentQr: 'Értesítés megjelenítése QR-ként',
  },
  el: {
    qrDisplayBundleHint:
      'Δείξτε αυτό το QR σε άλλη συσκευή (κάμερα) ή αφήστε το στην οθόνη και σαρώστε με «Οθόνη PC».',
    qrDisplayPaymentHint:
      'Δείξτε αυτό το QR στον παραλήπτη — σάρωση με κάμερα ή καταγραφή οθόνης σε PC.',
    scanQrBundle: 'Σάρωση QR bundle',
    scanQrCamera: 'Κάμερα τηλεφώνου / webcam',
    scanQrHintCamera:
      'Τηλέφωνο ή φορητός με κάμερα: στοχεύστε το QR στην άλλη συσκευή.',
    scanQrHintScreen:
      'PC: κάντε κλικ, επιλέξτε το παράθυρο ή την οθόνη με ορατό QR· η εφαρμογή βρίσκει τον κωδικό μόνη της.',
    scanQrPayment: 'Σάρωση QR πληρωμής',
    scanQrPickSource: 'Επιλέξτε τρόπο σάρωσης:',
    scanQrScanning: 'Αναζήτηση κωδικού QR… κρατήστε τον στο κάδρο.',
    scanQrScreen: 'Οθόνη PC (στυλ Exodus)',
    scanQrTitleBundle: 'Σάρωση QR recipient bundle',
    scanQrTitlePayment: 'Σάρωση QR ειδοποίησης πληρωμής',
    showPaymentQr: 'Εμφάνιση ειδοποίησης ως QR',
  },
  bg: {
    qrDisplayBundleHint:
      'Покажете този QR на друго устройство (камера) или го оставете на екрана и сканирайте с „Екран на PC“.',
    qrDisplayPaymentHint:
      'Покажете този QR на получателя — сканиране с камера или захват на екран на PC.',
    scanQrBundle: 'Сканирай QR на bundle',
    scanQrCamera: 'Камера на телефона / уеб камера',
    scanQrHintCamera:
      'Телефон или лаптоп с камера: насочете към QR на другото устройство.',
    scanQrHintScreen:
      'PC: кликнете, изберете прозорец или екран с видим QR; приложението намира кода само.',
    scanQrPayment: 'Сканирай QR за плащане',
    scanQrPickSource: 'Изберете начин на сканиране:',
    scanQrScanning: 'Търся QR код… дръжте го в кадър.',
    scanQrScreen: 'Екран на PC (като Exodus)',
    scanQrTitleBundle: 'Сканирай QR на recipient bundle',
    scanQrTitlePayment: 'Сканирай QR на известие за плащане',
    showPaymentQr: 'Покажи известието като QR',
  },
  tr: {
    qrDisplayBundleHint:
      'Bu QR’yi başka bir cihaza (kamera) gösterin veya ekranda bırakıp «PC ekranı» ile tarayın.',
    qrDisplayPaymentHint:
      'Bu QR’yi alıcıya gösterin — kamera taraması veya PC’de ekran yakalama.',
    scanQrBundle: 'Bundle QR tara',
    scanQrCamera: 'Telefon / web kamerası',
    scanQrHintCamera:
      'Kamerası olan telefon veya dizüstü: diğer cihazdaki QR’ye tutun.',
    scanQrHintScreen:
      'PC: tıklayın, QR görünen pencere veya ekranı seçin; uygulama kodu kendisi bulur.',
    scanQrPayment: 'Ödeme QR tara',
    scanQrPickSource: 'Tarama yöntemini seçin:',
    scanQrScanning: 'QR kodu aranıyor… karede tutun.',
    scanQrScreen: 'PC ekranı (Exodus tarzı)',
    scanQrTitleBundle: 'Alıcı bundle QR tara',
    scanQrTitlePayment: 'Ödeme bildirimi QR tara',
    showPaymentQr: 'Bildirimi QR olarak göster',
  },
  hr: {
    qrDisplayBundleHint:
      'Pokažite ovaj QR drugom uređaju (kamera) ili ostavite na zaslonu i skenirajte načinom „PC zaslon“.',
    qrDisplayPaymentHint:
      'Pokažite ovaj QR primatelju — sken kamerom ili snimanje zaslona na PC-u.',
    scanQrBundle: 'Skeniraj QR bundle',
    scanQrCamera: 'Kamera telefona / web kamera',
    scanQrHintCamera:
      'Telefon ili laptop s kamerom: usmjerite na QR na drugom uređaju.',
    scanQrHintScreen:
      'PC: kliknite, odaberite prozor ili zaslon s vidljivim QR-om; aplikacija sama pronađe kod.',
    scanQrPayment: 'Skeniraj QR plaćanja',
    scanQrPickSource: 'Odaberite način skeniranja:',
    scanQrScanning: 'Tražim QR kod… držite ga u kadru.',
    scanQrScreen: 'PC zaslon (kao Exodus)',
    scanQrTitleBundle: 'Skeniraj QR recipient bundle',
    scanQrTitlePayment: 'Skeniraj QR obavijesti o plaćanju',
    showPaymentQr: 'Prikaži obavijest kao QR',
  },
  no: {
    qrDisplayBundleHint:
      'Vis denne QR-koden til en annen enhet (kamera) eller la den stå på skjermen og skann med «PC-skjerm».',
    qrDisplayPaymentHint:
      'Vis denne QR-koden til mottakeren — kameraskanning eller skjermopptak på PC.',
    scanQrBundle: 'Skann bundle-QR',
    scanQrCamera: 'Telefon- / webkamera',
    scanQrHintCamera:
      'Telefon eller bærbar med kamera: pek mot QR-en på den andre enheten.',
    scanQrHintScreen:
      'PC: klikk, velg vinduet eller skjermen med synlig QR; appen finner koden selv.',
    scanQrPayment: 'Skann betalings-QR',
    scanQrPickSource: 'Velg hvordan du skanner:',
    scanQrScanning: 'Ser etter QR-kode… hold den i bildet.',
    scanQrScreen: 'PC-skjerm (som Exodus)',
    scanQrTitleBundle: 'Skann mottakers bundle-QR',
    scanQrTitlePayment: 'Skann betalingsvarslings-QR',
    showPaymentQr: 'Vis varsel som QR',
  },
  ko: {
    qrDisplayBundleHint:
      '이 QR을 다른 기기(카메라)에 보여주거나 화면에 두고 «PC 화면»으로 스캔하세요.',
    qrDisplayPaymentHint:
      '이 QR을 수취인에게 보여주세요 — 카메라 스캔 또는 PC 화면 캡처.',
    scanQrBundle: '번들 QR 스캔',
    scanQrCamera: '휴대폰 / 웹캠',
    scanQrHintCamera: '카메라가 있는 휴대폰이나 노트북: 다른 기기의 QR을 향하세요.',
    scanQrHintScreen:
      'PC: 클릭한 뒤 QR이 보이는 창이나 화면을 선택하면 앱이 코드를 자동으로 찾습니다.',
    scanQrPayment: '결제 QR 스캔',
    scanQrPickSource: '스캔 방식 선택:',
    scanQrScanning: 'QR 코드를 찾는 중… 프레임 안에 유지하세요.',
    scanQrScreen: 'PC 화면 (Exodus 스타일)',
    scanQrTitleBundle: '수취인 번들 QR 스캔',
    scanQrTitlePayment: '결제 알림 QR 스캔',
    showPaymentQr: '알림을 QR로 표시',
  },
  sk: {
    qrDisplayBundleHint:
      'Ukážte tento QR inému zariadeniu (kamera) alebo nechajte na obrazovke a naskenujte režimom „Obrazovka PC“.',
    qrDisplayPaymentHint:
      'Ukážte tento QR príjemcovi — sken kamerou alebo zachytenie obrazovky na PC.',
    scanQrBundle: 'Skenovať QR bundle',
    scanQrCamera: 'Kamera telefónu / webkamera',
    scanQrHintCamera:
      'Telefón alebo notebook s kamerou: namierte na QR na druhom zariadení.',
    scanQrHintScreen:
      'PC: kliknite, vyberte okno alebo obrazovku s viditeľným QR; aplikácia kód nájde sama.',
    scanQrPayment: 'Skenovať platobný QR',
    scanQrPickSource: 'Vyberte spôsob skenovania:',
    scanQrScanning: 'Hľadám QR kód… držte ho v zábere.',
    scanQrScreen: 'Obrazovka PC (ako Exodus)',
    scanQrTitleBundle: 'Skenovať QR recipient bundle',
    scanQrTitlePayment: 'Skenovať QR platobného oznámenia',
    showPaymentQr: 'Zobraziť oznámenie ako QR',
  },
  lt: {
    qrDisplayBundleHint:
      'Parodykite šį QR kitam įrenginiui (kamera) arba palikite ekrane ir nuskaitykite režimu „PC ekranas“.',
    qrDisplayPaymentHint:
      'Parodykite šį QR gavėjui — skenavimas kamera arba ekrano fiksavimas PC.',
    scanQrBundle: 'Nuskaityti bundle QR',
    scanQrCamera: 'Telefono / internetinė kamera',
    scanQrHintCamera:
      'Telefonas ar nešiojamas kompiuteris su kamera: nukreipkite į QR kitame įrenginyje.',
    scanQrHintScreen:
      'PC: spustelėkite, pasirinkite langą ar ekraną su matomu QR; programa pati randa kodą.',
    scanQrPayment: 'Nuskaityti mokėjimo QR',
    scanQrPickSource: 'Pasirinkite nuskaitymo būdą:',
    scanQrScanning: 'Ieškoma QR kodo… laikykite jį kadre.',
    scanQrScreen: 'PC ekranas (kaip Exodus)',
    scanQrTitleBundle: 'Nuskaityti gavėjo bundle QR',
    scanQrTitlePayment: 'Nuskaityti mokėjimo pranešimo QR',
    showPaymentQr: 'Rodyti pranešimą kaip QR',
  },
  be: {
    qrDisplayBundleHint:
      'Пакажыце гэты QR іншай прыладзе (камера) або пакіньце на экране і адскануйце рэжымам «Экран ПК».',
    qrDisplayPaymentHint:
      'Пакажыце гэты QR атрымальніку — сканаванне камерай або захоп экрана на ПК.',
    scanQrBundle: 'Сканаваць QR bundle',
    scanQrCamera: 'Камера тэлефона / вэб-камера',
    scanQrHintCamera:
      'Тэлефон або ноўтбук з камерай: навядзіце на QR на іншай прыладзе.',
    scanQrHintScreen:
      'ПК: націсніце, выберыце акно або экран з бачным QR; праграма знойдзе код сама.',
    scanQrPayment: 'Сканаваць QR плацяжу',
    scanQrPickSource: 'Выберыце спосаб сканавання:',
    scanQrScanning: 'Шукаем QR-код… трымайце яго ў кадры.',
    scanQrScreen: 'Экран ПК (як Exodus)',
    scanQrTitleBundle: 'Сканаваць QR recipient bundle',
    scanQrTitlePayment: 'Сканаваць QR апавяшчэння аб плацяжы',
    showPaymentQr: 'Паказаць апавяшчэнне як QR',
  },
  et: {
    qrDisplayBundleHint:
      'Näita seda QR-i teisele seadmele (kaamera) või jäta ekraanile ja skanni režiimiga „PC ekraan“.',
    qrDisplayPaymentHint:
      'Näita seda QR-i saajale — kaameraskann või ekraanikuva PC-l.',
    scanQrBundle: 'Skanni bundle QR',
    scanQrCamera: 'Telefoni / veebikaamera',
    scanQrHintCamera:
      'Kaameraga telefon või sülearvuti: suuna teise seadme QR-ile.',
    scanQrHintScreen:
      'PC: klõpsa, vali aken või ekraan nähtava QR-iga; rakendus leiab koodi ise.',
    scanQrPayment: 'Skanni makse QR',
    scanQrPickSource: 'Vali skannimisviis:',
    scanQrScanning: 'Otsin QR-koodi… hoia see raamis.',
    scanQrScreen: 'PC ekraan (nagu Exodus)',
    scanQrTitleBundle: 'Skanni saaja bundle QR',
    scanQrTitlePayment: 'Skanni makseteavituse QR',
    showPaymentQr: 'Näita teavitust QR-ina',
  },
  md: {
    qrDisplayBundleHint:
      'Arată acest QR altui dispozitiv (cameră) sau lasă-l pe ecran și scanează cu „Ecran PC”.',
    qrDisplayPaymentHint:
      'Arată acest QR destinatarului — scanare cu camera sau captură de ecran pe PC.',
    scanQrBundle: 'Scanează QR bundle',
    scanQrCamera: 'Cameră telefon / webcam',
    scanQrHintCamera:
      'Telefon sau laptop cu cameră: îndreaptă spre QR de pe celălalt dispozitiv.',
    scanQrHintScreen:
      'PC: click, alege fereastra sau ecranul cu QR vizibil; aplicația găsește codul singură.',
    scanQrPayment: 'Scanează QR de plată',
    scanQrPickSource: 'Alege modul de scanare:',
    scanQrScanning: 'Caut un cod QR… ține-l în cadru.',
    scanQrScreen: 'Ecran PC (ca Exodus)',
    scanQrTitleBundle: 'Scanează QR recipient bundle',
    scanQrTitlePayment: 'Scanează QR notificare plată',
    showPaymentQr: 'Arată notificarea ca QR',
  },
  it: {
    qrDisplayBundleHint:
      'Mostra questo QR a un altro dispositivo (fotocamera) oppure lascialo sullo schermo e scansiona con «Schermo PC».',
    qrDisplayPaymentHint:
      'Mostra questo QR al destinatario — scansione con fotocamera o cattura schermo su PC.',
    scanQrBundle: 'Scansiona QR del bundle',
    scanQrCamera: 'Fotocamera telefono / webcam',
    scanQrHintCamera:
      'Telefono o laptop con fotocamera: punta il QR sull’altro dispositivo.',
    scanQrHintScreen:
      'PC: clicca, scegli la finestra o lo schermo con QR visibile; l’app trova il codice da sola.',
    scanQrPayment: 'Scansiona QR di pagamento',
    scanQrPickSource: 'Scegli come scansionare:',
    scanQrScanning: 'Cerco un codice QR… tienilo inquadrado.',
    scanQrScreen: 'Schermo PC (stile Exodus)',
    scanQrTitleBundle: 'Scansiona QR del recipient bundle',
    scanQrTitlePayment: 'Scansiona QR notifica di pagamento',
    showPaymentQr: 'Mostra notifica come QR',
  },
  sw: {
    qrDisplayBundleHint:
      'Onyesha QR hii kwa kifaa kingine (kamera) au iachilie skrini na uskanue kwa «Skrini ya PC».',
    qrDisplayPaymentHint:
      'Onyesha QR hii kwa mpokeaji — skani kwa kamera au kunasa skrini kwenye PC.',
    scanQrBundle: 'Skani QR ya bundle',
    scanQrCamera: 'Kamera ya simu / webcam',
    scanQrHintCamera:
      'Simu au laptop yenye kamera: elekeza kwenye QR kwenye kifaa kingine.',
    scanQrHintScreen:
      'PC: bofya, chagua dirisha au skrini yenye QR inayoonekana; programu itapata msimbo yenyewe.',
    scanQrPayment: 'Skani QR ya malipo',
    scanQrPickSource: 'Chagua jinsi ya kuskani:',
    scanQrScanning: 'Natafuta msimbo wa QR… uweke kwenye fremu.',
    scanQrScreen: 'Skrini ya PC (kama Exodus)',
    scanQrTitleBundle: 'Skani QR ya recipient bundle',
    scanQrTitlePayment: 'Skani QR ya arifa ya malipo',
    showPaymentQr: 'Onyesha arifa kama QR',
  },
  ta: {
    qrDisplayBundleHint:
      'இந்த QR-ஐ மற்ற சாதனத்திற்கு (கேமரா) காட்டுங்கள் அல்லது திரையில் வைத்து «PC திரை» மூலம் ஸ்கேன் செய்யுங்கள்.',
    qrDisplayPaymentHint:
      'இந்த QR-ஐ பெறுநருக்கு காட்டுங்கள் — கேமரா ஸ்கேன் அல்லது PC திரை பிடிப்பு.',
    scanQrBundle: 'Bundle QR ஸ்கேன்',
    scanQrCamera: 'தொலைபேசி / வெப்கேம் கேமரா',
    scanQrHintCamera:
      'கேமரா உள்ள தொலைபேசி அல்லது மடிக்கணினி: மற்ற சாதனத்தின் QR-ஐ நோக்கிச் சுட்டவும்.',
    scanQrHintScreen:
      'PC: கிளிக் செய்து QR தெரியும் சாளரம் அல்லது திரையைத் தேர்ந்தெடுக்கவும்; ஆப் குறியீட்டைத் தானே கண்டுபிடிக்கும்.',
    scanQrPayment: 'பணம் செலுத்தும் QR ஸ்கேன்',
    scanQrPickSource: 'ஸ்கேன் செய்யும் முறையைத் தேர்வுசெய்க:',
    scanQrScanning: 'QR குறியீட்டைத் தேடுகிறோம்… சட்டகத்தில் வைத்திருங்கள்.',
    scanQrScreen: 'PC திரை (Exodus போன்றது)',
    scanQrTitleBundle: 'பெறுநர் bundle QR ஸ்கேன்',
    scanQrTitlePayment: 'பணம் அறிவிப்பு QR ஸ்கேன்',
    showPaymentQr: 'அறிவிப்பை QR ஆகக் காட்டு',
  },
  ha: {
    qrDisplayBundleHint:
      'Nuna wannan QR ga wani na’ura (kyamara) ko bar shi a allo kuma ka yi scan da «Allon PC».',
    qrDisplayPaymentHint:
      'Nuna wannan QR ga mai karɓa — scan da kyamara ko ɗaukar allo a PC.',
    scanQrBundle: 'Scan QR na bundle',
    scanQrCamera: 'Kyamara ta waya / webcam',
    scanQrHintCamera:
      'Waya ko laptop mai kyamara: nufi QR a kan wani na’ura.',
    scanQrHintScreen:
      'PC: danna, zaɓi taga ko allo da QR a bayyane; app zai sami lambar da kanta.',
    scanQrPayment: 'Scan QR na biyan kuɗi',
    scanQrPickSource: 'Zaɓi yadda za a yi scan:',
    scanQrScanning: 'Ana neman lambar QR… riƙe shi a cikin firam.',
    scanQrScreen: 'Allon PC (kamar Exodus)',
    scanQrTitleBundle: 'Scan QR na recipient bundle',
    scanQrTitlePayment: 'Scan QR na sanarwar biyan kuɗi',
    showPaymentQr: 'Nuna sanarwa a matsayin QR',
  },
  th: {
    qrDisplayBundleHint:
      'แสดง QR นี้ให้อุปกรณ์อื่น (กล้อง) หรือวางไว้บนหน้าจอแล้วสแกนด้วย «หน้าจอ PC»',
    qrDisplayPaymentHint:
      'แสดง QR นี้ให้ผู้รับ — สแกนด้วยกล้องหรือจับภาพหน้าจอบน PC',
    scanQrBundle: 'สแกน QR ของ bundle',
    scanQrCamera: 'กล้องโทรศัพท์ / เว็บแคม',
    scanQrHintCamera: 'โทรศัพท์หรือแล็ปท็อปที่มีกล้อง: เล็งไปที่ QR บนอีกเครื่อง',
    scanQrHintScreen:
      'PC: คลิก เลือกหน้าต่างหรือหน้าจอที่เห็น QR แอปจะหาโค้ดให้อัตโนมัติ',
    scanQrPayment: 'สแกน QR การชำระเงิน',
    scanQrPickSource: 'เลือกวิธีสแกน:',
    scanQrScanning: 'กำลังค้นหาโค้ด QR… ให้ค้างไว้ในเฟรม',
    scanQrScreen: 'หน้าจอ PC (แบบ Exodus)',
    scanQrTitleBundle: 'สแกน QR bundle ผู้รับ',
    scanQrTitlePayment: 'สแกน QR แจ้งเตือนการชำระเงิน',
    showPaymentQr: 'แสดงการแจ้งเตือนเป็น QR',
  },
  tl: {
    qrDisplayBundleHint:
      'Ipakita ang QR na ito sa ibang device (camera) o iwan sa screen at i-scan gamit ang «PC screen».',
    qrDisplayPaymentHint:
      'Ipakita ang QR na ito sa tatanggap — camera scan o screen capture sa PC.',
    scanQrBundle: 'I-scan ang bundle QR',
    scanQrCamera: 'Camera ng telepono / webcam',
    scanQrHintCamera:
      'Telepono o laptop na may camera: ituro sa QR sa kabilang device.',
    scanQrHintScreen:
      'PC: i-click, piliin ang window o screen na may nakikitang QR; sisiguraduhin ng app ang code.',
    scanQrPayment: 'I-scan ang payment QR',
    scanQrPickSource: 'Piliin kung paano mag-scan:',
    scanQrScanning: 'Naghahanap ng QR code… panatilihin sa frame.',
    scanQrScreen: 'PC screen (gaya ng Exodus)',
    scanQrTitleBundle: 'I-scan ang recipient bundle QR',
    scanQrTitlePayment: 'I-scan ang payment notification QR',
    showPaymentQr: 'Ipakita ang notification bilang QR',
  },
  nl: {
    qrDisplayBundleHint:
      'Toon deze QR aan een ander apparaat (camera) of laat hem op het scherm en scan met «Pc-scherm».',
    qrDisplayPaymentHint:
      'Toon deze QR aan de ontvanger — camerascan of schermopname op de pc.',
    scanQrBundle: 'Bundle-QR scannen',
    scanQrCamera: 'Telefoon- / webcamcamera',
    scanQrHintCamera:
      'Telefoon of laptop met camera: richt op de QR op het andere apparaat.',
    scanQrHintScreen:
      'Pc: klik, kies het venster of scherm met zichtbare QR; de app vindt de code zelf.',
    scanQrPayment: 'Betaal-QR scannen',
    scanQrPickSource: 'Kies hoe je scant:',
    scanQrScanning: 'Zoek een QR-code… houd hem in beeld.',
    scanQrScreen: 'Pc-scherm (zoals Exodus)',
    scanQrTitleBundle: 'Ontvanger-bundle-QR scannen',
    scanQrTitlePayment: 'Betalingsmelding-QR scannen',
    showPaymentQr: 'Melding als QR tonen',
  },
  id: {
    qrDisplayBundleHint:
      'Tunjukkan QR ini ke perangkat lain (kamera) atau biarkan di layar dan pindai dengan «Layar PC».',
    qrDisplayPaymentHint:
      'Tunjukkan QR ini ke penerima — pindai kamera atau tangkap layar di PC.',
    scanQrBundle: 'Pindai QR bundle',
    scanQrCamera: 'Kamera ponsel / webcam',
    scanQrHintCamera:
      'Ponsel atau laptop berkamera: arahkan ke QR di perangkat lain.',
    scanQrHintScreen:
      'PC: klik, pilih jendela atau layar yang menampilkan QR; aplikasi menemukan kode sendiri.',
    scanQrPayment: 'Pindai QR pembayaran',
    scanQrPickSource: 'Pilih cara memindai:',
    scanQrScanning: 'Mencari kode QR… jaga agar tetap di bingkai.',
    scanQrScreen: 'Layar PC (gaya Exodus)',
    scanQrTitleBundle: 'Pindai QR recipient bundle',
    scanQrTitlePayment: 'Pindai QR notifikasi pembayaran',
    showPaymentQr: 'Tampilkan notifikasi sebagai QR',
  },
  sl: {
    qrDisplayBundleHint:
      'Pokažite ta QR drugi napravi (kamera) ali pustite na zaslonu in skenirajte z načinom „Zaslon PC“.',
    qrDisplayPaymentHint:
      'Pokažite ta QR prejemniku — skeniranje s kamero ali zajem zaslona na PC.',
    scanQrBundle: 'Skeniraj QR bundle',
    scanQrCamera: 'Kamera telefona / spletna kamera',
    scanQrHintCamera:
      'Telefon ali prenosnik s kamero: usmerite na QR na drugi napravi.',
    scanQrHintScreen:
      'PC: kliknite, izberite okno ali zaslon z vidnim QR; aplikacija kodo najde sama.',
    scanQrPayment: 'Skeniraj plačilni QR',
    scanQrPickSource: 'Izberite način skeniranja:',
    scanQrScanning: 'Iščem QR kodo… držite jo v kadru.',
    scanQrScreen: 'Zaslon PC (kot Exodus)',
    scanQrTitleBundle: 'Skeniraj QR recipient bundle',
    scanQrTitlePayment: 'Skeniraj QR plačilnega obvestila',
    showPaymentQr: 'Prikaži obvestilo kot QR',
  },
  so: {
    qrDisplayBundleHint:
      'Tusi QR-kan qalab kale (kaamera) ama ka tag shaashadda oo ku sawir «Shaashadda PC».',
    qrDisplayPaymentHint:
      'Tusi QR-kan qaataha — sawir kaamera ama qabashada shaashadda PC.',
    scanQrBundle: 'Sawir QR-ka bundle',
    scanQrCamera: 'Kaamerada telefoonka / webcam',
    scanQrHintCamera:
      'Telefoon ama laptop leh kaamera: u jeedi QR-ka qalabka kale.',
    scanQrHintScreen:
      'PC: guji, dooro daaqadda ama shaashadda QR-ka muuqda; abku wuxuu helayaa koodka keligiis.',
    scanQrPayment: 'Sawir QR-ka lacag-bixinta',
    scanQrPickSource: 'Dooro sida loo sawiro:',
    scanQrScanning: 'Raadinaya koodka QR… ku hay frame-ka.',
    scanQrScreen: 'Shaashadda PC (sida Exodus)',
    scanQrTitleBundle: 'Sawir QR-ka recipient bundle',
    scanQrTitlePayment: 'Sawir QR-ka ogeysiiska lacag-bixinta',
    showPaymentQr: 'Tusi ogeysiiska sidii QR',
  },
  hi: {
    qrDisplayBundleHint:
      'यह QR दूसरे डिवाइस (कैमरा) को दिखाएँ या स्क्रीन पर छोड़कर «PC स्क्रीन» से स्कैन करें।',
    qrDisplayPaymentHint:
      'यह QR प्राप्तकर्ता को दिखाएँ — कैमरा स्कैन या PC पर स्क्रीन कैप्चर।',
    scanQrBundle: 'बंडल QR स्कैन करें',
    scanQrCamera: 'फ़ोन / वेबकैम कैमरा',
    scanQrHintCamera:
      'कैमरे वाला फ़ोन या लैपटॉप: दूसरे डिवाइस के QR पर लगाएँ।',
    scanQrHintScreen:
      'PC: क्लिक करें, वह विंडो या स्क्रीन चुनें जहाँ QR दिखे; ऐप कोड खुद ढूँढ लेगा।',
    scanQrPayment: 'भुगतान QR स्कैन करें',
    scanQrPickSource: 'स्कैन करने का तरीका चुनें:',
    scanQrScanning: 'QR कोड खोज रहे हैं… फ़्रेम में रखें।',
    scanQrScreen: 'PC स्क्रीन (Exodus जैसा)',
    scanQrTitleBundle: 'प्राप्तकर्ता बंडल QR स्कैन करें',
    scanQrTitlePayment: 'भुगतान सूचना QR स्कैन करें',
    showPaymentQr: 'सूचना को QR के रूप में दिखाएँ',
  },
  ur: {
    qrDisplayBundleHint:
      'یہ QR دوسرے آلے (کیمرہ) کو دکھائیں یا اسکرین پر رکھ کر «PC اسکرین» سے اسکین کریں۔',
    qrDisplayPaymentHint:
      'یہ QR وصول کنندہ کو دکھائیں — کیمرہ اسکین یا PC پر اسکرین کیپچر۔',
    scanQrBundle: 'بنڈل QR اسکین کریں',
    scanQrCamera: 'فون / ویب کیم کیمرہ',
    scanQrHintCamera:
      'کیمرے والا فون یا لیپ ٹاپ: دوسرے آلے کے QR پر لگائیں۔',
    scanQrHintScreen:
      'PC: کلک کریں، وہ ونڈو یا اسکرین منتخب کریں جہاں QR نظر آئے؛ ایپ کوڈ خود تلاش کرے گی۔',
    scanQrPayment: 'ادائیگی QR اسکین کریں',
    scanQrPickSource: 'اسکین کرنے کا طریقہ منتخب کریں:',
    scanQrScanning: 'QR کوڈ تلاش کر رہے ہیں… فریم میں رکھیں۔',
    scanQrScreen: 'PC اسکرین (Exodus جیسا)',
    scanQrTitleBundle: 'وصول کنندہ بنڈل QR اسکین کریں',
    scanQrTitlePayment: 'ادائیگی نوٹیفکیشن QR اسکین کریں',
    showPaymentQr: 'نوٹیفکیشن کو QR کے طور پر دکھائیں',
  },
  az: {
    qrDisplayBundleHint:
      'Bu QR-i digər cihaza (kamera) göstərin və ya ekranda saxlayıb «PC ekranı» ilə skan edin.',
    qrDisplayPaymentHint:
      'Bu QR-i alıcıya göstərin — kamera skanı və ya PC-də ekran çəkilişi.',
    scanQrBundle: 'Bundle QR skan et',
    scanQrCamera: 'Telefon / veb kamera',
    scanQrHintCamera:
      'Kamerası olan telefon və ya noutbuk: digər cihazdakı QR-ə tuşlayın.',
    scanQrHintScreen:
      'PC: klikləyin, görünən QR olan pəncərə və ya ekranı seçin; tətbiq kodu özü tapır.',
    scanQrPayment: 'Ödəniş QR skan et',
    scanQrPickSource: 'Skan üsulunu seçin:',
    scanQrScanning: 'QR kod axtarılır… kadrda saxlayın.',
    scanQrScreen: 'PC ekranı (Exodus kimi)',
    scanQrTitleBundle: 'Alıcı bundle QR skan et',
    scanQrTitlePayment: 'Ödəniş bildirişi QR skan et',
    showPaymentQr: 'Bildirişi QR kimi göstər',
  },
  is: {
    qrDisplayBundleHint:
      'Sýndu þennan QR öðru tæki (myndavél) eða skildu eftir á skjánum og skannaðu með „PC-skjár“.',
    qrDisplayPaymentHint:
      'Sýndu þennan QR viðtakanda — myndavélarskönnun eða skjáupptaka á PC.',
    scanQrBundle: 'Skanna bundle-QR',
    scanQrCamera: 'Síma- / vefmyndavél',
    scanQrHintCamera:
      'Sími eða fartölva með myndavél: stefndu á QR á hinu tækinu.',
    scanQrHintScreen:
      'PC: smelltu, veldu glugga eða skjá með sýnilegum QR; appið finnur kóðann sjálft.',
    scanQrPayment: 'Skanna greiðslu-QR',
    scanQrPickSource: 'Veldu hvernig á að skanna:',
    scanQrScanning: 'Leita að QR-kóða… haltu honum í ramma.',
    scanQrScreen: 'PC-skjár (eins og Exodus)',
    scanQrTitleBundle: 'Skanna mottakanda bundle-QR',
    scanQrTitlePayment: 'Skanna greiðslutilkynningar-QR',
    showPaymentQr: 'Sýna tilkynningu sem QR',
  },
  ka: {
    qrDisplayBundleHint:
      'აჩვენეთ ეს QR სხვა მოწყობილობას (კამერა) ან დატოვეთ ეკრანზე და დაასკანერეთ „PC ეკრანი“ რეჟიმით.',
    qrDisplayPaymentHint:
      'აჩვენეთ ეს QR მიმღებს — კამერის სკანირება ან ეკრანის ჩაწერა PC-ზე.',
    scanQrBundle: 'Bundle QR-ის სკანირება',
    scanQrCamera: 'ტელეფონის / ვებკამერა',
    scanQrHintCamera:
      'ტელეფონი ან ლეპტოპი კამერით: მიმართეთ სხვა მოწყობილობის QR-ს.',
    scanQrHintScreen:
      'PC: დააწკაპუნეთ, აირჩიეთ ფანჯარა ან ეკრანი ხილული QR-ით; აპი თავად იპოვის კოდს.',
    scanQrPayment: 'გადახდის QR-ის სკანირება',
    scanQrPickSource: 'აირჩიეთ სკანირების გზა:',
    scanQrScanning: 'ვეძებთ QR კოდს… შეინახეთ კადრში.',
    scanQrScreen: 'PC ეკრანი (როგორც Exodus)',
    scanQrTitleBundle: 'მიმღების bundle QR-ის სკანირება',
    scanQrTitlePayment: 'გადახდის შეტყობინების QR-ის სკანირება',
    showPaymentQr: 'შეტყობინების ჩვენება როგორც QR',
  },
  ku: {
    qrDisplayBundleHint:
      'Vê QR-ê nîşanî cîhazekî din (kamera) bide an li ser ekranê bihêle û bi «Ekrana PC» skan bike.',
    qrDisplayPaymentHint:
      'Vê QR-ê nîşanî wergir bide — skana kamera an girtina ekranê li ser PC.',
    scanQrBundle: 'QR-a bundle skan bike',
    scanQrCamera: 'Kamera telefonê / webcam',
    scanQrHintCamera:
      'Telefon an laptopê bi kamera: berê xwe bide QR-a li ser cîhaza din.',
    scanQrHintScreen:
      'PC: bitikîne, pencere an ekrana ku QR tê de xuya dibe hilbijêre; sepan kodê bi xwe dibîne.',
    scanQrPayment: 'QR-a dravdanê skan bike',
    scanQrPickSource: 'Awayê skanê hilbijêre:',
    scanQrScanning: 'Li koda QR digere… di çarçoveyê de bigire.',
    scanQrScreen: 'Ekrana PC (wek Exodus)',
    scanQrTitleBundle: 'QR-a recipient bundle skan bike',
    scanQrTitlePayment: 'QR-a agahdariya dravdanê skan bike',
    showPaymentQr: 'Agahdariyê wek QR nîşan bide',
  },
};

export function getStealthScanOverlay(
  locale: AppLocale
): { stealthUi: StealthScanStrings } | null {
  if (locale === 'pl' || locale === 'en') return null;
  const stealthUi = STEALTH_SCAN_BY_LOCALE[locale] ?? EN;
  return { stealthUi };
}
