import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

export const directorySchedules = ['MANUAL', 'HOURLY', 'EVERY_6_HOURS', 'EVERY_12_HOURS', 'DAILY_02'] as const

export class SaveDirectoryConfigurationDto {
  @IsBoolean() enabled!: boolean
  @IsOptional() @IsString() @MaxLength(100) tenantId?: string
  @IsOptional() @IsString() @MaxLength(100) clientId?: string
  @IsOptional() @IsString() @MaxLength(500) secret?: string
  @IsOptional() @IsString() @MaxLength(500) ldapUrl?: string
  @IsOptional() @IsString() @MaxLength(1000) baseDn?: string
  @IsOptional() @IsString() @MaxLength(1000) bindDn?: string
  @IsOptional() @IsString() @MaxLength(100000) caCertificate?: string
  @IsOptional() @IsString() @MaxLength(2000) userFilter?: string
  @IsBoolean() useTls!: boolean
  @IsIn(directorySchedules) schedule!: (typeof directorySchedules)[number]
  @IsBoolean() syncDisabled!: boolean
  @IsBoolean() syncLicenses!: boolean
  @IsOptional() @IsString() @MaxLength(10000) groupMapping?: string
  @IsString() @MaxLength(100) departmentAttribute!: string
  @IsString() @MaxLength(100) emailAttribute!: string
  @IsString() @MaxLength(100) employeeCodeAttribute!: string
  @IsString() @MaxLength(100) usernameAttribute!: string
}
