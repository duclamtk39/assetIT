# AssetFlow production stack

Cấu hình này chạy Caddy, Web, API, Netmon và PostgreSQL trên mạng Docker tách biệt. Chỉ Caddy mở cổng 80/443. API dùng tài khoản database runtime không có quyền DDL; container `migrate` dùng tài khoản owner riêng và thoát sau khi migration thành công. Tài khoản bootstrap PostgreSQL chỉ dùng để khởi tạo/khôi phục và không được cấp cho API.

## Các image

| Service  | Image                 | Vai trò |
| -------- | --------------------- | ------- |
| `web`    | `assetflow-frontend`  | Nginx phục vụ SPA và proxy `/api` sang API |
| `api`    | `assetflow-backend`   | HTTP API, nghiệp vụ tài sản |
| `migrate`| `assetflow-backend`   | Chạy Prisma migration rồi thoát |
| `netmon` | `assetflow-netmon`    | Giám sát mạng: quét dải, ping/TCP, sinh cảnh báo |

`netmon` là image riêng chứ không phải backend bật cờ. Nó không mở cổng nào, không nạp các module nghiệp vụ, và chỉ khởi động `PollerModule` (database + netmon). Nó **không** chạy migration — schema do container `migrate` sở hữu, hai container cùng migrate là cách một lần deploy tự phá dữ liệu.

Netmon chỉ dò những dải mạng mà Admin đã khai trong **Cài đặt → Dải mạng** và đang bật; không khai dải nào thì nó không gửi gói tin nào ra mạng. ICMP dùng socket datagram không đặc quyền nên container giữ nguyên `cap_drop: ALL` và `read_only: true`. Vì không có cổng để healthcheck, liveness đọc tuổi file nhịp tim `/tmp/netmon.heartbeat` mà vòng lặp ghi sau mỗi lượt chạy xong.

Nếu cần đọc được địa chỉ MAC của thiết bị, container phải nằm cùng lớp mạng 2 với thiết bị đó; qua bridge NAT của Docker thì bảng ARP không có bản ghi và hệ thống khớp tài sản theo IP.


## Cài mới

```bash
cd infra/docker/production
cp .env.example .env
mkdir -p secrets
chmod 700 secrets
openssl rand -hex 32 > secrets/postgres_bootstrap_password.txt
openssl rand -hex 32 > secrets/postgres_migration_password.txt
openssl rand -hex 32 > secrets/postgres_runtime_password.txt
openssl rand -base64 32 > secrets/data_encryption_key.txt
openssl rand -hex 32 > secrets/metrics_token.txt
openssl rand -base64 24 > secrets/initial_admin_password.txt
chmod 644 secrets/*.txt
```

Với UAT chỉ truy cập trong LAN bằng IP, cấu hình:

```env
APP_DOMAIN=http://192.168.50.15
APP_URL=http://192.168.50.15
COOKIE_SECURE=false
```

Khi có domain và HTTPS, đổi `APP_DOMAIN`, `APP_URL` sang domain thật và đặt `COOKIE_SECURE=true`. Sau đó:

```bash
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
curl -fsS http://192.168.50.15/api/v1/health/ready
```

Đăng nhập bằng `admin` và mật khẩu trong `initial_admin_password.txt`; hệ thống bắt buộc đổi mật khẩu lần đầu. Thư mục `secrets` có mode `700`; file bên trong có mode `644` để Compose mount cho API non-root đọc được nhưng người dùng khác trên host không thể truy cập qua thư mục. Không commit `.env`, `secrets/` hoặc backup.

Server đã khởi tạo bằng bản cũ cần chạy một lần `chmod 700 secrets && chmod 644 secrets/*.txt` để sửa lỗi container non-root không đọc được file-backed secrets.

## Monitoring và cảnh báo

```bash
docker compose --profile monitoring up -d
ssh -L 9090:127.0.0.1:9090 -L 9093:127.0.0.1:9093 user@server
```

Prometheus và Alertmanager chỉ bind localhost. Trước go-live phải cấu hình receiver email/Slack/webhook đã được phê duyệt trong `infra/monitoring/alertmanager.yml`; mặc định cảnh báo chỉ hiển thị trong giao diện Alertmanager.

## Backup, restore và DR drill

Chạy tại thư mục gốc repository:

```bash
ASSETFLOW_COMPOSE_FILE=infra/docker/production/compose.yaml ASSETFLOW_DB_SERVICE=db ./scripts/backup.sh
./scripts/dr-drill.sh backups/assetflow-YYYYMMDDTHHMMSSZ
```

DR drill khôi phục database vào volume PostgreSQL tạm, kiểm tra checksum và truy vấn dữ liệu rồi tự dọn tài nguyên; nó không chạm database đang chạy. Hàng quý vẫn cần diễn tập full-stack gồm hồ sơ đính kèm, đăng nhập và nghiệp vụ mẫu.

## Nâng cấp

```bash
git pull --ff-only origin main
# backup + DR drill trước khi đổi phiên bản
docker compose pull
docker compose up -d
docker compose ps
```

`migrate` phải hoàn tất trước khi API khởi động. Không dùng `docker compose down -v`.

## Microsoft 365 / LDAP và security acceptance

Xem [security testing](../../../docs/SECURITY_TESTING.md). Kiểm tra kết nối thật bằng `scripts/directory-live-test.sh`; script không nhận hoặc in client secret/LDAP bind password vì secret phải được lưu qua trang cài đặt. Chạy HTTPS security baseline bằng `scripts/security-smoke.sh`.

Stack và tooling không thay thế pentest độc lập, duyệt quyền tenant/domain thật, cấu hình kênh cảnh báo thật hoặc phê duyệt go-live của doanh nghiệp.
