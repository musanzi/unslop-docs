export const healthCheckSchema = {
  properties: {
    status: { type: 'string', enum: ['ok', 'error'], example: 'ok' },
    info: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'up' }
        },
        additionalProperties: true
      }
    },
    error: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'down' }
        },
        additionalProperties: true
      }
    },
    details: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'up' }
        },
        additionalProperties: true
      }
    }
  }
};
