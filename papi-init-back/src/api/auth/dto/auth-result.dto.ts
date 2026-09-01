/**
 * Same shape papi-authority's own `AuthResult` returns from
 * `/api/auth/login`, `/api/auth/refresh` and `/api/sso/login` — this service
 * relays it unchanged, so the type is shared across `auth` and `sso`.
 */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  mustChangePassword: boolean;
}

/** Narrows an unknown JSON body — never trust upstream shape blindly. */
export function isAuthResult(value: unknown): value is AuthResult {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;

  return (
    typeof v.accessToken === 'string' &&
    typeof v.refreshToken === 'string' &&
    typeof v.expiresIn === 'number' &&
    typeof v.mustChangePassword === 'boolean'
  );
}
