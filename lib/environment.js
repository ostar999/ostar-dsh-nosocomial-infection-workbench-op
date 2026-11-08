/**
 * Environment diagnostics and optional dependency installation.
 *
 * Everything here is user-triggered: the UI first shows what is present, then
 * a button may run the platform package manager. No background installation
 * happens while importing files.
 */
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const JOB_LIMIT = 20
const OUTPUT_LIMIT = 48 * 1024

function toolDirs () {
  return [
    ...String(process.env.PATH || '').split(path.delimiter),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ].filter(Boolean)
}

async function findTool (name) {
  const names = process.platform === 'win32' ? [name, `${name}.exe`] : [name]
  for (const dir of toolDirs()) {
    for (const candidate of names) {
      const full = path.join(dir, candidate)
      try { await fs.access(full); return full } catch {}
    }
  }
  return null
}

function findToolSync (name) {
  for (const dir of toolDirs()) {
    for (const candidate of process.platform === 'win32' ? [name, `${name}.exe`] : [name]) {
      const full = path.join(dir, candidate)
      if (existsSync(full)) return full
    }
  }
  return null
}

async function toolVersion (command, args) {
  if (!command) return ''
  try {
    const result = await execFileAsync(command, args, { timeout: 8000, maxBuffer: 1024 * 1024 })
    return String(result.stdout || result.stderr || '').trim().split('\n')[0] || ''
  } catch (error) {
    return String(error?.stdout || error?.stderr || error?.message || '').trim().split('\n')[0] || ''
  }
}

function pdfjsInfo () {
  try {
    const require = createRequire(import.meta.url)
    const packagePath = require.resolve('pdfjs-dist/package.json')
    const pkg = require(packagePath)
    return { ok: true, version: String(pkg.version || ''), path: path.dirname(packagePath) }
  } catch (error) {
    return { ok: false, version: '', error: String(error?.message || error) }
  }
}

export function createEnvironment ({ pluginRoot, getOfficeToPdf, version = '' }) {
  const jobs = new Map()

  async function check () {
    const pdfjs = pdfjsInfo()
    const pdftotext = await findTool('pdftotext')
    const mutool = await findTool('mutool')
    const brew = await findTool('brew')
    const npm = await findTool('npm') || await findTool('pnpm')
    const popplerVersion = await toolVersion(pdftotext, ['-v'])
    const mutoolVersion = await toolVersion(mutool, ['-v'])
    let officeToPdf = false
    try { officeToPdf = Boolean(getOfficeToPdf?.()) } catch {}
    const popplerCommand = brew ? `${brew} install poppler` : ''
    const pdfjsCommand = npm ? `${npm} install --no-audit --no-fund` : ''
    return {
      version,
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      pdfjs,
      poppler: { ok: Boolean(pdftotext), path: pdftotext || '', version: popplerVersion },
      mutool: { ok: Boolean(mutool), path: mutool || '', version: mutoolVersion },
      officeToPdf: { ok: officeToPdf },
      install: {
        poppler: {
          supported: process.platform === 'darwin' && Boolean(brew),
          command: popplerCommand,
          hint: popplerCommand || (process.platform === 'darwin'
            ? '需要先安装 Homebrew，然后在终端执行 brew install poppler'
            : process.platform === 'linux'
              ? '请用系统包管理器安装 poppler-utils（apt / dnf / pacman 等），确保 pdftotext 在 PATH 中'
              : process.platform === 'win32'
                ? '请安装 Poppler for Windows，并把 pdftotext.exe 加入 PATH'
                : '请安装 poppler，并确保 pdftotext 在 PATH 中'),
        },
        pdfjs: {
          supported: Boolean(npm),
          command: pdfjsCommand,
          hint: pdfjsCommand || '请在插件目录执行 npm install',
        },
      },
    }
  }

  function finishJob (job, code, error) {
    if (job.status !== 'running') return
    job.status = code === 0 ? 'done' : 'error'
    job.exitCode = code
    job.finishedAt = Date.now()
    if (error) job.output += `\n${error}`
    job.output = job.output.slice(-OUTPUT_LIMIT)
  }

  function startInstall (target) {
    if (!['poppler', 'pdfjs'].includes(target)) throw new Error('未知的依赖类型')
    const job = {
      id: `env_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      target,
      status: 'running',
      output: '',
      startedAt: Date.now(),
      finishedAt: null,
      exitCode: null,
      command: '',
    }
    jobs.set(job.id, job)
    while (jobs.size > JOB_LIMIT) {
      const first = jobs.keys().next().value
      if (!first) break
      jobs.delete(first)
    }
    const command = target === 'poppler'
      ? (process.platform === 'darwin' ? findToolSync('brew') : null)
      : (findToolSync('npm') || findToolSync('pnpm'))
    if (!command) {
      finishJob(job, 1, '当前平台没有可用的自动安装命令，请按页面提示手动安装。')
      return job
    }
    const args = target === 'poppler' ? ['install', 'poppler'] : ['install', '--no-audit', '--no-fund']
    const child = spawn(command, args, {
      cwd: pluginRoot,
      env: { ...process.env, PATH: [...toolDirs(), process.env.PATH || ''].filter(Boolean).join(path.delimiter) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    job.command = `${command} ${args.join(' ')}`
    const append = (chunk) => {
      job.output = (job.output + String(chunk)).slice(-OUTPUT_LIMIT)
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    child.on('error', (error) => finishJob(job, 1, String(error?.message || error)))
    child.on('close', (code) => finishJob(job, code ?? 1))
    return job
  }

  function getJob (id) {
    return jobs.get(String(id || '')) || null
  }

  return { check, startInstall, getJob }
}
