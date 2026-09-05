import { Transform } from 'class-transformer'
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'

export class CreateInventoryDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string
  @IsOptional() @IsUUID() departmentId?: string
  @IsOptional() @IsUUID() locationId?: string
  @IsOptional() @IsUUID() warehouseId?: string
  @IsOptional() @IsUUID() categoryId?: string
}

export class ScanInventoryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  value!: string
  @IsOptional() @IsUUID() observedLocationId?: string
  @IsOptional() @IsUUID() observedCustodianId?: string
  @IsOptional() @IsString() @MaxLength(2000) note?: string
}
