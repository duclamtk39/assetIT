import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertIncidentTransition,
  incidentMissingFields,
  incidentPriority,
  incidentSla,
  incidentStatusRequiresAssignee,
  isEligibleIncidentOperator,
} from '../src/modules/incidents/incidents.rules'
import { IncidentsService } from '../src/modules/incidents/incidents.service'

test('incident priority is calculated from impact and urgency', () => {
  assert.equal(incidentPriority('CRITICAL', 'HIGH'), 'P1')
  assert.equal(incidentPriority('HIGH', 'MEDIUM'), 'P2')
  assert.equal(incidentPriority('MEDIUM', 'MEDIUM'), 'P3')
  assert.equal(incidentPriority('LOW', 'LOW'), 'P4')
})

test('incident workflow prevents skipping assessment and closure stages', () => {
  assert.doesNotThrow(() => assertIncidentTransition('NEW', 'ACKNOWLEDGED'))
  assert.doesNotThrow(() => assertIncidentTransition('IN_PROGRESS', 'MONITORING'))
  assert.doesNotThrow(() => assertIncidentTransition('RESOLVED', 'CLOSED'))
  assert.throws(() => assertIncidentTransition('NEW', 'RESOLVED'), /INCIDENT_TRANSITION_NOT_ALLOWED/)
  assert.throws(() => assertIncidentTransition('CLOSED', 'IN_PROGRESS'), /INCIDENT_TRANSITION_NOT_ALLOWED/)
})

test('P1 SLA is stricter than P4', () => {
  assert.ok(incidentSla('P1').responseMinutes < incidentSla('P4').responseMinutes)
  assert.ok(incidentSla('P1').resolutionMinutes < incidentSla('P4').resolutionMinutes)
})

test('incident processing requires an assigned IT response operator', () => {
  assert.equal(incidentStatusRequiresAssignee('NEW'), false)
  assert.equal(incidentStatusRequiresAssignee('ACKNOWLEDGED'), true)
  assert.equal(incidentStatusRequiresAssignee('IN_PROGRESS'), true)
  assert.equal(incidentStatusRequiresAssignee('MONITORING'), true)
  assert.equal(incidentStatusRequiresAssignee('RESOLVED'), true)
  assert.equal(incidentStatusRequiresAssignee('CLOSED'), true)
  assert.equal(
    isEligibleIncidentOperator({
      role: 'IT',
      status: 'ACTIVE',
      department: { status: 'ACTIVE', isIncidentResponseTeam: true },
    }),
    true,
  )
  assert.equal(
    isEligibleIncidentOperator({
      role: 'ADMIN',
      status: 'ACTIVE',
      department: { status: 'ACTIVE', isIncidentResponseTeam: false },
    }),
    false,
  )
  assert.equal(
    isEligibleIncidentOperator({
      role: 'IT',
      status: 'INACTIVE',
      department: { status: 'ACTIVE', isIncidentResponseTeam: true },
    }),
    false,
  )
})

test('incident resolution and closure require evidence in workflow order', () => {
  const assigned = { assignedToId: 'user-1', initialAssessment: 'Đã đánh giá', containmentAction: 'Đã cô lập' }
  assert.deepEqual(incidentMissingFields('ACKNOWLEDGED', assigned), [])
  assert.deepEqual(incidentMissingFields('IN_PROGRESS', { assignedToId: 'user-1' }), ['initialAssessment'])
  assert.deepEqual(incidentMissingFields('MONITORING', assigned), [])
  assert.deepEqual(incidentMissingFields('RESOLVED', assigned), ['resolution', 'rootCause', 'correctiveAction'])
  const resolved = { ...assigned, resolution: 'Khôi phục', rootCause: 'Mất nguồn', correctiveAction: 'Thay UPS' }
  assert.deepEqual(incidentMissingFields('RESOLVED', resolved), [])
  assert.deepEqual(incidentMissingFields('CLOSED', resolved), ['preventiveAction', 'lessonsLearned'])
  assert.deepEqual(
    incidentMissingFields('CLOSED', {
      ...resolved,
      preventiveAction: 'Kiểm tra định kỳ',
      lessonsLearned: 'Theo dõi cảnh báo',
    }),
    [],
  )
})

const incidentRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'inc-1',
  incidentNo: 'SC-001',
  title: 'Mất kết nối máy chủ ERP',
  category: 'AVAILABILITY',
  status: 'CLOSED',
  priority: 'P2',
  asset: { assetTag: 'TS-001' },
  detectedAt: new Date('2026-09-01T00:00:00Z'),
  resolvedAt: new Date('2026-09-01T04:00:00Z'),
  resolution: 'Khởi động lại dịch vụ',
  rootCause: 'Hết dung lượng ổ đĩa',
  activities: [{ type: 'NOTE', note: 'Đã khoanh vùng', createdAt: new Date('2026-09-01T01:00:00Z') }],
  riskLinks: [],
  ...overrides,
})

test('an incident the risk register cites is deleted, and the citation is named in the audit entry', async () => {
  // RiskIncident is declared Restrict, so the links have to be cleared before the incident can go.
  // The risks that pointed at it are recorded, so the register's lost citation is still traceable.
  const order: string[] = []
  let audited: any
  const tx = {
    auditLog: {
      create: async ({ data }: any) => {
        order.push('audit')
        audited = data
        return {}
      },
    },
    riskIncident: {
      deleteMany: async () => {
        order.push('links')
        return { count: 1 }
      },
    },
    incident: {
      delete: async () => {
        order.push('incident')
        return {}
      },
    },
  }
  const db = {
    incident: {
      findUnique: async () =>
        incidentRecord({ riskLinks: [{ risk: { riskNo: 'RR-004', title: 'Gián đoạn dịch vụ' } }] }),
    },
    $transaction: (work: any) => work(tx),
  }
  const service = new IncidentsService(db as any)
  assert.deepEqual(await service.remove('inc-1', { id: 'admin', role: 'ADMIN', departmentId: null }), {
    success: true,
  })
  assert.deepEqual(order, ['audit', 'links', 'incident'])
  assert.deepEqual(audited.oldValues.riskLinks, [{ riskNo: 'RR-004', title: 'Gián đoạn dịch vụ' }])
})

test('deleting an incident keeps its timeline in the audit log', async () => {
  let audited: any
  const tx = {
    auditLog: {
      create: async ({ data }: any) => {
        audited = data
        return {}
      },
    },
    riskIncident: { deleteMany: async () => ({ count: 0 }) },
    incident: { delete: async () => ({}) },
  }
  const db = { incident: { findUnique: async () => incidentRecord() }, $transaction: (work: any) => work(tx) }
  const service = new IncidentsService(db as any)
  assert.deepEqual(await service.remove('inc-1', { id: 'admin', role: 'ADMIN', departmentId: null }), {
    success: true,
  })
  assert.equal(audited.action, 'INCIDENT_DELETED')
  assert.equal(audited.oldValues.incidentNo, 'SC-001')
  assert.equal(audited.oldValues.assetTag, 'TS-001')
  assert.equal(audited.oldValues.rootCause, 'Hết dung lượng ổ đĩa')
  assert.equal(audited.oldValues.activities.length, 1)
})

test('only an administrator can delete an incident', async () => {
  const db = { incident: { findUnique: async () => assert.fail('role is checked first') } }
  await assert.rejects(
    () => new IncidentsService(db as any).remove('inc-1', { id: 'it', role: 'IT', departmentId: null }),
    /Chỉ Admin/,
  )
})
