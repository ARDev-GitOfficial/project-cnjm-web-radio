import { getConnectionString } from "@netlify/database";
import type { Config } from "drizzle-kit";

export default {
  schema: "./db/schema.ts",
  out: "./netlify/database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || getConnectionString(),
  },
} satisfies Config;
