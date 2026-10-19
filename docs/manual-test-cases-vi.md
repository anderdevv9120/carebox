# CAREBOX — Bộ test case kiểm thử thủ công

Tài liệu này liệt kê các kịch bản kiểm thử thủ công cho web app CAREBOX. Trọng tâm là tương tác giữa 3 vai trò: **Bà Lan** (người cao tuổi), **Chị Minh** (gia đình) và **Anh Nam** (nhân viên điều phối).

Chuỗi văn bản trong dấu “…” hoặc `…` là nội dung UI/thông báo **chính xác** mà app phải hiển thị. Chuỗi này lấy từ code hiện tại trên `main`.

---

## 0. Chuẩn bị

| Hạng mục | Cách làm |
|---|---|
| Chạy app | `npm run dev` (http://localhost:5173). Muốn test trên điện thoại cùng Wi-Fi: `npm run dev -- --host`. |
| 3 phiên riêng | Phiên đăng nhập lưu trong `localStorage`, nên mỗi vai trò cần một **profile trình duyệt riêng**: ví dụ Chrome thường (`ba.lan`), Chrome ẩn danh (`con.gai`), Edge/Firefox (`nhan.vien`). Hai cửa sổ ẩn danh Chrome dùng chung storage, không dùng được. |
| Tài khoản | `ba.lan` / `con.gai` / `nhan.vien`, mật khẩu `carebox`. |
| Chế độ AI | Mọi phần đều test **có** mô hình AI: đặt `GEMINI_API_KEY` trong `.env.local`, restart dev server, gửi thử “Chào cháu” để chắc AI trả lời. Câu khớp từ khóa (dịch vụ, khẩn cấp, đổi thuốc, báo vấn đề, lịch, chỉ số, yêu cầu), câu trả lời khi đang ở giữa luồng hỏi, và các nút bấm vẫn chạy luật cố định, nên kết quả đúng như bảng. Chỉ câu **không** khớp từ khóa mới đi qua mô hình; câu trả lời đó có thể khác giữa các lần. |
| Reset | Bấm **↺** trên thanh trên cùng trước mỗi kịch bản. ↺ reset dữ liệu cho **cả 3 tài khoản**, không hỏi xác nhận. |
| Đồng bộ | Các màn hình khác cập nhật trong khoảng **~3 giây**. Polling dừng khi tab bị ẩn. |
| Mã tự sinh | Ngay sau reset, yêu cầu mới đầu tiên là **CB-004**, sự kiện/cảnh báo mới đầu tiên là **EVT-002**. Các test bên dưới dùng mã này với giả định vừa reset. |

**Ký hiệu vai trò:** 👵 Bà Lan · 👩 Chị Minh · 🧑‍💼 Anh Nam.

### 0.1 Dữ liệu sau reset (dùng làm mốc)

| Vai trò | Phải thấy |
|---|---|
| 🧑‍💼 | Bảng điều phối: **Cần xác minh 2**, **Chờ xử lý 0**, **Đang thực hiện 0**. Tab “Bảng điều phối” có badge 2. Danh sách theo thứ tự: EVT-001 “Dữ liệu thiết bị vượt ngưỡng” (Cần chú ý), CB-001 “Hỗ trợ lấy thuốc” (Chờ bổ sung thông tin), CB-003 “Đi chợ giúp bác” (Chờ điều phối). Tab Thông báo không có badge. |
| 👩 | Tổng quan: không có thẻ “Cần chị xử lý”. Tile Thiết bị “5/5 đang kết nối” + “1 cần chú ý”. Mục “Cảnh báo cần chú ý” có EVT-001. Tab “Thông báo” badge 1. “Yêu cầu của mẹ”: mục “CAREBOX nhờ hỗ trợ” và “Việc của chị” trống; mục “Đang được CAREBOX xử lý” có EVT-001, CB-001, CB-003. |
| 👵 | Trang chủ “Chào bà Lan! 👋”. Mục Yêu cầu (tab “Tất cả”): CB-003 Chờ điều phối, CB-001 Chờ bổ sung thông tin, CB-002 Hoàn tất. Sau khoảng 3 phút, Trang chủ hiện thẻ “Đến giờ” cho “Uống thuốc theo đơn”. |
| Cả 3 | Báo cáo (👩/🧑‍💼): mục “Báo cáo dịch vụ” có CB-002 “Đi khám bệnh”, Care Partner Anh Tuấn, người xác nhận Anh Nam. |

---

## 1. Đăng nhập & phiên

| ID | Các bước | Kết quả mong đợi |
|---|---|---|
| A1 | Chọn thẻ “Bà Nguyễn Thị Lan”, nhập `carebox`, bấm **Đăng nhập**. | Vào Trang chủ người cao tuổi. Logo chỉ ghi “CAREBOX”. Góc phải hiện tên “Bà Nguyễn Thị Lan”. |
| A2 | Đăng nhập `con.gai`. | Vào “Bảng điều khiển gia đình”. Logo “CAREBOX Family”. Tabs: Tổng quan, Yêu cầu của mẹ, Thông báo, Hồ sơ & thiết bị, Báo cáo. |
| A3 | Đăng nhập `nhan.vien`. | Vào “Bảng điều phối”. Logo “CAREBOX Operations”. Tabs: Bảng điều phối, Thông báo, Báo cáo, Hồ sơ & thiết bị. |
| A4 | Nhập sai mật khẩu, bấm Đăng nhập. | Hiện lỗi “Sai tài khoản hoặc mật khẩu”. Không vào app. |
| A5 | Để trống mật khẩu. | Nút **Đăng nhập** bị khóa. |
| A6 | Đang đăng nhập (mỗi vai trò), bấm F5. | Vẫn đăng nhập đúng vai trò, không quay về màn hình login. |
| A7 | Bấm **Đăng xuất**, rồi F5. | Về màn hình đăng nhập và vẫn ở đó sau F5. |
| A8 | DevTools → Application → Local Storage → sửa ký tự cuối của `token` trong `carebox-session`, đợi 3 giây. | Bị đăng xuất tự động (server trả 401). |

## 2. Đồng bộ, reset, điều hướng chung

| ID | Các bước | Kết quả mong đợi |
|---|---|---|
| B1 | 👵 bấm “Gặp nhân viên” trong chat. Quan sát 👩 và 🧑‍💼. | Trong ~3 giây, 👩 và 🧑‍💼 thấy cảnh báo mới mà không cần F5. |
| B2 | Tạo vài thay đổi. Từ **bất kỳ** vai trò nào bấm ↺. | Cả 3 màn hình quay về dữ liệu ở mục 0.1 trong ~3 giây. Chat của bà trở về một tin chào: “Bác cần CAREBOX hỗ trợ gì ạ? …”. |
| B3 | Ẩn tab 👩 (chuyển tab khác). 👵 tạo một cảnh báo. Mở lại tab 👩. | Tab 👩 cập nhật ngay khi hiện lại, không phải đợi chu kỳ 3 giây. |
| B4 | 👵 gửi “Cháu kể chuyện cho bác nghe đi” (đi qua mô hình nên chậm), rồi F5 ngay khi đang “Đang trả lời…”. | Tin đã gửi và câu trả lời vẫn còn sau khi tải lại. |

## 3. Chức năng riêng của 👵 Bà Lan

| ID | Các bước | Kết quả mong đợi |
|---|---|---|
| C1 | Trang chủ: xem tile “Uống thuốc”, “Lịch khám”. | Hiện giờ của lịch thuốc/lịch khám kế tiếp chưa tới; “—” nếu không còn. |
| C2 | Bấm nút mic 🎙️ to ở Trang chủ. | Mở màn hình “Trợ lý CAREBOX”. |
| C3 | Lịch trình: xem danh sách. | Các lịch sắp theo giờ. Lịch đã qua giờ (lúc reset) có badge “Đã nhận nhắc”. Có dòng “Lịch thuốc chỉ theo đơn đã được xác nhận. AI không tự thay đổi thuốc hay giờ uống.” |
| C4 | Dịch vụ: gõ “chợ” vào ô tìm. | Chỉ còn dòng “Đi chợ”. Gõ chữ không khớp → “Không tìm thấy dịch vụ”. |
| C5 | Dịch vụ → “Trò chuyện”. | Mở chat, **không** tạo yêu cầu nào. |
| C6 | Dịch vụ → “Mua thuốc”. | Mở chat. Bà “nói” “Tôi cần mua thuốc”. AI hỏi: “Bác muốn CAREBOX hỗ trợ mua thuốc, đúng không ạ? Bác cần lấy loại thuốc nào ạ?”. Chip gợi ý: “Không biết”, “Thôi”. |
| C7 | Yêu cầu: chuyển tab “Đang xử lý” / “Đã xong” / “Tất cả”. | Lọc đúng: yêu cầu mở / Hoàn tất + Đã từ chối / tất cả. Mỗi thẻ có “Phụ trách tiếp theo” và dòng thời gian. |
| C9 | Chat: (reset) nút **Xóa hội thoại** bị mờ. Gõ “Bác muốn đi chợ” → “Rau, trứng” → bấm **Xóa hội thoại**. | **Không** hỏi xác nhận. Chat chỉ còn lời chào “Bác cần CAREBOX hỗ trợ gì ạ? …”, chip trở về gợi ý mặc định. Yêu cầu đi chợ vẫn “Chờ bổ sung thông tin” với “Danh sách cần mua: Rau, trứng”, có nút **Tiếp tục yêu cầu**. |
| C8 | Sức khỏe: xem các thẻ chỉ số và biểu đồ (Huyết áp/Nhịp tim/Đường huyết). | Mỗi thẻ có giá trị, đơn vị, badge trạng thái, “Đo lúc HH:MM”. Huyết áp sau reset là 165/100, badge “Cần chú ý”. Có dòng “Ngưỡng giả lập — không phải chỉ định y tế. Không kết luận sức khỏe tổng thể.” |

---

## 4. Luồng tương tác 3 vai trò (trọng tâm)

### D1. Dịch vụ do nhân viên phụ trách — đi chợ, từ đầu đến Hoàn tất

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 👵 | Chat: gõ “Bác muốn đi chợ”. | AI: “Bác muốn CAREBOX hỗ trợ đi chợ, đúng không ạ? Bác cần mua những gì, số lượng bao nhiêu ạ?”. |
| 2 | 🧑‍💼 | Xem Bảng điều phối. | Có thẻ CB-004 “Đi chợ”, “Chờ bổ sung thông tin”, Bước tiếp theo “Người cao tuổi (bổ sung thông tin)”. Bộ đếm **không** đổi. |
| 3 | 👩 | Xem Yêu cầu của mẹ. | CB-004 nằm ở “Đang được CAREBOX xử lý”, chỉ xem, không có nút. Chưa có thông báo mới. |
| 4 | 👵 | Trả lời “Rau muống, 10 quả trứng”. | AI: “Bác muốn nhận đồ lúc nào ạ?”. |
| 5 | 👵 | Trả lời “9 giờ sáng mai”. | AI đọc lại: “Cháu nhắc lại: Đi chợ — Danh sách cần mua: Rau muống, 10 quả trứng; Thời gian mong muốn: 9 giờ sáng mai. Bác xác nhận giúp cháu, đúng không ạ?”. Chip: “Đúng rồi”, “Không”. Trạng thái: “Chờ xác nhận”. |
| 6 | 👵 | Bấm chip “Đúng rồi”. | AI: “Cháu đã gửi yêu cầu cho nhân viên CAREBOX điều phối. Yêu cầu chưa hoàn tất; bác xem tiến độ ở mục Yêu cầu ạ.”. Mục Yêu cầu: CB-004 “Chờ điều phối”, Phụ trách “Nhân viên CAREBOX (xác minh)”. |
| 7 | 🧑‍💼 | Xem bảng + Thông báo. | **Cần xác minh 3**, badge tab = 3. Thông báo: “Đi chợ: chờ điều phối”. |
| 8 | 👩 | Xem Thông báo + Yêu cầu của mẹ. | Thông báo: “Đi chợ: đã chuyển nhân viên CAREBOX điều phối.”. CB-004 vẫn chỉ xem. Badge “Yêu cầu của mẹ” **không** tăng. |
| 9 | 🧑‍💼 | Mở CB-004. | Chi tiết có: mã, người liên quan + nguồn “Người cao tuổi báo”, nội dung + 2 trường, thời điểm ghi nhận, lý do ưu tiên, “Thông tin đã xác minh: Chưa xác minh”, “Chưa rõ / còn thiếu: Không có”, “Ai làm tiếp”, trạng thái. Nút: **Xác minh**, **Nhờ gia đình hỗ trợ**, **Từ chối**. **Chưa có** “Phân công”. |
| 10 | 🧑‍💼 | Nhập ghi chú “Đã gọi bác xác nhận”, bấm **Xác minh**. | Lịch sử: “Anh Nam xác minh yêu cầu: Đã gọi bác xác nhận”. “Thông tin đã xác minh: Anh Nam · HH:MM dd/mm · Đã gọi bác xác nhận” + danh sách trường. Trạng thái vẫn “Chờ điều phối”. Ai làm tiếp: “Nhân viên CAREBOX (phân công)”. Nút Xác minh biến mất; hiện ô chọn Care Partner + **Phân công**. Bộ đếm: Cần xác minh 2, **Chờ xử lý 1**. |
| 11 | 🧑‍💼 | Chọn “Chị Hoa”, bấm **Phân công**. | Trạng thái “Đang xử lý”. Lịch sử “Anh Nam giao cho Chị Hoa.”. Bộ đếm: Chờ xử lý 0, **Đang thực hiện 1**. Chưa có nút “Xác nhận hoàn tất”. |
| 12 | 👵 | Xem mục Yêu cầu. | CB-004 “Đang xử lý”, Phụ trách “Chị Hoa (đang thực hiện)”. |
| 13 | 🧑‍💼 | Bấm **Ghi nhận báo cáo** khi ô trống. | Nút bị khóa. |
| 14 | 🧑‍💼 | Nhập “Đã mua đủ, giao tận nhà”, bấm **Ghi nhận báo cáo**. | Badge “Chờ nhân viên xác nhận”. Trạng thái vẫn “Đang xử lý”. Kết quả: “Care Partner báo: Đã mua đủ, giao tận nhà”. Ai làm tiếp: “Nhân viên CAREBOX (xác nhận kết quả)”. Bộ đếm: Đang thực hiện 0, Chờ xử lý 1. Hiện nút **Xác nhận hoàn tất**. |
| 15 | 🧑‍💼 | Bấm **Xác nhận hoàn tất**. | “Hoàn tất”. CB-004 rời Bảng điều phối. Lịch sử “Anh Nam xác nhận hoàn tất.”. |
| 16 | 👩 | Thông báo + Báo cáo. | Thông báo “Đi chợ: nhân viên CAREBOX đã xác nhận hoàn tất.”. Báo cáo dịch vụ, CB-004: “Kết quả thực hiện: Đã hoàn tất theo báo cáo của Care Partner Chị Hoa.”, “Người xác nhận: Anh Nam (nhân viên điều phối)”, có **cả** “Thời điểm hoàn tất” và “Thời điểm xác nhận”. |
| 17 | 👵 | Yêu cầu → tab “Đã xong”. | CB-004 “Hoàn tất”, có dòng “Care Partner báo: Đã mua đủ, giao tận nhà”, không còn nút Hủy. |

**Không được xảy ra:** yêu cầu dịch vụ đến “Hoàn tất” khi chưa có báo cáo Care Partner **và** xác nhận của nhân viên. 👩 không có nút nào trên yêu cầu dịch vụ.

### D2. Bà hủy sau khi đã phân công Care Partner

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 🧑‍💼 | Mở CB-003 → **Xác minh** (bỏ trống ghi chú) → chọn “Anh Tuấn” → **Phân công**. | CB-003 “Đang xử lý”. Lịch sử “Anh Nam xác minh yêu cầu.” và “Anh Nam giao cho Anh Tuấn.”. |
| 2 | 👵 | Yêu cầu → thẻ CB-003 → **Hủy yêu cầu**. | CB-003 “Đã từ chối”, “Lý do từ chối: Người cao tuổi từ chối”. Lịch sử thêm “Người cao tuổi hủy/từ chối yêu cầu.” và “Đã báo hủy cho Care Partner Anh Tuấn.”. |
| 3 | 🧑‍💼 | Thông báo + bảng. | Thông báo “Đi chợ giúp bác: bác đã hủy yêu cầu.”. CB-003 rời bảng. |
| 4 | 👩 | Thông báo. | “Đi chợ giúp bác: bác đã từ chối dịch vụ. Không đặt lại nếu bác không yêu cầu.” |
| 5 | Cả 3 | Kiểm tra danh sách. | **Không** có yêu cầu mới nào được tự tạo/đặt lại. |

### D3. Nhân viên từ chối yêu cầu

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 🧑‍💼 | Mở CB-003. Ô “Lý do từ chối” để trống. | Nút **Từ chối** bị khóa. |
| 2 | 🧑‍💼 | Nhập “Không có Care Partner khu vực này”, bấm **Từ chối**. | CB-003 “Đã từ chối”, rời bảng. Lịch sử “Anh Nam từ chối: Không có Care Partner khu vực này”. |
| 3 | 👩 | Thông báo. | “Đi chợ giúp bác: nhân viên CAREBOX không thực hiện được. Lý do: Không có Care Partner khu vực này” |
| 4 | 👵 | Yêu cầu. | CB-003 “Đã từ chối”, “Lý do từ chối: Không có Care Partner khu vực này”. |
| 5 | 🧑‍💼 | Mở CB-001 (đang “Chờ bổ sung thông tin”). | Chỉ có **Nhờ gia đình hỗ trợ** và **Từ chối**. Không có Xác minh/Phân công. |

### D4. Nhân viên nhờ gia đình hỗ trợ (hỏi – trả lời)

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 🧑‍💼 | Mở CB-003, ô “Câu hỏi gửi Chị Minh” nhập “Mẹ thích trứng gà hay trứng vịt?”, bấm **Nhờ gia đình hỗ trợ**. | Ô hỏi biến mất (mỗi việc chỉ một câu hỏi mở). Thẻ “Nhờ gia đình hỗ trợ”: “Chị Minh được hỏi lúc …: Mẹ thích trứng gà hay trứng vịt?” + “Chưa có trả lời”. Lịch sử “Anh Nam nhờ Chị Minh hỗ trợ: …”. |
| 2 | 👩 | Thông báo, Tổng quan, Yêu cầu của mẹ. | Thông báo “CAREBOX nhờ hỗ trợ (CB-003): Mẹ thích trứng gà hay trứng vịt?”. Badge “Yêu cầu của mẹ” = 1. Tổng quan có thẻ “Cần chị xử lý” (“1 việc chờ chị trả lời, nhận hoặc xem”). CB-003 nằm ở mục **CAREBOX nhờ hỗ trợ**, có ô “Câu trả lời của chị” + **Gửi trả lời** (khóa khi trống). |
| 3 | 👩 | Nhập “Trứng gà ta”, bấm **Gửi trả lời**. | CB-003 chuyển xuống “Đang được CAREBOX xử lý”, hiện “CAREBOX hỏi: …” / “Chị trả lời: Trứng gà ta”. Badge về 0, thẻ “Cần chị xử lý” biến mất. |
| 4 | 🧑‍💼 | Thông báo + chi tiết CB-003. | Thông báo “Chị Minh trả lời (CB-003): Trứng gà ta”. Chi tiết: “Trả lời lúc …: Trứng gà ta”. Lịch sử “Chị Minh trả lời: Trứng gà ta” với nguồn “Gia đình xác nhận”. Ô hỏi xuất hiện lại để hỏi tiếp. |
| 5 | 🧑‍💼 | Lặp lại với cảnh báo EVT-001. | Như trên. Thông báo của 👩 thuộc tab “Sức khỏe”. |
| 6 | 🧑‍💼 | Mở một việc do gia đình phụ trách (xem D5) hoặc việc đã đóng. | **Không** có nút “Nhờ gia đình hỗ trợ”. |

### D5. Liên hệ người thân — gia đình phụ trách

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 👵 | Chat: “Bác muốn gọi cho con gái”. | AI: “Bác muốn CAREBOX hỗ trợ liên hệ người thân, đúng không ạ? Bác muốn liên hệ với ai ạ?”. |
| 2 | 👵 | “Chị Minh” → “Tối nay qua ăn cơm với mẹ” → “Đúng rồi”. | Câu hỏi thứ hai: “Bác muốn nhắn gì ạ?”. Sau khi xác nhận, AI nói: “Cháu đã chuyển lời nhắn cho Chị Minh. Yêu cầu chưa hoàn tất; bác xem tiến độ ở mục Yêu cầu ạ.”. CB-004 “Chờ gia đình nhận”, Phụ trách “Chị Minh (nhận việc)”. |
| 3 | 👩 | Thông báo + Yêu cầu của mẹ. | Thông báo “Liên hệ người thân: chờ Chị Minh nhận việc”. Badge +1. CB-004 ở mục **Việc của chị**, có **Đã liên hệ** và **Từ chối**. |
| 4 | 🧑‍💼 | Bảng + Thông báo + chi tiết. | CB-004 nằm **sau** các việc của nhân viên, gắn nhãn “Gia đình phụ trách (chỉ xem)”. Bộ đếm không đổi. **Không** có thông báo cho nhân viên. Chi tiết **không** có nút hành động. |
| 5 | 👩 | Bấm **Đã liên hệ**. | CB-004 “Hoàn tất”. Lịch sử “Chị Minh đã liên hệ.”. |
| 6 | 👩/🧑‍💼 | Báo cáo. | CB-004: “Kết quả thực hiện: Đã hoàn tất theo xác nhận của gia đình.”, “Người xác nhận: Chị Minh (con gái)”. |
| 7 | (biến thể) | Làm lại bước 1–3, rồi 👩 bấm **Từ chối**, nhập “Tối nay chị bận”, bấm **Xác nhận từ chối**. | “Đã từ chối”. 👵 thấy “Lý do từ chối: Tối nay chị bận”. Nút “Xác nhận từ chối” khóa khi lý do trống; nút “Thôi” đóng ô lý do. |

### D6. Lịch nhắc **không** phải thuốc — gia đình duyệt

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 👵 | Lịch trình → **Thêm lịch trình ＋**. | Mở chat. AI: “Bác muốn CAREBOX hỗ trợ thêm lịch nhắc, đúng không ạ? Bác muốn cháu nhắc việc gì ạ?”. |
| 2 | 👵 | “Đi dạo công viên” → “5 giờ chiều” → “Đúng rồi”. | AI: “Cháu đã gửi Chị Minh duyệt lịch nhắc. Lịch chỉ được thêm sau khi Chị Minh xác nhận, yêu cầu chưa hoàn tất ạ.”. Lịch trình **chưa** có lịch mới. |
| 3 | 👩 | Yêu cầu của mẹ → Việc của chị. | Có ô giờ + **Duyệt lịch nhắc** (khóa khi chưa chọn giờ) + **Từ chối**. |
| 4 | 🧑‍💼 | Mở CB-004. | “Gia đình phụ trách”, không có nút Duyệt. |
| 5 | 👩 | Chọn 17:00, bấm **Duyệt lịch nhắc**. | CB-004 “Hoàn tất”. Lịch sử “Chị Minh duyệt lịch nhắc lúc 17:00.”. |
| 6 | 👵 | Lịch trình. | Có lịch mới “17:00 Đi dạo công viên” (biểu tượng 🚶), ghi chú “Chị Minh duyệt từ yêu cầu CB-004”. Nếu 17:00 đã qua trong ngày thì lịch bắt đầu từ ngày mai. |

### D7. Lịch nhắc **thuốc** — chỉ nhân viên duyệt

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 👵 | Chat: “Nhắc bác uống thuốc huyết áp lúc 9h”. | AI **không** hỏi “nhắc việc gì” hay giờ, đọc lại ngay: “Cháu nhắc lại: Thêm lịch nhắc — Nội dung nhắc: Uống thuốc huyết áp; Thời gian nhắc: 9h. Bác xác nhận giúp cháu, đúng không ạ?”. |
| 1b | 👵 | “Đúng rồi”. | AI: “Cháu đã gửi nhân viên CAREBOX kiểm tra lịch nhắc thuốc. Lịch chỉ được thêm sau khi được duyệt, yêu cầu chưa hoàn tất ạ.”. CB-004 “Chờ điều phối”. |
| 2 | 👩 | Thông báo + Yêu cầu của mẹ. | Thông báo “Thêm lịch nhắc: đã chuyển nhân viên CAREBOX điều phối.”. CB-004 chỉ xem, **không** có nút Duyệt. |
| 3 | 🧑‍💼 | Bảng + chi tiết CB-004. | Thông báo “Thêm lịch nhắc: chờ điều phối”. Cần xác minh +1. Ai làm tiếp: “Nhân viên CAREBOX (duyệt / liên hệ)”. Có ô giờ + **Duyệt lịch nhắc**. **Không** có Phân công. |
| 4 | 🧑‍💼 | Chọn 21:00, bấm **Duyệt lịch nhắc**. | “Hoàn tất”. Lịch sử “Anh Nam duyệt lịch nhắc lúc 21:00.”. |
| 5 | 👵 | Lịch trình. | Lịch mới “21:00 Uống thuốc huyết áp” với biểu tượng 💊 (loại thuốc), ghi chú “Anh Nam duyệt từ yêu cầu CB-004”. |
| 6 | 👩 | Báo cáo. | CB-004: “Đã hoàn tất theo xác nhận của nhân viên điều phối.”, “Người xác nhận: Anh Nam (nhân viên điều phối)”. |

**Nội dung nhắc lấy từ câu đầu:**

| Bà nói | Kết quả mong đợi |
|---|---|
| Chip “Nhắc lịch uống nước” | AI: “Bác muốn CAREBOX nhắc uống nước, đúng không ạ? Cháu nhắc bác vào lúc nào ạ?”. **Không** hỏi “nhắc việc gì”. |
| “Nhắc lịch uống nước” → “Không” | Từ chối như E16. |
| “Nhắc bác với” / “Đặt lịch nhắc giúp bác” | Chưa rõ nhắc gì: AI hỏi “Bác muốn CAREBOX hỗ trợ thêm lịch nhắc, đúng không ạ? Bác muốn cháu nhắc việc gì ạ?”. |

**Phân loại lịch nhắc** (gõ câu nhắc trong chat → trả lời giờ → “Đúng rồi”). Kiểm tra ai phụ trách:

| Câu nhắc | Phụ trách đúng |
|---|---|
| “Nhắc bác đi dạo công viên” | 👩 Chị Minh |
| “Nhắc bác đi bệnh viện” | 👩 Chị Minh |
| “Nhắc bác ra tiệm cắt tóc” | 👩 Chị Minh |
| “Nhắc lịch uống nước” (chip gợi ý) | 👩 Chị Minh |
| “Nhắc bác uống thuốc bổ” | 🧑‍💼 Anh Nam |
| “Nhắc bác tiêm insulin” | 🧑‍💼 Anh Nam |
| “Nhắc bác uống 2 viên canxi” | 🧑‍💼 Anh Nam |

### D8. Gia đình không phản hồi sau 30 phút → chuyển nhân viên

Cần đợi thật **hơn 30 phút**. Giữ ít nhất một tab đang **hiện** để server chạy tick.

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 👵 | Làm D5 bước 1–2 (liên hệ người thân), **không** để 👩 xử lý. | CB-004 “Chờ gia đình nhận”. |
| 2 | — | Đợi > 30 phút kể từ lúc bà xác nhận. | CB-004 chuyển “Chờ điều phối”. Lịch sử “Gia đình chưa phản hồi sau 30 phút, chuyển nhân viên CAREBOX.”. Ưu tiên “Cần chú ý”, lý do “Bỏ ngỏ quá 30 phút”. |
| 3 | 🧑‍💼 | Thông báo + chi tiết. | Thông báo “Liên hệ người thân: Chị Minh chưa nhận việc sau 30 phút, chờ nhân viên xử lý.”. Nhãn “chỉ xem” biến mất. Có nút **Đã liên hệ**. Ai làm tiếp: “Nhân viên CAREBOX hoặc Chị Minh”. |
| 4 | 👩 | Yêu cầu của mẹ. | CB-004 vẫn ở “Việc của chị”, vẫn có **Đã liên hệ**, có badge “Bỏ ngỏ”. |
| 5 | 🧑‍💼 hoặc 👩 | Một bên bấm **Đã liên hệ**. | “Hoàn tất”. Nút ở bên còn lại biến mất trong ~3 giây. Nếu 🧑‍💼 bấm, Báo cáo ghi “Đã hoàn tất theo xác nhận của nhân viên điều phối.”. |

### D9. AI không hiểu 2 lần → nhân viên tiếp nhận

Hai câu dưới đây đi qua mô hình. Kết quả bước 1–2 chỉ đúng khi mô hình đánh dấu **cả hai** câu là chưa hiểu. Nếu mô hình trả lời bình thường (ví dụ tự hỏi lại bằng lời của nó), không có cảnh báo; thử lại sau ↺ hoặc dùng D10.

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 👵 | Chat: “Bác muốn nhờ làm cái việc hôm trước ấy.” | AI: “Cháu chưa hiểu ý bác. Bác nói lại ngắn gọn giúp cháu nhé. Hoặc bác bấm “Gặp nhân viên”.”. Chưa có cảnh báo. |
| 2 | 👵 | “Cái việc mà bác đã nói lần trước đó.” | AI: “Cháu đã chuyển cho nhân viên CAREBOX và báo Chị Minh. Nhân viên sẽ liên hệ lại với bác ạ.”. |
| 3 | 🧑‍💼 | Bảng + Thông báo + chi tiết. | Thẻ EVT-002 “AI chưa hiểu yêu cầu”, ưu tiên “Chưa chắc chắn”, lý do “AI không hiểu sau khi hỏi lại”. “Chưa rõ / còn thiếu” chứa **cả hai** câu của bà. Thông báo “EVT-002: AI chưa hiểu yêu cầu của bác, cần gọi lại.”. |
| 4 | 👩 | Thông báo + Yêu cầu của mẹ. | Thông báo “EVT-002: AI chưa hiểu yêu cầu của bác, đã chuyển nhân viên CAREBOX.”. Thẻ chỉ xem, Phụ trách “Nhân viên CAREBOX (xem và tiếp nhận)”, có dòng “Chưa rõ: …”, **không** có nút. |
| 5 | 🧑‍💼 | Bấm **Tôi xem việc này**. | “Đang xử lý”, lịch sử “Anh Nam tiếp nhận.”. Bộ đếm chuyển từ Cần xác minh sang Đang thực hiện. |
| 6 | 🧑‍💼 | Ghi chú trống → nút **Đã xử lý** khóa. Nhập “Đã gọi lại, bác muốn mua hoa quả”, bấm **Đã xử lý**. | “Đã xử lý”, rời bảng. Lịch sử “Đóng sự kiện: Đã gọi lại, bác muốn mua hoa quả”. |
| 7 | (biến thể) | Câu bước 1 → “Lịch hôm nay” → câu bước 2. | “Lịch hôm nay” khớp từ khóa nên chuỗi bị reset. Câu cuối chỉ hỏi lại, **không** tạo cảnh báo. |
| 8 | (biến thể) | “Cháu kể chuyện vui cho bác nghe đi” → “Kể tiếp đi cháu”. | Mô hình trả lời tự nhiên. Trò chuyện bình thường **không** bị tính là chưa hiểu, **không** tạo cảnh báo. |

### D10. Bà bấm “Gặp nhân viên”

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 👵 | Chat → nút **Gặp nhân viên**. | Tin của bà “Gặp nhân viên”. AI trả lời như D9 bước 2. |
| 2 | 🧑‍💼 | Chi tiết EVT-002. | “AI chưa hiểu yêu cầu”, Chưa chắc chắn, lý do “Người dùng chọn gặp nhân viên”, chưa rõ: “Người cao tuổi chọn gặp nhân viên”. |
| 3 | 👩 | Thông báo. | Như D9 bước 4. |

### D11. Khẩn cấp từ lời bà — gia đình tiếp nhận, nhân viên đóng

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 👵 | Chat: “Tôi bị đau ngực quá”. | **Ngay lập tức**, không hỏi xác nhận: overlay đỏ “Bác đừng lo, cháu đang tìm trợ giúp”, “Người dùng báo dấu hiệu khẩn cấp”, nút “📞 Gọi 115”, “Gọi Chị Minh (con gái)”, dòng “Đã thông báo Chị Minh và nhân viên CAREBOX. Thông báo tự động chưa có nghĩa là đã có người tiếp nhận.”, nút “Đóng”. Chat: “Cháu đang hướng dẫn gọi 115 và đã báo Chị Minh.”. |
| 2 | 👩 + 🧑‍💼 | Xem **mọi** màn hình (chuyển vài tab). | Thanh đỏ trên mọi tab: “🚨 Khẩn cấp EVT-002: Người dùng báo dấu hiệu khẩn cấp — chưa có người xác nhận tiếp nhận.” + nút **Xem**. Cả hai nhận **cùng lúc** thông báo “KHẨN CẤP: Người dùng báo dấu hiệu khẩn cấp. Đang hướng dẫn gọi 115. Cần xác nhận đã tiếp nhận tình huống.”. 🧑‍💼: EVT-002 đứng đầu bảng, “🚨 Khẩn cấp”. 👩: badge “Yêu cầu của mẹ” +1, Tổng quan có “Cần chị xử lý”. |
| 3 | 👵 | Bấm **📞 Gọi 115**. | Nút đổi thành “📞 Đang gọi 115 (mô phỏng)…”. Lịch sử EVT-002 có “Mô phỏng: đang gọi 115.”. |
| 3b | 👵 | Bấm **Gọi Chị Minh (con gái)**. | Nút đổi thành “📞 Đang gọi Chị Minh (mô phỏng)…”. Lịch sử EVT-002 có “Mô phỏng: đang gọi Chị Minh.”. |
| 4 | 👩 | Bấm **Xem** trên thanh đỏ. | Mở “Yêu cầu của mẹ”. Thẻ đỏ EVT-002 có nút **Tôi đã tiếp nhận**. |
| 5 | 👩 | Bấm **Tôi đã tiếp nhận**. | Thanh đỏ (👩 + 🧑‍💼) đổi thành “… — Chị Minh đã tiếp nhận, chưa đóng.”. Badge 👩 −1. Lịch sử “Chị Minh tiếp nhận.” (nguồn Gia đình). |
| 6 | 👵 | Xem overlay. | Dòng cuối đổi thành “✅ Chị Minh đã nhận được và đang xử lý.”. |
| 7 | 🧑‍💼 | Chi tiết EVT-002. | Không còn nút “Tôi đã tiếp nhận”. Ai làm tiếp: “Chị Minh”. Có ô ghi chú + **Đã xử lý**. |
| 8 | 👩 | Tìm nút đóng sự cố. | **Không** có. Gia đình chỉ tiếp nhận, không đóng được. |
| 9 | 🧑‍💼 | Nhập “Đã gọi 115, bác đã vào viện”, bấm **Đã xử lý**. | EVT-002 “Đã xử lý”. Thanh đỏ biến mất ở 👩/🧑‍💼, overlay biến mất ở 👵. |
| 10 | (biến thể) | Tạo khẩn cấp mới, 👵 bấm **Đóng** trên overlay. | Overlay chỉ ẩn trên máy bà. Thanh đỏ của 👩/🧑‍💼 vẫn ghi “chưa có người xác nhận tiếp nhận”. |

### D12. Khẩn cấp từ thiết bị té ngã — nhân viên tiếp nhận

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 👵 | Sức khỏe → mở “🧪 Thiết bị giả lập” → **🛡️ Báo té ngã**. | Overlay khẩn cấp “Thiết bị báo té ngã”. Thẻ thiết bị té ngã: “Tín hiệu té ngã lúc HH:MM”. |
| 2 | 🧑‍💼 | Thanh đỏ → **Xem**. | Mở chi tiết EVT-002, nguồn “Thiết bị (giả lập)”, chi tiết “Thiết bị phát hiện té ngã gửi tín hiệu. Chưa xác nhận mức độ chấn thương.”. Có **Tôi đã tiếp nhận**. **Không** có “Tôi xem việc này”. **Chưa** có “Đã xử lý”. |
| 3 | 🧑‍💼 | Bấm **Tôi đã tiếp nhận**. | Handler Anh Nam. Thanh đỏ: “Anh Nam đã tiếp nhận, chưa đóng.”. Overlay bà: “✅ Anh Nam đã nhận được và đang xử lý.”. Nút “Tôi đã tiếp nhận” của 👩 biến mất. |
| 4 | 🧑‍💼 | Đóng với ghi chú. | Như D11 bước 9. |

### D13. Yêu cầu đổi liều / thuốc — AI từ chối, chuyển nhân viên

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 👵 | Chat: “Cho bác tăng liều thuốc huyết áp”. | AI: “Cháu không thể thay đổi thuốc hay liều. Bác hỏi bác sĩ hoặc dược sĩ nhé; cháu đã báo nhân viên CAREBOX.”. |
| 2 | 🧑‍💼 | Bảng + Thông báo. | EVT-002 “Yêu cầu vượt phạm vi AI: thay đổi thuốc”, “Thông thường”, lý do “AI không được tự quyết định y tế”. Thông báo “Bác hỏi về thay đổi thuốc hoặc liều: “Cho bác tăng liều thuốc huyết áp”.”. |
| 3 | 👩 | Thông báo. | Cùng nội dung, thêm “ Đã chuyển nhân viên CAREBOX kiểm tra.”. Thẻ chỉ xem. |
| 4 | 👵 | Lịch trình. | Danh sách lịch **không** đổi. |
| 5 | (biến thể) | Chat “Bác muốn mua thuốc”, đến câu “Bác cần lấy loại thuốc nào ạ?” trả lời “Cho bác uống thêm 2 viên”. | Tạo sự kiện đổi liều như trên. Câu này **không** được lưu vào trường “Loại thuốc”. Chat thoát khỏi luồng hỏi. |

### D14. Bà báo vấn đề (hết thuốc, mệt…)

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 👵 | Chat: “Bác hết thuốc rồi”. | AI: “Cháu đã ghi nhận và báo nhân viên CAREBOX, Chị Minh. Nếu bác khó thở hay đau ngực, bác nói ngay để cháu hướng dẫn gọi 115 nhé.”. |
| 2 | 🧑‍💼 | Bảng + Thông báo. | EVT-002 tiêu đề “Bác hết thuốc rồi”, “Cần chú ý”, lý do “Người cao tuổi báo vấn đề”. Thông báo “Bác báo: “Bác hết thuốc rồi”.”. |
| 3 | 👩 | Thông báo. | Cùng nội dung + “ Đã chuyển nhân viên CAREBOX kiểm tra.”. |
| 4 | 🧑‍💼→👩→🧑‍💼 | Hỏi gia đình “Nhà còn thuốc dự phòng không?” → 👩 trả lời → 🧑‍💼 tiếp nhận và đóng. | Như D4 và D9 bước 5–6. |

### D15. Thiết bị vượt ngưỡng

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 👵 | Thiết bị giả lập → dòng Nhịp tim → **Vượt ngưỡng**. | Thẻ Nhịp tim: 128 bpm, badge “Cần chú ý”. |
| 2 | 🧑‍💼 | Bảng + chi tiết. | EVT-002 “Dữ liệu thiết bị vượt ngưỡng”, “Cần chú ý”, lý do “Thiết bị đo nhịp tim: vượt ngưỡng giả lập”. Chi tiết: “Dữ liệu giả lập vượt ngưỡng đã cấu hình. Chưa có kết luận y tế và chưa xác nhận nguyên nhân.”. Có thẻ “Các bước tiếp theo” (4 bước). Thông báo “Thiết bị đo nhịp tim: dữ liệu vượt ngưỡng đã cấu hình, chưa có kết luận y tế.”. |
| 3 | 👩 | Thông báo + Tổng quan. | Thông báo như trên + “ Đã chuyển nhân viên CAREBOX kiểm tra.” (tab Sức khỏe). Tile Thiết bị “… cần chú ý” tăng. Không có từ ngữ chẩn đoán. |
| 4 | 👵 | Bấm **Vượt ngưỡng** lần nữa. | Tạo thêm **một** sự kiện mới (mỗi lần đo một sự kiện). |
| 5 | 👵 | Bấm **Bình thường**. | Thẻ về 74 bpm, badge “Bình thường theo ngưỡng đã cấu hình”. Các sự kiện cũ **vẫn mở** cho đến khi nhân viên đóng. |

### D16. Dữ liệu đáng nghi

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 👵 | Đường huyết → **Đáng nghi**. | Thẻ 0.2 mmol/L, badge “Dữ liệu đáng nghi”. |
| 2 | 🧑‍💼 / 👩 | Bảng / Thông báo. | EVT-002 “Dữ liệu đáng nghi”, “Chưa chắc chắn”, lý do “Máy đo đường huyết: giá trị ngoài khoảng hợp lý”. Thông báo “Máy đo đường huyết: dữ liệu đáng nghi, cần kiểm tra nguồn.” (👩 có thêm hậu tố chuyển nhân viên). |

### D17. Mất kết nối thiết bị & chống trùng cảnh báo

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 👵 | SpO₂ → **Mất kết nối**. | Thẻ SpO₂: giá trị “—”, badge “⚠ Thiếu dữ liệu”, “Lần cuối: HH:MM”. Nút đổi thành **Kết nối lại**. |
| 2 | 🧑‍💼 | Bảng. | EVT-002 “Thiết bị mất kết nối: Máy đo SpO₂”, “Chưa chắc chắn”, lý do “Dữ liệu thiết bị bị gián đoạn”, chi tiết “Không đủ dữ liệu. Không kết luận người dùng an toàn.”. |
| 3 | 👩 | Tổng quan + Hồ sơ & thiết bị. | Tile “4/5 đang kết nối”, “1 thiếu dữ liệu”. Thông báo “Máy đo SpO₂ mất kết nối. Không đủ dữ liệu. Không kết luận người dùng an toàn. Đã chuyển nhân viên CAREBOX kiểm tra.”. |
| 4 | 👵 | Chat: “Chỉ số SpO2 của bác thế nào”. | Câu trả lời bắt đầu “Hiện thiếu dữ liệu mới từ Máy đo SpO₂.”, kèm lần đo gần nhất và “Cháu không đánh giá được tình trạng sức khỏe; bác có thể hỏi bác sĩ ạ.”. |
| 5 | 👵 | **Kết nối lại**, rồi **Mất kết nối** lần nữa. | **Không** tạo sự kiện mới, vì EVT-002 còn mở. Kết nối lại cũng **không** tự đóng EVT-002. |
| 6 | 🧑‍💼 → 👵 | Nhân viên tiếp nhận + đóng EVT-002. Bà Kết nối lại rồi Mất kết nối. | Lúc này mới tạo sự kiện mất kết nối **mới**. |

### D18. Lịch nhắc: đã nhận / nhắc lại / không thực hiện được / không xác nhận

Sau reset khoảng 3 phút, lịch “Uống thuốc theo đơn” đến giờ.

| ID | Thao tác của 👵 | Kết quả mong đợi |
|---|---|---|
| D18.1 | Trang chủ, thẻ “Đến giờ · HH:MM Uống thuốc theo đơn” → **Đã nhận**. | Thẻ biến mất. Lịch trình: “Đã nhận nhắc”. Không tạo cảnh báo. Báo cáo 👩 có dòng “Đã nhận nhắc” nghĩa là bác đã nhận lời nhắc, không phải đã thực hiện. |
| D18.2 | (reset) **Nhắc lại**. | Badge “Nhắc lại sau”. Thẻ ẩn và quay lại sau 10 phút. |
| D18.3 | (reset) **Không thực hiện được**. | 🧑‍💼: EVT-002 “Không thực hiện được: Uống thuốc theo đơn”, “Cần chú ý”, lý do “Liên quan lịch uống thuốc”. Thông báo (tab Khác) “Bác báo không thực hiện được: Uống thuốc theo đơn.”. 👩 nhận cùng nội dung + hậu tố chuyển nhân viên. |
| D18.4 | (reset) Không bấm gì, đợi ~33 phút (giữ một tab hiện). | Badge “Chưa có xác nhận”. EVT-002 “Chưa có xác nhận: Uống thuốc theo đơn”, “Chưa chắc chắn”, lý do “Người dùng không xác nhận”. Thông báo “Chưa có xác nhận sau lịch nhắc "Uống thuốc theo đơn". Không kết luận bác đã thực hiện.”. Chỉ tạo **một** lần. |

### D19. Yêu cầu dở dang (CB-001) & “Bỏ ngỏ”

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 🧑‍💼 | Mở CB-001. | “Chờ bổ sung thông tin”. “Chưa rõ / còn thiếu: Địa điểm lấy, Thời gian mong muốn”. Chỉ có Nhờ gia đình hỗ trợ / Từ chối. |
| 2 | — | Đợi ~10 phút sau reset (CB-001 tạo từ 20 phút trước). | CB-001 ưu tiên “Cần chú ý”, lý do “Bỏ ngỏ quá 30 phút”. 👩 thấy badge “Bỏ ngỏ” trên thẻ. Sau ~15 phút, CB-003 cũng vậy. |
| 3 | 👵 | Hủy CB-001. | “Đã từ chối”. 👩 nhận thông báo từ chối. 🧑‍💼 **không** nhận thông báo, vì yêu cầu chưa từng được xác nhận. |

### D20. Bà tiếp tục yêu cầu dở dang (CB-001)

| # | Vai trò | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | 👵 | (reset) Yêu cầu → thẻ CB-001. | Có 2 nút cách nhau: **Tiếp tục yêu cầu** và **Hủy yêu cầu**. CB-002 (Hoàn tất) và CB-003 (Chờ điều phối) **không** có nút Tiếp tục yêu cầu. |
| 2 | 👵 | Bấm **Tiếp tục yêu cầu**. | Mở chat. Bà “nói” “Tiếp tục yêu cầu hỗ trợ lấy thuốc”. AI hỏi “Bác muốn lấy thuốc ở đâu ạ?”. |
| 3 | 👵 | Trả lời “Hiệu thuốc đầu ngõ” → “Chiều nay”. | AI nhắc lại nội dung và hỏi xác nhận. CB-001 “Chờ xác nhận”. |
| 4 | 👵 | Không trả lời; bấm **Xóa hội thoại**, rồi vào Yêu cầu → CB-001 → **Tiếp tục yêu cầu**. | AI nhắc lại nội dung lần nữa, **không** hỏi lại các trường đã có. |
| 5 | 👵 | Trả lời “Đúng rồi”. | CB-001 “Chờ điều phối”. 🧑‍💼 nhận thông báo “Hỗ trợ lấy thuốc: chờ điều phối”; bộ đếm Cần xác minh +1. 👩 nhận thông báo đã chuyển nhân viên. |

---

## 5. Hội thoại & phân loại câu nói (👵 chat)

Mỗi dòng bắt đầu từ chat sạch, không đang ở giữa câu hỏi dịch vụ (bấm ↺ hoặc hoàn tất/hủy luồng cũ). Luật từ khóa chạy trước mô hình, nên các câu khớp từ khóa luôn cho kết quả như bảng. Câu ghi “(qua mô hình)” không khớp từ khóa: nội dung trả lời có thể khác, chỉ kiểm tra phần “Kết quả mong đợi”.

| ID | Bà nói | Kết quả mong đợi |
|---|---|---|
| E1 | “Tôi bị đau ngực quá” | Khẩn cấp (như D11). |
| E2 | “Bác khó thở” / “Bà bị méo miệng” / “Bác thấy yếu nửa người” / “Bác nói ngọng” / “Ông ấy mất ý thức” / “Bác bị ngã chảy máu” / “Bác nói khó lắm” / “Cứu bác với” | Mỗi câu đều kích hoạt khẩn cấp ngay. |
| E3 | “Nhà bác ở ngã tư Cầu Giấy” (qua mô hình) | **Không** khẩn cấp (ngã tư là giao lộ). Mô hình trả lời bình thường. |
| E4 | “Cháu nói khó nghe quá” (qua mô hình) | **Không** khẩn cấp. Mô hình trả lời bình thường. |
| E5 | “Bác uống thêm 2 viên được không” / “Bác muốn ngừng thuốc huyết áp” / “Bác muốn dừng thuốc” / “Kê đơn cho bác” / “Đổi thuốc khác cho bác” | Sự kiện đổi thuốc (như D13). |
| E6 | “Bác muốn uống thêm nước” / “Bác dùng thuốc rồi” (qua mô hình) | **Không** tạo sự kiện đổi thuốc. Mô hình trả lời bình thường. |
| E7 | “Bác muốn mua thuốc” | Bắt đầu “Mua thuốc”. |
| E8 | “Mua giúp bác ít gạo” / “Mua đồ ăn sáng mai” | Bắt đầu “Đi chợ”. |
| E9 | “Mua giúp bác hộp thuốc” | Bắt đầu “Mua thuốc” (không phải Đi chợ). |
| E10 | “Bác muốn đi khám bệnh” | Bắt đầu “Đi khám bệnh”. |
| E11 | “Nhờ dọn dẹp nhà giúp bác” | Bắt đầu “Hỗ trợ sinh hoạt”. |
| E12 | “Bác thấy mệt” / “Bác bị chóng mặt” | Sự kiện vấn đề (như D14), “Cần chú ý”. |
| E13 | “Lịch hôm nay” (chip) | “Lịch hôm nay của bác: HH:MM … (trạng thái); …”. |
| E14 | “Huyết áp của bác bao nhiêu” | “Lần đo gần nhất của Máy đo huyết áp: 165/100 mmHg lúc HH:MM (nguồn: thiết bị giả lập). Cháu không đánh giá được tình trạng sức khỏe; bác có thể hỏi bác sĩ ạ.” |
| E15 | “Yêu cầu của bác đến đâu rồi” | “Yêu cầu của bác: Hỗ trợ lấy thuốc — Chờ bổ sung thông tin, tiếp theo: Người cao tuổi (bổ sung thông tin); Đi chợ giúp bác — Chờ điều phối, tiếp theo: Nhân viên CAREBOX (xác minh).” |

**Trong luồng hỏi thông tin dịch vụ:**

| ID | Các bước | Kết quả mong đợi |
|---|---|---|
| E16 | “Bác muốn đi chợ” → “Không”. | Từ chối ở câu hỏi đầu: AI “Dạ, cháu ghi nhận bác không cần nữa. Khi nào cần bác cứ gọi cháu nhé.”. Yêu cầu “Đã từ chối”. **Không** lưu “Không” làm danh sách mua. |
| E17 | “Bác muốn đi chợ” → “Rau” → chip “Thôi”. | Từ chối như E16. |
| E18 | Đến bước đọc lại → chip “Không”. | Từ chối. |
| E19 | Đến bước đọc lại → “abc” → “xyz”. | Lần 1: “Cháu chưa hiểu ý bác. Bác trả lời “đúng rồi” hoặc “không” giúp cháu nhé. Hoặc bác bấm “Gặp nhân viên”.”. Lần 2: chuyển nhân viên (như D9). Yêu cầu vẫn “Chờ xác nhận” trên bảng. |
| E20 | “Bác muốn đi chợ” → chip “Không biết” → “Sáng mai” → “Đúng rồi”. | Câu đọc lại có “Danh sách cần mua: chưa rõ”. Chi tiết 🧑‍💼: “Chưa rõ / còn thiếu: Danh sách cần mua”. |
| E21 | “Bác muốn đi khám bệnh” → “Bệnh viện E” → “Hôm nay 3 giờ chiều”. | Ưu tiên “Cần chú ý”, lý do “Cần hỗ trợ đi khám trong ngày”. |
| E22 | Đi khám: … → câu “Bác có cần người đưa đi không, đi bằng gì ạ?” trả lời “Không, bác tự đi được”. | Lưu “Nhu cầu di chuyển: Không, bác tự đi được”, **không** từ chối. |
| E23 | Đi khám: ngay câu hỏi đầu “Bác đi khám ở đâu ạ?” trả lời “Không, bác tự đi được”. | **Không** từ chối; lưu làm “Nơi khám”. |
| E24 | Đi khám: câu hỏi di chuyển trả lời “Không cần người đưa đi”. | Lưu “Nhu cầu di chuyển: Không cần người đưa đi”, **không** từ chối. |
| E25 | “Bác muốn đi chợ” → “Bác bị khó thở”. | Khẩn cấp ngay. Yêu cầu đi chợ vẫn “Chờ bổ sung thông tin” trên bảng. Chat thoát luồng hỏi. |
| E26 | Ở giữa luồng: 👵 vào Yêu cầu, **Hủy yêu cầu** đó, quay lại chat gõ “Lịch hôm nay”. | Câu hỏi cũ bị bỏ; AI trả lời lịch hôm nay. |

## 6. Thông báo

| ID | Các bước | Kết quả mong đợi |
|---|---|---|
| F1 | 👩 có badge Thông báo > 0, mở tab Thông báo. | Badge về 0. Các tin chưa đọc vẫn được tô đậm cho đến khi rời màn hình. |
| F2 | Tạo cảnh báo mới (D15), 🧑‍💼 mở Thông báo. | Badge 🧑‍💼 về 0. Badge 👩 **không** đổi (mỗi vai trò đọc riêng). |
| F3 | Chuyển tab Tất cả / Yêu cầu / Sức khỏe / Khác. | Lọc đúng loại: yêu cầu dịch vụ → Yêu cầu; thiết bị, đổi thuốc, khẩn cấp → Sức khỏe; AI chưa hiểu, lịch nhắc → Khác. |
| F4 | So sánh nội dung thông báo cùng sự kiện giữa 👩 và 🧑‍💼. | Bản của 👩 nói rõ “đã chuyển nhân viên CAREBOX”. Bản của 🧑‍💼 nói việc cần làm. |
| F5 | Cuối màn hình. | `“Đã gửi thông báo” không có nghĩa là đã có người đọc hoặc đã xử lý.` |
| F6 | 👵 | Không có màn hình thông báo. |

## 7. Báo cáo, Hồ sơ, Tổng quan

| ID | Các bước | Kết quả mong đợi |
|---|---|---|
| G1 | 👩 / 🧑‍💼 → Báo cáo sau reset. | “Tóm tắt yêu cầu” có số tiếp nhận hôm nay / hoàn tất / đang mở. “Lịch hôm nay”, “Cảnh báo cần chú ý”, “Báo cáo dịch vụ” (CB-002), “Kết nối dữ liệu” đủ 5 thiết bị. Hai vai trò thấy cùng nội dung. |
| G2 | Báo cáo dịch vụ CB-002. | “Đã hoàn tất theo báo cáo của Care Partner Anh Tuấn.”, “Người xác nhận: Anh Nam (nhân viên điều phối)”, “Thời điểm hoàn tất” ≠ “Thời điểm xác nhận”. |
| G3 | Hồ sơ & thiết bị. | Thông tin bà (72 tuổi, 12/03/1954, 0987 654 321), người liên hệ “Con gái – Chị Minh · 0901 234 567”, danh sách thiết bị + badge. Dòng “Chỉ hiển thị dữ liệu bác đã đồng ý chia sẻ với gia đình.” |
| G4 | 👩 Tổng quan → “Hoạt động gần đây”. | 5 dòng lịch sử mới nhất, có nguồn (Thiết bị / Người cao tuổi báo / Gia đình xác nhận / AI tổng hợp / Nhân viên xác minh). |
| G5 | 👩 bấm các tile Tổng quan. | Thiết bị → Hồ sơ & thiết bị; Lịch trình, Báo cáo → Báo cáo; Yêu cầu hỗ trợ → Yêu cầu của mẹ. |

## 8. Trợ lý AI (câu không khớp từ khóa)

Chi tiết xem `docs/ai-escalation-ui-tests.md`. Kết quả phụ thuộc mô hình, có thể khác giữa các lần. Trường hợp AI chưa hiểu 2 lần xem D9.

| ID | Bà nói | Kết quả mong đợi |
|---|---|---|
| I1 | “Cháu kể chuyện vui cho bác nghe đi” → “Kể tiếp đi cháu” | Trả lời tự nhiên. **Không** tạo cảnh báo “AI chưa hiểu”. |
| I2 | “Bác muốn có người đến dọn nhà” (không trùng từ khóa) | Có thể bắt đầu luồng “Hỗ trợ sinh hoạt” như khi dùng nút. |
| I3 | “Bác thấy tim đập loạn, sắp xỉu” | Có thể kích hoạt khẩn cấp qua mô hình. |
| I4 | Các câu ở E1, E2, E5 | Vẫn đi theo luật từ khóa (khẩn cấp / đổi thuốc), **không** qua mô hình. Kết quả ngay, không chờ “Đang trả lời…” lâu. |
| I5 | Đang ở giữa luồng hỏi dịch vụ, trả lời câu hỏi | Không gọi mô hình; luồng hỏi chạy như mục 5. |
| I6 | “Cháu có biết làm thơ không?” | Chỉ hiện câu trả lời, **không** hiện JSON `{"status":…}`. |

## 9. Giao diện & thiết bị

| ID | Các bước | Kết quả mong đợi |
|---|---|---|
| J1 | Cửa sổ rộng < 900px (hoặc điện thoại). | Tab ở đáy màn hình. 👵 có 5 tab (không có “Trợ lý”; mở trợ lý bằng mic Trang chủ). |
| J2 | Cửa sổ ≥ 900px. | Thanh tab chuyển sang sidebar. 👵 có thêm tab “Trợ lý”. |
| J3 | 👵 chat bấm mic 🎙️ nhỏ (Chrome, cho phép micro), nói “Lịch hôm nay”. | Câu nói được gửi và trả lời như E13. Trình duyệt không hỗ trợ: con trỏ chuyển vào ô nhập. |
| J4 | Đang “Đang trả lời…”. | Nút Gửi, chip, mic, “Gặp nhân viên” đều bị khóa. Không gửi trùng tin. |
| J5 | 🧑‍💼 mở chi tiết một việc, bấm “‹ Bảng điều phối”. | Quay về bảng. Tab “Bảng điều phối” vẫn sáng khi đang xem chi tiết. |

## 10. Kiểm tra cần chờ thời gian thật

Giữ ít nhất một tab đang hiện: server chỉ “tick” khi có client hỏi trạng thái.

| ID | Mốc thời gian | Kết quả mong đợi |
|---|---|---|
| K1 | 3 phút sau reset | “Uống thuốc theo đơn” đến giờ (D18). |
| K2 | ~10 / ~15 phút sau reset | CB-001 / CB-003 “Bỏ ngỏ” (D19). |
| K3 | 30 phút sau khi bà xác nhận việc của gia đình | Chuyển nhân viên (D8). |
| K4 | 33 phút sau reset, không phản hồi lịch nhắc | “Chưa có xác nhận” (D18.4). |
| K5 | ~5 giờ sau reset (mốc 6 giờ kể từ lần đo cuối; Huyết áp ~6 giờ) | Nhịp tim / Đường huyết / SpO₂ (rồi Huyết áp) thành “⚠ Thiếu dữ liệu”. Mỗi thiết bị **một** sự kiện “Thiếu dữ liệu: <tên thiết bị>”, không tạo lặp lại mỗi lần poll. |
| K6 | Qua 0:00 (giờ Việt Nam) | Lịch hằng ngày chuyển sang hôm nay, trạng thái làm mới. Lịch một lần (“Uống thuốc theo đơn”) bị bỏ. |
