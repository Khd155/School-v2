import "server-only";
import postgres from "postgres";

declare global {
  // Reuse the pool across hot reloads in development and warm serverless invocations.
  var __sql: postgres.Sql | undefined;
}

function create(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return postgres(url, {
    // Supabase transaction pooler does not support prepared statements.
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
}

export function db(): postgres.Sql {
  if (!globalThis.__sql) globalThis.__sql = create();
  return globalThis.__sql;
}
