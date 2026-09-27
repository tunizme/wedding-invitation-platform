import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';

export const requestValidationPipe = () =>
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    validationError: { target: false, value: false },
    exceptionFactory: () => new UnprocessableEntityException(),
  });
