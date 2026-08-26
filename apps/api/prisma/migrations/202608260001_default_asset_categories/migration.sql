-- These are operational master-data defaults, not demo assets.
-- Existing categories are preserved by matching either code or case-insensitive name.
WITH defaults (id, code, name, description) AS (
  VALUES
    ('7a5e7000-0000-4000-8000-000000000001'::uuid, 'LAPTOP', 'Laptop', 'Máy tính xách tay'),
    ('7a5e7000-0000-4000-8000-000000000002'::uuid, 'PC_DESKTOP', 'PC / Desktop', 'Máy tính để bàn và workstation'),
    ('7a5e7000-0000-4000-8000-000000000003'::uuid, 'MONITOR', 'Màn hình', 'Màn hình máy tính'),
    ('7a5e7000-0000-4000-8000-000000000004'::uuid, 'MOBILE', 'Mobile', 'Điện thoại di động'),
    ('7a5e7000-0000-4000-8000-000000000005'::uuid, 'TABLET', 'Tablet', 'Máy tính bảng'),
    ('7a5e7000-0000-4000-8000-000000000006'::uuid, 'SERVER', 'Server', 'Máy chủ vật lý'),
    ('7a5e7000-0000-4000-8000-000000000007'::uuid, 'SWITCH', 'Switch', 'Thiết bị chuyển mạch'),
    ('7a5e7000-0000-4000-8000-000000000008'::uuid, 'FIREWALL', 'Firewall', 'Thiết bị tường lửa'),
    ('7a5e7000-0000-4000-8000-000000000009'::uuid, 'ROUTER_WIFI', 'Router / Wi-Fi', 'Thiết bị định tuyến và không dây'),
    ('7a5e7000-0000-4000-8000-000000000010'::uuid, 'UPS', 'UPS', 'Bộ lưu điện'),
    ('7a5e7000-0000-4000-8000-000000000011'::uuid, 'NAS_STORAGE', 'NAS / Storage', 'Thiết bị lưu trữ mạng'),
    ('7a5e7000-0000-4000-8000-000000000012'::uuid, 'PRINTER', 'Máy in', 'Máy in và thiết bị in'),
    ('7a5e7000-0000-4000-8000-000000000013'::uuid, 'TIME_ATTENDANCE', 'Máy chấm công', 'Thiết bị chấm công'),
    ('7a5e7000-0000-4000-8000-000000000014'::uuid, 'CAMERA', 'Camera', 'Camera và thiết bị giám sát'),
    ('7a5e7000-0000-4000-8000-000000000015'::uuid, 'HEADSET', 'Tai nghe', 'Tai nghe và thiết bị âm thanh cá nhân'),
    ('7a5e7000-0000-4000-8000-000000000016'::uuid, 'KEYBOARD', 'Bàn phím', 'Bàn phím máy tính'),
    ('7a5e7000-0000-4000-8000-000000000017'::uuid, 'MOUSE', 'Chuột', 'Chuột máy tính'),
    ('7a5e7000-0000-4000-8000-000000000018'::uuid, 'WEBCAM', 'Webcam', 'Camera hội nghị cá nhân'),
    ('7a5e7000-0000-4000-8000-000000000019'::uuid, 'DOCK', 'Dock chuyển đổi', 'Dock và bộ chuyển đổi'),
    ('7a5e7000-0000-4000-8000-000000000020'::uuid, 'CHARGER_ADAPTER', 'Sạc & Adapter', 'Nguồn, sạc và adapter'),
    ('7a5e7000-0000-4000-8000-000000000021'::uuid, 'HUB_CABLE', 'Hub & Cáp kết nối', 'Hub và cáp kết nối'),
    ('7a5e7000-0000-4000-8000-000000000022'::uuid, 'EXTERNAL_STORAGE', 'Ổ lưu trữ ngoài', 'Thiết bị lưu trữ rời'),
    ('7a5e7000-0000-4000-8000-000000000023'::uuid, 'SOFTWARE_LICENSE', 'Phần mềm & Bản quyền', 'Phần mềm và quyền sử dụng'),
    ('7a5e7000-0000-4000-8000-000000000024'::uuid, 'DIGITAL_DATA', 'Tài sản số & Dữ liệu', 'Tài sản số, dữ liệu và chứng thư'),
    ('7a5e7000-0000-4000-8000-000000000025'::uuid, 'BYOD', 'Thiết bị BYOD', 'Thiết bị cá nhân được quản lý'),
    ('7a5e7000-0000-4000-8000-000000000026'::uuid, 'FURNITURE', 'Nội thất', 'Nội thất và thiết bị văn phòng'),
    ('7a5e7000-0000-4000-8000-000000000027'::uuid, 'OTHER', 'Khác', 'Nhóm tài sản khác')
)
INSERT INTO "asset_categories" ("id", "code", "name", "description", "status", "createdAt", "updatedAt")
SELECT id, code, name, description, 'ACTIVE'::"RecordStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM defaults d
WHERE NOT EXISTS (
  SELECT 1
  FROM "asset_categories" c
  WHERE c."code" = d.code OR lower(c."name") = lower(d.name)
);
