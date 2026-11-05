import { HttpErrorResponse, HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { catchError, from, map, mergeMap, throwError } from 'rxjs';
import { isApiResponse, parseApiErrorBlob } from '@/app/core/api';
import { environment } from '@web/environments/environment';

export const httpInterceptor = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const newReq: HttpRequest<unknown> = req.clone({
    url: /^https?:\/\//i.test(req.url) ? req.url : environment.apiUrl + req.url,
    withCredentials: true
  });

  return next(newReq).pipe(
    map((event) => {
      if (!(event instanceof HttpResponse) || req.responseType !== 'json') return event;

      const body = event.body;
      if (isApiResponse(body)) {
        return event.clone({ body: body.data });
      }

      return event;
    }),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
        return from(parseApiErrorBlob(error)).pipe(mergeMap((response) => throwError(() => response)));
      }

      return throwError(() => error);
    })
  );
};
