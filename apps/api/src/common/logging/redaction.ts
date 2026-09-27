// Credential-bearing headers, query strings and request bodies are deliberately omitted.
// Log this allowlisted projection, never Request/Error objects or arbitrary metadata.
export function safeRequestLog(
  request: { method: string; url: string },
  requestId: string,
  status: number,
) {
  return {
    requestId,
    method: request.method,
    status,
    route: request.url.split(/[?#]/, 1)[0],
  };
}
