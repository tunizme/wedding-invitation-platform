export interface ApiEnvironment {
  NODE_ENV: 'development' | 'test' | 'production';
  API_PORT: number;
  DATABASE_URL: string;
  FRONTEND_ORIGIN: string;
  DATABASE_HEALTH_TIMEOUT_MS: number;
}

function requiredUrl(values: Record<string, unknown>, key: string): string {
  const raw = values[key];
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(
      `Invalid backend environment configuration: ${key}. Copy apps/api/.env.example to apps/api/.env and provide a valid value.`,
    );
  }
  try {
    return new URL(raw).toString().replace(/\/$/, '');
  } catch {
    throw new Error(
      `Invalid backend environment configuration: ${key}. Copy apps/api/.env.example to apps/api/.env and provide a valid URL.`,
    );
  }
}

function port(
  values: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = Number(values[key] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(
      `Invalid backend environment configuration: ${key}. Use a port from 1 to 65535.`,
    );
  }
  return value;
}

export function validateEnvironment(
  values: Record<string, unknown>,
): ApiEnvironment {
  const nodeEnvironment =
    values.NODE_ENV === undefined
      ? 'development'
      : typeof values.NODE_ENV === 'string'
        ? values.NODE_ENV
        : '';
  if (!['development', 'test', 'production'].includes(nodeEnvironment)) {
    throw new Error(
      'Invalid backend environment configuration: NODE_ENV. Use development, test, or production.',
    );
  }
  const databaseUrl = requiredUrl(values, 'DATABASE_URL');
  if (
    !databaseUrl.startsWith('postgresql://') &&
    !databaseUrl.startsWith('postgres://')
  ) {
    throw new Error(
      'Invalid backend environment configuration: DATABASE_URL. Use a PostgreSQL URL.',
    );
  }

  return {
    NODE_ENV: nodeEnvironment as ApiEnvironment['NODE_ENV'],
    API_PORT: port(values, 'API_PORT', 3001),
    DATABASE_URL: databaseUrl,
    FRONTEND_ORIGIN: requiredUrl(values, 'FRONTEND_ORIGIN'),
    DATABASE_HEALTH_TIMEOUT_MS: port(
      values,
      'DATABASE_HEALTH_TIMEOUT_MS',
      1000,
    ),
  };
}
