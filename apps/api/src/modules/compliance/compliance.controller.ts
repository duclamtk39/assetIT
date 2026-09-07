import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import {
  CreateDocumentDto,
  CreateSoaVersionDto,
  IssueDocumentDto,
  IssueSoaDto,
  ListDocumentsQuery,
  UpdateDocumentDto,
  UpdateSoaEntryDto,
  WithdrawDocumentDto,
} from './compliance.dto'
import { ComplianceService } from './compliance.service'
import type { IncomingFile } from './document-storage'

type AuthRequest = Request & {
  authUser: { id: string; role: string; complianceAccess?: boolean }
}

const MAX_UPLOAD_BYTES = Number(process.env.COMPLIANCE_MAX_FILE_BYTES || 25 * 1024 * 1024)

@ApiTags('ISO compliance')
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get('summary') summary(@Req() req: AuthRequest) {
    return this.compliance.summary(req.authUser)
  }
  @Get('operators') operators(@Req() req: AuthRequest) {
    return this.compliance.operators(req.authUser)
  }
  @Get('controls') controls(@Req() req: AuthRequest) {
    return this.compliance.catalogue(req.authUser)
  }

  @Get('soa') listSoa(@Req() req: AuthRequest) {
    return this.compliance.listSoaVersions(req.authUser)
  }
  @Post('soa') createSoa(@Body() body: CreateSoaVersionDto, @Req() req: AuthRequest) {
    return this.compliance.createSoaVersion(body, req.authUser)
  }
  @Get('soa/:id') getSoa(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.compliance.getSoaVersion(id, req.authUser)
  }
  @Patch('soa/:id/entries/:code') updateSoaEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('code') code: string,
    @Body() body: UpdateSoaEntryDto,
    @Req() req: AuthRequest,
  ) {
    return this.compliance.upsertSoaEntry(id, code, body, req.authUser)
  }
  @Post('soa/:id/issue') issueSoa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: IssueSoaDto,
    @Req() req: AuthRequest,
  ) {
    return this.compliance.issueSoaVersion(id, body, req.authUser)
  }

  @Get('documents') listDocuments(@Query() query: ListDocumentsQuery, @Req() req: AuthRequest) {
    return this.compliance.listDocuments(query, req.authUser)
  }
  @Post('documents') createDocument(@Body() body: CreateDocumentDto, @Req() req: AuthRequest) {
    return this.compliance.createDocument(body, req.authUser)
  }
  @Get('documents/:id') getDocument(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.compliance.getDocument(id, req.authUser)
  }
  @Patch('documents/:id') updateDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDocumentDto,
    @Req() req: AuthRequest,
  ) {
    return this.compliance.updateDocument(id, body, req.authUser)
  }
  @Post('documents/:id/issue') issueDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: IssueDocumentDto,
    @Req() req: AuthRequest,
  ) {
    return this.compliance.issueDocument(id, body, req.authUser)
  }
  @Post('documents/:id/withdraw') withdrawDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: WithdrawDocumentDto,
    @Req() req: AuthRequest,
  ) {
    return this.compliance.withdrawDocument(id, body, req.authUser)
  }

  /** Memory storage: the file is validated and hashed before anything reaches the volume. */
  @Post('documents/:id/files')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  addFile(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: IncomingFile, @Req() req: AuthRequest) {
    return this.compliance.addFile(id, file, req.authUser)
  }

  @Get('files/:id/download') async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const { file, stream, contentDisposition } = await this.compliance.fileForDownload(id, req.authUser)
    res.setHeader('Content-Type', file.mimeType)
    res.setHeader('Content-Length', String(file.fileSize))
    res.setHeader('Content-Disposition', contentDisposition)
    // Never let a stored file be framed or sniffed into something executable in this origin.
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    stream.on('error', () => res.destroy())
    stream.pipe(res)
  }

  @Delete('files/:id') removeFile(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.compliance.removeFile(id, req.authUser)
  }
}
