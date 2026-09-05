import assert from 'node:assert/strict'
import test from 'node:test'
import { RiskAssessmentStatus, RiskLevel, RiskReviewDecision } from '@prisma/client'
import { assessmentStatusAfterDecision, calculateRiskScore } from '../src/modules/risks/risks.rules'

test('risk matrix derives a server-side score and level', () => {
  assert.deepEqual(calculateRiskScore(1, 4), { score: 4, level: RiskLevel.LOW })
  assert.deepEqual(calculateRiskScore(3, 3), { score: 9, level: RiskLevel.MEDIUM })
  assert.deepEqual(calculateRiskScore(4, 4), { score: 16, level: RiskLevel.HIGH })
  assert.deepEqual(calculateRiskScore(5, 4), { score: 20, level: RiskLevel.CRITICAL })
})

test('risk matrix rejects values outside the configured 5 by 5 scale', () => {
  assert.throws(() => calculateRiskScore(0, 5))
  assert.throws(() => calculateRiskScore(5, 6))
})

test('risk assessment requires review before approval', () => {
  assert.equal(
    assessmentStatusAfterDecision(RiskAssessmentStatus.DRAFT, RiskReviewDecision.SUBMIT),
    RiskAssessmentStatus.IN_REVIEW,
  )
  assert.equal(
    assessmentStatusAfterDecision(RiskAssessmentStatus.IN_REVIEW, RiskReviewDecision.APPROVE),
    RiskAssessmentStatus.APPROVED,
  )
  assert.throws(() => assessmentStatusAfterDecision(RiskAssessmentStatus.DRAFT, RiskReviewDecision.APPROVE))
})
