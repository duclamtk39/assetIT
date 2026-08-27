import { Body,Controller,Get,Param,ParseUUIDPipe,Patch,Post,Query,Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { AddDisposalEvidenceDto,CompleteDisposalDto,CreateDisposalDto,ListDisposalsQuery,UpdateSanitizationDto,WorkflowNoteDto } from './disposals.dto'
import { DisposalsService } from './disposals.service'

type AuthRequest=Request&{authUser:{id:string;role:string;departmentId:string|null}}

@ApiTags('Asset disposal and destruction')
@Controller('disposals')
export class DisposalsController{
  constructor(private readonly disposals:DisposalsService){}
  @Get('summary') summary(@Req() req:AuthRequest){return this.disposals.summary(req.authUser)}
  @Get('eligible-assets') eligibleAssets(@Req() req:AuthRequest){return this.disposals.eligibleAssets(req.authUser)}
  @Get() list(@Query() query:ListDisposalsQuery,@Req() req:AuthRequest){return this.disposals.list(query,req.authUser)}
  @Post() create(@Body() body:CreateDisposalDto,@Req() req:AuthRequest){return this.disposals.create(body,req.authUser)}
  @Get(':id') get(@Param('id',ParseUUIDPipe) id:string,@Req() req:AuthRequest){return this.disposals.get(id,req.authUser)}
  @Post(':id/submit') submit(@Param('id',ParseUUIDPipe) id:string,@Req() req:AuthRequest){return this.disposals.submit(id,req.authUser)}
  @Post(':id/approve') approve(@Param('id',ParseUUIDPipe) id:string,@Body() body:WorkflowNoteDto,@Req() req:AuthRequest){return this.disposals.approve(id,body,req.authUser)}
  @Post(':id/reject') reject(@Param('id',ParseUUIDPipe) id:string,@Body() body:WorkflowNoteDto,@Req() req:AuthRequest){return this.disposals.reject(id,body,req.authUser)}
  @Post(':id/start') start(@Param('id',ParseUUIDPipe) id:string,@Body() body:WorkflowNoteDto,@Req() req:AuthRequest){return this.disposals.start(id,body,req.authUser)}
  @Post(':id/evidence') addEvidence(@Param('id',ParseUUIDPipe) id:string,@Body() body:AddDisposalEvidenceDto,@Req() req:AuthRequest){return this.disposals.addEvidence(id,body,req.authUser)}
  @Patch(':id/items/:itemId/sanitization') sanitization(@Param('id',ParseUUIDPipe) id:string,@Param('itemId',ParseUUIDPipe) itemId:string,@Body() body:UpdateSanitizationDto,@Req() req:AuthRequest){return this.disposals.updateSanitization(id,itemId,body,req.authUser)}
  @Post(':id/complete') complete(@Param('id',ParseUUIDPipe) id:string,@Body() body:CompleteDisposalDto,@Req() req:AuthRequest){return this.disposals.complete(id,body,req.authUser)}
  @Post(':id/cancel') cancel(@Param('id',ParseUUIDPipe) id:string,@Body() body:WorkflowNoteDto,@Req() req:AuthRequest){return this.disposals.cancel(id,body,req.authUser)}
}
