/** Prevent migration and destructive race fixtures from targeting hosted databases. */
export function assertDisposablePostgres(databaseUrl: string | undefined): string {
  if (!databaseUrl || process.env.AQVORA_DISPOSABLE_DB !== "1") {
    throw new Error("Disposable PostgreSQL test flag and URL are required.");
  }
  const parsed = new URL(databaseUrl);
  if (parsed.protocol !== "postgresql:" ||
      !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
      parsed.pathname !== "/aqvora_test") {
    throw new Error("AQVORA database tests require local aqvora_test, never a hosted project.");
  }
  return databaseUrl;
}
