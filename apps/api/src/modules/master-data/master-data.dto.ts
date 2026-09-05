import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator'
export class MasterDataDto {
  @IsString() @IsNotEmpty() @MaxLength(50) code!: string
  @IsString() @IsNotEmpty() @MaxLength(150) name!: string
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsUUID() managerPersonId?: string | null
  @IsOptional() @IsString() @MaxLength(1000) address?: string
  @IsOptional() @IsBoolean() isIncidentResponseTeam?: boolean
}
