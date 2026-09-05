import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export class AgentDescriptorDto {
  @IsString() @IsNotEmpty() @MaxLength(100) id!: string
  @IsString() @IsNotEmpty() @MaxLength(50) version!: string
}
export class OperatingSystemDto {
  @IsString() @IsNotEmpty() @MaxLength(30) family!: string
  @IsString() @IsNotEmpty() @MaxLength(255) name!: string
  @IsOptional() @IsString() @MaxLength(100) version?: string
  @IsOptional() @IsString() @MaxLength(100) build?: string
  @IsOptional() @IsString() @MaxLength(150) kernel?: string
  @IsString() @IsNotEmpty() @MaxLength(30) arch!: string
}
export class DiskDto {
  @IsString() @IsNotEmpty() @MaxLength(255) name!: string
  @IsOptional() @IsString() @MaxLength(255) model?: string
  @IsOptional() @IsString() @MaxLength(255) serial?: string
  @IsOptional() @IsString() @MaxLength(30) type?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) size_bytes?: number
}
export class HardwareDto {
  @IsOptional() @IsString() @MaxLength(255) manufacturer?: string
  @IsOptional() @IsString() @MaxLength(255) model?: string
  @IsOptional() @IsString() @MaxLength(150) serial_number?: string
  @IsOptional() @IsString() @MaxLength(100) system_uuid?: string
  @IsOptional() @IsString() @MaxLength(255) cpu_model?: string
  @Type(() => Number) @IsInt() @Min(1) @Max(4096) logical_cpus!: number
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) memory_bytes?: number
  @IsOptional() @IsArray() @ArrayMaxSize(128) @ValidateNested({ each: true }) @Type(() => DiskDto) disks?: DiskDto[]
}
export class NetworkInterfaceDto {
  @IsString() @IsNotEmpty() @MaxLength(255) name!: string
  @IsOptional() @IsString() @MaxLength(64) mac_address?: string
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  addresses?: string[]
}
export class AgentDeviceDto {
  @IsString() @Length(64, 64) fingerprint!: string
  @IsString() @IsNotEmpty() @MaxLength(255) hostname!: string
  @IsOptional() @IsString() @MaxLength(255) fqdn?: string
  @ValidateNested() @Type(() => OperatingSystemDto) os!: OperatingSystemDto
  @ValidateNested() @Type(() => HardwareDto) hardware!: HardwareDto
  @IsArray()
  @ArrayMaxSize(128)
  @ValidateNested({ each: true })
  @Type(() => NetworkInterfaceDto)
  network_interfaces!: NetworkInterfaceDto[]
}
export class AgentInventoryDto {
  @IsIn(['1.0']) schema_version!: string
  @IsDateString() collected_at!: string
  @IsOptional() @IsString() @MaxLength(100) site_code?: string
  @ValidateNested() @Type(() => AgentDescriptorDto) agent!: AgentDescriptorDto
  @ValidateNested() @Type(() => AgentDeviceDto) device!: AgentDeviceDto
}

export class CreateEnrollmentTokenDto {
  @IsString() @IsNotEmpty() @MaxLength(150) name!: string
  @IsOptional() @IsString() @MaxLength(100) siteCode?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) expiresInDays = 30
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) maxEnrollments = 100
}
export class ListDiscoveryQuery {
  @IsOptional() @IsIn(['PENDING', 'MATCHED', 'CONFLICT', 'LINKED', 'CREATED', 'IGNORED']) status?: string
  @IsOptional() @IsString() @MaxLength(200) search?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit = 100
}
export class LinkDiscoveryDto {
  @IsUUID() assetId!: string
  @IsOptional() @IsString() @MaxLength(2000) note?: string
}
export class IgnoreDiscoveryDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) note!: string
}
export class CreateAssetFromDiscoveryDto {
  @IsString() @IsNotEmpty() @MaxLength(100) assetTag!: string
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string
  @IsString() @IsNotEmpty() @MaxLength(150) barcode!: string
  @IsUUID() categoryId!: string
  @IsUUID() warehouseId!: string
  @IsOptional() @IsString() @MaxLength(2000) note?: string
}
