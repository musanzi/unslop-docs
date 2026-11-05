import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { STATUS_CODES } from 'node:http';
import { IApiErrorResponse } from '../interfaces';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const response = host.switchToHttp().getResponse();
    const statusCode = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = STATUS_CODES[statusCode] ?? 'Internal Server Error';
    let error = message;

    if (exception instanceof HttpException) {
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else {
        const exceptionMessage: unknown = body['message'];
        const exceptionError: unknown = body['error'];

        if (
          typeof exceptionMessage === 'string' ||
          (Array.isArray(exceptionMessage) && exceptionMessage.every((item) => typeof item === 'string'))
        ) {
          message = exceptionMessage;
        }

        if (typeof exceptionError === 'string') {
          error = exceptionError;
        }
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    if (httpAdapter.isHeadersSent(response)) {
      httpAdapter.end(response);
      return;
    }

    const body: IApiErrorResponse = {
      success: false,
      statusCode,
      message,
      error
    };

    httpAdapter.reply(response, body, statusCode);
  }
}
