import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ProblemFilter } from './common/errors/problem.filter';
import { requestValidationPipe } from './common/errors/validation';
import { configureRequestBoundaries } from './common/http/request-boundaries';

export async function createApplication() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api/v1');
  configureRequestBoundaries(app, config.getOrThrow<string>('FRONTEND_ORIGIN'));
  app.useGlobalPipes(requestValidationPipe());
  app.useGlobalFilters(new ProblemFilter());
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
