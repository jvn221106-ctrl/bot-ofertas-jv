import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function check(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filename = path.join(dir, entry.name)
    if (entry.isDirectory()) check(filename)
    else if (filename.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', filename], { stdio: 'inherit' })
      if (result.error || result.status !== 0) process.exit(1)
    }
  }
}

for (const dir of ['src', 'scripts', 'test']) if (fs.existsSync(dir)) check(dir)
console.log('Sintaxe verificada em todos os arquivos JavaScript.')
