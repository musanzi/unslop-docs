import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { Observable, map } from 'rxjs';
import { IApiResponse } from '../interfaces';

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<T, IApiResponse<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<IApiResponse<T> | T> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        if (
          response.headersSent ||
          response.statusCode === HttpStatus.NO_CONTENT ||
          response.statusCode === HttpStatus.NOT_MODIFIED ||
          data instanceof StreamableFile
        ) {
          return data;
        }

        return {
          success: true as const,
          statusCode: response.statusCode,
          data: data ?? null
        };
      })
    );
  }
}
