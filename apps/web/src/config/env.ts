import { z } from 'zod';

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.url().refine((value) => /^https?:/.test(value), {
    message: 'must use http or https',
  }),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

export function parsePublicEnvironment(
  values: Record<string, string | undefined>,
): PublicEnvironment {
  const result = publicEnvironmentSchema.safeParse(values);
  if (!result.success) {
    const names = result.error.issues
      .map((issue) => issue.path.join('.'))
      .join(', ');
    throw new Error(
      `Invalid frontend environment configuration: ${names}. Copy apps/web/.env.example to apps/web/.env.local and provide valid values.`,
    );
  }
  return result.data;
}

export const publicEnvironment = () =>
  parsePublicEnvironment({
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    WEB_PORT: process.env.WEB_PORT,
  });
