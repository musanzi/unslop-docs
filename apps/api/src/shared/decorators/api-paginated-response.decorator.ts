import { applyDecorators, Type } from '@nestjs/common';
import { ApiBadRequestResponse, ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

export function ApiPaginatedResponse(model: Type<unknown>, description: string): MethodDecorator & ClassDecorator {
  // OpenAPI 3.1 prefixItems describes the two positions in the existing response tuple.
  const paginationSchema = {
    type: 'array',
    minItems: 2,
    maxItems: 2,
    prefixItems: [
      { type: 'array', items: { $ref: getSchemaPath(model) }, description: 'Items on the requested page' },
      { type: 'integer', minimum: 0, description: 'Total number of matching items before pagination' }
    ]
  };

  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        required: ['success', 'statusCode', 'data'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          statusCode: { type: 'integer', enum: [200] },
          data: paginationSchema
        }
      }
    }),
    ApiBadRequestResponse({
      description: 'Invalid pagination or filter parameters',
      schema: {
        type: 'object',
        required: ['success', 'statusCode', 'message', 'error'],
        properties: {
          success: { type: 'boolean', enum: [false] },
          statusCode: { type: 'integer', enum: [400] },
          message: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
          error: { type: 'string', example: 'Bad Request' }
        }
      }
    })
  );
}
