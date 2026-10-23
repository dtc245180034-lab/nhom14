# Đề 14 – Hệ thống Quản lý Dự án

Ứng dụng quản lý **dự án, công việc và thành viên**, triển khai hoàn toàn bằng Docker Compose với PostgreSQL, pgAdmin, Nginx, Prometheus, Grafana, Loki và Promtail.

## 1. Kiến trúc

- Người dùng → Nginx reverse proxy → Node.js/Express → PostgreSQL.
- pgAdmin quản trị PostgreSQL.
- Prometheus thu thập metrics từ ứng dụng, cAdvisor, Nginx exporter và PostgreSQL exporter.
- Grafana hiển thị dashboard; Loki nhận log container từ Promtail.
- Ba network tách biệt: `frontend`, `backend` (internal) và `monitoring`.

## 2. Yêu cầu

- Docker Desktop / Docker Engine có Docker Compose v2.
- RAM trống khoảng 4 GB.

## 3. Chạy hệ thống

```bash
cp .env.example .env
# Thay toàn bộ mật khẩu trong .env trước khi triển khai thật
docker compose pull
docker compose up -d --build
docker compose ps
```

Địa chỉ:

| Thành phần | URL | Đăng nhập |
|---|---|---|
| Website qua Nginx | http://localhost:8080 | Không yêu cầu |
| pgAdmin | http://localhost:5050 | Giá trị trong `.env` |
| Grafana | http://localhost:3001 | Giá trị trong `.env` |
| Prometheus | http://localhost:9090 | Không yêu cầu |

Kết nối pgAdmin: Host `postgres`, Port `5432`, Database/User/Password lấy từ `.env`.

## 4. Kiểm tra demo

```bash
curl http://localhost:8080/health
curl -I http://localhost:8080
docker compose ps
docker compose logs --tail=30 app nginx postgres
```

Prometheus: mở **Status → Targets**, xác nhận `application`, `cadvisor`, `nginx`, `postgres` đều UP. Grafana đã tự cấp sẵn 2 datasource và dashboard **Project Management Overview**.

### LogQL mẫu trong Grafana → Explore → Loki

```logql
{service="nginx"}
{service="app"} |= "error"
sum by (service) (count_over_time({service=~"app|nginx|postgres"}[5m]))
```

Hãy truy cập website và thao tác vài lần để tạo log trước khi chạy query.

## 5. Hardening đã áp dụng

1. App và Nginx chạy non-root; app dùng `USER node`.
2. `cap_drop: ALL`, `no-new-privileges:true`, filesystem app/Nginx read-only.
3. PostgreSQL chỉ ở network backend nội bộ, không publish cổng ra host.
4. Mật khẩu qua `.env`, không commit `.env` lên GitHub.
5. Nginx có security headers, ẩn version và rate limiting.
6. Truy vấn SQL dùng parameterized query; ràng buộc/foreign key trong DB.

> cAdvisor cần quyền truy cập host để đọc metrics container; đây là ngoại lệ có chủ đích và cần giải thích khi bảo vệ.

## 6. Commit theo yêu cầu đề bài

```bash
git init
git add .
git commit -m "feat: deploy project app PostgreSQL pgAdmin and Nginx"

# Sau khi hoàn thiện/kiểm tra monitoring
git add .
git commit -m "feat: add Prometheus Grafana and exporters"

# Sau khi hoàn thiện/kiểm tra logging và hardening
git add .
git commit -m "feat: add Loki Promtail and security hardening"
```

Khi nộp bài nên có **ít nhất 3 commit thực sự khác nhau**. Không chạy cả ba lệnh liên tiếp nếu không có thay đổi giữa các commit. Tốt nhất tách file theo từng giai đoạn ngay từ đầu hoặc dùng lịch sử commit đã chuẩn bị trong repository này.

## 7. Dừng và xóa dữ liệu

```bash
docker compose down
# Chỉ dùng khi muốn xóa toàn bộ dữ liệu database/monitoring:
docker compose down -v
```

