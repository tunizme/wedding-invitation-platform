import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

export async function createApplication() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({ origin: config.getOrThrow<string>('FRONTEND_ORIGIN') });
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
