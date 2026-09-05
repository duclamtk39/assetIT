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
import { RecordStatus } from '@prisma/client'
import { PartialType } from '@nestjs/swagger'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value
export class ListPeopleDto {
  @IsOptional() @IsString() @Transform(trim) search?: string
  @IsOptional() @IsUUID() departmentId?: string
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 100
}
export class CreatePersonDto {
  @IsString() @Transform(trim) @MinLength(2) @MaxLength(150) fullName!: string
  @IsString() @Transform(trim) @Matches(/^[A-Za-z0-9._-]{2,50}$/) employeeCode!: string
  @IsOptional() @Transform(emptyToUndefined) @IsEmail() @MaxLength(255) email?: string
  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(30) phone?: string
  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(150) jobTitle?: string
  @IsUUID() departmentId!: string
  @IsOptional() @Transform(emptyToUndefined) @IsUUID() locationId?: string
  @IsOptional() @Transform(emptyToUndefined) @IsUUID() linkedUserId?: string
}
export class UpdatePersonDto extends PartialType(CreatePersonDto) {
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus
}
