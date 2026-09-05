export type IncidentWorkflowStatus =
  'NEW' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'MONITORING' | 'RESOLVED' | 'CLOSED' | 'CANCELLED'

export const workflowFieldLabels: Record<string, string> = {
  assignedToId: 'người xử lý IT',
  initialAssessment: 'đánh giá ban đầu',
  containmentAction: 'khoanh vùng / ứng phó tức thời',
  resolution: 'xử lý và khôi phục dịch vụ',
  rootCause: 'nguyên nhân gốc (RCA)',
  correctiveAction: 'hành động khắc phục',
  preventiveAction: 'hành động phòng ngừa',
  lessonsLearned: 'bài học kinh nghiệm',
}

const requiredWorkflowFields: Partial<Record<IncidentWorkflowStatus, string[]>> = {
  ACKNOWLEDGED: ['assignedToId'],
  IN_PROGRESS: ['assignedToId', 'initialAssessment'],
  MONITORING: ['assignedToId', 'initialAssessment', 'containmentAction'],
  RESOLVED: ['assignedToId', 'initialAssessment', 'containmentAction', 'resolution', 'rootCause', 'correctiveAction'],
  CLOSED: [
    'assignedToId',
    'initialAssessment',
    'containmentAction',
    'resolution',
    'rootCause',
    'correctiveAction',
    'preventiveAction',
    'lessonsLearned',
  ],
}

export const missingIncidentWorkflowFields = (status: IncidentWorkflowStatus, form: Record<string, unknown>) =>
  (requiredWorkflowFields[status] || []).filter(field => !String(form[field] || '').trim())
