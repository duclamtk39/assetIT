import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import { Request, Response } from 'express'
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>()
    const request = host.switchToHttp().getRequest<Request>()
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const value = error instanceof HttpException ? error.getResponse() : null
    const body = typeof value === 'object' && value ? (value as Record<string, unknown>) : {}
    response.status(status).json({
      statusCode: status,
      code: body.code || (['GET', 'HEAD'].includes(request.method) ? 'RESOURCE_ERROR' : 'REQUEST_ERROR'),
      message: body.message || value || (status === 500 ? 'Lỗi hệ thống' : 'Yêu cầu không hợp lệ'),
      timestamp: new Date().toISOString(),
    })
  }
}
