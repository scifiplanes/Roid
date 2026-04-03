import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgPath = path.join(__dirname, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string }

function resolveDeployId(): string {
  const fromEnv =
    process.env.VITE_DEPLOY_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.CI_COMMIT_SHA
  if (fromEnv && String(fromEnv).trim() !== '') return String(fromEnv).trim()
  return String(pkg.version ?? '0.0.0')
}

const balancePath = path.join(__dirname, 'src/game/gameBalance.persisted.json')
const musicDebugPath = path.join(__dirname, 'src/game/asteroidMusicDebug.persisted.json')
const settingsClientPath = path.join(__dirname, 'src/game/settingsClient.persisted.json')

const BALANCE_KEYS = [
  'durabilityMult',
  'replicatorFeedSpeedMult',
  'toolCostMult',
  'reactorOutputMult',
  'energyBaseCapMult',
  'batteryStorageMult',
  'passiveIncomeMult',
] as const

function isValidBalance(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  for (const k of BALANCE_KEYS) {
    const v = o[k]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0.1 || v > 4) return false
  }
  return true
}

/** Loose: JSON object; optional `voices` array for asteroid music debug. */
function isValidAsteroidMusicDebug(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  if (o.voices !== undefined && !Array.isArray(o.voices)) return false
  return true
}

function isValidSettingsClientV1(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return false
  return (obj as { v?: unknown }).v === 1
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_DEPLOY_ID': JSON.stringify(resolveDeployId()),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  /** Dev auto-save POSTs overwrite these JSON files; they are also statically imported in `main.ts`. Ignore them so writes do not trigger a full page reload. */
  server: {
    watch: {
      ignored: [balancePath, musicDebugPath, settingsClientPath],
    },
  },
  plugins: [
    {
      name: 'persist-game-balance',
      configureServer(server) {
        server.middlewares.use('/api/persist-game-balance', (req, res, next) => {
          if (req.method !== 'POST') {
            next()
            return
          }
          let body = ''
          req.setEncoding('utf8')
          req.on('data', (chunk: string) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const raw = body
              const parsed: unknown = JSON.parse(raw)
              if (!isValidBalance(parsed)) {
                res.statusCode = 400
                res.end('invalid balance')
                return
              }
              fs.writeFileSync(balancePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
              res.statusCode = 204
              res.end()
            } catch {
              res.statusCode = 400
              res.end('bad request')
            }
          })
        })
      },
    },
    {
      name: 'persist-asteroid-music-debug',
      configureServer(server) {
        server.middlewares.use('/api/persist-asteroid-music', (req, res, next) => {
          if (req.method !== 'POST') {
            next()
            return
          }
          let body = ''
          req.setEncoding('utf8')
          req.on('data', (chunk: string) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const parsed: unknown = JSON.parse(body)
              if (!isValidAsteroidMusicDebug(parsed)) {
                res.statusCode = 400
                res.end('invalid asteroid music debug')
                return
              }
              fs.writeFileSync(musicDebugPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
              res.statusCode = 204
              res.end()
            } catch {
              res.statusCode = 400
              res.end('bad request')
            }
          })
        })
      },
    },
    {
      name: 'persist-settings-client',
      configureServer(server) {
        server.middlewares.use('/api/persist-settings-client', (req, res, next) => {
          if (req.method !== 'POST') {
            next()
            return
          }
          let body = ''
          req.setEncoding('utf8')
          req.on('data', (chunk: string) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const parsed: unknown = JSON.parse(body)
              if (!isValidSettingsClientV1(parsed)) {
                res.statusCode = 400
                res.end('invalid settings client')
                return
              }
              fs.writeFileSync(settingsClientPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
              res.statusCode = 204
              res.end()
            } catch {
              res.statusCode = 400
              res.end('bad request')
            }
          })
        })
      },
    },
  ],
})
