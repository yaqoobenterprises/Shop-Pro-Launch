/** A popup may update authentication only when both its origin and window identity match. */
export function isExpectedOAuthMessage(event: Pick<MessageEvent, "origin" | "source" | "data">, origin: string, popup: Window | null): boolean {
  if (!popup || event.origin !== origin || event.source !== popup) return false;
  if (!event.data || typeof event.data !== "object") return false;
  return event.data.type === "OAUTH_AUTH_SUCCESS" || event.data.type === "OAUTH_AUTH_ERROR";
}
