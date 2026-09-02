export const PROJECT_INFO_BODY = `PIERRON — THÔNG TIN DỰ ÁN
Phiên bản 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. đại diện cho “PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK”,
hoặc thông tục là CPDDC (Tiền kỹ thuật số phi tập trung dựa trên Quỹ Tập trung).

Đây là một loại tiền điện tử trên Solana mà, thông qua sự kết hợp của các cơ chế riêng biệt 49, hình thành một hệ sinh thái tự trị, phi tập trung được thiết kế để mang lại mức độ an toàn tài chính cao nhất cho người dùng cá nhân.

Dự án được thiết kế để đạt sự minh bạch tuyệt đối đối với người dùng và để người dùng không cần phải tin tưởng vào sản phẩm.

Các quy tắc được nhúng trong dự án là cuối cùng và không thể thay đổi.

Hệ sinh thái PIERRON hoàn toàn tự trị: nó không cần quản trị viên và cũng không có quản trị viên. Dự án cũng không có bàn hỗ trợ hay dịch vụ khách hàng. Mọi quyết định và hành động do người dùng thực hiện trong hệ sinh thái hoàn toàn là trách nhiệm của người dùng. Người tạo dự án không chịu trách nhiệm về các quyết định sai lầm hoặc lỗi của người dùng.

PIERRON có hơn 2200 bằng chứng chính thức mà không có assume, admit, external_body, vacuity hoặc các nhánh underspecified.
━━━━━━━━━━━━━━━━━━━━
1. PIERRON LÀ GÌ
━━━━━━━━━━━━━━━━━━━━
Pierron là một giao thức token trên chuỗi khối Solana. Các quy tắc kinh tế (giới hạn, đóng góp vào quỹ  1%, thời gian chờ, phân phối lại, thưởng trung thành, phát hành và đốt) được thực thi trên chuỗi bởi các chương trình hợp đồng thông minh — không chỉ được mô tả trong tài liệu.

Token PIERRON (SPL Token-2022) kết hợp:

• giao dịch DEX chính thức với giới hạn trên mỗi giao dịch và thời gian chờ,  
• đóng góp 1% vào quỹ phân phối lại — có thể thu hồi sau một chu kỳ hoạt động (không phải “hình phạt cho giao dịch”),  
• chu kỳ hoạt động và claim một phần của quỹ,  
• thưởng trung thành dựa trên khối lượng,  
• phát hành có kiểm soát vào quỹ thị trường cùng với lịch trình đốt,  
• phí sàn SOL trên các giao dịch hoán đổi chính thức,  
• Safe Send (chuyển khoản tư nhân hơn) và Pierron Pay (thanh toán cho thương nhân).  

Ứng dụng di động và dapp xây dựng các giao dịch. Nguồn sự thật về các quy tắc là mã được triển khai trên Solana.
━━━━━━━━━━━━━━━━━━━━
2. NGUYÊN TẮC THIẾT KẾ
━━━━━━━━━━━━━━━━━━━━
• Quy tắc trong mã — giới hạn và điều kiện đủ tư cách được chương trình kiểm tra.
• Hoạt động hơn suy đoán hàng loạt — giới hạn cứng cho mỗi giao dịch và mỗi kỳ.
• Chia sẻ quỹ cho hoạt động chu trình thực, không chỉ giữ yên.
• Giảm phát cấu trúc — phân bổ đốt lớn và lịch trình đốt cố định.
• Đường rủi ro tách biệt — giải quyết và ẩn danh là các chương trình riêng; thanh toán kho yêu cầu phiếu hợp lệ.
━━━━━━━━━━━━━━━━━━━━
3. TOKENOMICS (CUNG CẤP)
━━━━━━━━━━━━━━━━━━━━
Đơn vị: token UI (6 chữ số thập phân trên chuỗi).

Tổng cung:  150,000,000,000 PIERRON (150 tỷ)

Phân bổ:
• Quỹ thị trường (escrow → DEX):  60B (40%)
• Ví nhà phát triển:  21B (14%)
• Thưởng khách hàng trung thành:  7B (~4.7%)
• Đốt (két + lịch trình):  56B (~37.3%)
• Kho bạc:  6B (4%)

Phát hành: mỗi epoch, giao thức phát hành token từ escrow vào quỹ DEX theo hạn ngạch epoch — cao hơn khi bắt đầu, sau đó chuẩn.

Đốt: từ két đốt với tỷ lệ cố định trong khoảng 20 năm dương lịch của các epoch cho đến khi phân bổ đốt hết.

Độ dài thời kỳ:  21,600 giây (6 giờ). Thời kỳ 0 bắt đầu vào dấu thời gian khai sinh của giao thức.
━━━━━━━━━━━━━━━━━━━━
4. KIẾN TRÚC (TÓM TẮT)
━━━━━━━━━━━━━━━━━━━━
• Chương trình Pierron — kế toán, giới hạn DEX, sổ sách giao dịch, tiền thưởng trung thành, phân phối lại, tích tắc, đốt, giá sàn
• Transfer Hook — Phân loại chuyển nhượng Token-2022; giới hạn và đóng góp 1% trên các con đường chính thức
• Settlement — rút tiền trong kho (phân phối lại, thưởng trung thành, phần thưởng keeper) sau khi chuẩn bị phiếu quà tặng
• Stealth — thanh ghi, gửi và claim (Safe Send)
• TradeBook / tài khoản người dùng — hoạt động, volume, ticket, epoch bitmap, số lượng claim
• Mạng keepers — các epoch trước, phát thải/đốt và draw; họ không phân phối lại claim hoặc giải thưởng cho người dùng
━━━━━━━━━━━━━━━━━━━━
5. QUY TẮC GIAO DỊCH
━━━━━━━━━━━━━━━━━━━━
CON ĐƯỜNG CHÍNH THỨC
Giao dịch qua hoán đổi trong ứng dụng Pierron (bể DEX theo chính sách của giao thức), với các hướng dẫn giới hạn và chuyển tiền-khóa. Các giao dịch ngoài các con đường được phép có thể bị từ chối hoặc phân loại khác. ĐÓNG GÓP 

1% (CÓ THỂ PHỤC HỒI — KHÔNG PHẢI HÌNH PHẠT)

1% của khối lượng giao dịch chính thức sẽ vào một bể phân phối chung. Đây không phải là một khoản phí trừng phạt và không phải là việc thiêu hủy vĩnh viễn quỹ của bạn: với đủ hoạt động trong hệ sinh thái, bạn có thể reclaim phần của mình trong bể sau khi chu kỳ kết thúc.

Một chu kỳ phân phối lại kéo dài 28 kỷ nguyên. Với các kỷ nguyên 6 giờ thì đó là 7 ngày. Sau khi chu kỳ kết thúc, người dùng đủ điều kiện claim nhận phần của họ từ quỹ trong ứng dụng.

Điều kiện hồi phục: hoạt động đủ trong chu kỳ (bao gồm ít nhất 9 kỷ nguyên hoạt động trong bản đồ 28 kỷ nguyên và duy trì ít nhất 10 PIERRON) — xem Phân phối lại. Nếu không có hoạt động trong hệ sinh thái thì không có phần quỹ; với đóng góp cộng với hoạt động, giao dịch tạo quyền được claim từ quỹ — không chỉ là chi phí giao dịch.

Đóng góp 1% không thể bị vô hiệu hóa trong cài đặt — nó là một phần của giao thức.

GIÁ SÀN (SOL)
Các hoán đổi chính thức yêu cầu phí SOL tỷ lệ thuận với khối lượng PIERRON (100 lamports per 1 PIERRON). Quỹ được chuyển vào kho bạc giá sàn và có thể hỗ trợ thanh khoản / sàn giao dịch.

GIỚI HẠN TRÊN MỖI GIAO DỊCH
PIERRON tối đa cho mỗi giao dịch phụ thuộc vào số lần phân phối lại claims nhận được:

• 0–24 claims: 13,000,000 PIERRON
• ≥ 25 claims: 16,000,000 PIERRON
• ≥ 75 claims: 19,000,000 PIERRON
• ≥ 175 claims: 24,000,000 PIERRON
• ≥ 375 claims: 34,000,000 PIERRON (cap)

THỜI GIAN HỒI GIỮA CÁC LẦN HOÁN ĐỔI
• 0–24 claims: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Một nỗ lực hoán đổi sớm bị từ chối trên chuỗi.

HOÁN ĐỔI ĐẦU TIÊN
Giao dịch chính thức đầu tiên trên một tài khoản phải ít nhất là 2 PIERRON.

GIỚI HẠN BÁN TOÀN CẦU THEO KỲ
Tổng lượng bán của tất cả người dùng trong một kỳ chia sẻ một mức trần tăng theo tổng số claims của giao thức:

• dưới 25 tổng claims: 2,000,000,000 PIERRON
• dưới 75: 3,000,000,000
• dưới 175: 5,000,000,000
• dưới 375: 7,000,000,000
•  375+: 9,000,000,000

Giới hạn khối lượng và giao dịch theo kỳ cho mỗi người dùng cũng được áp dụng (bao gồm tối đa 100 giao dịch mỗi kỳ và một giới hạn khối lượng cho mỗi người dùng).
━━━━━━━━━━━━━━━━━━━━
6. PHÂN PHỐI LẠI — KHÔI PHỤC ĐÓNG GÓP 1%
━━━━━━━━━━━━━━━━━━━━
TẠI SAO 1% TỒN TẠI
Mỗi lần hoán đổi chính thức, 1% được đặt vào một quỹ chung. Sau 28 chu kỳ (7 ngày với một chu kỳ 6 giờ), quỹ này được chia cho những người hoạt động đủ trong hệ sinh thái. Giao dịch tích cực + hoạt động chu kỳ = quyền nhận claim từ quỹ. Không hoạt động = không được chia phần. Đây là cơ chế khuyến khích lòng trung thành / phục hồi đóng góp, không phải là hình phạt cho việc giao dịch.

Đóng góp 1% được thiết kế để tạm thời ràng buộc một phần vốn trong hệ sinh thái và gián tiếp ngăn chặn các cuộc tấn công Sybil.

NGUỒN QUỸ
Đóng góp 1% từ các lần hoán đổi chính thức tài trợ cho hầm tái phân phối.

CHU KỲ VÀ THỜI GIAN
• chu kỳ:  28 epoch =  7 ngày (epoch =  6 giờ),
• sau khi chu kỳ kết thúc, quỹ được phân chia (phần ≈ quỹ / số lượng đủ điều kiện),
• claim trong ứng dụng khi đạt điều kiện.

ĐIỀU KIỆN (HOẠT ĐỘNG ĐỦ)
• ít nhất 9 epoch hoạt động trong bitmap 28-epoch,
• duy trì ít nhất 10 số dư PIERRON,
• hoạt động được công nhận bởi giao thức (giao dịch chính thức / đường dẫn giao thức).

YÊU CẦU
• người dùng khởi tạo claim trong ứng dụng (chuẩn bị → thanh toán → tiêu dùng),
• keepers không claim cho người dùng,
• phiếu vẫn hợp lệ trong vòng 28 epoch — những phiếu chưa được claim có thể hết hạn,
• phí giao thức claim trong PIERRON là 0; người dùng trả phí mạng SOL,
• một claim thành công sẽ tăng bộ đếm claim → giới hạn hoán đổi cao hơn và thời gian chờ ngắn hơn.
━━━━━━━━━━━━━━━━━━━━
7. TIỀN THƯỞNG TRUNG THÀNH
━━━━━━━━━━━━━━━━━━━━
VÉ
• kiếm được từ khối lượng giao dịch chính thức (ngưỡng:  10 PIERRON khối lượng →  1 vé),
• tối đa 50 vé mỗi người dùng mỗi cửa sổ,
• cửa sổ rút thăm mỗi 7 epoch trong chu kỳ 28-epoch.

RÚT THĂM
• keepers nộp cam kết ngẫu nhiên (commit–reveal),
• rút thăm yêu cầu số cam kết tối thiểu (ngưỡng sản xuất:  20) và số vé tối thiểu,
• sau cửa sổ: rút thăm hoặc bỏ qua (quá ít vé),
• giải thưởng:  2,000,000 PIERRON mỗi lần rút thăm (từ phân bổ thưởng trung thành),
• thanh toán: chuẩn bị → quyết toán → claim bởi người thắng.

HIỆU LỰC MÃ GIẢM GIÁ
Mã giảm giá cho claim chương trình xổ số airdrop có hiệu lực trong 7 kỳ, sau đó hết hạn.
━━━━━━━━━━━━━━━━━━━━
8. GỬI AN TOÀN VÀ PIERRON THANH TOÁN
━━━━━━━━━━━━━━━━━━━━
GỬI AN TOÀN
Đăng ký → gửi vào kho lưu trữ bí mật → người nhận claim. Yêu cầu có thể cần hai giao dịch. Đây là con đường chuyển tiền riêng tư hơn — nó không bỏ qua giới hạn hoán đổi hoặc đóng góp 1%.

PIERRON THANH TOÁN
Thanh toán vào tài khoản thương nhân với hướng dẫn thanh toán. Hook phân loại chuyển tiền là Thanh Toán, không phải bán DEX bình thường.

QUY TẮC
• không sử dụng các đường dẫn này để vượt qua giới hạn giao dịch chính thức hoặc đóng góp 1%,
• luôn xác minh địa chỉ người nhận / QR trước khi gửi — các lỗi trên chuỗi là không thể đảo ngược.
━━━━━━━━━━━━━━━━━━━━
9. QUY TẮC SỬ DỤNG ỨNG DỤNG
━━━━━━━━━━━━━━━━━━━━
1. Chỉ kết nối ví đáng tin cậy. Không bao giờ chia sẻ cụm từ khôi phục của bạn với “hỗ trợ” hoặc người lạ. 
2. Hoán đổi: phê duyệt toàn bộ chuỗi trong ví; không đóng ví giữa lúc ký. 
3. Tôn trọng thời gian chờ — nhấn lại không ghi đè các quy tắc trên chuỗi. 
4. Tái phân phối / thưởng trung thành claim: chỉ khi ứng dụng hiển thị sẵn sàng; sau khi thành công, chờ đồng bộ mạng trước khi thực hiện hoán đổi tiếp theo. 
5. Trên Android (các OEM tích cực): ở lại trong ví cho đến khi XÁC NHẬN, sau đó quay lại Pierron; không tắt ứng dụng nền. 
6. Cấm: tấn công chương trình, lừa đảo dưới tên Pierron, spam RPC, cố gắng khai thác thanh toán / hook.
━━━━━━━━━━━━━━━━━━━━
10. VÒNG KINH TẾ
━━━━━━━━━━━━━━━━━━━━
Escrow phát hành token vào pool DEX mỗi epoch. Giao dịch đặt một đóng góp 1% vào pool phân phối lại (có thể thu hồi sau 7 ngày /  28 epoch với hoạt động đủ), vé thưởng trung thành và phí giá sàn SOL. Hoạt động trong chu kỳ 28-epoch đủ điều kiện để bạn reclaim một phần của pool. Tiền thưởng trung thành được rút ra trong các cửa sổ 7-epoch. Việc đốt giảm nguồn cung song song theo lịch trình. Người dùng claim phân phối lại và tự nhận giải thưởng; keepers duy trì đồng hồ giao thức.
━━━━━━━━━━━━━━━━━━━━
11. NGUY CƠ
━━━━━━━━━━━━━━━━━━━━
• rủi ro hợp đồng thông minh và nâng cấp, 
• rủi ro thị trường đối với giá PIERRON (không đảm bảo lợi nhuận mặc dù có burn / giá sàn), 
• phí SOL đối với các giao dịch thất bại hoặc lặp lại, 
• không đảm bảo lợi nhuận — việc phân phối lại và thưởng trung thành không phải là sản phẩm gửi tiền.

Sử dụng ứng dụng có nghĩa là chấp nhận các quy tắc trên chuỗi và các rủi ro nêu trên.

Pierron — tokenomics minh bạch và sử dụng thực tế.`;
