import { useEffect } from 'react'
import { featureTranslations } from './feature-catalog'

// Từ điển giao diện tập trung. Chỉ dịch nhãn hệ thống; không đụng tới mã, tên người và dữ liệu doanh nghiệp.
const viToEn: Array<[string, string]> = [
  ['Đăng nhập hệ thống', 'Sign in'],
  [
    'Tài khoản quản trị ban đầu được tạo trong quá trình cài đặt hệ thống.',
    'The initial administrator account is created during system installation.',
  ],
  ['Tên đăng nhập', 'Username'],
  ['Mật khẩu', 'Password'],
  ['Đang xác thực...', 'Authenticating...'],
  ['Đổi mật khẩu lần đầu', 'Change initial password'],
  ['Mật khẩu mới', 'New password'],
  ['Xác nhận mật khẩu mới', 'Confirm new password'],
  ['Đổi mật khẩu và tiếp tục', 'Change password and continue'],
  ['Đang cập nhật...', 'Updating...'],
  ['Hệ thống quản lý tài sản', 'Asset management system'],
  ['HỆ THỐNG QUẢN LÝ TÀI SẢN', 'ASSET MANAGEMENT SYSTEM'],
  ['Quản lý và theo dõi toàn bộ tài sản trong công ty.', 'Manage and track all company assets.'],
  ['Phạm vi dữ liệu theo quyền tài khoản.', 'Data scope follows account permissions.'],
  [
    'Quản trị các danh mục dùng chung trong toàn bộ quy trình tài sản.',
    'Manage shared master data across the asset lifecycle.',
  ],
  [
    'Kết nối Microsoft 365/Entra ID hoặc LDAP/Active Directory để đồng bộ hồ sơ, phòng ban và phạm vi phân quyền.',
    'Connect Microsoft 365/Entra ID or LDAP/Active Directory to synchronize users, departments and access scope.',
  ],
  [
    'Thiết lập ngôn ngữ mặc định, múi giờ và cách hiển thị ngày giờ trên toàn hệ thống.',
    'Configure the default language, timezone and date/time display across the system.',
  ],
  [
    'Thay đổi logo, tên phần mềm và thông tin công ty trên toàn hệ thống.',
    'Change the logo, application name and company information across the system.',
  ],
  [
    'Thiết lập thông tin sử dụng khi gửi biên bản bàn giao tài sản.',
    'Configure information used when sending asset handover records.',
  ],
  ['Không có tài sản phù hợp với điều kiện đã chọn.', 'No assets match the selected conditions.'],
  ['Không có tài sản cần xử lý.', 'No assets require attention.'],
  ['Không có dữ liệu', 'No data'],
  ['Tổng quan vận hành', 'Operations overview'],
  ['Sổ tài sản', 'Asset register'],
  ['Cấp phát & Thu hồi', 'Issue & Return'],
  ['Cấp phát / Thu hồi', 'Issue / Return'],
  ['Điều chuyển tài sản', 'Asset transfer'],
  ['Nhập kho tài sản', 'Asset receipt'],
  ['Tra cứu Barcode / QR', 'Barcode / QR lookup'],
  ['Nhập thủ công', 'Manual entry'],
  ['Nhập thủ công một tài sản', 'Enter one asset manually'],
  [
    'Khai báo đầy đủ hồ sơ và cấu hình trước khi ghi nhận vào kho.',
    'Complete the asset record and configuration before receiving it into stock.',
  ],
  ['Import template Excel', 'Import Excel template'],
  ['Import tài sản từ template Excel', 'Import assets from an Excel template'],
  [
    'Nhập hàng loạt tài sản bằng template Excel chuẩn của hệ thống.',
    'Bulk receive assets using the system Excel template.',
  ],
  [
    'Dùng khi tiếp nhận nhiều tài sản trong cùng một đợt nhập kho.',
    'Use this when receiving multiple assets in one stock receipt.',
  ],
  ['Tải template Excel', 'Download Excel template'],
  ['Không đổi tên hoặc thứ tự các cột trong file mẫu.', 'Do not rename or reorder columns in the template.'],
  ['Điền dữ liệu tài sản', 'Enter asset data'],
  [
    'Mã tài sản và Tên tài sản là bắt buộc; mỗi dòng là một tài sản.',
    'Asset code and Asset name are required; each row represents one asset.',
  ],
  ['Chọn file để nhập kho', 'Choose the receipt file'],
  [
    'Hệ thống kiểm tra mã trùng và nguyên giá trước khi ghi nhận.',
    'The system checks duplicate codes and purchase cost before importing.',
  ],
  ['Các cột trong template', 'Template columns'],
  ['Chọn file Excel để import', 'Choose Excel file to import'],
  ['Đang kiểm tra file...', 'Validating file...'],
  [
    'Quét mã, khai báo trực tiếp hoặc import danh sách tài sản từ Excel.',
    'Scan a code, enter details directly, or import an asset list from Excel.',
  ],
  ['Quét mã vào phiếu nhập', 'Scan a code into the receipt'],
  [
    'Camera, máy quét USB hoặc nhập mã thủ công. Mã chỉ dùng để nhận dạng và kiểm tra trùng.',
    'Use a camera, USB scanner, or manual entry. The code is only used for identification and duplicate checking.',
  ],
  ['Kiểm tra mã', 'Check code'],
  ['Phiếu nhập kho tài sản', 'Asset receipt form'],
  ['Khai báo một tài sản hoặc nhập hàng loạt từ file Excel.', 'Enter one asset or import multiple assets from Excel.'],
  ['Ảnh và thông tin chung', 'Image and general information'],
  ['Ảnh tài sản', 'Asset image'],
  ['Tên tài sản', 'Asset name'],
  ['Mã tài sản / Barcode', 'Asset code / Barcode'],
  ['Loại / Nhóm tài sản', 'Asset category'],
  ['Kho / Vị trí nhập', 'Receiving warehouse / Location'],
  [
    'Nhập kho luôn tạo tài sản ở trạng thái Sẵn sàng và chưa gán người sử dụng.',
    'Receiving always creates an Available asset with no assigned user.',
  ],
  ['Nguyên giá (VNĐ)', 'Purchase cost (VND)'],
  ['Cấu hình kỹ thuật', 'Technical configuration'],
  ['Hãng sản xuất', 'Manufacturer'],
  ['Ổ đĩa', 'Storage'],
  ['Hệ điều hành', 'Operating system'],
  ['Địa chỉ IP', 'IP address'],
  ['Địa chỉ MAC', 'MAC address'],
  ['Xác nhận nhập kho', 'Confirm receipt'],
  ['Tải file mẫu', 'Download template'],
  ['Kho & Vị trí', 'Warehouses & Locations'],
  ['Kiểm kê tài sản', 'Asset inventory'],
  ['Mua sắm & PO', 'Purchasing & PO'],
  ['Nhà cung cấp', 'Suppliers'],
  ['Bảo trì & Sự cố', 'Maintenance & Incidents'],
  ['Lịch sử / Audit', 'History / Audit'],
  ['Lịch sử nhập xuất', 'Stock movement history'],
  ['In & Quét Barcode', 'Print & Scan Barcode'],
  ['Barcode & Nhập kho', 'Barcode & Asset Receipt'],
  ['Barcode / QR & Nhập kho', 'Barcode / QR & Asset Receipt'],
  ['Quét Barcode / QR', 'Scan Barcode / QR'],
  [
    'Quét Barcode hoặc QR để tra cứu tài sản và lập hồ sơ nhập kho.',
    'Scan a Barcode or QR code to find an asset and prepare its receipt record.',
  ],
  [
    'Đưa Barcode hoặc QR Code vào camera, dùng máy quét USB hoặc nhập mã thủ công.',
    'Show a Barcode or QR code to the camera, use a USB scanner, or enter the code manually.',
  ],
  ['Dữ liệu quét được xử lý thế nào?', 'How is scanned data processed?'],
  ['Mở camera quét mã', 'Open code scanner'],
  ['Mã tài sản, Barcode, QR hoặc serial', 'Asset code, Barcode, QR or serial'],
  ['Chưa quét tài sản', 'No asset scanned'],
  [
    'Tra cứu tài sản đã có hoặc quét mã để lập đầy đủ hồ sơ tài sản nhập kho.',
    'Look up an existing asset or scan a code to create a complete receipt record.',
  ],
  ['Tra cứu tài sản', 'Asset lookup'],
  ['Nhập kho tài sản mới', 'Receive new asset'],
  ['Quét tài sản', 'Scan asset'],
  [
    'Đưa barcode vào camera hoặc đặt con trỏ vào ô dưới và dùng máy quét USB.',
    'Place the barcode in front of the camera, or focus the field below and use a USB scanner.',
  ],
  ['Dữ liệu scan lấy từ đâu?', 'Where does scanned data come from?'],
  [
    'Camera đọc hình barcode/QR; máy quét USB gõ chuỗi mã vào ô; hệ thống dùng chuỗi đó để đối chiếu mã tài sản hoặc serial trong sổ tài sản.',
    'The camera reads a barcode/QR image; a USB scanner enters the code; the system matches it against the asset code or serial number in the asset register.',
  ],
  ['Mở camera', 'Open camera'],
  ['Mã tài sản, barcode hoặc serial', 'Asset code, barcode or serial'],
  ['Tra cứu', 'Look up'],
  ['Chưa có tài sản', 'No asset selected'],
  ['Thông tin tài sản sẽ xuất hiện tại đây sau khi quét.', 'Asset information will appear here after scanning.'],
  ['Loại tài sản', 'Asset category'],
  ['Người đang sử dụng', 'Current user'],
  ['Hãng / Model', 'Manufacturer / Model'],
  ['CPU / RAM / Disk', 'CPU / RAM / Disk'],
  ['Barcode / QR', 'Barcode / QR'],
  ['Danh mục hệ thống', 'System master data'],
  ['Danh tính & người dùng', 'Identity & Users'],
  ['Danh tính & đồng bộ người dùng', 'Identity & User Synchronization'],
  ['Ngày giờ & ngôn ngữ', 'Date, Time & Language'],
  ['Thương hiệu', 'Branding'],
  ['Tùy chỉnh thương hiệu', 'Branding'],
  ['Cấu hình email', 'Email settings'],
  ['Cấu hình hệ thống', 'System settings'],
  ['TRUNG TÂM CÀI ĐẶT', 'SETTINGS CENTER'],
  ['Cấu hình toàn hệ thống', 'System-wide configuration'],
  ['Phòng ban và site', 'Departments and sites'],
  ['Microsoft 365 hoặc LDAP', 'Microsoft 365 or LDAP'],
  ['Múi giờ và định dạng', 'Timezone and formats'],
  ['Logo và tên công ty', 'Logo and company name'],
  ['Thông tin gửi biên bản', 'Handover email information'],
  ['Danh sách phòng ban', 'Department list'],
  ['Danh sách site và địa điểm', 'Site and location list'],
  ['Site & Địa điểm', 'Sites & Locations'],
  ['Phòng ban', 'Department'],
  ['Người phụ trách', 'Manager'],
  ['Tên phòng ban', 'Department name'],
  ['Mã phòng ban', 'Department code'],
  ['Tên site', 'Site name'],
  ['Mã site', 'Site code'],
  ['Địa chỉ', 'Address'],
  ['Cấu hình khu vực', 'Regional settings'],
  [
    'Các thay đổi được áp dụng cho tài khoản hiện tại và dùng làm mặc định khi tạo người dùng mới.',
    'Changes apply to the current account and become the default for new users.',
  ],
  [
    'Thời điểm nghiệp vụ vẫn được lưu theo UTC trong cơ sở dữ liệu. Cài đặt này chỉ thay đổi cách hiển thị, không làm thay đổi dữ liệu audit.',
    'Business timestamps remain stored as UTC in the database. This setting only changes display and does not alter audit data.',
  ],
  ['ngôn ngữ phổ biến được hỗ trợ.', 'popular languages are supported.'],
  ['Ngôn ngữ hiển thị', 'Display language'],
  ['Múi giờ', 'Timezone'],
  ['Định dạng ngày', 'Date format'],
  ['Định dạng giờ', 'Time format'],
  ['Ngày đầu tuần', 'First day of week'],
  ['24 giờ (14:30)', '24-hour (14:30)'],
  ['12 giờ (02:30 PM)', '12-hour (02:30 PM)'],
  ['Thứ Hai', 'Monday'],
  ['Chủ Nhật', 'Sunday'],
  ['Xem trước theo múi giờ đã chọn', 'Preview in selected timezone'],
  ['Khôi phục mặc định', 'Restore defaults'],
  ['Lưu cấu hình', 'Save settings'],
  ['Lưu thay đổi', 'Save changes'],
  ['Kiểm tra kết nối', 'Test connection'],
  ['Đang kiểm tra...', 'Testing...'],
  ['Bật đồng bộ', 'Enable synchronization'],
  ['Lịch đồng bộ', 'Sync schedule'],
  ['Lần đồng bộ gần nhất', 'Last synchronization'],
  ['Chưa từng đồng bộ', 'Never synchronized'],
  ['Quy tắc cập nhật', 'Update policy'],
  ['Kết nối Microsoft 365 / Entra ID', 'Connect Microsoft 365 / Entra ID'],
  ['Kết nối LDAP / Active Directory', 'Connect LDAP / Active Directory'],
  ['Microsoft Graph · Entra ID', 'Microsoft Graph · Entra ID'],
  ['LDAPS hoặc StartTLS', 'LDAPS or StartTLS'],
  ['Nguyên tắc bảo mật', 'Security principles'],
  [
    'Client secret và mật khẩu bind không được trả về trình duyệt sau khi lưu. Bản production phải giữ chúng trong secret store phía server.',
    'Client secrets and bind passwords are never returned to the browser after saving. Production must keep them in a server-side secret store.',
  ],
  [
    'Sử dụng ứng dụng Entra ID với quyền Microsoft Graph User.Read.All và GroupMember.Read.All.',
    'Use an Entra ID application with Microsoft Graph User.Read.All and GroupMember.Read.All permissions.',
  ],
  [
    'Tài khoản dịch vụ chỉ cần quyền đọc OU và thuộc tính người dùng được chọn.',
    'The service account only needs read access to the selected OU and user attributes.',
  ],
  ['Nhập secret mới hoặc giữ nguyên giá trị đã cấu hình', 'Enter a new secret or keep the configured value'],
  ['Bind DN / Tài khoản dịch vụ', 'Bind DN / Service account'],
  ['Mật khẩu bind', 'Bind password'],
  ['Bắt buộc TLS và xác minh chứng chỉ máy chủ', 'Require TLS and verify the server certificate'],
  ['Ánh xạ và lịch đồng bộ', 'Mapping and synchronization schedule'],
  ['Thuộc tính phòng ban', 'Department attribute'],
  ['Thuộc tính email', 'Email attribute'],
  ['Mã nhân viên', 'Employee ID'],
  ['Ánh xạ nhóm sang vai trò', 'Map groups to roles'],
  ['Mỗi dòng: Tên nhóm = Admin | IT | HCNS', 'One per line: Group name = Admin | IT | HCNS'],
  [
    'Đồng bộ cả tài khoản đã vô hiệu hóa để phục vụ lịch sử kiểm toán',
    'Synchronize disabled accounts for audit history',
  ],
  ['Không xóa lịch sử · Khóa tài khoản không còn hiệu lực', 'Preserve history · Lock inactive accounts'],
  ['Thủ công', 'Manual'],
  ['Mỗi giờ', 'Hourly'],
  ['Mỗi 6 giờ', 'Every 6 hours'],
  ['Mỗi 12 giờ', 'Every 12 hours'],
  ['Hằng ngày 02:00', 'Daily at 02:00'],
  [
    'Đã lưu cấu hình không nhạy cảm. Secret/mật khẩu không được lưu trong trình duyệt và phải chuyển tới secret store qua backend.',
    'Non-sensitive settings saved. Secrets/passwords are not stored in the browser and must be sent to the server-side secret store.',
  ],
  [
    'Cấu hình bắt buộc đã đầy đủ. Backend sẽ thực hiện kết nối thật và xác minh quyền đọc người dùng.',
    'Required settings are complete. The backend will perform the connection and verify user read permissions.',
  ],
  ['Chưa đủ thông tin bắt buộc để kiểm tra kết nối.', 'Required information is missing for the connection test.'],
  ['Đang bật', 'Enabled'],
  ['Đang tắt', 'Disabled'],
  ['Thông tin nhận diện', 'Brand identity'],
  [
    'Thay đổi logo, thông tin công ty và mẫu biên bản bàn giao A4.',
    'Change the logo, company information and A4 handover template.',
  ],
  [
    'Các trường công ty và bộ phận sẽ tự động xuất hiện trên biên bản bàn giao.',
    'Company and department fields appear automatically on the handover record.',
  ],
  ['Logo công ty', 'Company logo'],
  ['Tên phần mềm', 'Application name'],
  ['Tên công ty', 'Company name'],
  ['Địa chỉ công ty', 'Company address'],
  ['Địa chỉ in trên biên bản', 'Address printed on the handover record'],
  ['Bộ phận quản lý / bàn giao', 'Managing / handover department'],
  ['Bộ phận IT / Quản lý tài sản', 'IT / Asset Management Department'],
  ['Mã mẫu biên bản', 'Handover template code'],
  ['Dòng mô tả', 'Tagline'],
  ['Màu thương hiệu', 'Brand color'],
  ['Chọn ảnh', 'Choose image'],
  ['Xóa logo', 'Remove logo'],
  ['XEM TRƯỚC', 'PREVIEW'],
  ['Email biên bản bàn giao', 'Handover record email'],
  [
    'Bản frontend mở ứng dụng email mặc định với nội dung được soạn sẵn. Gửi tự động sẽ được kích hoạt khi kết nối API email ở backend.',
    'The frontend opens the default email application with prepared content. Automatic sending will be enabled after connecting the backend email API.',
  ],
  ['Tên người gửi', 'Sender name'],
  ['Email phản hồi', 'Reply-to email'],
  ['CC mặc định', 'Default CC'],
  ['Tiêu đề email', 'Email subject'],
  ['Dùng {{asset_code}} để chèn mã tài sản.', 'Use {{asset_code}} to insert the asset code.'],
  ['Đã lưu cấu hình email.', 'Email settings saved.'],
  ['Tổng tài sản', 'Total assets'],
  ['Đang sử dụng', 'In use'],
  ['Sẵn sàng trong kho', 'Available in stock'],
  ['Bảo trì / Hỏng', 'Maintenance / Broken'],
  ['Quá hạn trả', 'Overdue returns'],
  ['Tài sản theo loại', 'Assets by category'],
  ['Tổng nguyên giá', 'Total purchase cost'],
  ['Danh sách tài sản', 'Asset list'],
  ['Tình trạng cần xử lý', 'Items requiring attention'],
  ['Xem cần xử lý', 'Needs attention'],
  ['Mở sổ tài sản', 'Open asset register'],
  ['Nhập tài sản', 'Receive asset'],
  ['Thêm tài sản', 'Add asset'],
  ['Nhập Excel', 'Import Excel'],
  ['Import Excel', 'Import Excel'],
  ['Xuất Excel', 'Export Excel'],
  ['Tải mẫu', 'Download template'],
  ['Tất cả phòng ban', 'All departments'],
  ['Tất cả trạng thái', 'All statuses'],
  ['Tất cả loại', 'All categories'],
  ['Tất cả vị trí', 'All locations'],
  ['Tất cả người dùng', 'All users'],
  ['Tất cả', 'All'],
  ['Danh mục được dùng khi cấp phát tài sản cho nhân viên.', 'Used when assigning assets to employees.'],
  ['Quản lý văn phòng, kho và địa điểm đặt tài sản.', 'Manage offices, warehouses and asset locations.'],
  ['Thêm phòng ban', 'Add department'],
  ['Thêm site', 'Add site'],
  ['Chưa chỉ định', 'Not assigned'],
  ['Không thể xóa phòng ban đang có tài sản', 'Cannot delete a department that has assets'],
  ['Không thể xóa site đang có tài sản', 'Cannot delete a site that has assets'],
  ['MÃ TÀI SẢN', 'ASSET CODE'],
  ['TÊN TÀI SẢN', 'ASSET NAME'],
  ['SERIAL / SERVICE TAG', 'SERIAL / SERVICE TAG'],
  ['LOẠI TÀI SẢN', 'CATEGORY'],
  ['PHÒNG BAN / VỊ TRÍ', 'DEPARTMENT / LOCATION'],
  ['NGƯỜI SỬ DỤNG', 'ASSIGNED USER'],
  ['NGUYÊN GIÁ', 'PURCHASE COST'],
  ['TRẠNG THÁI', 'STATUS'],
  ['NGÀY CẤP', 'ISSUED DATE'],
  ['NGÀY THU HỒI', 'RETURNED DATE'],
  ['HẠN TRẢ', 'DUE DATE'],
  ['THAO TÁC', 'ACTIONS'],
  ['TÀI SẢN', 'ASSET'],
  ['PHÒNG BAN', 'DEPARTMENT'],
  ['VỊ TRÍ', 'LOCATION'],
  ['LOẠI', 'CATEGORY'],
  ['Sẵn sàng', 'Available'],
  ['Bảo trì', 'Maintenance'],
  ['Hỏng', 'Broken'],
  ['Cho mượn', 'On loan'],
  ['Sắp đến hạn trả', 'Due soon'],
  ['Quá hạn', 'Overdue'],
  ['Chưa gán', 'Unassigned'],
  ['Máy tính', 'Computer'],
  ['Màn hình', 'Monitor'],
  ['Máy in', 'Printer'],
  ['Phần mềm & Bản quyền', 'Software & Licenses'],
  ['Tài sản số & Dữ liệu', 'Digital Assets & Data'],
  ['Thiết bị BYOD', 'BYOD Device'],
  ['Tai nghe', 'Headset'],
  ['Bàn phím', 'Keyboard'],
  ['Chuột', 'Mouse'],
  ['Phụ kiện', 'Accessories'],
  ['Nhóm khác', 'Other'],
  ['Ngày mua', 'Purchase date'],
  ['Mã:', 'Code:'],
  ['Phụ trách:', 'Manager:'],
  ['Mua ', 'Purchased '],
  ['Cập nhật ', 'Updated '],
  [' bản ghi', ' records'],
  [' tài sản', ' assets'],
  [' phòng ban', ' departments'],
  [' địa điểm', ' locations'],
  ['Hiển thị', 'Showing'],
  ['Số dòng', 'Rows'],
  ['Trang', 'Page'],
  ['Tìm mã, tên, serial, người sử dụng...', 'Search code, name, serial or user...'],
  ['Tìm kiếm', 'Search'],
  ['Làm mới', 'Refresh'],
  ['Bộ lọc nâng cao', 'Advanced filters'],
  ['Xóa bộ lọc', 'Clear filters'],
  ['Cấp phát', 'Issue'],
  ['Thu hồi', 'Return'],
  ['Điều chuyển', 'Transfer'],
  ['Nhập kho', 'Receive'],
  ['Kiểm kê', 'Inventory'],
  ['In tem', 'Print label'],
  ['In barcode', 'Print barcode'],
  ['In Barcode / QR', 'Print Barcode / QR'],
  ['In nhãn tài sản', 'Print asset label'],
  [
    'Chọn loại mã phù hợp với thiết bị quét của đơn vị.',
    'Choose the code type that matches your organization’s scanners.',
  ],
  ['Barcode', 'Barcode'],
  ['QR Code', 'QR Code'],
  ['Cả hai', 'Both'],
  ['Phù hợp máy quét 1D và tem dài', 'For 1D scanners and wide labels'],
  ['Tem vuông, quét bằng camera', 'Square label, scannable by camera'],
  ['In đồng thời Barcode và QR', 'Print Barcode and QR together'],
  ['Xuất sổ tài sản', 'Export asset register'],
  ['Không kèm mã', 'No code images'],
  ['File nhẹ, chỉ gồm dữ liệu', 'Smaller file with data only'],
  ['Kèm Barcode', 'Include Barcode'],
  ['Thêm ảnh Barcode cho từng tài sản', 'Add a Barcode image for each asset'],
  ['Kèm QR Code', 'Include QR Code'],
  ['Thêm ảnh QR cho từng tài sản', 'Add a QR image for each asset'],
  ['Kèm cả hai', 'Include both'],
  ['Thêm Barcode và QR Code', 'Add Barcode and QR Code images'],
  ['Đang tạo file...', 'Generating file...'],
  ['Mã Barcode / QR', 'Barcode / QR code'],
  ['Quét mã', 'Scan code'],
  ['Quét barcode', 'Scan barcode'],
  ['Quét kiểm kê', 'Scan inventory'],
  ['Xuất đối soát', 'Export reconciliation'],
  ['Thêm mới', 'Add new'],
  ['Chỉnh sửa', 'Edit'],
  ['Xóa', 'Delete'],
  ['Lưu', 'Save'],
  ['Hủy', 'Cancel'],
  ['Đóng', 'Close'],
  ['Xác nhận', 'Confirm'],
  ['Hoàn tất', 'Done'],
  ['Đăng xuất', 'Sign out'],
  ['Cài đặt', 'Settings'],
  ['Trợ giúp', 'Help'],
  ['Tổng quan', 'Overview'],
  ['Báo cáo', 'Reports'],
  ['Trang chủ', 'Home'],
  // These are localized only when the installation still uses AssetFlow's
  // built-in placeholders. Real company and person names remain untouched.
  ['Công ty của bạn', 'Your company'],
  ['Quản trị viên', 'Administrator'],
  ['Quản lý tài sản', 'Asset management'],
  ['TÀI SẢN', 'ASSETS'],
  ['NGHIỆP VỤ', 'OPERATIONS'],
  ['BÁO CÁO', 'REPORTING'],
  ['CÔNG CỤ', 'TOOLS'],
  ...featureTranslations.map(([source, target]): [string, string] => [source, target]),
]

const viToEnExact = new Map(viToEn.map(([source, target]) => [source.trim(), target]))
const originalText = new WeakMap<Node, string>()
const renderedText = new WeakMap<Node, string>()
const originalAttributes = new WeakMap<Element, Map<string, string>>()
const renderedAttributes = new WeakMap<Element, Map<string, string>>()

export function translateUiText(value: string, language: string) {
  if (language !== 'en-US') return value
  const leading = value.match(/^\s*/)?.[0] || ''
  const trailing = value.match(/\s*$/)?.[0] || ''
  const content = value.trim()
  const exact = viToEnExact.get(content)
  if (exact) return `${leading}${exact}${trailing}`
  const countPatterns: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
    [/^(\d+) tài sản$/, match => `${match[1]} assets`],
    [/^(\d+) bản ghi$/, match => `${match[1]} records`],
    [/^(\d+) phòng ban$/, match => `${match[1]} departments`],
    [/^(\d+) địa điểm$/, match => `${match[1]} locations`],
    [
      /^(\d+) ngôn ngữ phổ biến được hỗ trợ\. Thay đổi ngôn ngữ được áp dụng ngay\.$/,
      match => `${match[1]} popular languages are available. Language changes are applied immediately.`,
    ],
    [/^Hiển thị (.+) \/ (\d+) bản ghi$/, match => `Showing ${match[1]} / ${match[2]} records`],
    [/^Trang (\d+)\/(\d+)$/, match => `Page ${match[1]}/${match[2]}`],
    [/^Mua (.+)$/, match => `Purchased ${match[1]}`],
    [/^Cập nhật (.+)$/, match => `Updated ${match[1]}`],
    [
      /^Đợt (.+) · (.+) · (.+) đến (.+)$/,
      match => `Inventory session ${match[1]} · ${match[2]} · ${match[3]} to ${match[4]}`,
    ],
    [/^(\d+) giờ (\d+) phút$/, match => `${match[1]}h ${match[2]}m`],
    [/^(\d+) giờ$/, match => `${match[1]}h`],
    [/^(\d+) phút$/, match => `${match[1]}m`],
  ]
  for (const [pattern, render] of countPatterns) {
    const match = content.match(pattern)
    if (match) return `${leading}${render(match)}${trailing}`
  }
  return value
}

function translateRoot(root: ParentNode, language: string) {
  // Preserve the business value of options before translating their visible label.
  // Without an explicit value, changing option text also changes its form value.
  root
    .querySelectorAll<HTMLOptionElement>('option:not([value])')
    .forEach(option => option.setAttribute('value', option.value))
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const parent = node.parentElement
    if (!parent || ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)) continue
    const current = node.nodeValue || ''
    const previousRendered = renderedText.get(node)
    if (!originalText.has(node) || (previousRendered !== undefined && current !== previousRendered))
      originalText.set(node, current)
    const source = originalText.get(node) || ''
    const next = language === 'en-US' ? translateUiText(source, language) : source
    renderedText.set(node, next)
    if (next !== node.nodeValue) node.nodeValue = next
  }
  const elements =
    root instanceof Element
      ? [root, ...root.querySelectorAll<HTMLElement>('*')]
      : [...root.querySelectorAll<HTMLElement>('*')]
  for (const element of elements) {
    for (const attribute of ['placeholder', 'title', 'aria-label']) {
      const value = element.getAttribute(attribute)
      if (!value) continue
      const originals = originalAttributes.get(element) || new Map<string, string>()
      const rendered = renderedAttributes.get(element) || new Map<string, string>()
      const previousRendered = rendered.get(attribute)
      if (!originals.has(attribute) || (previousRendered !== undefined && value !== previousRendered))
        originals.set(attribute, value)
      const source = originals.get(attribute) || value
      const next = language === 'en-US' ? translateUiText(source, language) : source
      originals.set(attribute, source)
      rendered.set(attribute, next)
      originalAttributes.set(element, originals)
      renderedAttributes.set(element, rendered)
      if (next !== value) element.setAttribute(attribute, next)
    }
  }
}

export function useRuntimeI18n(language: string) {
  useEffect(() => {
    let scheduled = false
    const apply = () => {
      scheduled = false
      translateRoot(document.body, language)
    }
    const schedule = () => {
      if (!scheduled) {
        scheduled = true
        queueMicrotask(apply)
      }
    }
    apply()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label'],
    })
    return () => observer.disconnect()
  }, [language])
}
