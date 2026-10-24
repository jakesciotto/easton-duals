export function loadDotEnv(file: string): void {
  const before: Record<string, string | undefined> = { ...process.env }
  try {
    process.loadEnvFile(file)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    throw err
  }
  for (const key of Object.keys(before)) {
    process.env[key] = before[key]
  }
}

export const DEV_DB_PATH = './data/dev.db'

export function applyDevDefaults(env: Record<string, string | undefined>): string | null {
  if (env.DUALS_DEV_REMOTE === '1' || env.DUELS_DEV_REMOTE === '1') return null
  env.DB_PATH ??= DEV_DB_PATH
  return env.DB_PATH
}
