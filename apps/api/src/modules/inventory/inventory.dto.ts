import { Transform } from 'class-transformer'
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'

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
  /**
   * False records that the asset was looked for and not found. Without it the only way an item ever
   * became MISSING was by still being untouched when the session closed, so a counter had no way to
   * say "I checked and it is not there" while the count was running.
   */
  @IsOptional() @Transform(({ value }) => value !== false && value !== 'false') @IsBoolean() found?: boolean
  @IsOptional() @IsString() @MaxLength(2000) note?: string
}
