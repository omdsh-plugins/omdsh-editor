# `@omdsh-plugins/omdsh-editor`

English | [中文](README.zh.md)

Open the project you are working in with the editor you actually use. A split control in the session header: press the left half and the conversation's directory opens in the editor you chose last time, press the chevron and pick a different one.

The harness has no such capability and no seam that would let one be reached around it, so this package adds both halves — the host side that finds the applications and starts one, and the browser side that offers them.

```
┌──────────────────────────────────────────────┬───────────────┐
│  my-project                                  │  ⌗   ⧉   [◧|▾] │  ← the session header
└──────────────────────────────────────────────┴───────────────┘
                                                        │
                                       ┌────────────────┴──────┐
                                       │ ◧  VS Code            │
                                       │ ◧  Cursor             │
                                       │ ▤  Finder             │
                                       │ ▸  Terminal           │
                                       │ ▸  iTerm2             │
                                       └───────────────────────┘
```

## Installing

`dsh plugin --profile <name> <args…>` is a thin `pnpm` forwarder run inside the profile directory (`~/.dsh/profiles/web`, or `$DSH_HOME/profiles/web`). It takes anything pnpm takes, and then reconciles `dsh.profile.bundles` against what is installed.

This package is unpublished, so install it from this checkout:

```sh
pnpm install && pnpm run build                 # lib/ must exist; link: does not build
dsh plugin --profile web add link:/absolute/path/to/omdsh-editor
```

A relative spec is anchored to the directory you invoked `dsh` from, so from inside this checkout `dsh plugin --profile web add link:.` is the same thing. Either way the profile manifest gains the dependency and `@omdsh-plugins/omdsh-editor` is appended to `dsh.profile.bundles`, so [`cordis.patch.yml`](cordis.patch.yml) is applied after `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app`. The harness tree stays exactly as it shipped.

Restart the runtime to pick it up (`dsh web`, or quit and reopen the desktop application). To remove it:

```sh
dsh plugin --profile web remove @omdsh-plugins/omdsh-editor
```

which takes the bundle row, the routes, and the control with it.

`link:` means pnpm neither builds the package nor installs its dependencies — neither matters here, because the node half imports only Node builtins and the browser half inlines `clsx`. It does mean a rebuild after editing sources is yours to run.

There is no companion plugin to be absent. Every service either half injects is a harness one the profile already composes — `webServer`, `sessions`, and `webRuntime` on the host, `slots` and `locale` in the browser — so nothing else from this collection has to be installed beside it, and nothing else changes what it does. `webRuntime` is the web surface bundle's, which is what makes this a web-profile row: it carries the trust list the fence checks against, and a surface with no web server has no browser to serve anyway.

## Which machine the editor opens on

**The one running the runtime.** That is where the project directory is, which makes it the only machine where opening the folder means anything, and it is where the harness's own model already puts the work.

It follows that reaching a runtime over the network and pressing an editor starts that editor next to the files, not next to the browser. The plugin says so rather than hiding it: on a host with nothing installed the menu names the platform it looked on (`No editor found on the machine running dsh (linux)`), which distinguishes "install an editor" from "this runtime is not on your desk".

Putting this in the Electron shell instead would have made the capability exclusive to the packaged application, when `dsh web` in a terminal wants it just as much.

## What it offers

| Kind | Applications |
|---|---|
| Editors | VS Code, VS Code Insiders, Cursor, Windsurf, Zed, Sublime Text, IntelliJ IDEA, PyCharm, WebStorm, Xcode |
| Files | Finder, File Explorer, `xdg-open` |
| Terminals | Terminal, iTerm2, Warp, Ghostty, WezTerm, kitty, Alacritty |

Only the ones this host actually has are listed. Detection is a `stat` per candidate and nothing else — no `mdfind`, no registry read, no subprocess — so the whole sweep is a few milliseconds and the menu is a plain list rather than a dialog to wait on. The result is cached for 15 seconds, which is short enough that an editor installed while the harness runs shows up without a restart.

An application this table does not know is invisible. Adding one is four lines in [`src/catalog.ts`](src/catalog.ts), or an `editors` entry in the plugin's configuration, which replaces the shipped table outright.

## How an application is found and started

A row lists the ways it may be present, most preferred first, and the first that answers decides both that it is installed and how it is launched.

| Probe | Where it looks | How it launches |
|---|---|---|
| `mac-app` | the standard macOS application directories, including `~/Applications` | `open -a <bundle> <dir>` |
| `windows-exe` | a fixed path under `%LOCALAPPDATA%` / `%ProgramFiles%` | the executable, with the directory |
| `path-bin` | `PATH` (with `.exe`/`.cmd`/`.bat`/`.com` on Windows) | the executable, with the directory |

The bundle is preferred over a CLI shim because it survives a GUI session whose `PATH` never ran the user's profile. `open -a` rather than the executable inside the bundle, because Launch Services is what activates an instance that is already running and the only way an argument reaches it — which is also what makes Terminal spawn a shell in the directory and Finder reveal it.

Four terminals (Ghostty, WezTerm, kitty, Alacritty) are listed by their CLI only. Their working directory is a flag rather than a document, and `open -a` cannot pass a flag to a running instance; a bundle probe would light the row up and then open the wrong directory, which is worse than the row being absent.

The child is detached into its own process group with its streams closed and then unreferenced, so quitting the harness — or one of the desktop shell's own memory-policy restarts — does not close the window you are typing in.

## The routes

All three live under `/omdsh-editor` and are registered through `ctx.effect`, so unmounting the plugin removes them.

| Route | What it does |
|---|---|
| `GET /omdsh-editor/editors` | the applications this host has, and its `process.platform` |
| `GET /omdsh-editor/icon?id=…` | one application's own icon, as PNG |
| `POST /omdsh-editor/open` | launch one on a conversation's directory |

**The directory is the host's to decide.** An open request names a session; the session's own working directory is authoritative, and the `cwd` the browser sends is consulted only when the session carries none. Either way the result must be absolute and must still be a directory before anything is started. There is deliberately no `process.cwd()` fallback: opening whatever directory the harness happened to be started from, because this conversation has none, is a surprise rather than a fallback.

Every route passes the same browser-trust check the `/api` gateway applies ([`src/trust-fence.ts`](src/trust-fence.ts)) — a Host header naming us, plus same-origin browser markers. A route that starts a native application must be exactly as reachable as `/api`, and no more.

## The control

One entry in `conversation.session.header.utilities`, the right-aligned utility row ui-conversation already declares. The package declares no slot of its own, so removing it leaves the header as it shipped.

The split is the design. The left half is the verb — the common case is "open my project in my editor", and it should cost one press with no decision. The right half is the chooser, needed the first time and when you want a different one. The choice is remembered in `localStorage`, which is the only reason the left half can be a verb at all.

## The icons are the real ones

Each row is drawn with the product's actual icon, which is what makes six rows tell themselves apart the way a Dock does.

Nothing is bundled and nothing is redrawn. The bytes come off the copy of the application installed on this host — `Contents/Resources/*.icns`, named by the bundle's own `Info.plist` — rendered locally, exactly as the platform's "Open With" menu renders them. A package that shipped a dozen vendors' logos would be a licensing question; reading the copy the user installed is not.

Extraction is pure Node, no `sips` and no subprocess: an `.icns` is a flat type-length-value container, and every modern one carries its large variants as embedded PNG, so the icon is a scan and a slice. The smallest variant at least 64px wide is served, which is a few kilobytes and crisp at 2×.

Three things can leave a row without one — a host whose applications are not macOS bundles, a bundle using a compiled asset catalog rather than an `.icns`, and one whose `Resources` holds many `.icns` with none identifiable as the app's own. All three fall back to a glyph of the row's kind tinted in the product's accent, which is still enough to tell the rows apart. The catalog answer carries `icon: boolean` so the picker only requests icons that exist, and the `<img>` falls back on error anyway.

## Commands

```sh
pnpm install
pnpm run build       # tsc emits lib/types, tsdown bundles both halves
pnpm run typecheck   # sources and tests
pnpm run test        # vitest
```

The committed manifest pins the published harness, so a bare clone installs and builds itself. To build against a sibling checkout instead:

```sh
pnpm run harness:local ../../deepseek-harness   # that checkout must be built first
pnpm install
pnpm run harness:npm                            # before committing — a link: is one machine's layout
pnpm run check:harness-pin
```

The node-only specs run from a bare clone on the pin. The three browser specs need the checkout: the harness's published browser packages ship a loader bundle a test runner cannot import, so on the pin they resolve to [`tests/registry-mode-guard.ts`](tests/registry-mode-guard.ts) and fail with a message saying so.

## Known limitations and deferred work

- **Editors are found from a table.** A host with something unusual installed sees a shorter list than it has. "What editors exist on this machine" is not a question with an answer; the escape hatch is the `editors` configuration.
- **Success means the process started.** Once the child is detached there is no exit code to wait for, so an editor that starts and then refuses the directory itself reports nothing back. The spawn window is 150ms — long enough for Node to deliver an `ENOENT`, short enough to be invisible.
- **The remembered choice is per browser, not per user.** It lives in `localStorage`, so a second browser starts on the first listed editor again.
- **Xcode is handed a directory, not a project.** `open -a Xcode <dir>` is what the row does; a folder that is not a project or workspace opens as Xcode's own folder view.
- **Windows detection covers the default install locations only.** An editor installed elsewhere is found only if its shim is on `PATH`.
- **Icons are macOS-only.** Windows would need PE resource extraction and Linux a `.desktop` + theme lookup; neither is done, so those hosts get the kind glyph. A bundle whose icon lives in a compiled `Assets.car` also falls back, since reaching into one would mean carrying an asset-catalog decoder.
- **Only the XML `Info.plist` is parsed.** A binary one is not decoded — the icon is found by the app's own name instead, which is what every such bundle uses in practice (Xcode included). A binary-plist bundle that names its icon something else falls back to the glyph.
- **No end-to-end coverage.** Exercising the real thing means a windowing session and an installed editor; the specs cover detection, every route and refusal, the launch contract (detached, `shell: false`, correct working directory) against real processes, and the browser half's state machine and rendering.
