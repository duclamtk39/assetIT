import assert from 'node:assert/strict'
import test from 'node:test'
import { RiskAssessmentStatus, RiskLevel, RiskReviewDecision } from '@prisma/client'
import { assessmentStatusAfterDecision, calculateRiskScore } from '../src/modules/risks/risks.rules'
import {
  acceptanceCriteria,
  acceptanceRuleFor,
  impactScale,
  likelihoodScale,
  riskCriteria,
  riskLevelFor,
} from '../src/modules/risks/risk-criteria'

test('risk level comes from the criteria matrix, not from the product of the two axes', () => {
  // calculateRiskScore(likelihood, impact)
  assert.deepEqual(calculateRiskScore(1, 4), { score: 4, level: RiskLevel.MEDIUM })
  assert.deepEqual(calculateRiskScore(3, 3), { score: 9, level: RiskLevel.MEDIUM })
  assert.deepEqual(calculateRiskScore(4, 4), { score: 16, level: RiskLevel.CRITICAL })
  assert.deepEqual(calculateRiskScore(5, 4), { score: 20, level: RiskLevel.CRITICAL })
})

test('a rare catastrophe outranks a constant nuisance despite the identical product', () => {
  // Both score 5. Weighing them the same was the flaw in multiplying the axes together.
  assert.equal(calculateRiskScore(1, 5).level, RiskLevel.HIGH)
  assert.equal(calculateRiskScore(5, 1).level, RiskLevel.MEDIUM)
})

test('nothing catastrophic is ever below High and nothing negligible ever reaches Critical', () => {
  for (const likelihood of [1, 2, 3, 4, 5]) {
    assert.ok(
      [RiskLevel.HIGH, RiskLevel.CRITICAL].includes(riskLevelFor(likelihood, 5)),
      `impact 5 with likelihood ${likelihood} must stay at least High`,
    )
    assert.notEqual(riskLevelFor(likelihood, 1), RiskLevel.CRITICAL)
  }
})

test('risk level never falls when either axis rises', () => {
  const order = [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL]
  for (let likelihood = 1; likelihood <= 5; likelihood++)
    for (let impact = 1; impact <= 5; impact++) {
      const rank = order.indexOf(riskLevelFor(likelihood, impact))
      if (likelihood < 5) assert.ok(order.indexOf(riskLevelFor(likelihood + 1, impact)) >= rank)
      if (impact < 5) assert.ok(order.indexOf(riskLevelFor(likelihood, impact + 1)) >= rank)
    }
})

test('every cell of the published matrix has a documented level and acceptance rule', () => {
  assert.equal(riskCriteria.matrix.length, 25)
  for (const cell of riskCriteria.matrix) {
    assert.equal(cell.level, riskLevelFor(cell.likelihood, cell.impact))
    assert.ok(acceptanceRuleFor(cell.level).rule.length > 0)
  }
})

test('both scales define all five steps and every impact dimension', () => {
  assert.deepEqual(
    likelihoodScale.map(item => item.value),
    [1, 2, 3, 4, 5],
  )
  assert.deepEqual(
    impactScale.map(item => item.value),
    [1, 2, 3, 4, 5],
  )
  for (const item of [...likelihoodScale, ...impactScale]) assert.ok(item.definition.trim().length > 0)
  for (const item of impactScale)
    for (const dimension of riskCriteria.impactDimensions) assert.ok(item.dimensions[dimension].trim().length > 0)
})

test('critical residual risk may not be accepted and review cadence tightens with the level', () => {
  assert.equal(acceptanceRuleFor(RiskLevel.CRITICAL).acceptable, false)
  for (const level of [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH])
    assert.equal(acceptanceRuleFor(level).acceptable, true)
  const cadence = acceptanceCriteria.map(item => item.reviewMonths)
  assert.deepEqual(
    [...cadence].sort((a, b) => b - a),
    cadence,
  )
  for (const level of [RiskLevel.HIGH, RiskLevel.CRITICAL])
    assert.equal(acceptanceRuleFor(level).treatmentRequired, true)
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
