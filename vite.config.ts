import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const balancePath = path.join(__dirname, 'src/game/gameBalance.persisted.json')
const musicDebugPath = path.join(__dirname, 'src/game/asteroidMusicDebug.persisted.json')

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

export default defineConfig({
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
  ],
})
