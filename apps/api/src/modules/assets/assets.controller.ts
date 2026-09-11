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
import { AssetsService } from './assets.service'
import type { IncomingImage } from './asset-image.storage'
import { CreateAssetDto, ListAssetsQuery, ScanAssetQuery, UpdateAssetDto } from './assets.dto'

const MAX_IMAGE_BYTES = Number(process.env.ASSET_IMAGE_MAX_BYTES || 3 * 1024 * 1024)

type AuthRequest = Request & { authUser: { id: string; role: string; departmentId: string | null } }
@ApiTags('Assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}
  @Get('scan') scan(@Query() query: ScanAssetQuery, @Req() req: AuthRequest) {
    return this.assets.scan(query.value, req.authUser)
  }
  @Get('summary') summary(@Req() req: AuthRequest) {
    return this.assets.summary(req.authUser)
  }
  @Get() list(@Query() query: ListAssetsQuery, @Req() req: AuthRequest) {
    return this.assets.list(query, req.authUser)
  }
  /** Memory storage: the file is checked against its magic bytes before anything reaches the volume. */
  @Post(':id/image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  setImage(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: IncomingImage, @Req() req: AuthRequest) {
    return this.assets.setImage(id, file, req.authUser)
  }
  @Delete(':id/image') clearImage(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.assets.clearImage(id, req.authUser)
  }
  @Get(':id/image') async image(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest, @Res() res: Response) {
    const { stream, mimeType } = await this.assets.imageFor(id, req.authUser)
    res.setHeader('Content-Type', mimeType)
    // Never let a stored file be sniffed into something executable in this origin.
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    res.setHeader('Cache-Control', 'private, max-age=60')
    stream.on('error', () => res.destroy())
    stream.pipe(res)
  }
  @Get(':id/history') history(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.assets.history(id, req.authUser)
  }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.assets.get(id, req.authUser)
  }
  @Post() create(@Body() body: CreateAssetDto, @Req() req: AuthRequest) {
    return this.assets.create(body, req.authUser)
  }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateAssetDto, @Req() req: AuthRequest) {
    return this.assets.update(id, body, req.authUser)
  }
  @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.assets.remove(id, req.authUser)
  }
}
