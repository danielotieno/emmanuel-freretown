try {
  process.loadEnvFile(".env");
} catch {
  // no .env file; CI sets the variable directly
}

/**
 * The integration database. It is wiped and migrated before every run, so its name must
 * contain "test" — a guard against pointing the suite at a real database.
 */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Point it at an empty Postgres database whose name contains 'test' (see README).",
    );
  }
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.includes("test")) {
    throw new Error(`Refusing to wipe database "${name}": its name must contain "test".`);
  }
  return url;
}
