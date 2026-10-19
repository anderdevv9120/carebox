# CAREBOX — Tính năng chính theo vai trò

Tài liệu này giải thích ngắn gọn web app CAREBOX làm gì, và mỗi vai trò thấy, làm được gì. Chi tiết kiểm thử xem `docs/manual-test-cases-vi.md`.

> Đây là bản demo. Không có thiết bị thật, không đưa ra chẩn đoán y tế. Mọi dữ liệu là dữ liệu minh họa.

## 1. Tổng quan

CAREBOX kết nối 3 người, mỗi người đăng nhập trên thiết bị riêng và cùng xem một dữ liệu chung (cập nhật sau khoảng 3 giây):

| Vai trò | Tài khoản | Ai | Việc chính |
|---|---|---|---|
| 👵 Người cao tuổi | `ba.lan` | Bà Nguyễn Thị Lan | Nói chuyện với trợ lý, gửi yêu cầu, xem lịch và sức khỏe |
| 👩 Gia đình | `con.gai` | Chị Minh (con gái) | Theo dõi mẹ, xử lý một số việc của gia đình, trả lời khi CAREBOX nhờ |
| 🧑‍💼 Nhân viên điều phối | `nhan.vien` | Anh Nam | Xác minh, phân công Care Partner, xác nhận kết quả, xử lý cảnh báo |

Mật khẩu chung: `carebox`. Nút **↺** trên thanh trên cùng đưa dữ liệu của cả 3 tài khoản về trạng thái ban đầu.

**Care Partner** (Anh Tuấn, Chị Hoa) là người đi làm việc thực tế (mua thuốc, đi chợ…). Họ không có tài khoản; nhân viên chọn tên họ và ghi lại báo cáo thay họ.

## 2. 👵 Bà Lan — người cao tuổi

Giao diện chữ to, ít thao tác.

| Màn hình | Làm được gì |
|---|---|
| **Trang chủ** | Lời chào, giờ uống thuốc và lịch khám kế tiếp, nút mic lớn để mở trợ lý. Thẻ “Đến giờ” khi tới giờ nhắc. |
| **Trợ lý** (chat) | Nói hoặc gõ yêu cầu. Trợ lý hỏi từng thông tin còn thiếu, đọc lại để bà xác nhận “Đúng rồi”, rồi chuyển đi. Nút **Gặp nhân viên** chuyển ngay cho nhân viên. Nút **Xóa hội thoại** xóa tin nhắn, yêu cầu đã tạo vẫn giữ. |
| **Lịch trình** | Lịch uống thuốc, lịch khám. Lịch thuốc chỉ theo đơn đã xác nhận; AI không tự đổi thuốc hay giờ uống. |
| **Sức khỏe** | Chỉ số huyết áp, nhịp tim, đường huyết và biểu đồ. Cuối trang có thiết bị giả lập (Bình thường, Vượt ngưỡng, Đáng nghi, Mất kết nối, Báo té ngã) để demo. |
| **Dịch vụ** | Chọn nhanh dịch vụ: Mua thuốc, Đi chợ, Đi khám, Hỗ trợ sinh hoạt, Liên hệ người thân, Thêm lịch nhắc, Trò chuyện. |
| **Yêu cầu** | Danh sách yêu cầu, trạng thái, ai phụ trách tiếp theo, dòng thời gian. Yêu cầu đang dở có nút **Tiếp tục yêu cầu**. |

Trợ lý luôn an toàn trước:

- **Khẩn cấp** (“đau ngực”, “khó thở”, “ngã chảy máu”…): báo ngay cho gia đình và nhân viên, không hỏi xác nhận. Màn hình hiện nút gọi 115.
- **Đổi liều / đổi thuốc** (“tăng liều”, “uống thêm 2 viên”, “ngừng thuốc”): trợ lý từ chối, khuyên hỏi bác sĩ hoặc dược sĩ, và báo nhân viên.
- **Không hiểu**: hỏi lại một lần. Lần thứ hai vẫn chưa hiểu thì chuyển nhân viên và báo Chị Minh.
- **Bà nói “Thôi”, “Không cần”**: hủy yêu cầu, không đặt lại.

## 3. 👩 Chị Minh — gia đình

Gia đình được cập nhật và hỗ trợ khi cần. Gia đình **không** làm các dịch vụ do nhân viên phụ trách.

| Màn hình | Làm được gì |
|---|---|
| **Tổng quan** | Thẻ “Cần chị xử lý”, tình trạng thiết bị, cảnh báo cần chú ý. |
| **Yêu cầu của mẹ** | 3 phần: **CAREBOX nhờ hỗ trợ** (nhân viên hỏi, chị trả lời), **Việc của chị** (yêu cầu gia đình phụ trách), **Đang được CAREBOX xử lý** (chỉ xem). |
| **Thông báo** | Thông báo dành cho gia đình. |
| **Hồ sơ & thiết bị** | Thông tin của bà và các thiết bị. |
| **Báo cáo** | Báo cáo dịch vụ đã xong: Care Partner nào làm, ai xác nhận, lúc nào. |

Việc gia đình tự xử lý:

- **Liên hệ người thân**: bấm “Đã liên hệ” hoặc “Từ chối”.
- **Thêm lịch nhắc không liên quan thuốc**: duyệt kèm giờ, hoặc từ chối.
- **Khẩn cấp**: bấm **Tôi đã tiếp nhận**. Chỉ nhân viên được đóng ca khẩn cấp.

Nếu gia đình chưa xử lý việc của mình sau 30 phút, việc đó chuyển sang nhân viên. Gia đình vẫn có thể xử lý; ai làm trước thì việc đóng.

## 4. 🧑‍💼 Anh Nam — nhân viên điều phối

Nhân viên nhận mọi việc cần kiểm tra hoặc cần người thực hiện.

| Màn hình | Làm được gì |
|---|---|
| **Bảng điều phối** | 3 bộ đếm: **Cần xác minh**, **Chờ xử lý**, **Đang thực hiện**. Danh sách việc sắp theo mức ưu tiên (Khẩn cấp > Cần chú ý > Chưa chắc chắn > Thông thường), cũ trước. Bấm vào để xem chi tiết. |
| **Chi tiết** | Nội dung, nguồn, mức ưu tiên, thông tin đã/chưa xác minh, lịch sử, các nút thao tác, khung **Nhờ gia đình hỗ trợ**. |
| **Thông báo** | Thông báo dành cho nhân viên. |
| **Báo cáo**, **Hồ sơ & thiết bị** | Giống màn hình của gia đình. |

Quy trình dịch vụ (Mua thuốc, Đi chợ, Đi khám, Hỗ trợ sinh hoạt):

1. Bà xác nhận yêu cầu → **Chờ điều phối**.
2. Nhân viên bấm **Xác minh** (kèm ghi chú nếu cần).
3. Chọn Care Partner, bấm **Phân công** → **Đang xử lý**.
4. Nhập báo cáo của Care Partner, bấm **Ghi nhận báo cáo**.
5. Bấm **Xác nhận hoàn tất** → **Hoàn tất**.

Không có báo cáo của Care Partner và xác nhận của nhân viên thì không thể Hoàn tất. Nhân viên cũng có thể từ chối yêu cầu, phải ghi lý do.

Việc khác của nhân viên:

- **Lịch nhắc uống thuốc**: kiểm tra đơn thuốc rồi duyệt kèm giờ. Không cần Care Partner.
- **Cảnh báo** (thiết bị vượt ngưỡng, mất kết nối, AI chưa hiểu, bà báo hết thuốc, yêu cầu đổi liều): bấm **Tôi xem việc này**, rồi đóng kèm ghi chú.
- **Khẩn cấp**: tiếp nhận, điều phối, đóng ca kèm ghi chú.
- **Nhờ gia đình hỗ trợ**: gửi câu hỏi cho Chị Minh trên bất kỳ việc nào đang mở.

## 5. Ai phụ trách việc gì

| Việc | 👵 Bà Lan | 👩 Chị Minh | 🧑‍💼 Anh Nam |
|---|---|---|---|
| Mua thuốc, Đi chợ, Đi khám, Hỗ trợ sinh hoạt | Gửi yêu cầu, có thể hủy | Nhận thông báo, chỉ xem | Xác minh, phân công, xác nhận hoàn tất |
| Liên hệ người thân | Gửi yêu cầu | **Xử lý** | Chỉ xem (nhận lại sau 30 phút) |
| Lịch nhắc không phải thuốc | Gửi yêu cầu | **Duyệt** | Chỉ xem (nhận lại sau 30 phút) |
| Lịch nhắc uống thuốc | Gửi yêu cầu | Nhận thông báo | **Duyệt** sau khi kiểm tra đơn |
| AI chưa hiểu / Gặp nhân viên | Bấm nút hoặc nói | Nhận thông báo | **Gọi lại, đóng ca** |
| Cảnh báo thiết bị | — | Nhận thông báo | **Kiểm tra, đóng ca** |
| Yêu cầu đổi liều thuốc | AI từ chối | Nhận thông báo | **Hướng dẫn gặp bác sĩ, đóng ca** |
| Khẩn cấp | Báo, gọi 115 | **Tiếp nhận** | **Tiếp nhận, đóng ca** |

## 6. Nguyên tắc chung

- AI không bao giờ tự nói một việc đã xong. Việc chỉ xong khi có người xác nhận.
- AI không chẩn đoán, không đổi thuốc, không đổi liều.
- Khẩn cấp không chờ bất kỳ bước xác nhận nào.
- Thiết bị mất dữ liệu hiện “Thiếu dữ liệu”, không bao giờ hiện là bình thường.
- Mỗi vai trò chỉ làm được việc của mình; máy chủ chặn thao tác sai vai trò.
