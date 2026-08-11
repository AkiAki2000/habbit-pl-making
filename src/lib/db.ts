import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

// Server-only Postgres client (Route Handlers run in the Node runtime).
// Works against any Postgres, including Supabase's hosted database — the
// app talks to it over a plain connection string, not Supabase's REST/SDK
// layer, so no Supabase-specific client is needed.
declare global {
  var __habitPlSql: Sql | undefined;
}

function createClient(): Sql {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL が設定されていません。.env.local に DATABASE_URL=postgres://... を追加して、開発サーバーを再起動してください。",
    );
  }
  const client = postgres(connectionString, {
    ssl: connectionString.includes("localhost") ? false : "require",
  });
  if (process.env.NODE_ENV !== "production") globalThis.__habitPlSql = client;
  return client;
}

function getClient(): Sql {
  return globalThis.__habitPlSql ?? createClient();
}

// `sql` is exported as a Proxy, not a real client, so importing this module
// never touches DATABASE_URL — only an actual query does. Next.js imports
// every route module during `next build`'s page-data-collection pass (to
// read its config), which would otherwise fail in any environment/CI run
// without a database configured, even though no request was ever handled.
export const sql: Sql = new Proxy(function sql() {} as unknown as Sql, {
  apply(_target, _thisArg, args) {
    const client = getClient();
    return Reflect.apply(client as unknown as (...a: unknown[]) => unknown, client, args);
  },
  get(_target, prop) {
    const client = getClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
