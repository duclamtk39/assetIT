import { Transform, Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { DataSanitizationStatus, DisposalEvidenceType, DisposalStatus, DisposalType } from '@prisma/client'

export class ListDisposalsQuery {
  @IsOptional() @IsString() @MaxLength(200) search?: string
  @IsOptional() @IsEnum(DisposalStatus) status?: DisposalStatus
  @IsOptional() @IsEnum(DisposalType) type?: DisposalType
  @Transform(({ value }) => Number(value || 1)) @IsInt() @Min(1) page = 1
  @Transform(({ value }) => Number(value || 20)) @IsInt() @Min(1) @Max(100) limit = 20
}

export class CreateDisposalItemDto {
  @IsUUID() assetId!: string
  @IsString() @IsNotEmpty() @MaxLength(2000) conditionAssessment!: string
  @IsBoolean() requiresDataSanitization = false
}

export class CreateDisposalDto {
  @IsString() @IsNotEmpty() @MaxLength(250) title!: string
  @IsEnum(DisposalType) type!: DisposalType
  @IsString() @IsNotEmpty() @MaxLength(10000) reason!: string
  @IsString() @IsNotEmpty() @MaxLength(1000) policyReference!: string
  @IsOptional() @IsString() @MaxLength(250) recipient?: string
  @IsOptional() @IsString() @MaxLength(250) vendorReference?: string
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimatedProceeds?: number
  @IsOptional() @IsString() @Length(3, 3) currency = 'VND'
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDisposalItemDto)
  items!: CreateDisposalItemDto[]
}

export class WorkflowNoteDto {
  @IsString() @IsNotEmpty() @MaxLength(10000) note!: string
}

export class CompleteDisposalDto extends WorkflowNoteDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) actualProceeds?: number
}

export class AddDisposalEvidenceDto {
  @IsEnum(DisposalEvidenceType) type!: DisposalEvidenceType
  @IsString() @IsNotEmpty() @MaxLength(250) title!: string
  @IsOptional() @IsString() @MaxLength(150) documentNo?: string
  @IsOptional() @IsDateString() documentDate?: string
  @IsString() @IsNotEmpty() @MaxLength(2000) storagePath!: string
  @IsOptional() @IsString() @Matches(/^[a-fA-F0-9]{64}$/) checksumSha256?: string
  @IsOptional() @IsString() @MaxLength(5000) note?: string
}

export class UpdateSanitizationDto {
  @IsEnum(DataSanitizationStatus) status!: DataSanitizationStatus
  @IsOptional() @IsString() @MaxLength(1000) method?: string
}
