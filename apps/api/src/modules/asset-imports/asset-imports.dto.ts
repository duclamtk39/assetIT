import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export class ImportRowDto {
  @Type(() => Number) @IsInt() @Min(2) rowNumber!: number
  @IsObject() payload!: Record<string, unknown>
}

export class StageAssetImportDto {
  @IsString() @IsNotEmpty() @MaxLength(255) sourceFileName!: string
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows!: ImportRowDto[]
}
