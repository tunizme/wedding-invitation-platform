// Credential-bearing headers, query strings and request bodies are deliberately omitted.
// Log this allowlisted projection, never Request/Error objects or arbitrary metadata.
function beforeControl(value: string): string {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return value.slice(0, index);
  }
  return value;
}

export function safeRequestLog(
  request: { method: string; url: string },
  requestId: string,
  status: number,
) {
  const withoutQuery = request.url.split(/[?#]/, 1)[0];
  const route = beforeControl(withoutQuery).slice(0, 2048);
  return {
    requestId: beforeControl(requestId).slice(0, 100),
    method: beforeControl(request.method)
      .replace(/[^A-Z]/gi, '')
      .slice(0, 10)
      .toUpperCase(),
    status,
    route,
  };
}
