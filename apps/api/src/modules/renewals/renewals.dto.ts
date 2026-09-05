import { Transform, Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { DigitalEntitlementStatus, DigitalEntitlementType } from '@prisma/client'

export class ListEntitlementsQuery {
  @IsOptional() @IsString() @MaxLength(200) search?: string
  @IsOptional() @IsEnum(DigitalEntitlementType) type?: DigitalEntitlementType
  @IsOptional() @IsEnum(DigitalEntitlementStatus) status?: DigitalEntitlementStatus
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) @Max(3650) dueWithinDays?: number
}
export class CreateEntitlementDto {
  @IsString() @IsNotEmpty() @MaxLength(60) code!: string
  @IsString() @IsNotEmpty() @MaxLength(250) name!: string
  @IsEnum(DigitalEntitlementType) type!: DigitalEntitlementType
  @IsOptional() @IsString() @MaxLength(200) productName?: string
  @IsOptional() @IsString() @MaxLength(120) edition?: string
  @IsOptional() @IsString() @MaxLength(255) subscriptionIdentifier?: string
  @IsOptional() @IsString() @MaxLength(253) domainName?: string
  @IsOptional() @IsString() @MaxLength(253) commonName?: string
  @IsOptional() @IsString() @MaxLength(200) registrar?: string
  @IsOptional() @IsString() @MaxLength(200) issuer?: string
  @IsOptional() @IsString() @MaxLength(80) licenseMetric?: string
  @Type(() => Number) @IsInt() @Min(1) @Max(10000000) totalQuantity = 1
  @IsOptional() @IsDateString() startDate?: string
  @IsDateString() expiryDate!: string
  @IsOptional() @IsBoolean() autoRenew = false
  @Type(() => Number) @IsInt() @Min(1) @Max(120) renewalPeriodMonths = 12
  @IsOptional() @IsDateString() cancellationDeadline?: string
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) purchaseCost?: number
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) renewalCost?: number
  @IsOptional() @IsString() @MaxLength(3) currency = 'VND'
  @IsOptional() @IsString() @MaxLength(100) purchaseOrderNo?: string
  @IsOptional() @IsString() @MaxLength(100) contractNo?: string
  @IsOptional() @IsString() @MaxLength(1000) managementUrl?: string
  @IsOptional() @IsString() @MaxLength(255) accountName?: string
  @IsOptional() @IsString() @MaxLength(500) secretReference?: string
  @IsOptional() @IsString() @MaxLength(255) technicalContact?: string
  @IsOptional() @IsString() @MaxLength(255) businessOwner?: string
  @IsOptional() @IsString() @MaxLength(10000) notes?: string
  @IsOptional() @IsUUID() vendorId?: string
  @IsOptional() @IsUUID() ownerDepartmentId?: string
  @IsOptional() @IsUUID() ownerUserId?: string
}
export class AssignEntitlementDto {
  @IsOptional() @IsUUID() personId?: string
  @IsOptional() @IsUUID() assetId?: string
  @IsOptional() @IsUUID() departmentId?: string
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000) quantity = 1
  @IsOptional() @IsDateString() expectedEndAt?: string
  @IsOptional() @IsString() @MaxLength(5000) note?: string
}
export class RevokeAssignmentDto {
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string
}
export class RenewEntitlementDto {
  @IsDateString() newExpiryDate!: string
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number
  @IsOptional() @IsString() @MaxLength(3) currency = 'VND'
  @IsOptional() @IsString() @MaxLength(100) purchaseOrderNo?: string
  @IsOptional() @IsString() @MaxLength(100) invoiceNo?: string
  @IsOptional() @IsUUID() approvedBy?: string
  @IsOptional() @IsString() @MaxLength(10000) notes?: string
}
export class UpdateEntitlementContractDto {
  @IsDateString() expiryDate!: string
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) renewalCost?: number
  @IsOptional() @IsBoolean() autoRenew?: boolean
}
export class AlertPolicyDto {
  @IsBoolean() enabled = true
  @IsArray() @IsInt({ each: true }) @Min(0, { each: true }) @Max(3650, { each: true }) warningDays!: number[]
  @IsArray() @IsInt({ each: true }) @Min(1, { each: true }) @Max(365, { each: true }) overdueEscalationDays!: number[]
  @IsArray() @IsEmail({}, { each: true }) recipients!: string[]
  @IsBoolean() notifyOwner = true
}
export class AcknowledgeAlertDto {
  @IsOptional() @IsString() @MaxLength(5000) note?: string
}
export class RenewalEmailConfigurationDto {
  @IsBoolean() enabled!: boolean
  @IsString() @IsNotEmpty() @MaxLength(255) smtpHost!: string
  @Type(() => Number) @IsInt() @Min(1) @Max(65535) smtpPort = 587
  @IsBoolean() secure = false
  @IsOptional() @IsString() @MaxLength(255) username?: string
  @IsOptional() @IsString() @MaxLength(500) password?: string
  @IsString() @IsNotEmpty() @MaxLength(150) fromName!: string
  @IsEmail() @MaxLength(255) fromAddress!: string
  @IsOptional() @IsEmail() @MaxLength(255) replyTo?: string
}
export class TestRenewalEmailDto {
  @IsEmail() recipient!: string
}
