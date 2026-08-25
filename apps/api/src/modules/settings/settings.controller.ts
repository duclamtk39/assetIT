import { Body,Controller,Get,Put,Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { UpdateSettingDto } from './settings.dto'
import { SettingsService } from './settings.service'
import { Public } from '../../auth/public.decorator'
type AuthRequest=Request&{authUser:{id:string;role:string}}
@ApiTags('Application settings') @Controller('settings')
export class SettingsController{
  constructor(private readonly settings:SettingsService){}
  @Public() @Get('public') publicIdentity(){return this.settings.publicIdentity()}
  @Get() list(){return this.settings.list()}
  @Put() update(@Body() body:UpdateSettingDto,@Req() req:AuthRequest){return this.settings.update(body,req.authUser)}
}
