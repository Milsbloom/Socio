import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";
import { env } from "@/lib/env";

type Db = MySql2Database<typeof schema>;
const globalForDb = globalThis as unknown as { socioDb?: Db };

function instance(): Db {
  if (!globalForDb.socioDb) {
    const pool = mysql.createPool({ uri: env("DATABASE_URL"), connectionLimit: 5, timezone: "Z" });
    globalForDb.socioDb = drizzle({ client: pool, schema, mode: "default" });
  }
  return globalForDb.socioDb;
}

/** Connects on first use, so builds and tests don't need a database. */
export const db = new Proxy({} as Db, {
  get: (_t, prop) => {
    const real = instance();
    const v = Reflect.get(real, prop, real);
    return typeof v === "function" ? v.bind(real) : v;
  },
});

export { schema };
