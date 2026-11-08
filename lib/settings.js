/**
 * Per-profile model selection for the workbench.
 *
 * The first run inherits the Host's current default model; once the user picks
 * a model in the panel, that choice is stored next to the task data and used
 * for every analysis and follow-up question.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const FILE = 'model-selection.json'

function clean (value) {
  if (!value || typeof value !== 'object') return null
  const provider = String(value.provider || '').trim()
  const model = String(value.model || '').trim()
  if (!provider || !model) return null
  const reasoningEffort = String(value.reasoningEffort || '').trim()
  return reasoningEffort ? { provider, model, reasoningEffort } : { provider, model }
}

export async function createModelSettings ({ dataDir, logger = console }) {
  const file = path.join(dataDir, FILE)
  let current = null
  try {
    current = clean(JSON.parse(await fs.readFile(file, 'utf8')))
  } catch {
    current = null
  }
  return {
    file,
    get () { return current },
    async save (next) {
      const value = clean(next)
      if (!value) throw new Error('模型选择无效')
      await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
      current = value
      return value
    },
  }
}
