import express from 'express'

import cors from 'cors'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(cors())

function loadJson(name) {
  return JSON.parse(readFileSync(path.join(__dirname, 'data', name), 'utf-8'))
}

// These three endpoints are where you'll eventually plug in your real
// parser output (AST walk -> nodes/edges, route scan -> apiData,
// migration files / information_schema query -> schemaData).
// For now they just serve the same static JSON the frontend already
// falls back to, so you can wire the two folders together end to end.
app.get('/api/graph', (req, res) => res.json(loadJson('graph.json')))
app.get('/api/api-explorer', (req, res) => res.json(loadJson('api.json')))
app.get('/api/schema', (req, res) => res.json(loadJson('schema.json')))

const PORT = 4000
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`))
