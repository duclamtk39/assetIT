export type AnnexTheme = 'ORGANIZATIONAL' | 'PEOPLE' | 'PHYSICAL' | 'TECHNOLOGICAL'
export type SoaDecision = 'APPLICABLE' | 'EXCLUDED'
export type Implementation = 'NOT_STARTED' | 'PLANNED' | 'PARTIAL' | 'IMPLEMENTED'
export type SoaStatus = 'DRAFT' | 'ISSUED' | 'SUPERSEDED'
export type DocumentType = 'POLICY' | 'PROCEDURE' | 'REGULATION' | 'GUIDELINE' | 'FORM' | 'RECORD'
export type DocumentStatus = 'DRAFT' | 'ISSUED' | 'SUPERSEDED' | 'WITHDRAWN'

export interface Lookup {
  id: string
  fullName?: string
  name?: string
  role?: string
  complianceAccess?: boolean
}

export interface EvidenceSource {
  module: string
  route: string
  description: string
}

export interface ControlSummary {
  code: string
  theme: AnnexTheme
  title: string
  titleVi: string
  decision: SoaDecision | null
  justification: string | null
  implementation: Implementation | null
  evidenceSource: EvidenceSource | null
  documents: Array<{ id: string; documentCode: string; title: string; status: DocumentStatus }>
}

export interface Catalogue {
  standard: string
  themes: Array<{ key: AnnexTheme; clause: string; name: string; nameVi: string }>
  soa: { id: string; version: string; issuedAt: string | null; status: SoaStatus } | null
  controls: ControlSummary[]
}

export interface SoaEntry {
  id: string
  controlCode: string
  decision: SoaDecision
  justification: string
  implementation: Implementation
  implementationNote: string | null
}

export interface SoaVersion {
  id: string
  version: string
  status: SoaStatus
  scope: string
  note: string | null
  issuedAt: string | null
  approvedAt: string | null
  approver?: Lookup | null
  creator?: Lookup
  _count?: { entries: number }
}

export interface SoaDetail extends SoaVersion {
  entries: Array<{
    code: string
    theme: AnnexTheme
    title: string
    titleVi: string
    entry: SoaEntry | null
    evidenceSource: EvidenceSource | null
  }>
}

export interface DocumentFile {
  id: string
  originalName: string
  mimeType: string
  fileSize: number
  checksumSha256: string
  createdAt: string
  uploader: Lookup
}

export interface ComplianceDocument {
  id: string
  documentCode: string
  title: string
  type: DocumentType
  status: DocumentStatus
  version: string
  summary: string | null
  issuedAt: string | null
  effectiveFrom: string | null
  nextReviewAt: string | null
  approvedAt: string | null
  owner: Lookup
  approver?: Lookup | null
  department?: { id: string; name: string } | null
  controls: Array<{ controlCode: string }>
  files: DocumentFile[]
}

export interface ComplianceSummary {
  totalControls: number
  documentsIssued: number
  documentsByStatus: Array<{ label: string; count: number }>
  reviewDue: number
  soa: { version: string; issuedAt: string | null; applicable: number; excluded: number; implemented: number } | null
  linkedEvidence: number
}

export const themeLabels: Record<AnnexTheme, string> = {
  ORGANIZATIONAL: 'Tổ chức',
  PEOPLE: 'Con người',
  PHYSICAL: 'Vật lý',
  TECHNOLOGICAL: 'Công nghệ',
}

export const decisionLabels: Record<SoaDecision, string> = {
  APPLICABLE: 'Áp dụng',
  EXCLUDED: 'Loại trừ',
}

export const implementationLabels: Record<Implementation, string> = {
  NOT_STARTED: 'Chưa bắt đầu',
  PLANNED: 'Đã lên kế hoạch',
  PARTIAL: 'Một phần',
  IMPLEMENTED: 'Đã triển khai',
}

export const soaStatusLabels: Record<SoaStatus, string> = {
  DRAFT: 'Bản nháp',
  ISSUED: 'Đang hiệu lực',
  SUPERSEDED: 'Đã thay thế',
}

export const documentTypeLabels: Record<DocumentType, string> = {
  POLICY: 'Chính sách',
  PROCEDURE: 'Quy trình',
  REGULATION: 'Quy định',
  GUIDELINE: 'Hướng dẫn',
  FORM: 'Biểu mẫu',
  RECORD: 'Hồ sơ',
}

export const documentStatusLabels: Record<DocumentStatus, string> = {
  DRAFT: 'Bản nháp',
  ISSUED: 'Đang hiệu lực',
  SUPERSEDED: 'Đã thay thế',
  WITHDRAWN: 'Đã thu hồi',
}

export const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

export const viDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('vi-VN') : '—')
