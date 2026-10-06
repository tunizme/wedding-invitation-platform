import 'server-only';

/** Called only when a server request needs the API, never during module load. */
export function serverEnvironment(
  values: Record<string, string | undefined> = process.env,
): { apiInternalBaseUrl: string } {
  const raw = values.API_INTERNAL_BASE_URL;
  const invalid = () =>
    new Error('Invalid server environment: API_INTERNAL_BASE_URL');
  if (!raw || raw !== raw.trim()) throw invalid();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid();
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['/api/v1', '/api/v1/'].includes(url.pathname)
  )
    throw invalid();
  return { apiInternalBaseUrl: url.toString().replace(/\/$/, '') };
}
