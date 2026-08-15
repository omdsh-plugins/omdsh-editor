/**
 * The spawner, against real processes. These are the specs that would catch
 * "the editor closes when the harness does" and "a directory name ran as a
 * command", neither of which a fake spawner can prove.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hostSpawner } from '../src/index.ts'

/** A scratch directory each case gets to itself. */
let workdir: string

beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), 'omdsh-editor-'))
})

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true })
})

/**
 * Wait for a file the detached child writes.
 * @param path - the file to wait for.
 * @param timeoutMs - how long to keep looking.
 * @returns its contents, or undefined when it never appeared.
 */
async function settle(path: string, timeoutMs = 2_000): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      return await readFile(path, 'utf8')
    } catch {
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }
  return undefined
}

describe('hostSpawner', () => {
  it('starts a process and resolves', async () => {
    await expect(hostSpawner(50).run({ command: 'true', args: [] }, workdir)).resolves.toBeUndefined()
  })

  it('rejects with launch-failed when the program does not exist', async () => {
    await expect(hostSpawner(1_000).run({ command: join(workdir, 'nope'), args: [] }, workdir))
      .rejects.toMatchObject({ code: 'launch-failed' })
  })

  it('rejects when the working directory does not exist', async () => {
    await expect(hostSpawner(1_000).run({ command: 'true', args: [] }, join(workdir, 'gone')))
      .rejects.toMatchObject({ code: 'launch-failed' })
  })

  it('runs the child in the directory it was given', async () => {
    const marker = join(workdir, 'cwd')
    await hostSpawner(50).run({ command: 'sh', args: ['-c', `pwd > ${marker}`] }, workdir)
    // macOS resolves the temp directory through /private; compare the tails.
    expect((await settle(marker))?.trim().endsWith(workdir.replace(/^\/private/, ''))).toBe(true)
  })

  it('never runs an argument as a command', async () => {
    const marker = join(workdir, 'pwned')
    // With `shell: true` this argument would be a second command and the
    // marker would appear. A directory the user named `; touch pwned` is a
    // directory, so it must not.
    await hostSpawner(50).run({ command: 'true', args: [`; touch ${marker}`] }, workdir)
    await new Promise(resolve => setTimeout(resolve, 200))
    await expect(readFile(marker, 'utf8')).rejects.toThrow()
  })

  it('detaches the child into its own process group', async () => {
    const marker = join(workdir, 'pgid')
    await hostSpawner(50).run({ command: 'sh', args: ['-c', `ps -o pgid= -p $$ > ${marker}`] }, workdir)
    const childGroup = Number((await settle(marker))?.trim())
    expect(Number.isNaN(childGroup)).toBe(false)
    // Sharing this process's group is exactly what a group signal at harness
    // shutdown would follow into the editor.
    expect(childGroup).not.toBe(process.pid)
  })
})
