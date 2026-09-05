import {
  IncidentImpact,
  IncidentPriority,
  IncidentStatus,
  IncidentUrgency,
  RecordStatus,
  UserRole,
} from '@prisma/client'

const priorityMatrix: Record<IncidentImpact, Record<IncidentUrgency, IncidentPriority>> = {
  CRITICAL: { HIGH: 'P1', MEDIUM: 'P1', LOW: 'P2' },
  HIGH: { HIGH: 'P1', MEDIUM: 'P2', LOW: 'P3' },
  MEDIUM: { HIGH: 'P2', MEDIUM: 'P3', LOW: 'P4' },
  LOW: { HIGH: 'P3', MEDIUM: 'P4', LOW: 'P4' },
}

export const incidentPriority = (impact: IncidentImpact, urgency: IncidentUrgency) => priorityMatrix[impact][urgency]

export const incidentSla = (priority: IncidentPriority) =>
  ({
    P1: { responseMinutes: 15, resolutionMinutes: 4 * 60 },
    P2: { responseMinutes: 30, resolutionMinutes: 8 * 60 },
    P3: { responseMinutes: 4 * 60, resolutionMinutes: 3 * 24 * 60 },
    P4: { responseMinutes: 8 * 60, resolutionMinutes: 5 * 24 * 60 },
  })[priority]

const transitions: Record<IncidentStatus, IncidentStatus[]> = {
  NEW: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['MONITORING', 'RESOLVED'],
  MONITORING: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: [],
  CANCELLED: [],
}

export function assertIncidentTransition(from: IncidentStatus, to: IncidentStatus) {
  if (from === to) return
  if (!transitions[from].includes(to)) throw new Error('INCIDENT_TRANSITION_NOT_ALLOWED')
}

export const incidentStatusRequiresAssignee = (status: IncidentStatus) =>
  ['ACKNOWLEDGED', 'IN_PROGRESS', 'MONITORING', 'RESOLVED', 'CLOSED'].includes(status)

type IncidentWorkflowRecord = {
  assignedToId?: string | null
  initialAssessment?: string | null
  containmentAction?: string | null
  resolution?: string | null
  rootCause?: string | null
  correctiveAction?: string | null
  preventiveAction?: string | null
  lessonsLearned?: string | null
}

const hasText = (value?: string | null) => Boolean(value?.trim())

export const incidentMissingFields = (status: IncidentStatus, incident: IncidentWorkflowRecord) => {
  const missing: string[] = []
  if (incidentStatusRequiresAssignee(status) && !incident.assignedToId) missing.push('assignedToId')
  if (['IN_PROGRESS', 'MONITORING', 'RESOLVED', 'CLOSED'].includes(status) && !hasText(incident.initialAssessment))
    missing.push('initialAssessment')
  if (['MONITORING', 'RESOLVED', 'CLOSED'].includes(status) && !hasText(incident.containmentAction))
    missing.push('containmentAction')
  if (['RESOLVED', 'CLOSED'].includes(status)) {
    if (!hasText(incident.resolution)) missing.push('resolution')
    if (!hasText(incident.rootCause)) missing.push('rootCause')
    if (!hasText(incident.correctiveAction)) missing.push('correctiveAction')
  }
  if (status === 'CLOSED') {
    if (!hasText(incident.preventiveAction)) missing.push('preventiveAction')
    if (!hasText(incident.lessonsLearned)) missing.push('lessonsLearned')
  }
  return missing
}

export const isEligibleIncidentOperator = (user: {
  role: UserRole
  status: RecordStatus
  department?: { status: RecordStatus; isIncidentResponseTeam: boolean } | null
}) =>
  Boolean(
    ['ADMIN', 'IT'].includes(user.role) &&
    user.status === 'ACTIVE' &&
    user.department?.status === 'ACTIVE' &&
    user.department.isIncidentResponseTeam,
  )
