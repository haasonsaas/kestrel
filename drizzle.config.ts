import type { Config } from 'drizzle-kit'

export default {
  schema: './src/main/db/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './dev.db'
  }
} satisfies Config
