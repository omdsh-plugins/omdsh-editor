import { access, readFile, readdir, stat } from "node:fs/promises";
import { basename, delimiter, isAbsolute, join, resolve } from "node:path";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
//#region lib/types/app-icon.js
/**
* The real icon of an installed application, read off the user's own disk.
*
* The picker draws each row with the product's actual mark rather than an
* approximation of it. That is a deliberate choice about WHERE the artwork
* comes from: nothing is redrawn and nothing is redistributed — the bytes are
* the ones already in the application bundle on this machine, rendered locally,
* exactly as the platform's own "Open With" menu renders them. A package that
* shipped a dozen vendors' logos would be a licensing question; reading the
* copy the user installed is not.
*
* The extraction is pure Node. An `.icns` is a flat type-length-value
* container, and every modern one carries its large variants as embedded PNG,
* so the icon is a scan and a slice — no `sips`, no subprocess, nothing to go
* wrong on a host where a command line tool moved.
* @module @omdsh-plugins/omdsh-editor/src/app-icon
*/
/** The eight bytes every PNG starts with. */
const PNG_SIGNATURE = Buffer.from([
	137,
	80,
	78,
	71,
	13,
	10,
	26,
	10
]);
/** Magic at the head of an `.icns` container. */
const ICNS_MAGIC = "icns";
/**
* Smallest edge worth serving. The mark renders at 16–18 CSS px, so 64 is
* crisp at 2x and still a couple of kilobytes; below this the browser would be
* upscaling on a retina display.
*/
const PREFERRED_ICON_EDGE = 64;
/**
* Every PNG variant an `.icns` carries, in container order.
*
* Entries that are not PNG — the old raw and RLE bitmaps, the JPEG 2000
* variants, the table of contents — are skipped rather than decoded: the
* point is to find bytes a browser already understands.
* @param icns - the whole `.icns` file.
* @returns the PNG variants; empty when the file carries none.
*/
function icnsVariants(icns) {
	if (icns.length < 8 || icns.toString("latin1", 0, 4) !== ICNS_MAGIC) return [];
	const end = Math.min(icns.readUInt32BE(4), icns.length);
	const variants = [];
	let offset = 8;
	while (offset + 8 <= end) {
		const type = icns.toString("latin1", offset, offset + 4);
		const length = icns.readUInt32BE(offset + 4);
		if (length < 8 || offset + length > end) break;
		const data = icns.subarray(offset + 8, offset + length);
		if (data.length >= 24 && data.subarray(0, 8).equals(PNG_SIGNATURE)) variants.push({
			type,
			width: data.readUInt32BE(16),
			png: data
		});
		offset += length;
	}
	return variants;
}
/**
* The variant to serve: the smallest one that is still crisp, or the largest
* available when every variant is below that.
* @param variants - what the container carried.
* @returns the chosen PNG, or undefined when there were none.
*/
function pickVariant(variants) {
	if (variants.length === 0) return void 0;
	const byWidth = [...variants].sort((a, b) => a.width - b.width);
	return (byWidth.find((variant) => variant.width >= 64) ?? byWidth[byWidth.length - 1])?.png;
}
/** The real filesystem. */
const hostBundleReader = {
	readFile,
	readdir
};
/**
* The icon file named by a bundle's `Info.plist`.
*
* Only the XML form is read, with a regex rather than a plist parser: this is
* one string out of one well-known key, and carrying a binary-plist decoder to
* reach it would be a lot of surface for the handful of bundles that use one.
* Those fall through to {@link resolveIconPath}'s naming fallbacks, which is
* how Xcode — binary plist, icon named after the app — is still found.
* @param plist - the raw `Info.plist` bytes.
* @returns the `CFBundleIconFile` value, or undefined.
*/
function iconFileFromPlist(plist) {
	if (plist.subarray(0, 8).toString("latin1") === "bplist00") return void 0;
	const value = /<key>CFBundleIconFile<\/key>\s*<string>([^<]*)<\/string>/.exec(plist.toString("utf8"))?.[1]?.trim();
	if (value === void 0 || value === "") return void 0;
	if (value.includes("/") || value.includes("\\") || value.includes("..")) return void 0;
	return value.toLowerCase().endsWith(".icns") ? value : `${value}.icns`;
}
/**
* Where one bundle keeps its icon.
*
* Three chances, because no single rule covers every bundle: the declared
* name, the app's own name (which is what an application with a binary
* `Info.plist` almost always uses), and — only when the directory holds
* exactly one — the sole `.icns` there. The last is deliberately not a
* "pick the first" guess: VS Code's Resources holds sixty of them, one per
* file type it claims, and any of those would be the wrong picture.
* @param bundle - absolute path of the `.app`.
* @param reader - filesystem access.
* @returns the absolute icon path, or undefined when none was identified.
*/
async function resolveIconPath(bundle, reader) {
	const resources = join(bundle, "Contents", "Resources");
	const declared = await reader.readFile(join(bundle, "Contents", "Info.plist")).then(iconFileFromPlist, () => void 0);
	if (declared !== void 0) {
		const path = join(resources, declared);
		if (await reader.readFile(path).then(() => true, () => false)) return path;
	}
	const named = join(resources, `${basename(bundle, ".app")}.icns`);
	if (await reader.readFile(named).then(() => true, () => false)) return named;
	const icons = (await reader.readdir(resources).catch(() => [])).filter((entry) => entry.toLowerCase().endsWith(".icns"));
	return icons.length === 1 && icons[0] !== void 0 ? join(resources, icons[0]) : void 0;
}
/**
* One application's icon as PNG bytes.
* @param bundle - absolute path of the `.app`.
* @param reader - filesystem access.
* @returns the PNG, or undefined when the bundle yielded none.
*/
async function readAppIcon(bundle, reader = hostBundleReader) {
	const path = await resolveIconPath(bundle, reader);
	if (path === void 0) return void 0;
	const icns = await reader.readFile(path).catch(() => void 0);
	if (icns === void 0) return void 0;
	return pickVariant(icnsVariants(icns));
}
/**
* Icons already extracted, held for the process's life.
*
* An application's icon changes only when the application is replaced, and a
* replaced application restarts the runtime often enough in practice; the
* browser's own cache means this is consulted about once per page anyway. A
* miss is remembered too — re-scanning a 300 KB container on every menu open
* to conclude "no icon" again is the one case worth caching hardest.
*/
var IconCache = class {
	reader;
	icons = /* @__PURE__ */ new Map();
	/**
	* @param reader - filesystem access.
	*/
	constructor(reader = hostBundleReader) {
		this.reader = reader;
	}
	/**
	* One bundle's icon.
	* @param key - cache key; the editor id.
	* @param bundle - absolute path of the `.app`.
	* @returns the PNG, or undefined when there is none to serve.
	*/
	async get(key, bundle) {
		if (this.icons.has(key)) return this.icons.get(key);
		const icon = await readAppIcon(bundle, this.reader);
		this.icons.set(key, icon);
		return icon;
	}
	/** Forget everything, so the next read goes back to disk. */
	clear() {
		this.icons.clear();
	}
};
//#endregion
//#region lib/types/catalog.js
/**
* The applications this plugin knows how to find and how to open a directory
* in — one table, and the pure rules that turn a row into a command line.
*
* A table rather than a probe-anything scan, because "which of these did the
* user install" is answerable in milliseconds from a handful of `stat` calls,
* while "what editors exist on this machine" is not answerable at all. The
* cost is that an editor nobody added here is invisible; the {@link Config}
* `editors` option is the escape hatch, and adding a row is four lines.
*
* Node-free, like [shared](./shared.ts): a row says WHERE to look and WHAT to
* run, and [detect](./detect.ts) is the only module that touches a disk.
* @module @omdsh-plugins/omdsh-editor/src/catalog
*/
/**
* The placeholder an {@link EditorEntry.args} template puts the directory at.
* A token rather than an append rule because a flag may need it glued on
* (`--working-directory=/path`), which appending cannot express.
*/
const DIRECTORY_TOKEN = "{dir}";
/**
* Where macOS keeps applications. `/System/…` carries the two Apple entries
* (Terminal moved to `/System/Applications/Utilities` in Catalina, and Finder
* has always been in CoreServices), and `~/Applications` is where a per-user
* install lands.
*/
const MAC_APP_DIRECTORIES = [
	"/Applications",
	"/Applications/Utilities",
	"/System/Applications",
	"/System/Applications/Utilities",
	"/System/Library/CoreServices",
	"~/Applications"
];
/**
* The known applications, in the order the picker lists them: editors first
* (the reason someone opens this menu), then the file manager, then terminals.
*/
const DEFAULT_CATALOG = [
	{
		id: "vscode",
		label: "VS Code",
		kind: "code",
		accent: "#3b8eea",
		probes: [
			{
				kind: "mac-app",
				bundle: "Visual Studio Code.app"
			},
			{
				kind: "windows-exe",
				root: "localAppData",
				path: "Programs/Microsoft VS Code/Code.exe"
			},
			{
				kind: "windows-exe",
				root: "programFiles",
				path: "Microsoft VS Code/Code.exe"
			},
			{
				kind: "path-bin",
				bin: "code"
			}
		]
	},
	{
		id: "vscode-insiders",
		label: "VS Code Insiders",
		kind: "code",
		accent: "#2aa15d",
		probes: [
			{
				kind: "mac-app",
				bundle: "Visual Studio Code - Insiders.app"
			},
			{
				kind: "windows-exe",
				root: "localAppData",
				path: "Programs/Microsoft VS Code Insiders/Code - Insiders.exe"
			},
			{
				kind: "path-bin",
				bin: "code-insiders"
			}
		]
	},
	{
		id: "cursor",
		label: "Cursor",
		kind: "code",
		accent: "#a8aab0",
		probes: [
			{
				kind: "mac-app",
				bundle: "Cursor.app"
			},
			{
				kind: "windows-exe",
				root: "localAppData",
				path: "Programs/cursor/Cursor.exe"
			},
			{
				kind: "path-bin",
				bin: "cursor"
			}
		]
	},
	{
		id: "windsurf",
		label: "Windsurf",
		kind: "code",
		accent: "#12b886",
		probes: [
			{
				kind: "mac-app",
				bundle: "Windsurf.app"
			},
			{
				kind: "windows-exe",
				root: "localAppData",
				path: "Programs/Windsurf/Windsurf.exe"
			},
			{
				kind: "path-bin",
				bin: "windsurf"
			}
		]
	},
	{
		id: "zed",
		label: "Zed",
		kind: "code",
		accent: "#dd6b20",
		probes: [{
			kind: "mac-app",
			bundle: "Zed.app"
		}, {
			kind: "path-bin",
			bin: "zed"
		}]
	},
	{
		id: "sublime",
		label: "Sublime Text",
		kind: "code",
		accent: "#ff9800",
		probes: [
			{
				kind: "mac-app",
				bundle: "Sublime Text.app"
			},
			{
				kind: "windows-exe",
				root: "programFiles",
				path: "Sublime Text/sublime_text.exe"
			},
			{
				kind: "path-bin",
				bin: "subl"
			}
		]
	},
	{
		id: "intellij",
		label: "IntelliJ IDEA",
		kind: "code",
		accent: "#fe2857",
		probes: [
			{
				kind: "mac-app",
				bundle: "IntelliJ IDEA.app"
			},
			{
				kind: "mac-app",
				bundle: "IntelliJ IDEA CE.app"
			},
			{
				kind: "path-bin",
				bin: "idea"
			}
		]
	},
	{
		id: "pycharm",
		label: "PyCharm",
		kind: "code",
		accent: "#21d789",
		probes: [
			{
				kind: "mac-app",
				bundle: "PyCharm.app"
			},
			{
				kind: "mac-app",
				bundle: "PyCharm CE.app"
			},
			{
				kind: "path-bin",
				bin: "pycharm"
			}
		]
	},
	{
		id: "webstorm",
		label: "WebStorm",
		kind: "code",
		accent: "#07c3f2",
		probes: [{
			kind: "mac-app",
			bundle: "WebStorm.app"
		}, {
			kind: "path-bin",
			bin: "webstorm"
		}]
	},
	{
		id: "xcode",
		label: "Xcode",
		kind: "code",
		accent: "#1c7ced",
		probes: [{
			kind: "mac-app",
			bundle: "Xcode.app"
		}]
	},
	{
		id: "finder",
		label: "Finder",
		kind: "files",
		accent: "#4aa3ff",
		probes: [{
			kind: "mac-app",
			bundle: "Finder.app"
		}]
	},
	{
		id: "explorer",
		label: "File Explorer",
		kind: "files",
		accent: "#ffc83d",
		probes: [{
			kind: "path-bin",
			bin: "explorer"
		}]
	},
	{
		id: "xdg-open",
		label: "File Manager",
		kind: "files",
		accent: "#7f8c98",
		probes: [{
			kind: "path-bin",
			bin: "xdg-open"
		}]
	},
	{
		id: "terminal",
		label: "Terminal",
		kind: "terminal",
		accent: "#9aa0a6",
		probes: [{
			kind: "mac-app",
			bundle: "Terminal.app"
		}]
	},
	{
		id: "iterm2",
		label: "iTerm2",
		kind: "terminal",
		accent: "#3ecf5c",
		probes: [{
			kind: "mac-app",
			bundle: "iTerm.app"
		}]
	},
	{
		id: "warp",
		label: "Warp",
		kind: "terminal",
		accent: "#01a4ff",
		probes: [{
			kind: "mac-app",
			bundle: "Warp.app"
		}]
	},
	{
		id: "ghostty",
		label: "Ghostty",
		kind: "terminal",
		accent: "#c8b6ff",
		probes: [{
			kind: "path-bin",
			bin: "ghostty"
		}],
		args: [`--working-directory=${DIRECTORY_TOKEN}`]
	},
	{
		id: "wezterm",
		label: "WezTerm",
		kind: "terminal",
		accent: "#4ec9b0",
		probes: [{
			kind: "path-bin",
			bin: "wezterm"
		}],
		args: [
			"start",
			"--cwd",
			DIRECTORY_TOKEN
		]
	},
	{
		id: "kitty",
		label: "kitty",
		kind: "terminal",
		accent: "#f2b632",
		probes: [{
			kind: "path-bin",
			bin: "kitty"
		}],
		args: ["--directory", DIRECTORY_TOKEN]
	},
	{
		id: "alacritty",
		label: "Alacritty",
		kind: "terminal",
		accent: "#f46d01",
		probes: [{
			kind: "path-bin",
			bin: "alacritty"
		}],
		args: ["--working-directory", DIRECTORY_TOKEN]
	}
];
/**
* The command that opens one directory in one located application.
*
* macOS bundles go through `open -a`, never through the executable inside the
* bundle: `open` is what asks Launch Services to activate an already-running
* instance rather than starting a second one, and it is the only way an
* argument reaches an application that is already up. `--args` is deliberately
* absent — with `open -a APP DIR` the directory is the document being opened,
* which is what makes Terminal spawn a shell there and Finder reveal it.
*
* Everything else is the executable itself, since a CLI shim already means
* "open this path".
* @param entry - the catalog row.
* @param probe - the probe that answered.
* @param located - what the probe resolved to (bundle path, or executable path).
* @param directory - the absolute directory to open.
* @returns the command line to spawn.
*/
function planLaunch(entry, probe, located, directory) {
	if (probe.kind === "mac-app") return {
		command: "open",
		args: [
			"-a",
			located,
			directory
		]
	};
	return {
		command: located,
		args: (entry.args ?? ["{dir}"]).map((arg) => arg.replaceAll(DIRECTORY_TOKEN, directory))
	};
}
//#endregion
//#region lib/types/detect.js
/**
* Which catalog rows this host actually has.
*
* Detection is a `stat` per probe and nothing more — no `mdfind`, no registry
* read, no shelling out. That keeps the whole sweep inside a few milliseconds,
* which is what lets the picker be a plain list the user opens rather than a
* dialog they wait on.
*
* Every filesystem fact this module needs arrives through {@link DetectionEnv},
* so a spec drives the entire matrix — macOS bundles, Windows install roots, a
* bare Linux `PATH` — without a fixture tree on disk.
* @module @omdsh-plugins/omdsh-editor/src/detect
*/
/** File extensions Windows treats as directly executable, in `PATHEXT` order. */
const WINDOWS_EXECUTABLE_SUFFIXES = [
	".exe",
	".cmd",
	".bat",
	".com"
];
/**
* How long one detection sweep stays fresh. Short enough that installing an
* editor while the harness runs shows up without a restart, long enough that
* one interaction with the picker never probes the disk twice.
*/
const DETECTION_TTL_MS = 15e3;
/**
* Expand a leading `~` against the user's home directory.
* @param path - a configured or catalog path.
* @param home - the home directory to expand against.
* @returns the absolute path.
*/
function expandHome(path, home) {
	if (path === "~") return home;
	if (path.startsWith("~/")) return join(home, path.slice(2));
	return path;
}
/**
* The real host's detection facts.
* @param env - process environment (`process.env` in production).
* @param platform - `process.platform`.
* @returns the environment {@link detectEditors} probes against.
*/
function hostEnv(env = process.env, platform = process.platform) {
	const home = homedir();
	return {
		platform,
		appDirectories: MAC_APP_DIRECTORIES.map((directory) => expandHome(directory, home)),
		pathEntries: (env["PATH"] ?? env["Path"] ?? "").split(delimiter).filter((entry) => entry !== ""),
		windowsRoots: {
			...env["LOCALAPPDATA"] === void 0 ? {} : { localAppData: env["LOCALAPPDATA"] },
			...env["ProgramFiles"] === void 0 ? {} : { programFiles: env["ProgramFiles"] },
			...env["ProgramFiles(x86)"] === void 0 ? {} : { programFilesX86: env["ProgramFiles(x86)"] }
		},
		exists: async (path) => {
			try {
				await stat(path);
				return true;
			} catch {
				return false;
			}
		},
		executable: async (path) => {
			try {
				await access(path, constants.X_OK);
				return (await stat(path)).isFile();
			} catch {
				return false;
			}
		}
	};
}
/**
* Resolve one probe against the host.
* @param probe - the probe to try.
* @param env - the host facts.
* @returns what it resolved to, or undefined when this host does not have it.
*/
async function locate(probe, env) {
	if (probe.kind === "mac-app") {
		if (env.platform !== "darwin") return void 0;
		for (const directory of env.appDirectories) {
			const candidate = join(directory, probe.bundle);
			if (await env.exists(candidate)) return candidate;
		}
		return;
	}
	if (probe.kind === "windows-exe") {
		if (env.platform !== "win32") return void 0;
		const root = env.windowsRoots[probe.root];
		if (root === void 0) return void 0;
		const candidate = join(root, probe.path);
		return await env.exists(candidate) ? candidate : void 0;
	}
	const suffixes = env.platform === "win32" ? WINDOWS_EXECUTABLE_SUFFIXES : [""];
	for (const directory of env.pathEntries) for (const suffix of suffixes) {
		const candidate = join(directory, probe.bin + suffix);
		if (await env.executable(candidate)) return candidate;
	}
}
/**
* The first probe of one row that this host answers.
* @param entry - the catalog row.
* @param env - the host facts.
* @returns the match, or undefined when the row is not installed.
*/
async function detectEntry(entry, env) {
	for (const probe of entry.probes) {
		const located = await locate(probe, env);
		if (located !== void 0) return {
			entry,
			probe,
			located
		};
	}
}
/**
* Sweep a catalog against one host.
*
* Rows are probed concurrently — they are independent `stat` calls, and the
* sweep's latency is what the user waits on the first time the menu opens —
* and the result keeps the catalog's own order, so the list is stable across
* hosts rather than ordered by who answered first.
* @param env - the host facts.
* @param catalog - the rows to probe; the shipped table by default.
* @returns every installed row, in catalog order.
*/
async function detectEditors(env, catalog = DEFAULT_CATALOG) {
	return (await Promise.all(catalog.map((entry) => detectEntry(entry, env)))).filter((editor) => editor !== void 0);
}
/**
* The wire projection of a detected row: what the picker renders, with the
* host paths left behind.
* @param editor - the detection result.
* @returns the descriptor the browser half receives.
*/
function describe(editor) {
	const { id, label, kind, accent } = editor.entry;
	return {
		id,
		label,
		kind,
		accent,
		icon: editor.probe.kind === "mac-app"
	};
}
/**
* The command that opens one directory in one detected application.
* @param editor - the detection result.
* @param directory - the absolute directory to open.
* @returns the command line to spawn.
*/
function planFor(editor, directory) {
	return planLaunch(editor.entry, editor.probe, editor.located, directory);
}
/**
* A detection sweep held for a while, so opening the menu twice is one sweep.
*
* The cache has a life rather than being permanent because installing an
* editor while the harness runs is ordinary, and "restart the runtime to see
* Cursor" is not an answer anyone should have to be given. A few seconds is
* long enough that the menu never re-probes within one interaction.
*/
var EditorRegistry = class {
	env;
	catalog;
	now;
	cached;
	inFlight;
	ttlMs;
	/**
	* @param env - the host facts to probe against.
	* @param catalog - the rows to probe.
	* @param ttlMs - how long a sweep stays fresh; `undefined` takes the default.
	* @param now - clock, injectable for specs.
	*/
	constructor(env, catalog = DEFAULT_CATALOG, ttlMs = void 0, now = Date.now) {
		this.env = env;
		this.catalog = catalog;
		this.now = now;
		this.ttlMs = ttlMs ?? 15e3;
	}
	/**
	* The installed applications, swept at most once per TTL.
	* @returns every installed row, in catalog order.
	*/
	async list() {
		const cached = this.cached;
		if (cached !== void 0 && this.now() - cached.at < this.ttlMs) return cached.editors;
		this.inFlight ??= detectEditors(this.env, this.catalog).then((editors) => {
			this.cached = {
				at: this.now(),
				editors
			};
			this.inFlight = void 0;
			return editors;
		}, (error) => {
			this.inFlight = void 0;
			throw error;
		});
		return this.inFlight;
	}
	/**
	* One installed application by id.
	* @param id - {@link EditorEntry.id}.
	* @returns the detection result, or undefined when this host does not have it.
	*/
	async find(id) {
		return (await this.list()).find((editor) => editor.entry.id === id);
	}
	/** Drop the cached sweep, so the next list re-probes. */
	invalidate() {
		this.cached = void 0;
	}
};
/**
* Whether a path is one this plugin may hand to an editor.
* @param path - the candidate directory.
* @returns the resolved absolute path, or undefined when it is not absolute.
*/
function normalizeDirectory(path) {
	if (!isAbsolute(path)) return void 0;
	return resolve(path);
}
//#endregion
//#region lib/types/wire.js
/**
* What the host routes answer with: one error class carrying a machine code
* and an HTTP status, and the writers every route ends in — so a route body
* reads as its own logic and never as response plumbing.
* @module @omdsh-plugins/omdsh-editor/src/wire
*/
/** A failure a route can answer with verbatim. */
var EditorError = class extends Error {
	code;
	status;
	/**
	* @param code - machine-routable kind the browser half branches on.
	* @param message - human text; safe to show in the picker.
	* @param status - HTTP status to answer with.
	*/
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
		this.name = "EditorError";
	}
};
/**
* Answer with one JSON value.
* @param res - the response being written.
* @param value - JSON-serializable payload.
* @param status - HTTP status (default 200).
*/
function writeJson(res, value, status = 200) {
	const body = JSON.stringify(value);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": String(Buffer.byteLength(body)),
		"cache-control": "no-store"
	});
	res.end(body);
}
/**
* Answer with a failure. An {@link EditorError} keeps its code and status;
* anything else is an internal fault and says so without leaking its text.
* @param res - the response being written.
* @param error - the thrown value.
*/
function writeError(res, error) {
	if (error instanceof EditorError) {
		writeJson(res, { error: {
			code: error.code,
			message: error.message
		} }, error.status);
		return;
	}
	writeJson(res, { error: {
		code: "launch-failed",
		message: "the editor request failed"
	} }, 500);
}
/**
* Read one request body, bounded so a runaway upload cannot hold memory.
* @param req - the request to drain.
* @param limit - the largest body accepted, in bytes.
* @returns the body text.
* @throws {EditorError} bad-request when it exceeded the limit.
*/
async function readBody(req, limit = 16384) {
	let body = "";
	for await (const chunk of req) {
		body += String(chunk);
		if (body.length > limit) throw new EditorError("bad-request", "the request body is too large", 413);
	}
	return body;
}
/**
* Parse one JSON request body into its named string fields.
* @param body - the drained request body.
* @returns the object it carried.
* @throws {EditorError} bad-request when it is not a JSON object.
*/
function parseJsonObject(body) {
	let parsed;
	try {
		parsed = JSON.parse(body);
	} catch {
		throw new EditorError("bad-request", "the request is not JSON");
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new EditorError("bad-request", "the request is not a JSON object");
	return parsed;
}
/**
* Read one required string field.
* @param body - the parsed request object.
* @param name - the field name.
* @returns its non-blank value.
* @throws {EditorError} bad-request when absent or blank.
*/
function requireString(body, name) {
	const value = body[name];
	if (typeof value !== "string" || value.trim() === "") throw new EditorError("bad-request", `missing "${name}"`);
	return value;
}
/**
* Read one optional string field.
* @param body - the parsed request object.
* @param name - the field name.
* @returns its non-blank value, or undefined.
*/
function optionalString(body, name) {
	const value = body[name];
	return typeof value === "string" && value.trim() !== "" ? value : void 0;
}
//#endregion
//#region lib/types/launch.js
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
const SPAWN_SETTLE_MS = 150;
/**
* The real spawner.
* @param settleMs - how long to watch for a spawn failure.
* @returns a spawner that detaches every child.
*/
function hostSpawner(settleMs = 150) {
	return { run: (plan, cwd) => new Promise((resolve, reject) => {
		const child = spawn(plan.command, [...plan.args], {
			cwd,
			detached: true,
			stdio: "ignore",
			shell: false
		});
		const timer = setTimeout(() => {
			child.removeListener("error", onError);
			child.unref();
			resolve();
		}, settleMs);
		const onError = (error) => {
			clearTimeout(timer);
			reject(new EditorError("launch-failed", error.message, 500));
		};
		child.once("error", onError);
	}) };
}
//#endregion
//#region lib/types/shared.js
/**
* The contract between this plugin's two halves: the route paths and the JSON
* shapes they carry.
*
* Node-free on purpose. The browser half imports this module for real (the
* client bundle inlines it), so one `node:` import here would put the
* filesystem and `child_process` in the browser bundle's module graph.
* Everything that touches a disk or spawns anything lives in
* [detect](./detect.ts) and [launch](./launch.ts) instead.
* @module @omdsh-plugins/omdsh-editor/src/shared
*/
/** Path prefix every route of this plugin lives under. */
const ROUTE_PREFIX = "/omdsh-editor";
/** The editors this host actually has, as the picker lists them. */
const EDITORS_PATH = `${ROUTE_PREFIX}/editors`;
/** Launch one of them on a session's directory. */
const OPEN_PATH = `${ROUTE_PREFIX}/open`;
/**
* One application's own icon, as PNG. Takes `?id=<editorId>`.
*
* A route rather than bytes inlined into the catalog answer: the icons are a
* few kilobytes each and the browser caches them, so paying for them once and
* lazily beats making every list request carry all of them.
*/
const ICON_PATH = `${ROUTE_PREFIX}/icon`;
//#endregion
//#region lib/types/routes.js
/**
* The two routes: what is installed, and open one of them.
*
* Both are written against injected capabilities rather than against the
* process, so the whole surface — including the refusals, which are most of
* the behavior worth pinning — is drivable from a spec with no editor
* installed and nothing spawned.
* @module @omdsh-plugins/omdsh-editor/src/routes
*/
/**
* Answer the catalog request.
* @param res - the response being written.
* @param deps - see {@link RouteDeps}.
*/
async function handleEditors(res, deps) {
	writeJson(res, {
		editors: (await deps.registry.list()).map(describe),
		platform: deps.platform
	});
}
/**
* Answer an icon request with the application's own artwork.
* @param url - the parsed request target, carrying `?id=`.
* @param res - the response being written.
* @param deps - see {@link RouteDeps}.
*/
async function handleIcon(url, res, deps) {
	const id = url.searchParams.get("id");
	if (id === null || id === "") throw new EditorError("bad-request", "missing \"id\"");
	const editor = await deps.registry.find(id);
	if (editor === void 0) throw new EditorError("unknown-editor", `no installed application named ${JSON.stringify(id)}`, 404);
	const icon = editor.probe.kind !== "mac-app" ? void 0 : await deps.readIcon(id, editor.located);
	if (icon === void 0) throw new EditorError("unknown-editor", `no icon for ${JSON.stringify(id)}`, 404);
	res.writeHead(200, {
		"content-type": "image/png",
		"content-length": String(icon.byteLength),
		"cache-control": "private, max-age=3600"
	});
	res.end(icon);
}
/**
* Answer an open request: resolve the directory, find the application, run it.
* @param req - the request being read.
* @param res - the response being written.
* @param deps - see {@link RouteDeps}.
*/
async function handleOpen(req, res, deps) {
	const body = parseJsonObject(await readBody(req));
	const sessionId = requireString(body, "sessionId");
	const editorId = requireString(body, "editorId");
	const root = deps.resolveRoot(sessionId, optionalString(body, "cwd"));
	const directory = normalizeDirectory(root);
	if (directory === void 0) throw new EditorError("bad-directory", `working directory "${root}" is not absolute`);
	if (!await deps.isDirectory(directory)) throw new EditorError("bad-directory", `"${directory}" is not a directory`);
	const editor = await deps.registry.find(editorId);
	if (editor === void 0) throw new EditorError("unknown-editor", `no installed application named ${JSON.stringify(editorId)}`, 404);
	await deps.spawner.run(planFor(editor, directory), directory);
	writeJson(res, {
		editorId,
		path: directory
	});
}
/**
* Route one request that arrived under this plugin's prefix.
* @param req - the request.
* @param res - the response.
* @param deps - see {@link RouteDeps}.
* @returns completion once the response is written.
*/
async function handleRequest(req, res, deps) {
	try {
		const url = new URL(req.url ?? "/", "http://omdsh-editor.invalid");
		const { pathname } = url;
		if (pathname === EDITORS_PATH) {
			if (req.method !== "GET") throw new EditorError("bad-request", "the editor list is read with GET", 405);
			await handleEditors(res, deps);
			return;
		}
		if (pathname === ICON_PATH) {
			if (req.method !== "GET") throw new EditorError("bad-request", "an icon is read with GET", 405);
			await handleIcon(url, res, deps);
			return;
		}
		if (pathname === OPEN_PATH) {
			if (req.method !== "POST") throw new EditorError("bad-request", "an open is posted", 405);
			await handleOpen(req, res, deps);
			return;
		}
		throw new EditorError("bad-request", `no route at ${pathname}`, 404);
	} catch (error) {
		writeError(res, error);
	}
}
//#endregion
//#region lib/types/trust-fence.js
/**
* Browser-trust fence for this plugin's routes, behaviorally identical to the
* /api gateway's fence in `@deepseek-ai/dsh-client-connection`
* (src/api-request-trust.ts + src/loopback-hostname.ts, BSD-3-Clause,
* restated here because that package exports neither helper and a plugin must
* not reach into another package's internals).
*
* These routes start a native application on the host, so they must be
* exactly as reachable as `/api` and no more: a Host header naming us
* (loopback, or an authority this deployment was told to serve) plus
* same-origin browser markers. This is a DNS-rebinding and cross-site
* defense, not authentication — a deployment that publishes `/api` to a
* network publishes these with it.
* @module @omdsh-plugins/omdsh-editor/src/trust-fence
*/
/** One header's value, when it was sent exactly once. */
function header(headers, name) {
	const value = headers[name];
	return typeof value === "string" ? value : void 0;
}
/** Normalized URL of a Host-header authority, or undefined when unparsable. */
function parseAuthority(authority) {
	try {
		return new URL(`http://${authority}`);
	} catch {
		return;
	}
}
/**
* Whether a normalized hostname names the local loopback authority.
* @param hostname - the URL-normalized hostname.
* @returns true for localhost, [::1], and the whole 127.0.0.0/8 literal range.
*/
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/** Canonical authority form: hostname, or hostname:port when a port was written. */
function canonicalAuthority(entry, entryUrl) {
	const port = entryUrl.port !== "" ? entryUrl.port : new URL(`https://${entry}`).port;
	return port === "" ? entryUrl.hostname : `${entryUrl.hostname}:${port}`;
}
/** Whether the request authority matches a trustedHosts entry (exact, or port-less). */
function isTrustedAuthority(hostUrl, trustedHosts) {
	return trustedHosts.some((entry) => {
		const entryUrl = parseAuthority(entry);
		if (entryUrl === void 0) return false;
		return canonicalAuthority(entry, entryUrl) === entryUrl.hostname ? entryUrl.hostname === hostUrl.hostname : entryUrl.host === hostUrl.host;
	});
}
/**
* Decide whether one request may reach this plugin's routes.
* @param request - node HTTP request facts (headers).
* @param trustedHosts - non-loopback authorities this deployment serves.
* @returns true when the Host is ours and the browser markers are same-origin.
*/
function isTrustedRequest(request, trustedHosts) {
	const host = header(request.headers, "host");
	if (host === void 0) return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === void 0) return false;
	if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
	if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
	const origin = header(request.headers, "origin");
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
//#endregion
//#region lib/types/index.js
/**
* Open the project in an editor, host half: find the applications this machine
* has, and start one of them on a conversation's directory.
*
* It lives in the runtime rather than in the desktop shell because the runtime
* is where the project directory IS. The harness's own model is that a session
* works in a directory on the host that runs the runtime, so that is the host
* whose editors are worth offering and the only one where opening the folder
* means anything. A shell-side implementation would also make the capability
* exclusive to the packaged application, when `dsh web` in a terminal wants it
* just as much.
*
* The consequence is stated rather than hidden: reaching a runtime over the
* network and pressing an editor opens that editor on the machine running the
* runtime, next to the files, and not on the machine holding the browser.
* The browser half says so — the picker names the host platform when it has
* nothing to offer — and the trust fence keeps the route exactly as reachable
* as `/api` and no more.
* @module @omdsh-plugins/omdsh-editor
*/
/** Cordis plugin name. */
const name = "omdsh-editor";
/**
* Services required before the routes can mount: the HTTP carrier, the session
* store the working directory comes from, and the web runtime's bind-derived
* trust list.
*/
const inject = [
	"webServer",
	"sessions",
	"webRuntime"
];
/**
* Mount the editor routes.
* @param ctx - host context carrying the webserver, sessions, and web runtime.
* @param config - see {@link Config}.
*/
function apply(ctx, config = {}) {
	const sessions = ctx.get("sessions");
	const webRuntime = ctx.get("webRuntime");
	const registry = new EditorRegistry(hostEnv(), config.editors ?? DEFAULT_CATALOG, config.detectionTtlMs);
	const spawner = hostSpawner();
	const icons = new IconCache();
	/**
	* A conversation's directory. The session's own is authoritative; the
	* browser's value is a fallback for a session that carries none, and is
	* never trusted beyond being absolute (the route checks that, and that it
	* is still a directory, before anything is started).
	*/
	const resolveRoot = (sessionId, clientCwd) => {
		const attached = sessions.get(sessionId)?.header.cwd;
		if (attached !== void 0 && attached !== "") return attached;
		if (clientCwd !== void 0 && clientCwd !== "") return clientCwd;
		throw new EditorError("no-directory", `session ${JSON.stringify(sessionId)} is not working in a directory`, 404);
	};
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: ROUTE_PREFIX,
		handler: async (req, res) => {
			if (!isTrustedRequest(req, webRuntime.trustedHosts)) {
				res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
				res.end("forbidden");
				return;
			}
			await handleRequest(req, res, {
				registry,
				spawner,
				readIcon: (id, bundle) => icons.get(id, bundle),
				platform: process.platform,
				resolveRoot,
				isDirectory: async (path) => {
					try {
						return (await stat(path)).isDirectory();
					} catch {
						return false;
					}
				}
			});
		}
	}), "omdsh-editor: editor routes");
}
//#endregion
export { DEFAULT_CATALOG, DETECTION_TTL_MS, DIRECTORY_TOKEN, EDITORS_PATH, EditorError, EditorRegistry, ICON_PATH, IconCache, MAC_APP_DIRECTORIES, OPEN_PATH, PREFERRED_ICON_EDGE, ROUTE_PREFIX, SPAWN_SETTLE_MS, apply, describe, detectEditors, detectEntry, expandHome, handleRequest, hostBundleReader, hostEnv, hostSpawner, icnsVariants, iconFileFromPlist, inject, isLoopbackHostname, isTrustedRequest, name, normalizeDirectory, pickVariant, planFor, planLaunch, readAppIcon, resolveIconPath };
