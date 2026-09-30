import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ProblemFilter } from './common/errors/problem.filter';
import { requestValidationPipe } from './common/errors/validation';
import type { NextFunction, Request, Response } from 'express';

export async function createApplication() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api/v1');
  // Authentication/profile/Admin responses can contain identity or session state.
  // A single default also covers redirects and future IAM routes that might omit
  // a controller-level decorator.
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.useGlobalPipes(requestValidationPipe());
  app.useGlobalFilters(new ProblemFilter());
  app.enableCors({
    origin: config.getOrThrow<string>('FRONTEND_ORIGIN'),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-CSRF-Token'],
    exposedHeaders: ['Retry-After'],
  });
  app.enableShutdownHooks();

  const openApi = new DocumentBuilder()
    .setTitle('Wedding Invitation Platform Foundation API')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup(
    'api/v1/docs',
    app,
    SwaggerModule.createDocument(app, openApi),
  );
  return app;
}

async function bootstrap() {
  const app = await createApplication();
  const config = app.get(ConfigService);
  await app.listen(config.get<number>('API_PORT', 3001), '0.0.0.0');
}

if (require.main === module) {
  void bootstrap();
}
