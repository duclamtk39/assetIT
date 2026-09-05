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
