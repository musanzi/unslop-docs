export interface IApiResponse<T> {
  success: true;
  statusCode: number;
  data: T | null;
}

export interface IApiErrorResponse {
  success: false;
  statusCode: number;
  message: string | string[];
  error: string;
}
