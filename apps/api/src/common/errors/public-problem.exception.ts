import { BadRequestException, ConflictException } from '@nestjs/common';

export class OnboardingCannotCompleteException extends ConflictException {
  readonly problemCode = 'ONBOARDING_CANNOT_COMPLETE' as const;
}

export class PasswordChangeNotApplicableException extends BadRequestException {
  readonly problemCode = 'PASSWORD_CHANGE_NOT_APPLICABLE' as const;
}
