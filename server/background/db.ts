import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Dedicated server-side PostgreSQL pool, never the local JSON fallback.
// Session advisory locks REQUIRE a direct or session-pooling connection.
let pool: Pool | undefined;
export function backgroundPool(): Pool {
  // Match DBStorage exactly: a NEON_DATABASE_URL preference here could split
  // the ownership/claim ledger from the actual orders.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Background execution requires PostgreSQL");
  if (process.env.BACKGROUND_DB_SESSION_LOCKS_CONFIRMED !== "true") {
    throw new Error("Background DB requires reviewed session-preserving connection");
  }
  neonConfig.webSocketConstructor = ws;
  return pool ??= new Pool({ connectionString, max: 3, connectionTimeoutMillis: 10000 });
}