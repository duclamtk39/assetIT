import { IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator'

export class LoginDto {
  @IsString()
  @Length(1, 100)
  username!: string

  @IsString()
  @Length(1, 200)
  password!: string
}

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentPassword?: string

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string
}
