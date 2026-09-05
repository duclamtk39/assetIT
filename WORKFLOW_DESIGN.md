# Thiết kế luồng nghiệp vụ quản lý tài sản

Tài liệu này cụ thể hóa `ASSET_MANAGEMENT_SPEC.md`, tham khảo cách tổ chức nghiệp vụ của ManageEngine AssetExplorer nhưng được tinh giản cho nhu cầu quản lý cấp phát nội bộ.

## 1. Nguyên tắc thiết kế

- Mỗi tài sản có một hồ sơ duy nhất: mã/barcode, serial, trạng thái, vị trí và người sử dụng hiện tại.
- Phân biệt tuyệt đối `status` và `transaction`: trạng thái là kết quả hiện tại, transaction là nghiệp vụ tạo ra thay đổi.
- `assets.current_user/current_location/current_status` chỉ là snapshot đọc nhanh; Assignment/Return/Transfer/Maintenance mới là nguồn sự thật nghiệp vụ.
- Mọi thay đổi về người giữ, vị trí và trạng thái phải sinh nhật ký, không sửa lịch sử cũ.
- Barcode/QR là điểm bắt đầu chung cho nhập kho, cấp phát, thu hồi, điều chuyển và kiểm kê.
- Một tài sản chỉ có một người hoặc một kho/phòng chịu trách nhiệm tại một thời điểm.
- Phiếu bàn giao lưu tình trạng thiết bị, người thực hiện, thời gian và ngày dự kiến trả.
- Chứng từ, snapshot asset, asset history và audit log phải được ghi trong cùng database transaction.
- `DISPOSED` là terminal state, không được quay lại vòng cấp phát.

## 2. Mô hình trạng thái

```text
PENDING_RECEIPT ──RECEIVE──► READY
                               ├──ASSIGN──► IN_USE ──RETURN──┐
                               └──LOAN────► ON_LOAN ─RETURN──┤
                                                            ▼
                                                        RETURNED
                                                   ┌────────┼────────┐
                                                   ▼        ▼        ▼
                                                 READY  MAINTENANCE BROKEN
                                                           │        │
                                                           ├─READY  └─DISPOSE
                                                           └─BROKEN      ▼
                                                                     DISPOSED
```

`OVERDUE` và `DUE_SOON` là nhãn tính toán từ loan đang mở, không phải lifecycle status.

### 2.1 Ma trận transition

| Nghiệp vụ | From | To |
|---|---|---|
| Nhập kho | `PENDING_RECEIPT` | `READY` |
| Cấp phát | `READY` | `IN_USE` |
| Cho mượn | `READY` | `ON_LOAN` |
| Thu hồi | `IN_USE`, `ON_LOAN` | `RETURNED` |
| Trả về kho | `RETURNED` | `READY` |
| Mở bảo trì | `READY`, `RETURNED`, `BROKEN` | `MAINTENANCE` |
| Hoàn tất bảo trì | `MAINTENANCE` | `READY`, `BROKEN`, `DISPOSED` |
| Thanh lý | `BROKEN` | `DISPOSED` |
| Điều chuyển/kiểm kê | Giữ nguyên | Giữ nguyên |

## 3. Luồng nhập kho

1. Chọn đơn mua hàng hoặc nhập không qua PO.
2. Quét barcode/QR của từng thiết bị; hệ thống kiểm tra trùng mã và serial.
3. Bổ sung loại tài sản, model, nhà cung cấp, bảo hành và vị trí kho.
4. Xác nhận số lượng/tình trạng thực nhận.
5. Tạo hồ sơ tài sản ở trạng thái `Sẵn sàng` và ghi giao dịch `Nhập kho`.
6. In tem nội bộ nếu thiết bị chưa có mã phù hợp.

## 4. Luồng cấp phát / cho mượn

1. Quét mã hoặc tìm tài sản đang ở trạng thái `Sẵn sàng`.
2. Chọn người nhận, phòng ban và vị trí sử dụng.
3. Ghi tình trạng bàn giao và ngày dự kiến trả nếu là tài sản mượn.
4. Xác nhận bàn giao; phiên bản sau hỗ trợ người nhận ký/xác nhận qua email.
5. Tạo Assignment `OPEN`, cập nhật snapshot sang `IN_USE` hoặc `ON_LOAN` và append history trong cùng transaction.

## 5. Luồng thu hồi

1. Quét tài sản hoặc mở hồ sơ từ danh sách người dùng.
2. Hệ thống hiển thị người đang chịu trách nhiệm để đối chiếu.
3. Chọn kho/vị trí nhận lại và đánh giá tình trạng.
4. Tạo Return, đóng đúng Assignment đang mở và chuyển tạm sang `RETURNED` để kiểm tra.
5. Sau kiểm tra: về `READY`, mở Maintenance hoặc chuyển `BROKEN`; cập nhật snapshot và append history cùng transaction.

## 6. Luồng điều chuyển

1. Chọn tài sản và site/location/warehouse nguồn, đích.
2. Ghi lý do, tình trạng và người phê duyệt nếu cần.
3. Sau xác nhận, cập nhật vị trí và ghi lịch sử `Điều chuyển`; không tự thay đổi người đang sử dụng hoặc đóng Assignment.
4. Muốn giao cho người khác phải thực hiện Thu hồi → READY → Cấp phát mới.
5. Chỉ điều chuyển được vào kho khi tài sản không có người giữ. Tài sản đang sử dụng hoặc đang mượn
   phải đi qua phiếu Thu hồi, vì chỉ phiếu thu hồi mới đóng Assignment và ghi nhận tình trạng khi nhận lại.
   Đổi vị trí (không kèm kho) cho tài sản đang sử dụng vẫn hợp lệ, ví dụ khi nhân viên đổi chỗ ngồi.

## 7. Luồng kiểm kê bằng barcode/QR

1. Tạo đợt kiểm kê theo kho, phòng ban hoặc địa điểm.
2. Chụp dữ liệu kỳ vọng tại thời điểm bắt đầu kiểm kê.
3. Nhân viên quét liên tục bằng camera hoặc máy quét USB.
4. Phân loại kết quả: `Khớp`, `Sai vị trí`, `Sai người giữ`, `Không tìm thấy`, `Ngoài danh sách`.
5. Người quản lý duyệt điều chỉnh; việc sửa dữ liệu tạo giao dịch riêng.

## 8. Hồ sơ tài sản

- Tổng quan: trạng thái, vị trí, người sử dụng, hạn trả và tình trạng bàn giao.
- Nhận dạng: mã tài sản, barcode/QR, serial, loại, model.
- Mua sắm: PO, nhà cung cấp, ngày mua, nguyên giá và bảo hành.
- Lịch sử: dòng thời gian bất biến của nhập kho, cấp phát, thu hồi, điều chuyển, bảo trì và thanh lý.
- Tài liệu: biên bản bàn giao, hóa đơn, ảnh và chứng từ.

## 9. Quy tắc kiểm soát

- Không cấp phát tài sản đang `Bảo trì`, `Hỏng` hoặc đã `Thanh lý`.
- Chỉ `READY` được cấp phát/cho mượn; `IN_USE` và `ON_LOAN` không được cấp tiếp.
- Mỗi asset chỉ có tối đa một Assignment `OPEN` và một Maintenance record mở.
- Không cho phép barcode, mã tài sản hoặc serial bị trùng.
- Thu hồi chỉ hợp lệ khi tài sản đang có người sử dụng.
- Điều chuyển không mặc định thay đổi người sử dụng.
- Tài sản đang có người giữ không được điều chuyển thẳng vào kho. Ràng buộc được chốt ở ba tầng:
  luật nghiệp vụ `assertTransferAllowed`, kiểm tra trong service, và CHECK constraint
  `assets_custody_excludes_warehouse` trong database.
- Bất biến nền: một tài sản hoặc nằm trong kho, hoặc nằm trong tay một người, không bao giờ cả hai.
  Trạng thái `IN_USE`/`ON_LOAN` luôn đi kèm người giữ; `READY` luôn thuộc về một kho.
- `DISPOSED` không được quay lại `READY` hoặc tham gia nghiệp vụ mới.
- Mọi thao tác phải lưu người thực hiện và thời gian theo hệ thống.
- Tài sản quá ngày dự kiến trả được đánh dấu quá hạn và gửi cảnh báo.

## 10. Phạm vi triển khai

### Đã có trong prototype

- Sổ tài sản và hồ sơ chi tiết.
- Theo dõi người giữ, phòng ban, vị trí và trạng thái.
- Cấp phát, thu hồi, điều chuyển và lịch sử giao dịch.
- Tình trạng bàn giao và ngày dự kiến trả.
- In Code 128; quét camera, máy quét USB hoặc nhập mã.

### Backend foundation đã có

- PostgreSQL/Prisma, local authentication, session cookie, RBAC cơ bản và department scope.
- Transaction riêng cho cấp phát/cho mượn, thu hồi, điều chuyển và bảo trì.
- Snapshot tài sản, history và audit được ghi cùng database transaction.
- Partial unique index khóa một Assignment mở và một Maintenance mở trên mỗi tài sản.
- Microsoft 365/Entra ID và LDAP synchronization chạy qua backend.

### Còn lại trước v1.0

- Hoàn tất kết nối mọi frontend write flow sang API; loại bỏ local state ngoài demo mode.
- Nhập kho theo PO, import staging và quét nhiều thiết bị liên tục.
- Đợt kiểm kê, đối soát và duyệt chênh lệch.
- Ký nhận, email outbox/worker, file biên bản và attachment checksum.

## Nguồn tham khảo

- https://www.manageengine.com/products/asset-explorer/
- https://www.manageengine.com/products/asset-explorer/asset-inventory-management.html
- https://www.manageengine.com/products/asset-explorer/track-it-assets.html
- https://www.manageengine.com/products/asset-explorer/po-and-contracts.html
- https://www.manageengine.com/products/asset-explorer/mobile-app.html
