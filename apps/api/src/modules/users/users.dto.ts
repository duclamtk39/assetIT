import { Transform, Type } from 'class-transformer'
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { RecordStatus, UserRole } from '@prisma/client'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)

export class ListManagedUsersDto {
  @IsOptional() @IsString() @Transform(trim) search?: string
  @IsOptional() @IsEnum(UserRole) role?: UserRole
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus
  @IsOptional() @IsUUID() departmentId?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 50
}

export class CreateLocalUserDto {
  @IsString() @Transform(trim) @MinLength(2) @MaxLength(150) fullName!: string
  @IsString() @Transform(trim) @Matches(/^[A-Za-z0-9._-]{2,50}$/) employeeCode!: string
  @IsString() @Transform(lower) @Matches(/^[a-z0-9._-]{3,100}$/) username!: string
  @IsEmail() @Transform(lower) @MaxLength(255) email!: string
  @IsOptional() @IsString() @Transform(trim) @MaxLength(30) phone?: string
  @IsUUID() departmentId!: string
  @IsEnum(UserRole) role!: UserRole
  @IsString() @MinLength(8) @MaxLength(200) temporaryPassword!: string
}

export class UpdateLocalUserDto {
  @IsOptional() @IsString() @Transform(trim) @MinLength(2) @MaxLength(150) fullName?: string
  @IsOptional() @IsString() @Transform(trim) @Matches(/^[A-Za-z0-9._-]{2,50}$/) employeeCode?: string
  @IsOptional() @IsString() @Transform(lower) @Matches(/^[a-z0-9._-]{3,100}$/) username?: string
  @IsOptional() @IsEmail() @Transform(lower) @MaxLength(255) email?: string
  @IsOptional() @IsString() @Transform(trim) @MaxLength(30) phone?: string
  @IsOptional() @IsUUID() departmentId?: string
  @IsOptional() @IsEnum(UserRole) role?: UserRole
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus
}

export class ResetLocalPasswordDto {
  @IsString() @MinLength(8) @MaxLength(200) temporaryPassword!: string
}
