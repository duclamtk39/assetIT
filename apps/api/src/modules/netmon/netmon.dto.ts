import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

const PROBE_METHODS = ['ICMP', 'TCP_PORT', 'BOTH'] as const

export class SubnetDto {
  @IsString() @MinLength(2) @MaxLength(150) name!: string
  /** Validated properly in the service: class-validator's isIP cannot express the /22 floor. */
  @IsString() @MaxLength(43) cidr!: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4094) vlanId?: number
  @IsOptional() @IsString() @MaxLength(500) description?: string
  @IsOptional() @IsUUID() locationId?: string
  @IsOptional() @IsUUID() departmentId?: string
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsIn(PROBE_METHODS) probeMethod?: (typeof PROBE_METHODS)[number]
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(65535, { each: true })
  tcpPorts?: number[]
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(10080) scanIntervalMinutes?: number
  @IsOptional() @Type(() => Number) @IsInt() @Min(30) @Max(86400) checkIntervalSeconds?: number
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) failureThreshold?: number
}

export class UpdateSubnetDto extends SubnetDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150) declare name: string
  @IsOptional() @IsString() @MaxLength(43) declare cidr: string
}

export class UpdateDeviceDto {
  @IsOptional() @IsString() @MaxLength(200) label?: string
  @IsOptional() @IsString() @MaxLength(1000) note?: string
  @IsOptional() @IsBoolean() monitored?: boolean
}

export class LinkDeviceDto {
  @IsUUID() assetId!: string
  /** Copies the discovered address onto the asset record, which is how the register gets populated. */
  @IsOptional() @IsBoolean() copyNetworkFields?: boolean
}

export class AcknowledgeNetworkAlertDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string
}

export class ListDevicesQuery {
  @IsOptional() @IsString() @MaxLength(200) search?: string
  @IsOptional() @IsUUID() subnetId?: string
  @IsOptional() @IsIn(['UNKNOWN', 'UP', 'DOWN', 'PAUSED']) status?: string
  @IsOptional() @IsIn(['linked', 'unlinked']) link?: 'linked' | 'unlinked'
  @Type(() => Number) @IsInt() @Min(1) page = 1
  @Type(() => Number) @IsInt() @Min(1) @Max(500) limit = 100
}

export class DeviceHistoryQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(30) days = 7
}
