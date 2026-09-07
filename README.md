# AssetFlow v2.2

> Endpoint Agent MVP cho Windows/Linux đã có enrollment API, credential riêng theo máy, snapshot bất biến và Discovery Inbox. IT chọn liên kết tài sản, tạo mới, bỏ qua hoặc xử lý xung đột; Agent không tự ghi vào sổ tài sản. Network Discovery/SNMP được để ở giai đoạn sau. Xem [thiết kế Endpoint Agent](docs/ENDPOINT_AGENT.md) và [hướng dẫn Agent](apps/agent/README.md).

[![CI](https://github.com/duclamtk39/assetIT/actions/workflows/ci.yml/badge.svg)](https://github.com/duclamtk39/assetIT/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/badge/Docker-GHCR-2496ED?logo=docker&logoColor=white)](https://github.com/duclamtk39/assetIT/pkgs)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

AssetFlow là phần mềm self-hosted quản lý vòng đời tài sản: nhập kho, cấp phát, cho mượn, thu hồi, điều chuyển, kiểm kê, bảo trì, lịch sử và Barcode/QR.

> Phiên bản hiện tại phù hợp cho UAT/pilot nội bộ có kiểm soát. Trước khi go-live chính thức, doanh nghiệp cần hoàn thành [Production Readiness Checklist](docs/PRODUCTION_READINESS.md).
<img width="1905" height="912" alt="image" src="https://github.com/user-attachments/assets/5751e833-f62c-4d59-aef8-9e21f4d450d6" />


## Cài nhanh bằng Docker

Máy chủ chỉ cần Linux, Git, Docker Engine và Docker Compose v2. Không cần cài Node.js hoặc PostgreSQL trực tiếp.

Nếu triển khai trên Windows 10/11 bằng Docker Desktop, xem tài liệu riêng: [Triển khai AssetFlow trên Windows bằng Docker](docs/WINDOWS_DOCKER_DEPLOYMENT.md).

Khuyến nghị tối thiểu: 2 CPU, 4 GB RAM, 20 GB ổ đĩa trống và một IP LAN cố định.

### 1. Kiểm tra máy chủ

```bash
docker --version
docker compose version
git --version
openssl version
```

Nếu một trong các lệnh chưa tồn tại, hãy cài Docker Engine, Docker Compose plugin, Git và OpenSSL bằng trình quản lý gói của hệ điều hành.

### 2. Tải AssetFlow

```bash
sudo mkdir -p /opt
cd /opt
sudo git clone https://github.com/duclamtk39/assetIT.git
sudo chown -R "$USER":"$USER" /opt/assetIT
cd /opt/assetIT/infra/docker/production
chmod +x init.sh ../../../scripts/*.sh
./init.sh
```

Lệnh `init.sh` tự tạo `.env` và các mật khẩu ngẫu nhiên trong thư mục `secrets/`. Không commit, gửi qua chat hoặc email các file này.

### 3. Cấu hình địa chỉ truy cập

Mở file cấu hình:

```bash
nano /opt/assetIT/infra/docker/production/.env
```

Với server nội bộ có IP `192.168.50.15`, giữ hoặc sửa các giá trị sau:

```env
REGISTRY_PREFIX=ghcr.io/duclamtk39
ASSETFLOW_VERSION=edge

APP_DOMAIN=http://192.168.50.15
APP_URL=http://192.168.50.15
COOKIE_SECURE=false
TZ=Asia/Ho_Chi_Minh
```

Thay `192.168.50.15` bằng IP thật của server. Tag `edge` luôn nhận bản mới nhất từ nhánh `main`, phù hợp UAT. Môi trường vận hành ổn định nên ghim một tag release cụ thể, ví dụ `2.2.0`.

Nếu có domain và HTTPS:

```env
APP_DOMAIN=assets.company.vn
APP_URL=https://assets.company.vn
COOKIE_SECURE=true
```

Caddy sẽ tự xin chứng chỉ TLS khi DNS trỏ đúng về server và cổng `80/443` được phép truy cập.

### 4. Khởi động

```bash
cd /opt/assetIT/infra/docker/production
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps -a
```

Dùng `ps -a` vì `migrate` là container chạy một lần rồi thoát; `ps` thường sẽ không hiển thị nó. Trạng thái đúng là `migrate` ở `Exited (0)`, còn `db`, `api`, `web`, `proxy` ở `Up`.

Kiểm tra API, thay IP nếu cần:

```bash
curl -fsS http://192.168.50.15/api/v1/health/ready
```

Sau đó mở:

```text
http://192.168.50.15
```

### 5. Đăng nhập lần đầu

Tên đăng nhập mặc định:

```text
admin
```

Xem mật khẩu khởi tạo:

```bash
cat /opt/assetIT/infra/docker/production/secrets/initial_admin_password.txt
```

Hệ thống bắt buộc đổi mật khẩu ngay lần đăng nhập đầu tiên. Sau khi đăng nhập, người dùng có thể tiếp tục đổi mật khẩu tại khu vực hồ sơ ở cuối sidebar.

Production không tự tạo dữ liệu demo.

## Cập nhật lên bản mới nhất

Tag `edge` được đẩy lên GHCR bởi workflow **Publish edge images**, và workflow này chỉ khởi động sau khi **CI** của nhánh `main` kết thúc thành công. Phải chờ *Publish edge images* xong, không chỉ chờ CI: cập nhật sớm hơn thì `docker compose pull` tải lại đúng image cũ và server trông như không có gì thay đổi.

Luôn backup trước khi tải image và chạy migration mới:

```bash
cd /opt/assetIT

ASSETFLOW_COMPOSE_FILE=infra/docker/production/compose.yaml \
ASSETFLOW_DB_SERVICE=db \
./scripts/backup.sh

git pull --ff-only origin main

cd infra/docker/production
docker compose pull
docker compose up -d --remove-orphans
docker compose ps -a
curl -fsS http://192.168.50.15/api/v1/health/ready
```

`git pull` cập nhật cấu hình triển khai; `docker compose pull` tải image mới. Container `migrate` phải chạy thành công trước khi API khởi động.

Sau khi cập nhật, kiểm tra cả cấu hình lẫn image đang chạy thật sự:

```bash
cd /opt/assetIT
git log -1 --oneline
curl -fsS http://192.168.50.15/api/v1/health/version
```

`git log` cho biết cấu hình triển khai đang ở commit nào. `health/version` trả về `edge-<commit>` của chính image API đang chạy — đây là cách duy nhất để phân biệt bản mới với bản cũ, vì `edge` là tag di động nên tên tag không nói lên điều gì. Hai giá trị phải cùng trỏ về một commit khi cập nhật hoàn tất. Image build trước phiên bản này trả về `development`; giá trị đó nghĩa là API vẫn đang chạy image cũ.

## Backup

Backup gồm PostgreSQL và hồ sơ đính kèm:

```bash
cd /opt/assetIT
ASSETFLOW_COMPOSE_FILE=infra/docker/production/compose.yaml \
ASSETFLOW_DB_SERVICE=db \
./scripts/backup.sh
```

File backup được tạo trong `/opt/assetIT/backups/assetflow-<thời-gian>/`.

Ngoài backup trên, cần sao lưu mã hóa các thành phần sau sang một máy hoặc kho lưu trữ khác:

- `/opt/assetIT/backups/`
- `/opt/assetIT/infra/docker/production/.env`
- `/opt/assetIT/infra/docker/production/secrets/`

Không chạy `docker compose down -v`; tùy chọn `-v` sẽ xóa volume database và hồ sơ.

## Khôi phục

Thử khả năng khôi phục mà không tác động hệ thống đang chạy:

```bash
cd /opt/assetIT
./scripts/dr-drill.sh backups/assetflow-YYYYMMDDTHHMMSSZ
```

Khôi phục thật sẽ thay thế dữ liệu hiện tại và yêu cầu nhập `RESTORE` để xác nhận:

```bash
cd /opt/assetIT
ASSETFLOW_COMPOSE_FILE=infra/docker/production/compose.yaml \
ASSETFLOW_DB_SERVICE=db \
./scripts/restore.sh backups/assetflow-YYYYMMDDTHHMMSSZ
```

Sau khi restore, kiểm tra đăng nhập, số lượng tài sản, file đính kèm và lịch sử audit.

## Xem log và xử lý lỗi

```bash
cd /opt/assetIT/infra/docker/production
docker compose ps -a
docker compose logs --tail=200 db migrate api web proxy
docker compose config
```

Các lưu ý quan trọng:

- Nếu `migrate` lỗi, API sẽ không khởi động để tránh chạy code mới trên schema cũ.
- Nếu PostgreSQL báo `P1000`, mật khẩu trong volume cũ không khớp file secret hiện tại. Không xóa volume; khôi phục secret cũ hoặc thực hiện quy trình đổi mật khẩu database có kiểm soát.
- Nếu container báo không đọc được secret, chạy `chmod 700 secrets && chmod 644 secrets/*.txt` trong thư mục production rồi khởi động lại.
- Chỉ mở cổng `80/443`; PostgreSQL không được public ra LAN hoặc Internet.
- HTTP qua IP chỉ phù hợp mạng LAN/VPN tin cậy. Dùng HTTPS trước khi truy cập qua Internet.

Khởi động lại sau khi sửa cấu hình:

```bash
docker compose up -d --force-recreate
```

## Monitoring

```bash
cd /opt/assetIT/infra/docker/production
docker compose --profile monitoring up -d
```

Prometheus và Alertmanager chỉ bind localhost tại `9090/9093`. Trước go-live cần cấu hình receiver email, Slack hoặc webhook và thử cảnh báo thực tế.

## Microsoft 365 và LDAP

Cấu hình tại **Cài đặt → Danh tính & người dùng**. Test kết nối và kiểm tra mapping trước khi bật đồng bộ thật:

```bash
cd /opt/assetIT
ASSETFLOW_URL=http://192.168.50.15 DIRECTORY_PROVIDER=M365 ./scripts/directory-live-test.sh
ASSETFLOW_URL=http://192.168.50.15 DIRECTORY_PROVIDER=LDAP ./scripts/directory-live-test.sh
```

Chỉ thêm `DIRECTORY_RUN_SYNC=true` sau khi đã kiểm tra đúng phạm vi người dùng, phòng ban và vai trò sẽ được đồng bộ. Không sử dụng LDAP không mã hóa ngoài môi trường thử nghiệm cô lập.

## Phát triển local

Yêu cầu Node.js 22 trở lên:

```bash
git clone https://github.com/duclamtk39/assetIT.git
cd assetIT
npm ci
npm run verify
npm run dev
```

Mở `http://127.0.0.1:5173`. Dữ liệu demo chỉ hoạt động khi chủ động đặt `VITE_DEMO_MODE=true`; không bật tùy chọn này trong production.

## Kiến trúc triển khai

```text
Người dùng
   │
   ▼
Caddy :80/:443
   ├── Web (React)
   └── API (NestJS)
          │
          └── PostgreSQL (mạng Docker nội bộ)
```

- `proxy`: điểm truy cập duy nhất từ bên ngoài.
- `web`: giao diện React đã build.
- `api`: REST API, xác thực, phân quyền và nghiệp vụ.
- `migrate`: chạy migration bằng tài khoản database riêng rồi thoát.
- `db`: PostgreSQL, không publish cổng ra host.
- `postgres_data` và `document_data`: named volume giữ dữ liệu qua các lần cập nhật.

## CI/CD và phát hành

- Push/PR chạy build, test, audit dependency và kiểm tra Docker image.
- CI trên `main` xanh sẽ kích hoạt workflow **Publish edge images**, đẩy tag `edge` lên GHCR. Đây là bước quyết định thời điểm server UAT có bản mới để tải.
- GitHub Release phát hành image theo SemVer để ghim phiên bản ổn định.
- Cập nhật server bằng `git pull`, `docker compose pull` và `docker compose up -d` như hướng dẫn phía trên.
- Mỗi image mang sẵn `APP_VERSION` của commit đã build, đọc được qua `GET /api/v1/health/version`.

## Tài liệu

- [Triển khai trên Windows bằng Docker](docs/WINDOWS_DOCKER_DEPLOYMENT.md)
- [Production stack](infra/docker/production/README.md)
- [Kiến trúc](docs/ARCHITECTURE.md)
- [Production readiness](docs/PRODUCTION_READINESS.md)
- [Bảo mật và kiểm thử directory](docs/SECURITY_TESTING.md)
- [Đánh giá rủi ro CNTT](docs/IT_RISK_ASSESSMENT.md)
- [Release và CI/CD](docs/RELEASE.md)
- [Security policy](SECURITY.md)

## ❤️ Support AssetFlow

AssetFlow miễn phí và có thể self-host. Nếu dự án hữu ích, bạn có thể hỗ trợ chi phí duy trì và phát triển.

### Donate qua Vietcombank

<img width="379" height="469" alt="image" src="https://github.com/user-attachments/assets/cb41d5ba-38db-4e49-9998-4a39553205c4" />


- Chủ tài khoản: **NGUYEN DUC LAM**
- Số tài khoản: **059000212664**

Vui lòng kiểm tra đúng tên người nhận trước khi chuyển khoản. Cảm ơn bạn đã ủng hộ AssetFlow ❤️
