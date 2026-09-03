import { Transform } from 'class-transformer'
import { IsDateString,IsEmail,IsIn,IsInt,IsNotEmpty,IsObject,IsOptional,IsString,Max,MaxLength,Min } from 'class-validator'
export class VendorDto{
  @IsString() @IsNotEmpty() @MaxLength(50) code!:string
  @IsString() @IsNotEmpty() @MaxLength(200) name!:string
  @IsOptional() @IsString() @MaxLength(50) taxCode?:string
  @IsString() @MaxLength(150) category!:string
  @IsString() @MaxLength(150) contact!:string
  @Transform(({value})=>value===''||value===null?undefined:value) @IsOptional() @IsEmail() email?:string
  @IsOptional() @IsString() @MaxLength(30) phone?:string
  @IsOptional() @IsString() address?:string
  @IsOptional() @IsString() certifications?:string
  @IsString() @IsIn(['Chưa đánh giá','Đã phê duyệt','Có điều kiện','Cần cải thiện','Tạm ngưng']) status!:string
  @Transform(({value})=>value===''||value===null?undefined:value) @IsOptional() @IsDateString() lastEvaluation?:string
  @IsInt() @Min(0) @Max(100) score=0
  @IsObject() scores!:Record<string,number>
  @IsOptional() @IsString() notes?:string
}
