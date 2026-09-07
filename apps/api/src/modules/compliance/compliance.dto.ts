import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { ComplianceDocumentStatus, ComplianceDocumentType, ControlImplementation, SoaDecision } from '@prisma/client'

/** Annex A codes look like A.5.11 or A.8.34; the catalogue is the final authority on which exist. */
const ANNEX_CODE = /^A\.[5-8]\.\d{1,2}$/

export class ListDocumentsQuery {
  @IsOptional() @IsString() @MaxLength(200) search?: string
  @IsOptional() @IsEnum(ComplianceDocumentType) type?: ComplianceDocumentType
  @IsOptional() @IsEnum(ComplianceDocumentStatus) status?: ComplianceDocumentStatus
  @IsOptional() @Matches(ANNEX_CODE) controlCode?: string
  @IsOptional() @IsUUID() ownerId?: string
  /** Documents whose review date has passed, for the §7.5 review cadence. */
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() reviewDue?: boolean
  @Transform(({ value }) => Number(value || 1)) @IsInt() @Min(1) page = 1
  @Transform(({ value }) => Number(value || 20)) @IsInt() @Min(1) @Max(100) limit = 20
}

export class CreateDocumentDto {
  @IsString() @IsNotEmpty() @MaxLength(60) documentCode!: string
  @IsString() @IsNotEmpty() @MaxLength(250) title!: string
  @IsEnum(ComplianceDocumentType) type!: ComplianceDocumentType
  @IsString() @IsNotEmpty() @MaxLength(20) version!: string
  @IsOptional() @IsString() @MaxLength(5000) summary?: string
  @IsUUID() ownerId!: string
  @IsOptional() @IsUUID() departmentId?: string
  @IsOptional() @IsDateString() issuedAt?: string
  @IsOptional() @IsDateString() effectiveFrom?: string
  @IsOptional() @IsDateString() nextReviewAt?: string
  @IsOptional() @IsUUID() supersedesId?: string
  @IsOptional() @IsArray() @ArrayMaxSize(93) @Matches(ANNEX_CODE, { each: true }) controlCodes: string[] = []
}

export class UpdateDocumentDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(250) title?: string
  @IsOptional() @IsEnum(ComplianceDocumentType) type?: ComplianceDocumentType
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(20) version?: string
  @IsOptional() @IsString() @MaxLength(5000) summary?: string
  @IsOptional() @IsUUID() ownerId?: string
  @IsOptional() @IsUUID() departmentId?: string
  @IsOptional() @IsDateString() issuedAt?: string
  @IsOptional() @IsDateString() effectiveFrom?: string
  @IsOptional() @IsDateString() nextReviewAt?: string
  @IsOptional() @IsArray() @ArrayMaxSize(93) @Matches(ANNEX_CODE, { each: true }) controlCodes?: string[]
}

export class IssueDocumentDto {
  @IsDateString() effectiveFrom!: string
  @IsOptional() @IsDateString() nextReviewAt?: string
  @IsString() @IsNotEmpty() @MaxLength(2000) note!: string
}

export class WithdrawDocumentDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string
}

export class CreateSoaVersionDto {
  @IsString() @IsNotEmpty() @MaxLength(20) version!: string
  @IsString() @IsNotEmpty() @MaxLength(20000) scope!: string
  @IsOptional() @IsString() @MaxLength(5000) note?: string
  /** Copy the decisions of the version currently in force instead of starting from nothing. */
  @IsOptional() @IsUUID() cloneFromId?: string
}

export class UpdateSoaEntryDto {
  @IsEnum(SoaDecision) decision!: SoaDecision
  @IsString() @IsNotEmpty() @MaxLength(5000) justification!: string
  @IsOptional() @IsEnum(ControlImplementation) implementation?: ControlImplementation
  @IsOptional() @IsString() @MaxLength(5000) implementationNote?: string
}

export class IssueSoaDto {
  @IsDateString() issuedAt!: string
  @IsString() @IsNotEmpty() @MaxLength(2000) note!: string
}

export class UploadFileMetaDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string
}

export class GrantComplianceAccessDto {
  @Type(() => Boolean) @IsBoolean() granted!: boolean
}
