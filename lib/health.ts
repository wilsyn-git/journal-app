/**
 * Minimal shape of the Prisma client needed for a health probe (#67). Declared
 * structurally so the check is unit-testable with a fake client — no Prisma
 * import required in tests.
 */
export interface HealthCheckDb {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>
}

/**
 * Readiness probe for #67: confirms the database is reachable by running a
 * trivial `SELECT 1`. Returns true if it succeeds, false on any error. Never
 * throws — the caller maps the boolean to a 200/503 response.
 */
export async function checkDatabaseHealth(db: HealthCheckDb): Promise<boolean> {
    try {
        await db.$queryRaw`SELECT 1`
        return true
    } catch {
        return false
    }
}
