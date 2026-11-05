import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('unslop-docs API DOC')
    .setDescription(
      'Google-only sign-in with Redis sessions. Admin access requires the verified Google account configured by ADMIN_EMAIL.'
    )
    .setOpenAPIVersion('3.1.0')
    .build();

  return SwaggerModule.createDocument(app, config);
}
