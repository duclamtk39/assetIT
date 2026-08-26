import assert from 'node:assert/strict'
import test from 'node:test'
import { missingIncidentWorkflowFields } from '../src/features/incidents/incident-workflow'

test('incident workflow validates assignment and analysis before processing',()=>{
  assert.deepEqual(missingIncidentWorkflowFields('ACKNOWLEDGED',{}),['assignedToId'])
  assert.deepEqual(missingIncidentWorkflowFields('ACKNOWLEDGED',{assignedToId:'user-1'}),[])
  assert.deepEqual(missingIncidentWorkflowFields('IN_PROGRESS',{assignedToId:'user-1'}),['initialAssessment'])
})

test('incident workflow validates RCA, CAPA and lessons before closure',()=>{
  const response={assignedToId:'user-1',initialAssessment:'Đã đánh giá',containmentAction:'Đã cô lập'}
  assert.deepEqual(missingIncidentWorkflowFields('RESOLVED',response),['resolution','rootCause','correctiveAction'])
  const resolved={...response,resolution:'Đã khôi phục',rootCause:'Mất nguồn',correctiveAction:'Thay UPS'}
  assert.deepEqual(missingIncidentWorkflowFields('RESOLVED',resolved),[])
  assert.deepEqual(missingIncidentWorkflowFields('CLOSED',resolved),['preventiveAction','lessonsLearned'])
  assert.deepEqual(missingIncidentWorkflowFields('CLOSED',{...resolved,preventiveAction:'Kiểm tra định kỳ',lessonsLearned:'Theo dõi cảnh báo'}),[])
})
