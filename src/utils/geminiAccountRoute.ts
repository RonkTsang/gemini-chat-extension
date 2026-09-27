/**
 * Extract the leading `/u/{numeric account index}` from a URL pathname.
 * Gemini uses this account slot for both page routes and API endpoints;
 * the index is not a stable account ID. Match only at the start, with `/`
 * or the end of the pathname after the digits. Return no trailing slash,
 * or an empty string when no explicit account route prefix is present.
 * @example "/u/1/library" -> "/u/1"; "/library" -> ""; "/u/1extra/library" -> "".
 */
export function extractGeminiAccountRoutePrefix(pathname: string): string {
  return pathname.match(/^\/u\/\d+(?=\/|$)/)?.[0] ?? ''
}
