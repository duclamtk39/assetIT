import { IsIn, IsObject } from 'class-validator'
export class UpdateSettingDto {
  @IsIn(['branding', 'email', 'regional']) key!: 'branding' | 'email' | 'regional'
  @IsObject() value!: Record<string, unknown>
}
