import { Transform, Type } from 'class-transformer'
import {
  IsDateString,
  IsIn,
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
import { OmitType, PartialType } from '@nestjs/swagger'

export class ListAssetsQuery {
  @IsOptional() @IsString() search?: string
  @IsOptional() @IsUUID() category?: string
  @IsOptional() @IsUUID() department?: string
  @IsOptional() @IsUUID() location?: string
  @IsOptional() @IsString() status?: string
  @IsOptional() @IsUUID() assignedUser?: string
  @IsOptional() @IsString() sort = 'assetTag'
  @IsOptional() @IsIn(['asc', 'desc']) order: 'asc' | 'desc' = 'asc'
  @Type(() => Number) @IsInt() @Min(1) page = 1
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20
}

export class ScanAssetQuery {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  value!: string
}

// Intake always creates an unassigned READY asset. Lifecycle fields are absent by design.
export class CreateAssetDto {
  @IsString() @IsNotEmpty() @MaxLength(100) assetTag!: string
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string
  @IsOptional() @IsString() @MaxLength(150) serialNumber?: string
  @IsOptional() @IsString() @MaxLength(100) systemUuid?: string
  @IsString() @IsNotEmpty() @MaxLength(150) barcode!: string
  @IsUUID() categoryId!: string
  @IsOptional() @IsUUID() modelId?: string
  @IsOptional() @IsUUID() manufacturerId?: string
  @IsUUID() warehouseId!: string
  @IsOptional() @IsUUID() locationId?: string
  @IsOptional() @IsDateString() purchaseDate?: string
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) purchaseCost?: number
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) warrantyMonths?: number
  @IsOptional() @IsString() @MaxLength(200) cpu?: string
  @IsOptional() @IsString() @MaxLength(200) ram?: string
  @IsOptional() @IsString() @MaxLength(200) storage?: string
  @IsOptional() @IsString() @MaxLength(200) operatingSystem?: string
  @IsOptional() @IsString() @MaxLength(64) ipAddress?: string
  @IsOptional() @IsString() @MaxLength(64) macAddress?: string
  @IsOptional() @IsString() @MaxLength(5000) notes?: string
}

// Ownership, status and placement can only change through lifecycle commands.
export class UpdateAssetDto extends PartialType(OmitType(CreateAssetDto, ['warehouseId', 'locationId'] as const)) {}
