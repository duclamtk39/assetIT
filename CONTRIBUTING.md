# Contributing

1. Tạo branch từ `develop`; không commit trực tiếp lên `main`.
2. Không commit `.env`, secret, database dump, file upload hoặc dữ liệu cá nhân.
3. Chạy `npm ci` và `npm run verify` trước khi push.
4. Thay đổi schema phải kèm migration, mô tả tương thích và kế hoạch rollback/backup.
5. Pull request cần mô tả phạm vi, cách kiểm thử và ảnh chụp nếu thay đổi UI.

## Kiểm thử

- `npm run verify` chạy lint, kiểm tra định dạng, build, unit test và audit phụ thuộc.
- `npm run lint:fix` và `npm run format` sửa tự động phần lớn vi phạm.
- `npm run test:integration:docker` dựng một PostgreSQL dùng-một-lần bằng Docker, chạy migration rồi
  chạy integration test của API trên đó. Cần Docker đang chạy; container luôn được xóa sau khi kết thúc.
- Nếu đã có sẵn database thử nghiệm, đặt `DATABASE_URL` rồi chạy `npm run test:integration`.
  Tài khoản kết nối phải có quyền `TRUNCATE` vì mỗi lượt chạy sẽ xóa sạch dữ liệu nghiệp vụ.
  Tuyệt đối không trỏ vào database có dữ liệu thật.

## Dữ liệu demo

`npm run db:seed:docker` nạp dữ liệu demo vào stack Docker đang chạy (tự dựng và xóa một
forwarder tạm vì PostgreSQL nằm trên mạng `internal`, không mở cổng ra host). Nếu đã có sẵn
`DATABASE_URL` thì dùng `ASSETFLOW_DEMO_SEED=true npm run db:seed`.

Seed ghi dữ liệu qua chính các service nghiệp vụ nên mọi bản ghi đều có lịch sử, audit log và
chuyển trạng thái đúng như khi thao tác trên giao diện. Seed chỉ chạy khi database chưa có tài
sản mã `DEMO-`; muốn tạo lại thì `docker compose ... down -v` rồi `up -d`.

Lint hiện còn cảnh báo (`any` và các rule react-hooks mới). Cảnh báo không chặn CI nhưng là hàng đợi
nợ kỹ thuật; không thêm cảnh báo mới khi sửa code.

Commit nên nhỏ, có mục đích rõ ràng và không trộn refactor không liên quan. Lỗ hổng bảo mật phải gửi theo [SECURITY.md](SECURITY.md), không tạo public issue.
