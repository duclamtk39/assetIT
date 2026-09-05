import { Type } from 'class-transformer'
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator'
import { AssetAssignmentType, AssetReturnOutcome, MaintenanceOutcome } from '@prisma/client'

export class AssignAssetDto {
  @IsEnum(AssetAssignmentType) type!: AssetAssignmentType
  @IsUUID() assignedToId!: string
  @IsUUID() locationId!: string
  @ValidateIf(value => value.type === AssetAssignmentType.LOAN) @IsDateString() expectedReturnDate?: string
  @IsString() @MinLength(1) @MaxLength(100) conditionOut!: string
  @IsOptional() @IsString() @MaxLength(5000) note?: string
}
export class ReturnAssetDto {
  @IsOptional() @IsUUID() warehouseId?: string
  @IsOptional() @IsUUID() locationId?: string
  @IsString() @MinLength(1) @MaxLength(100) conditionIn!: string
  @IsEnum(AssetReturnOutcome) outcome!: AssetReturnOutcome
  @IsOptional() @IsString() @MaxLength(5000) note?: string
}
export class TransferAssetDto {
  @IsOptional() @IsUUID() toWarehouseId?: string
  @IsOptional() @IsUUID() toLocationId?: string
  @IsOptional() @IsString() @MaxLength(100) condition?: string
  @IsString() @MinLength(2) @MaxLength(1000) reason!: string
}
export class OpenMaintenanceDto {
  @IsOptional() @IsUUID() warehouseId?: string
  @IsString() @MinLength(2) @MaxLength(2000) issue!: string
}
export class CompleteMaintenanceDto {
  @IsEnum(MaintenanceOutcome) outcome!: MaintenanceOutcome
  @IsString() @MinLength(2) @MaxLength(5000) resolution!: string
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cost?: number
  @IsOptional() @IsUUID() warehouseId?: string
}
