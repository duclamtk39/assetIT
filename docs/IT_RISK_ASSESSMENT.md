# Đánh giá rủi ro CNTT AssetFlow

Phân hệ này quản lý rủi ro CNTT theo quy trình của ISO/IEC 27005:2022, với các mốc phê duyệt lấy theo ISO/IEC 27001:2022 và cách mô tả kịch bản theo NIST SP 800-30 Rev.1. Đây là thiết kế tham chiếu, không phải tuyên bố tổ chức đã được chứng nhận ISO.

## Quy trình

```text
Thiết lập bối cảnh  ->  Nhận diện  ->  Phân tích  ->  Định giá
   (27005 §5)          (§7.2)         (§7.3)        (§7.4)
                                                       |
                          Theo dõi, rà soát  <-  Chấp nhận rủi ro còn lại  <-  Xử lý
                              (§10)                 (27001 §8.3)               (§8)
```

Mỗi bước tương ứng một trạng thái có thật của hồ sơ rủi ro, không phải mô tả trang trí. Thanh quy trình trên giao diện hiển thị số hồ sơ đang nằm ở từng bước và bấm vào sẽ lọc đúng tập hồ sơ đó.

## Tiêu chí rủi ro

ISO/IEC 27001:2022 §6.1.2(a) yêu cầu tổ chức phải định nghĩa và lưu giữ tiêu chí đánh giá rủi ro, gồm cả tiêu chí chấp nhận rủi ro. Trong AssetFlow các tiêu chí này nằm ở một nơi duy nhất: [`apps/api/src/modules/risks/risk-criteria.ts`](../apps/api/src/modules/risks/risk-criteria.ts).

Máy chủ vừa dùng chúng để chấm điểm, vừa phục vụ nguyên văn qua `GET /api/v1/risk-assessments/criteria`. Giao diện không tự quyết định ngưỡng nào; nó hiển thị lại đúng thứ máy chủ trả về. Nhờ vậy điều một auditor đọc trên màn hình luôn là điều API đã dùng để tính.

Tiêu chí gồm bốn phần:

- **Thang xác suất 1–5** — diễn đạt bằng tần suất dự kiến (trên 5 năm một lần … hằng tháng trở lên), không bằng cảm tính.
- **Thang ảnh hưởng 1–5** — chấm trên năm khía cạnh: tài chính, gián đoạn dịch vụ, dữ liệu, tuân thủ pháp lý và uy tín. Một kịch bản lấy mức cao nhất mà nó chạm tới ở bất kỳ khía cạnh nào; không lấy trung bình, vì một hậu quả thảm khốc không được triệt tiêu bởi việc nó vô hại ở các khía cạnh còn lại.
- **Ma trận 5 × 5** — mức rủi ro được **gán theo từng ô**, theo ISO/IEC 27005 Annex A.
- **Tiêu chí chấp nhận** — với mỗi mức: có bắt buộc xử lý không, có được phép chấp nhận không, ai đủ thẩm quyền phê duyệt và chu kỳ rà soát.

### Vì sao không nhân xác suất với ảnh hưởng

Cách tính bằng tích số không phân biệt được `1×5` với `5×1`: cả hai đều bằng 5, trong khi một thảm họa hiếm gặp và một phiền toái thường xuyên đòi hỏi quyết định hoàn toàn khác nhau. Ma trận hiện tại được cố ý nghiêng về phía ảnh hưởng:

- Không có gì mang hậu quả thảm khốc bị xếp dưới mức **Cao**, kể cả khi hiếm.
- Không có gì mang hậu quả không đáng kể chạm tới mức **Nghiêm trọng**, kể cả khi xảy ra liên tục.
- Mức không bao giờ giảm khi một trong hai trục tăng lên.

Điểm số `xác suất × ảnh hưởng` vẫn được lưu và dùng để sắp xếp, báo cáo; nhưng **mức** rủi ro lấy từ ma trận.

## Phê duyệt và phân tách trách nhiệm

- Đợt đánh giá đi theo `DRAFT → IN_REVIEW → APPROVED`, và chỉ đóng được từ `APPROVED`, `TREATMENT` hoặc `MONITORING`.
- Chấp nhận rủi ro còn lại (`ACCEPT_RESIDUAL`) yêu cầu đồng thời: đã chấm điểm rủi ro còn lại, đã ghi lý do chấp nhận, và mức còn lại phải là mức mà tiêu chí cho phép chấp nhận. Rủi ro còn lại ở mức **Nghiêm trọng** không được chấp nhận trong bất kỳ trường hợp nào — phải hạ xuống Cao trở xuống trước.
- Chủ sở hữu rủi ro không được tự chấp nhận rủi ro của chính mình; chỉ tài khoản Admin khác mới ký được.
- Mọi quyết định đều kèm ghi chú bắt buộc và sinh một dòng audit log.

Các ràng buộc này được thi hành ở API, không phải ở giao diện. Giao diện chỉ vô hiệu hóa trước những nút chắc chắn sẽ bị từ chối.

## Ma trận vốn có và ma trận còn lại

Hai lưới trả lời hai câu hỏi khác nhau: rủi ro sẽ ra sao nếu không có kiểm soát, và còn lại bao nhiêu sau khi đã áp dụng. Giao diện cho chuyển qua lại giữa hai lưới, và khi bấm vào một ô thì bộ lọc đọc đúng cặp cột mà lưới đó được dựng lên — nếu không, ô sẽ đếm một tập và trả về một tập khác.

Hồ sơ chưa chấm điểm rủi ro còn lại sẽ không xuất hiện trong lưới "còn lại"; số lượng này được báo ngay dưới lưới để không bị hiểu nhầm là đã xử lý xong.

## Khi sửa tiêu chí

Sửa `risk-criteria.ts` là sửa hệ thống quản lý an toàn thông tin, không phải sửa cấu hình hiển thị:

- Mức của các hồ sơ đã lưu **không** tự tính lại; cột `inherentLevel` và `residualLevel` giữ giá trị tại thời điểm chấm.
- Phải rà soát và phê duyệt lại các đợt đánh giá đang mở sau khi đổi tiêu chí.
- Ghi lại lý do thay đổi để phục vụ đánh giá nội bộ theo ISO/IEC 27001 §9.2.

## Phần chưa có

Bản hiện tại chưa có Statement of Applicability và danh mục 93 kiểm soát của ISO/IEC 27001:2022 Annex A. Trường `controlCode` và `framework` trong biện pháp kiểm soát vẫn là văn bản tự do. Tổ chức muốn dùng cho mục đích chứng nhận cần bổ sung phần này.
