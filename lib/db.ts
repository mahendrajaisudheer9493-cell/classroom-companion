import { PrismaClient } from "@prisma/client";

// One PrismaClient per process. In dev, Next.js hot reload re-imports modules, so we park the
// client on globalThis to avoid opening a new connection pool on every reload. On serverless
// (Vercel) each warm instance reuses its client; DATABASE_URL uses the pgbouncer pooler with
// connection_limit=1 so many instances don't exhaust Postgres connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
