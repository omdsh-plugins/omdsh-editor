# `@omdsh-plugins/omdsh-editor`

[English](README.md) | 中文

用你真正在用的编辑器打开当前项目。会话标题栏右侧的一个分体控件：按左半边，当前会话的目录就在你上次选的编辑器里打开；按右边的箭头，换一个。

harness 本身没有这个能力，也没有可以绕过它去实现的接缝，所以这个包同时提供两半——负责查找并启动应用的宿主半边，和负责呈现选择的浏览器半边。

```
┌──────────────────────────────────────────────┬───────────────┐
│  my-project                                  │  ⌗   ⧉   [◧|▾] │  ← 会话标题栏
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

## 安装

`dsh plugin --profile <名字> <参数…>` 是一层很薄的 `pnpm` 转发，在 profile 目录（`~/.dsh/profiles/web`，或 `$DSH_HOME/profiles/web`）里执行。pnpm 收什么它就收什么，之后再把 `dsh.profile.bundles` 与实际安装状态对齐。

本包未发布，所以从这份检出安装：

```sh
pnpm install && pnpm run build                 # 必须先有 lib/；link: 不会帮你构建
dsh plugin --profile web add link:/omdsh-editor/的绝对路径
```

相对路径会以你执行 `dsh` 时所在的目录为锚，所以在这份检出里 `dsh plugin --profile web add link:.` 是同一件事。两种写法都会让 profile 清单多出这条依赖，并把 `@omdsh-plugins/omdsh-editor` 追加到 `dsh.profile.bundles`，于是 [`cordis.patch.yml`](cordis.patch.yml) 会在 `@deepseek-ai/dsh-base` 和 `@deepseek-ai/dsh-web-app` 之后生效。harness 的目录树保持出厂原样。

重启 runtime 才会生效（重跑 `dsh web`，或退出并重开桌面应用）。移除：

```sh
dsh plugin --profile web remove @omdsh-plugins/omdsh-editor
```

这会同时带走 bundle 行、路由和这个控件。

`link:` 意味着 pnpm 既不构建这个包也不装它的依赖——这两件在这里都不要紧，因为 node 半边只 import Node 内置模块，浏览器半边把 `clsx` 打进了 bundle。但它确实意味着改完源码后重新构建要你自己跑。

没有"缺了就不工作"的伙伴插件。两半 inject 的每一个服务都是 profile 已经组合好的 harness 服务——宿主侧是 `webServer`、`sessions`、`webRuntime`，浏览器侧是 `slots` 和 `locale`——所以不必再装这个集合里的任何别的插件，别的插件也不会改变它的行为。`webRuntime` 来自 web 形态的 bundle，这也正是这一行属于 web profile 的原因：信任围栏要比对的那份清单就在它上面，而一个没有网页服务器的形态本来也没有浏览器要服务。

## 编辑器在哪台机器上打开

**运行 runtime 的那台。** 项目目录就在那里，所以那是唯一一台"打开这个文件夹"有意义的机器，也正是 harness 自身模型里工作发生的地方。

由此可以推出：通过网络访问一个 runtime 并按下编辑器，编辑器会在文件旁边启动，而不是在浏览器旁边。插件把这一点说出来而不是藏起来：在一台什么都没装的主机上，菜单会写明它查找的平台（`No editor found on the machine running dsh (linux)`），这样"去装个编辑器"和"这个 runtime 不在我桌上"就区分开了。

把它做进 Electron 外壳会让这个能力只属于打包后的应用，而终端里的 `dsh web` 同样需要它。

## 它能提供什么

| 类别 | 应用 |
|---|---|
| 编辑器 | VS Code、VS Code Insiders、Cursor、Windsurf、Zed、Sublime Text、IntelliJ IDEA、PyCharm、WebStorm、Xcode |
| 文件 | Finder、文件资源管理器、`xdg-open` |
| 终端 | Terminal、iTerm2、Warp、Ghostty、WezTerm、kitty、Alacritty |

只列出这台主机真正装了的。探测就是每个候选一次 `stat`，仅此而已——没有 `mdfind`，不读注册表，不起子进程——所以整轮扫描是几毫秒，菜单是一个直接展开的列表而不是一个要等的对话框。结果缓存 15 秒，短到在 harness 运行期间装的编辑器不用重启就会出现。

表里没有的应用是看不见的。加一个是 [`src/catalog.ts`](src/catalog.ts) 里的四行，或者插件配置里的一项 `editors`——后者会整体替换出厂的表。

## 一个应用是怎么被找到和启动的

每一行按优先顺序列出它可能存在的几种形态，第一个命中的既决定了"装了"，也决定了怎么启动。

| 探测方式 | 查找位置 | 启动方式 |
|---|---|---|
| `mac-app` | macOS 标准应用目录，含 `~/Applications` | `open -a <bundle> <dir>` |
| `windows-exe` | `%LOCALAPPDATA%` / `%ProgramFiles%` 下的固定路径 | 可执行文件加目录参数 |
| `path-bin` | `PATH`（Windows 上带 `.exe`/`.cmd`/`.bat`/`.com`） | 可执行文件加目录参数 |

优先 bundle 而不是命令行 shim，因为在一个从未执行过用户 profile 的 GUI 会话里，`PATH` 上可能什么都没有，而 bundle 仍在。用 `open -a` 而不是直接执行 bundle 里的可执行文件，因为 Launch Services 才会激活已经在运行的实例，也只有它能把参数送进去——这同时也是 Terminal 会在该目录起一个 shell、Finder 会定位到该目录的原因。

有四个终端（Ghostty、WezTerm、kitty、Alacritty）只按命令行形态收录。它们的工作目录是一个 flag 而不是一份"文档"，而 `open -a` 没法把 flag 传给已在运行的实例；如果给它们加 bundle 探测，那一行会亮起来然后打开错误的目录——这比这一行干脆不出现更糟。

子进程被 detach 到自己的进程组、关闭流、然后 unref，所以退出 harness——或者桌面外壳按自己的内存策略做的一次重启——不会关掉你正在敲字的窗口。

## 路由

三条都挂在 `/omdsh-editor` 下，并且通过 `ctx.effect` 注册，所以卸载插件就会移除它们。

| 路由 | 作用 |
|---|---|
| `GET /omdsh-editor/editors` | 这台主机有哪些应用，以及它的 `process.platform` |
| `GET /omdsh-editor/icon?id=…` | 某个应用自己的图标，PNG |
| `POST /omdsh-editor/open` | 在某个会话的目录上启动其中一个 |

**目录由宿主说了算。** 一次 open 请求指名一个会话；会话自身的工作目录是权威来源，浏览器发来的 `cwd` 只在会话没有目录时才会被参考。无论走哪条路，结果都必须是绝对路径，并且在启动任何东西之前必须仍然是一个目录。这里刻意没有 `process.cwd()` 兜底：因为这个会话没有目录，就去打开 harness 恰好被启动时所在的那个目录，这是意外而不是兜底。

每条路由都会通过与 `/api` 网关完全相同的浏览器信任检查（[`src/trust-fence.ts`](src/trust-fence.ts)）——Host 头指向我们，加上同源的浏览器标记。一条能启动本机应用的路由，必须与 `/api` 一样可达，且不能更可达。

## 这个控件

在 `conversation.session.header.utilities` 里的一个条目，这是 ui-conversation 已经声明好的右对齐工具行。本包不声明任何自己的 slot，所以移除它之后标题栏就是出厂的样子。

分体是设计本身。左半边是动词——常见情形就是"用我的编辑器打开我的项目"，它应该只花一次点击、不需要做选择。右半边是选择器，只在第一次以及想换一个的时候需要。选择记在 `localStorage` 里，这也正是左半边能成为一个动词的唯一原因。

## 图标是真的

每一行用产品**自己的图标**绘制，这也正是六行能像 Dock 那样一眼分辨开的原因。

不附带、不重绘。字节来自这台主机上已安装的那份应用——`Contents/Resources/*.icns`，由 bundle 自己的 `Info.plist` 指名——在本地渲染，和系统"打开方式"菜单做的是同一件事。在包里附带十几个厂商的 logo 是授权问题；读取用户自己装的那份不是。

提取是纯 Node，不用 `sips`、不起子进程：`.icns` 是一个扁平的 type-length-value 容器，现代的每一个都把大尺寸变体存成内嵌 PNG，所以取图标就是一次扫描加一次切片。服务的是宽度不小于 64px 的最小变体，几 KB，在 2× 下清晰。

三种情况会让某一行没有真图标——应用不是 macOS bundle 的主机、用编译后的 asset catalog 而非 `.icns` 的 bundle、以及 `Resources` 里一堆 `.icns` 但认不出哪个是应用自己的。三种都回退到该行类别的字形、染上产品主色，仍然足以分辨。catalog 响应里带 `icon: boolean`，所以选择器只会去请求确实存在的图标；即便如此 `<img>` 出错时也会自己回退。

## 命令

```sh
pnpm install
pnpm run build       # tsc 产出 lib/types，tsdown 打包两半
pnpm run typecheck   # 源码与测试
pnpm run test        # vitest
```

提交的 manifest 固定指向已发布的 harness，所以裸 clone 自己就能安装和构建。要改成对着同级的 checkout 构建：

```sh
pnpm run harness:local ../../deepseek-harness   # 那个 checkout 需要先构建过
pnpm install
pnpm run harness:npm                            # 提交前务必执行 —— link: 是某一台机器的目录布局
pnpm run check:harness-pin
```

只跑 node 的用例在裸 clone + 固定版本下都能过。三个浏览器用例需要那份 checkout：harness 已发布的浏览器包只提供测试运行器无法 import 的 loader bundle，所以在固定版本下它们会解析到 [`tests/registry-mode-guard.ts`](tests/registry-mode-guard.ts)，并以一条说明原因的报错失败。

## 已知限制与待办

- **编辑器来自一张表。** 装了冷门工具的主机看到的列表会比实际短。"这台机器上存在哪些编辑器"本身不是一个有答案的问题；逃生舱是 `editors` 配置。
- **成功只意味着进程起来了。** 子进程 detach 之后没有退出码可等，所以一个启动了但自己拒绝了该目录的编辑器不会把这件事报回来。spawn 观察窗口是 150ms——长到足够 Node 送达一次 `ENOENT`，短到在界面上看不出来。
- **记住的选择是按浏览器而不是按用户。** 它存在 `localStorage` 里，所以换一个浏览器会重新从列表第一个开始。
- **Xcode 拿到的是目录而不是工程。** 这一行做的就是 `open -a Xcode <dir>`；一个不是工程或 workspace 的目录会以 Xcode 自己的文件夹视图打开。
- **Windows 探测只覆盖默认安装位置。** 装在别处的编辑器只有在 shim 位于 `PATH` 上时才能被找到。
- **图标只支持 macOS。** Windows 需要解析 PE 资源，Linux 需要 `.desktop` 加图标主题查找，两者都没做，所以那些主机拿到的是类别字形。图标存在编译后 `Assets.car` 里的 bundle 也会回退——要读它就得带一个 asset catalog 解码器。
- **只解析 XML 形式的 `Info.plist`。** 二进制的不解码，改用应用自己的名字去找图标——实际上每个这样的 bundle 都是这么命名的（Xcode 就是）。如果某个二进制 plist 的 bundle 把图标叫了别的名字，那一行回退到字形。
- **没有端到端覆盖。** 跑通真实链路需要一个窗口会话和一个装好的编辑器；现有用例覆盖了探测、每条路由与每种拒绝、针对真实进程的启动契约（detach、`shell: false`、正确的工作目录），以及浏览器半边的状态机与渲染。
