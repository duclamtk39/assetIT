import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { IncidentCategory, IncidentImpact, IncidentPriority, IncidentStatus, IncidentUrgency } from '@prisma/client'

export class ListIncidentsQuery {
  @IsOptional() @IsString() @MaxLength(200) search?: string
  @IsOptional() @IsEnum(IncidentStatus) status?: IncidentStatus
  @IsOptional() @IsEnum(IncidentCategory) category?: IncidentCategory
  @IsOptional() @IsEnum(IncidentPriority) priority?: IncidentPriority
  @IsOptional() @IsUUID() departmentId?: string
  @IsOptional() @IsDateString() from?: string
  @IsOptional() @IsDateString() to?: string
  @IsOptional() @IsIn(['all', 'open', 'critical', 'resolved', 'overdue', 'downtime']) view:
    'all' | 'open' | 'critical' | 'resolved' | 'overdue' | 'downtime' = 'all'
  @Transform(({ value }) => Number(value || 1)) @IsInt() @Min(1) page = 1
  @Transform(({ value }) => Number(value || 20)) @IsInt() @Min(1) @Max(100) limit = 20
}

export class IncidentSummaryQuery {
  @IsOptional() @IsIn(['week', 'month', 'year']) period: 'week' | 'month' | 'year' = 'month'
  @IsOptional() @IsDateString() reference?: string
}

export class CreateIncidentDto {
  @IsString() @IsNotEmpty() @MaxLength(250) title!: string
  @IsEnum(IncidentCategory) category!: IncidentCategory
  @IsEnum(IncidentImpact) impact!: IncidentImpact
  @IsEnum(IncidentUrgency) urgency!: IncidentUrgency
  @IsString() @IsNotEmpty() @MaxLength(10000) description!: string
  @IsString() @IsNotEmpty() @MaxLength(150) reporterName!: string
  @IsDateString() detectedAt!: string
  @IsOptional() @IsString() @MaxLength(255) reporterContact?: string
  @IsOptional() @IsString() @MaxLength(200) serviceName?: string
  @IsOptional() @IsString() @MaxLength(5000) businessImpact?: string
  @IsOptional() @IsString() @MaxLength(5000) initialAssessment?: string
  @IsOptional() @IsUUID() departmentId?: string
  @IsOptional() @IsUUID() locationId?: string
  @IsOptional() @IsUUID() assetId?: string
  @IsOptional() @IsUUID() assignedToId?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000000) affectedUsers = 0
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(5256000) downtimeMinutes = 0
  @IsOptional() @IsBoolean() isSecurityIncident = false
  @IsOptional() @IsBoolean() isBusinessContinuityEvent = false
}

export class UpdateIncidentDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(250) title?: string
  @IsOptional() @IsEnum(IncidentCategory) category?: IncidentCategory
  @IsOptional() @IsEnum(IncidentImpact) impact?: IncidentImpact
  @IsOptional() @IsEnum(IncidentUrgency) urgency?: IncidentUrgency
  @IsOptional() @IsString() @MaxLength(10000) description?: string
  @IsOptional() @IsString() @MaxLength(150) reporterName?: string
  @IsOptional() @IsString() @MaxLength(255) reporterContact?: string
  @IsOptional() @IsString() @MaxLength(200) serviceName?: string
  @IsOptional() @IsString() @MaxLength(5000) businessImpact?: string
  @IsOptional() @IsString() @MaxLength(5000) initialAssessment?: string
  @IsOptional() @IsString() @MaxLength(10000) containmentAction?: string
  @IsOptional() @IsString() @MaxLength(10000) resolution?: string
  @IsOptional() @IsString() @MaxLength(10000) rootCause?: string
  @IsOptional() @IsString() @MaxLength(10000) correctiveAction?: string
  @IsOptional() @IsString() @MaxLength(10000) preventiveAction?: string
  @IsOptional() @IsString() @MaxLength(10000) lessonsLearned?: string
  @IsOptional() @IsUUID() departmentId?: string
  @IsOptional() @IsUUID() locationId?: string
  @IsOptional() @IsUUID() assetId?: string
  @IsOptional() @IsUUID() assignedToId?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000000) affectedUsers?: number
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(5256000) downtimeMinutes?: number
  @IsOptional() @IsBoolean() isSecurityIncident?: boolean
  @IsOptional() @IsBoolean() isBusinessContinuityEvent?: boolean
}

export class ChangeIncidentStatusDto {
  @IsEnum(IncidentStatus) status!: IncidentStatus
  @IsString() @IsNotEmpty() @MaxLength(5000) note!: string
}

export class AddIncidentActivityDto {
  @IsString() @IsNotEmpty() @MaxLength(5000) note!: string
  @IsOptional() @IsString() @MaxLength(40) type = 'NOTE'
}
