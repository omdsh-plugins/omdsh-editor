/**
 * Starting the chosen application, and surviving it.
 *
 * The editor must outlive the harness: a user who quits `dsh` should not have
 * their editor close with it, and a runtime restart (the desktop shell does
 * them on its own memory policy) must not take a window they are typing in.
 * So the child is detached into its own process group with its streams closed
 * and then unreferenced — after which this process has no handle on it at all,
 * which is the point.
 *
 * That is also why success here means "the process started", and nothing more.
 * Once detached there is no exit code to wait for and nothing to report, so
 * the only failure this module can name is the spawn itself failing.
 * @module @omdsh-plugins/omdsh-editor/src/launch
 */

import { spawn } from 'node:child_process'
import type { LaunchPlan } from './catalog.ts'
import { EditorError } from './wire.ts'

/** Starting a process, as this plugin needs it (a spec supplies its own). */
export interface Spawner {
  /**
   * Start one detached process.
   * @param plan - the command line.
   * @param cwd - the working directory to start it in.
   * @returns completion once the process is running, rejection when it is not.
   */
  run: (plan: LaunchPlan, cwd: string) => Promise<void>
}

/**
 * How long to wait for the spawn to be accepted before reporting success.
 *
 * Node reports a spawn failure asynchronously through `error`, so returning
 * the instant `spawn()` returns would call every launch a success — including
 * one that immediately fails with ENOENT. Waiting the whole child out is not
 * an option either (the child is the editor, and it lives for hours). This
 * window is the compromise: long enough for `error` to arrive from the event
 * loop, short enough to be invisible in the UI.
 */
export const SPAWN_SETTLE_MS = 150

/**
 * The real spawner.
 * @param settleMs - how long to watch for a spawn failure.
 * @returns a spawner that detaches every child.
 */
export function hostSpawner(settleMs = SPAWN_SETTLE_MS): Spawner {
  return {
    run: (plan, cwd) => new Promise<void>((resolve, reject) => {
      const child = spawn(plan.command, [...plan.args], {
        cwd,
        detached: true,
        // Nothing reads the editor's output, and an inherited pipe nobody
        // drains is how a detached child ends up blocked on a full buffer.
        stdio: 'ignore',
        // No shell: the directory is user data and reaches the program as one
        // argv entry, so a path with a space, a quote, or a `;` in it is a
        // path and never a second command.
        shell: false,
      })
      const timer = setTimeout(() => {
        child.removeListener('error', onError)
        // The child is on its own from here; unref lets this process exit
        // without waiting for an editor the user may keep open all day.
        child.unref()
        resolve()
      }, settleMs)
      const onError = (error: Error): void => {
        clearTimeout(timer)
        reject(new EditorError('launch-failed', error.message, 500))
      }
      child.once('error', onError)
    }),
  }
}
