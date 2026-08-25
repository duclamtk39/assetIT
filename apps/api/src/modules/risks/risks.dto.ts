import { Transform, Type } from 'class-transformer'
import { IsArray, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator'
import { RiskAssessmentStatus, RiskControlStatus, RiskItemStatus, RiskReviewDecision, RiskSource, RiskTreatmentStatus, RiskTreatmentStrategy } from '@prisma/client'

export class ListRiskAssessmentsQuery {
  @IsOptional() @IsString() @MaxLength(200) search?: string
  @IsOptional() @IsEnum(RiskAssessmentStatus) status?: RiskAssessmentStatus
  @IsOptional() @IsUUID() departmentId?: string
  @Transform(({ value }) => Number(value || 1)) @IsInt() @Min(1) page = 1
  @Transform(({ value }) => Number(value || 20)) @IsInt() @Min(1) @Max(100) limit = 20
}

export class ListRisksQuery {
  @IsOptional() @IsString() @MaxLength(200) search?: string
  @IsOptional() @IsEnum(RiskItemStatus) status?: RiskItemStatus
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) level?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  @IsOptional() @IsUUID() assessmentId?: string
  @IsOptional() @IsUUID() departmentId?: string
  @IsOptional() @IsUUID() ownerId?: string
  @Transform(({ value }) => Number(value || 1)) @IsInt() @Min(1) page = 1
  @Transform(({ value }) => Number(value || 20)) @IsInt() @Min(1) @Max(100) limit = 20
}

export class CreateRiskAssessmentDto {
  @IsString() @IsNotEmpty() @MaxLength(250) title!: string
  @IsOptional() @IsString() @MaxLength(10000) description?: string
  @IsString() @IsNotEmpty() @MaxLength(20000) scope!: string
  @IsOptional() @IsString() @MaxLength(80) methodology = 'ISO_27005_NIST_800_30'
  @IsUUID() ownerId!: string
  @IsOptional() @IsUUID() approverId?: string
  @IsOptional() @IsUUID() departmentId?: string
  @IsDateString() startDate!: string
  @IsOptional() @IsDateString() targetDate?: string
  @IsOptional() @IsDateString() nextReviewAt?: string
}

export class CreateRiskItemDto {
  @IsString() @IsNotEmpty() @MaxLength(250) title!: string
  @IsString() @IsNotEmpty() @MaxLength(100) category!: string
  @IsString() @IsNotEmpty() @MaxLength(10000) scenario!: string
  @IsString() @IsNotEmpty() @MaxLength(10000) threat!: string
  @IsString() @IsNotEmpty() @MaxLength(10000) vulnerability!: string
  @IsOptional() @IsString() @MaxLength(10000) existingControls?: string
  @IsOptional() @IsEnum(RiskSource) source: RiskSource = RiskSource.MANUAL
  @Type(() => Number) @IsInt() @Min(1) @Max(5) likelihood!: number
  @Type(() => Number) @IsInt() @Min(1) @Max(5) impact!: number
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) residualLikelihood?: number
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) residualImpact?: number
  @IsOptional() @IsEnum(RiskTreatmentStrategy) treatmentStrategy: RiskTreatmentStrategy = RiskTreatmentStrategy.MITIGATE
  @IsOptional() @IsString() @MaxLength(10000) acceptanceRationale?: string
  @IsUUID() ownerId!: string
  @IsOptional() @IsUUID() departmentId?: string
  @IsOptional() @IsDateString() dueDate?: string
  @IsOptional() @IsDateString() nextReviewAt?: string
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) assetIds: string[] = []
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) incidentIds: string[] = []
}

export class UpdateRiskItemDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(250) title?: string
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) category?: string
  @IsOptional() @IsString() @MaxLength(10000) scenario?: string
  @IsOptional() @IsString() @MaxLength(10000) threat?: string
  @IsOptional() @IsString() @MaxLength(10000) vulnerability?: string
  @IsOptional() @IsString() @MaxLength(10000) existingControls?: string
  @IsOptional() @IsEnum(RiskItemStatus) status?: RiskItemStatus
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) likelihood?: number
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) impact?: number
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) residualLikelihood?: number
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) residualImpact?: number
  @IsOptional() @IsEnum(RiskTreatmentStrategy) treatmentStrategy?: RiskTreatmentStrategy
  @IsOptional() @IsString() @MaxLength(10000) acceptanceRationale?: string
  @IsOptional() @IsUUID() ownerId?: string
  @IsOptional() @IsUUID() departmentId?: string
  @IsOptional() @IsDateString() dueDate?: string
  @IsOptional() @IsDateString() nextReviewAt?: string
}

export class CreateRiskControlDto {
  @IsOptional() @IsString() @MaxLength(80) controlCode?: string
  @IsString() @IsNotEmpty() @MaxLength(250) title!: string
  @IsOptional() @IsString() @MaxLength(10000) description?: string
  @IsOptional() @IsString() @MaxLength(100) framework?: string
  @IsOptional() @IsEnum(RiskControlStatus) status: RiskControlStatus = RiskControlStatus.PLANNED
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) effectiveness?: number
  @IsOptional() @IsString() @MaxLength(10000) evidence?: string
}

export class CreateRiskTreatmentDto {
  @IsString() @IsNotEmpty() @MaxLength(250) title!: string
  @IsOptional() @IsString() @MaxLength(10000) description?: string
  @IsUUID() assigneeId!: string
  @IsDateString() dueDate!: string
}

export class UpdateRiskTreatmentDto {
  @IsOptional() @IsEnum(RiskTreatmentStatus) status?: RiskTreatmentStatus
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) progress?: number
  @IsOptional() @IsString() @MaxLength(10000) outcome?: string
}

export class ReviewRiskDto {
  @IsEnum(RiskReviewDecision) decision!: RiskReviewDecision
  @IsString() @IsNotEmpty() @MaxLength(10000) note!: string
}
