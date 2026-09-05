import { RiskAssessmentStatus, RiskLevel, RiskReviewDecision } from '@prisma/client'

export function calculateRiskScore(likelihood: number, impact: number) {
  if (
    !Number.isInteger(likelihood) ||
    likelihood < 1 ||
    likelihood > 5 ||
    !Number.isInteger(impact) ||
    impact < 1 ||
    impact > 5
  )
    throw new Error('Risk likelihood and impact must be integers from 1 to 5')
  const score = likelihood * impact
  const level: RiskLevel =
    score >= 17 ? RiskLevel.CRITICAL : score >= 10 ? RiskLevel.HIGH : score >= 5 ? RiskLevel.MEDIUM : RiskLevel.LOW
  return { score, level }
}

export function assessmentStatusAfterDecision(current: RiskAssessmentStatus, decision: RiskReviewDecision) {
  if (decision === RiskReviewDecision.SUBMIT && current === RiskAssessmentStatus.DRAFT)
    return RiskAssessmentStatus.IN_REVIEW
  if (decision === RiskReviewDecision.RETURN_FOR_CHANGES && current === RiskAssessmentStatus.IN_REVIEW)
    return RiskAssessmentStatus.DRAFT
  if (decision === RiskReviewDecision.APPROVE && current === RiskAssessmentStatus.IN_REVIEW)
    return RiskAssessmentStatus.APPROVED
  const closable: RiskAssessmentStatus[] = [
    RiskAssessmentStatus.APPROVED,
    RiskAssessmentStatus.TREATMENT,
    RiskAssessmentStatus.MONITORING,
  ]
  if (decision === RiskReviewDecision.CLOSE && closable.includes(current)) return RiskAssessmentStatus.CLOSED
  throw new Error('Invalid risk assessment workflow transition')
}
