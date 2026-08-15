window.__ModuleLoader__.load({
	id: "@omdsh-plugins/omdsh-editor",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/shared.ts
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
		//#region src/client/controller.ts
		/**
		* The picker's state: what the host has, what the user last chose, and what is
		* being started right now.
		*
		* Two things are worth naming here. The list is fetched ONCE PER PAGE, at
		* plugin mount rather than per header or per menu opening: the sweep is a few
		* dozen `stat` calls the host caches anyway, and paying for it up front is
		* what lets the button carry the right icon and open the right editor on the
		* first press instead of after the user has opened the menu once. And the last
		* choice is REMEMBERED across reloads, because this control's whole shape (one
		* button that opens, one chevron that picks) only pays off if pressing the
		* button does what the user did last time.
		* @module @omdsh-plugins/omdsh-editor/src/client/controller
		*/
		/** Where the remembered choice is kept. */
		const PREFERENCE_KEY = "omdsh-editor:preferred";
		const INITIAL = {
			status: "idle",
			editors: [],
			platform: "",
			preferredId: void 0,
			openingId: void 0,
			error: void 0
		};
		/**
		* The real browser's capabilities.
		* @returns deps backed by `fetch` and `localStorage`.
		*/
		function browserDeps() {
			return {
				fetch: (path, init) => fetch(path, {
					...init,
					credentials: "same-origin"
				}),
				readPreference: () => {
					try {
						return localStorage.getItem("omdsh-editor:preferred") ?? void 0;
					} catch {
						return;
					}
				},
				writePreference: (id) => {
					try {
						localStorage.setItem(PREFERENCE_KEY, id);
					} catch {}
				}
			};
		}
		/**
		* Read the error message out of a refused response, falling back to the
		* status when the body is not this plugin's envelope.
		* @param response - the refused response.
		* @returns human text for the picker.
		*/
		async function refusalText(response) {
			try {
				const message = (await response.json()).error?.message;
				if (typeof message === "string" && message !== "") return message;
			} catch {}
			return `HTTP ${response.status}`;
		}
		/** Message text of an unknown thrown value. */
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/** Holds the picker's state and talks to the host half. */
		var EditorPickerController = class {
			deps;
			/** The snapshot the picker renders from. */
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(INITIAL);
			/** True once a list has been asked for, so opening the menu again is free. */
			requested = false;
			/** @param deps - see {@link EditorPickerDeps}. */
			constructor(deps) {
				this.deps = deps;
			}
			/**
			* Ask the host for its applications, once — plus one retry per opening after
			* a failure.
			*
			* Idempotent for the successful case, because the menu calls this every time
			* it opens and a settled list is not worth re-fetching. A FAILED list is,
			* though: the usual cause is a runtime that was restarting, and opening the
			* menu again is exactly when the user wants another attempt.
			* @returns completion once the list settled, successfully or not.
			*/
			async list() {
				const { status } = this.store.getSnapshot();
				if (this.requested && status !== "error") return;
				this.requested = true;
				await this.refresh();
			}
			/**
			* Ask the host again, whatever was asked before.
			* @returns completion once the list settled, successfully or not.
			*/
			async refresh() {
				this.patch({
					status: "loading",
					error: void 0
				});
				try {
					const response = await this.deps.fetch(EDITORS_PATH);
					if (!response.ok) {
						this.patch({
							status: "error",
							error: await refusalText(response)
						});
						return;
					}
					const body = await response.json();
					const editors = Array.isArray(body.editors) ? body.editors : [];
					this.patch({
						status: "ready",
						editors,
						platform: typeof body.platform === "string" ? body.platform : "",
						preferredId: this.resolvePreferred(editors)
					});
				} catch (error) {
					this.patch({
						status: "error",
						error: messageOf(error)
					});
				}
			}
			/**
			* Open one application on a directory, and remember the choice.
			* @param sessionId - the conversation whose directory is opened.
			* @param editorId - which application.
			* @param cwd - the directory the browser derived; the host's fallback only.
			* @returns completion once the host answered.
			*/
			async open(sessionId, editorId, cwd) {
				this.deps.writePreference(editorId);
				this.patch({
					preferredId: editorId,
					openingId: editorId,
					error: void 0
				});
				const request = {
					sessionId: String(sessionId),
					editorId,
					...cwd === void 0 ? {} : { cwd }
				};
				try {
					const response = await this.deps.fetch(OPEN_PATH, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(request)
					});
					if (!response.ok) {
						const error = await refusalText(response);
						this.patch({
							openingId: void 0,
							error
						});
						if (response.status === 404) this.refresh();
						return;
					}
					this.patch({ openingId: void 0 });
				} catch (error) {
					this.patch({
						openingId: void 0,
						error: messageOf(error)
					});
				}
			}
			/** Dismiss the last failure without retrying. */
			dismissError() {
				if (this.store.getSnapshot().error === void 0) return;
				this.patch({ error: void 0 });
			}
			/**
			* Which application the button itself opens.
			* @param editors - the applications the host listed.
			* @returns the remembered choice when it is still installed, else the first
			* listed — which is the top editor, and the right guess for someone who has
			* never used this control.
			*/
			resolvePreferred(editors) {
				const remembered = this.store.getSnapshot().preferredId ?? this.deps.readPreference();
				if (remembered !== void 0 && editors.some((editor) => editor.id === remembered)) return remembered;
				return editors[0]?.id;
			}
			/**
			* Merge a partial state into the store.
			* @param next - the fields that changed.
			*/
			patch(next) {
				this.store.set({
					...this.store.getSnapshot(),
					...next
				});
			}
		};
		//#endregion
		//#region ../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region \0dsh-css:/Users/haowang/Workdir/Projs/Gits/omdsh-plugins/omdsh-editor/src/client/EditorGlyph.module.css.mjs
		const css$2 = ".DyjLva_glyph{color:var(--dsw-alias-label-secondary);stroke:currentColor;stroke-width:1.5px;stroke-linecap:round;stroke-linejoin:round;flex:none}:disabled .DyjLva_glyph,[aria-disabled=true] .DyjLva_glyph{color:var(--dsw-alias-label-dimmed)!important}";
		const tagId$2 = "@omdsh-plugins/omdsh-editor/EditorGlyph.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@omdsh-plugins/omdsh-editor";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var EditorGlyph_module_css_default = { "glyph": "DyjLva_glyph" };
		//#endregion
		//#region src/client/EditorGlyph.tsx
		/** One glyph's path data, drawn on a 16×16 grid with a 1.5px stroke. */
		const PATHS = {
			code: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6 4.5 2.5 8 6 11.5M10 4.5 13.5 8 10 11.5" }),
			terminal: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3.5 5 6.5 8l-3 3M8.5 11.5h4" }),
			files: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2.5 12.5v-9h4l1.5 2h5.5v7z" })
		};
		/**
		* Render one application's mark.
		* @param props.kind - which glyph to draw.
		* @param props.accent - the product's accent color, as the glyph is tinted.
		* @param props.size - square edge in px (default 16).
		* @returns the glyph element.
		*/
		function EditorGlyph({ kind, accent, size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				className: EditorGlyph_module_css_default.glyph,
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				...accent === void 0 ? {} : { style: { color: accent } },
				"aria-hidden": "true",
				focusable: "false",
				children: PATHS[kind]
			});
		}
		//#endregion
		//#region \0dsh-css:/Users/haowang/Workdir/Projs/Gits/omdsh-plugins/omdsh-editor/src/client/EditorMark.module.css.mjs
		const css$1 = ".xjZgCa_icon{object-fit:contain;image-rendering:auto;flex:none}:disabled .xjZgCa_icon,[aria-disabled=true] .xjZgCa_icon{opacity:.4}";
		const tagId$1 = "@omdsh-plugins/omdsh-editor/EditorMark.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@omdsh-plugins/omdsh-editor";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var EditorMark_module_css_default = { "icon": "xjZgCa_icon" };
		//#endregion
		//#region src/client/EditorMark.tsx
		/**
		* The mark one listed application is drawn with: its own icon, or the glyph of
		* its kind when the host has no icon to give.
		*
		* The real icon is the point — six rows of coloured squares are told apart at
		* a glance the way a Dock is, and an approximation never quite is. It comes
		* from the copy of the application installed on the host, served by this
		* plugin's own icon route; nothing is bundled here.
		*
		* The glyph stays as the fallback rather than being deleted, because two cases
		* still reach it: a host whose applications are not macOS bundles, and a
		* bundle whose icon cannot be identified. It also covers the moment before the
		* image has loaded, so a menu never opens onto blank space where marks go.
		*/
		/**
		* Where one application's icon is fetched from.
		* @param id - the editor id.
		* @returns the icon route with its query.
		*/
		function iconUrl(id) {
			return `${ICON_PATH}?id=${encodeURIComponent(id)}`;
		}
		/**
		* Render one application's mark.
		* @param props.id - the editor id, naming the icon to fetch.
		* @param props.kind - the fallback glyph's kind.
		* @param props.accent - the fallback glyph's tint.
		* @param props.icon - whether the host has an icon for this application.
		* @param props.size - square edge in px (default 16).
		* @returns the icon, or the glyph.
		*/
		function EditorMark({ id, kind, accent, icon, size = 16 }) {
			const [failed, setFailed] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				setFailed(false);
			}, [id]);
			if (icon !== true || failed) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditorGlyph, {
				kind,
				accent,
				size
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
				className: EditorMark_module_css_default.icon,
				src: iconUrl(id),
				width: size,
				height: size,
				alt: "",
				"aria-hidden": "true",
				draggable: false,
				onError: () => {
					setFailed(true);
				}
			});
		}
		//#endregion
		//#region \0dsh-css:/Users/haowang/Workdir/Projs/Gits/omdsh-plugins/omdsh-editor/src/client/EditorPicker.module.css.mjs
		const css = ".Mrxw-G_capsule{border:1px solid var(--dsw-alias-border-l2);background:0 0;border-radius:18px;align-items:stretch;height:32px;display:inline-flex;overflow:hidden}.Mrxw-G_faulted{border-color:var(--dsw-alias-border-error,var(--dsw-alias-border-l2))}.Mrxw-G_primary,.Mrxw-G_chevron{color:var(--dsw-alias-label-primary);cursor:pointer;transition:background var(--ds-transition-duration-slow) var(--ds-ease-in-out);background:0 0;border:none;justify-content:center;align-items:center;display:inline-flex}@media (prefers-reduced-motion:reduce){.Mrxw-G_primary,.Mrxw-G_chevron{transition:none}}.Mrxw-G_primary{padding:0 8px 0 12px}.Mrxw-G_chevron{color:var(--dsw-alias-label-tertiary);padding:0 8px 0 4px}.Mrxw-G_primary:hover:not(:disabled),.Mrxw-G_chevron:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.Mrxw-G_primary:disabled,.Mrxw-G_chevron:disabled{color:var(--dsw-alias-label-dimmed);cursor:wait}.Mrxw-G_chevron:before{content:\"\";background:var(--dsw-alias-border-l2);align-self:center;width:1px;height:16px;margin-right:4px}";
		const tagId = "@omdsh-plugins/omdsh-editor/EditorPicker.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@omdsh-plugins/omdsh-editor";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var EditorPicker_module_css_default = {
			"chevron": "Mrxw-G_chevron",
			"faulted": "Mrxw-G_faulted",
			"primary": "Mrxw-G_primary",
			"capsule": "Mrxw-G_capsule"
		};
		//#endregion
		//#region src/client/EditorPicker.tsx
		/**
		* The editor picker: one split capsule in the session header's utility row.
		*
		* Two affordances in one control, which is the whole design. The left half is
		* the verb — press it and the project opens in the editor you used last, no
		* menu, no decision. The right half is the chooser, and it is only needed the
		* first time and when you want a different one. A plain menu-only button would
		* make the common case two clicks; a plain button with no menu would make the
		* uncommon case impossible.
		*
		* The directory it opens is the session's, resolved on the host. What this
		* component derives from the workspace list is only what the tooltip says —
		* showing the user which folder is about to open is worth a lookup, and being
		* wrong about it costs nothing, because the host never takes the browser's
		* word for the path.
		*/
		/**
		* What a non-selectable row's id begins with.
		*
		* The picker's `onSelect` already refuses anything the listed applications do
		* not claim, so this is the second lock rather than the first: a catalog id is
		* a bare identifier, so no application can ever collide with one of these and
		* a placeholder can never be mistaken for a choice.
		*/
		const PLACEHOLDER_PREFIX = "placeholder:";
		/**
		* The workspace directory this session is accounted under.
		* @param workspaces - the live workspace list.
		* @param sessionId - the current conversation.
		* @returns the absolute path, or undefined when no workspace claims it.
		*/
		function directoryOf(workspaces, sessionId) {
			return workspaces.items.find((item) => item.sessionIds.includes(sessionId))?.path;
		}
		/**
		* Render the picker.
		* @param props - composed slot props (contract.ts).
		* @returns the split capsule and its menu.
		*/
		function EditorPicker({ sessionId, useEditorPicker, useWorkspaces, list, open, dismissError, t }) {
			const { status, editors, platform, preferredId, openingId, error } = useEditorPicker((state) => state);
			const directory = useWorkspaces((state) => directoryOf(state, sessionId));
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const triggerRef = (0, react.useRef)(null);
			const preferred = editors.find((editor) => editor.id === preferredId);
			const busy = openingId !== void 0;
			/** Open the menu, asking the host for its list if that has not settled. */
			const openMenu = () => {
				dismissError();
				list();
				setMenuOpen(true);
			};
			/**
			* Run one application and close the menu.
			* @param editorId - which application.
			*/
			const choose = (editorId) => {
				setMenuOpen(false);
				open(sessionId, editorId, directory);
			};
			const items = (0, react.useMemo)(() => buildItems({
				status,
				editors,
				platform,
				t
			}), [
				status,
				editors,
				platform,
				t
			]);
			/**
			* One application's mark, or the neutral glyph before the host has said
			* anything at all.
			* @param editor - the application, when known.
			* @returns the mark.
			*/
			const markOf = (editor) => editor === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditorGlyph, { kind: "code" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditorMark, {
				id: editor.id,
				kind: editor.kind,
				accent: editor.accent,
				icon: editor.icon,
				size: 18
			});
			const primaryLabel = preferred === void 0 ? t("trigger.aria") : directory === void 0 ? t("open", { editor: preferred.label }) : t("open.in", {
				editor: preferred.label,
				path: directory
			});
			const trigger = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: clsx(EditorPicker_module_css_default.capsule, error !== void 0 && EditorPicker_module_css_default.faulted),
				ref: triggerRef,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: busy ? t("opening", { editor: preferred?.label ?? "" }) : primaryLabel,
					side: "bottom",
					delayMs: 400,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: EditorPicker_module_css_default.primary,
						"aria-label": primaryLabel,
						disabled: busy,
						"aria-busy": busy,
						onClick: () => {
							preferred === void 0 ? openMenu() : choose(preferred.id);
						},
						children: markOf(preferred)
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: EditorPicker_module_css_default.chevron,
					"aria-label": t("trigger.menu.aria"),
					"aria-haspopup": "menu",
					"aria-expanded": menuOpen,
					disabled: busy,
					onClick: () => {
						menuOpen ? setMenuOpen(false) : openMenu();
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {})
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open: menuOpen,
				anchor: trigger,
				items,
				onSelect: (id) => {
					if (editors.some((editor) => editor.id === id)) choose(id);
				},
				onClose: () => {
					setMenuOpen(false);
				},
				align: "end",
				portal: true,
				getAnchorRect: () => triggerRef.current?.getBoundingClientRect() ?? null,
				...error === void 0 ? {} : { footer: [{
					type: "label",
					id: "error",
					text: t("failed", { reason: error })
				}] }
			});
		}
		/**
		* The menu's rows: the applications, or the one line saying why there are
		* none. Every placeholder is a disabled row rather than an empty list, because
		* a menu that opens onto nothing reads as broken.
		* @param input.status - how far the catalog request got.
		* @param input.editors - the applications the host listed.
		* @param input.platform - the host's platform, named when the list is empty.
		* @param input.t - the namespace's translate.
		* @returns the rows to render.
		*/
		function buildItems({ status, editors, platform, t }) {
			if (status === "idle" || status === "loading") return [{
				id: `${PLACEHOLDER_PREFIX}loading`,
				label: t("loading"),
				disabled: true
			}];
			if (editors.length > 0) return editors.map((editor) => ({
				id: editor.id,
				label: editor.label,
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditorMark, {
					id: editor.id,
					kind: editor.kind,
					accent: editor.accent,
					icon: editor.icon
				})
			}));
			return [{
				id: `${PLACEHOLDER_PREFIX}empty`,
				label: platform === "" ? t("empty") : t("empty.remote", { platform }),
				disabled: true
			}];
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* `editor` namespace dictionaries.
		*
		* Product names are absent on purpose: "VS Code" and "iTerm2" are what their
		* vendors call them in every language, and they arrive from the host's catalog
		* rather than from here. Only the harness's own words are translated.
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "editor";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"trigger.aria": "在编辑器中打开",
			"trigger.menu.aria": "选择编辑器",
			"open": "在 {editor} 中打开",
			"open.in": "在 {editor} 中打开 {path}",
			"opening": "正在启动 {editor}…",
			"loading": "正在查找已安装的编辑器…",
			"empty": "在这台主机上没有找到编辑器",
			"empty.remote": "在运行 dsh 的主机（{platform}）上没有找到编辑器",
			"remote.note": "编辑器会在运行 dsh 的主机上打开",
			"retry": "重试",
			"failed": "打开失败：{reason}"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"trigger.aria": "Open in editor",
			"trigger.menu.aria": "Choose an editor",
			"open": "Open in {editor}",
			"open.in": "Open {path} in {editor}",
			"opening": "Starting {editor}…",
			"loading": "Looking for installed editors…",
			"empty": "No editor found on this machine",
			"empty.remote": "No editor found on the machine running dsh ({platform})",
			"remote.note": "Editors open on the machine running dsh",
			"retry": "Try again",
			"failed": "Could not open: {reason}"
		};
		//#endregion
		//#region src/client/index.ts
		/** Required services (cordis fiber inject). */
		const inject = ["slots", "locale"];
		/**
		* Mount the picker.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "omdsh-editor: dictionaries");
			const controller = new EditorPickerController(browserDeps());
			ctx.effect(() => {
				controller.list();
				return () => {};
			}, "omdsh-editor: initial editor sweep");
			ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
				name: "conversation.session.header.utilities",
				id: "omdsh-editor-picker",
				order: 100,
				locale: NS,
				inject: () => ({
					hooks: { editorPicker: controller.store },
					list: () => {
						controller.list();
					},
					open: (sessionId, editorId, cwd) => {
						controller.open(sessionId, editorId, cwd);
					},
					dismissError: () => {
						controller.dismissError();
					}
				})
			}, EditorPicker));
		}
		//#endregion
		exports.EditorGlyph = EditorGlyph;
		exports.EditorMark = EditorMark;
		exports.EditorPicker = EditorPicker;
		exports.EditorPickerController = EditorPickerController;
		exports.NS = NS;
		exports.PREFERENCE_KEY = PREFERENCE_KEY;
		exports.apply = apply;
		exports.browserDeps = browserDeps;
		exports.buildItems = buildItems;
		exports.directoryOf = directoryOf;
		exports.en = en;
		exports.iconUrl = iconUrl;
		exports.inject = inject;
		exports.zh = zh;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map