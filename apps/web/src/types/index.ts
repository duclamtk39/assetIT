export type AssetStatus = 'Đang sử dụng' | 'Sẵn sàng' | 'Đã giữ chỗ' | 'Đã thu hồi' | 'Bảo trì' | 'Hỏng' | 'Đã thanh lý'

export interface Asset {
  id: number
  apiId?: string
  code: string
  barcode?: string
  qrCode?: string
  name: string
  category: string
  serial: string
  department: string
  location: string
  assignedTo: string
  purchaseDate: string
  purchaseCost: number
  status: AssetStatus
  icon: string
  condition?: 'Tốt' | 'Trầy xước nhẹ' | 'Cần kiểm tra' | 'Hỏng'
  dueDate?: string
  recipientEmail?: string
  assignmentType?: 'Cấp phát' | 'Cho mượn'
  manufacturer?: string
  model?: string
  cpu?: string
  ram?: string
  storage?: string
  operatingSystem?: string
  ipAddress?: string
  macAddress?: string
  imageDataUrl?: string
}

export type TransactionType = 'Nhập kho' | 'Cấp phát' | 'Cho mượn' | 'Thu hồi' | 'Điều chuyển'

export interface AssetTransaction {
  id: number
  assetId: number
  assetCode: string
  assetName: string
  type: TransactionType
  from: string
  to: string
  performedBy: string
  date: string
  note: string
  condition?: string
  dueDate?: string
  recipientEmail?: string
}

export interface Department {
  id: number
  name: string
  code: string
  manager: string
  managerId?: string
  isIncidentResponseTeam?: boolean
}

export interface Site {
  id: number
  name: string
  code: string
  address: string
}

export interface EmailSettings {
  senderName: string
  replyTo: string
  cc: string
  subjectTemplate: string
}

export interface BrandingSettings {
  appName: string
  companyName: string
  companyAddress: string
  handoverDepartment: string
  handoverFormCode: string
  tagline: string
  primaryColor: string
  logoDataUrl: string
}

export interface RegionalSettings {
  language: string
  timezone: string
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  timeFormat: '24h' | '12h'
  firstDayOfWeek: 'monday' | 'sunday'
}

export type UserRole = 'Admin' | 'IT' | 'HCNS'

export interface AppUser {
  id: number | string
  username: string
  password?: string
  name: string
  email: string
  role: UserRole
  departmentScope: string[]
  mustChangePassword?: boolean
}
