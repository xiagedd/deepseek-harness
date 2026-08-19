# Agent Note: 资源管理器工作区忽略与搜索

Status: implemented

[English](2026-08-18-explorer-workspace-ignore-and-search.md) | 中文

## Problem

资源管理器先暴露了全工作区模糊搜索，但已部署的浏览器载体尚未包含 `host.searchEntries`，因此即使 Host RPC 源码已经存在，UI 仍提示当前运行时不支持工作区搜索。文件树列举、模糊搜索与 `@` workspace-file 候选的忽略行为也不一致；大体量的已忽略目录仍可能先被枚举，再由客户端过滤。

## Decision

`host.listEntries` 与 `host.searchEntries` 是权威枚举路径。两者都通过 `ctx.fs` 读取工作区根的忽略文件：先应用内置 `.git/`，存在时再应用 `.gitignore`，最后应用 `.dshignore`；仅在 `.dshignore` 缺失时兼容 `.cursorignore`。Git 与产品忽略文件都不存在时，面向 Unity 的默认规则会省略 `Library/`、`Temp/`、`Logs/`、`obj/` 与 `*.meta`。注释、空行、`*`、`**`、根相对路径、目录模式及 `!` 否定均由维护中的 `ignore` 包定义。`.meta` 文件仍由 Host 无条件省略。

`listEntries` 接受可选工作区 `root`；资源管理器与 `@` workspace-file source 都会传入它，使嵌套列举共用同一个匹配根。搜索 walk 在把目录压栈前就移除被忽略目录，因此不会枚举其后代。搜索按根懒建索引，并以已加载的 ignore 正文作为缓存键；每次搜索请求重读这些正文，发生变化即重建。列举则每次请求重读规则。Host 文件系统变更会使全部搜索索引失效。

Web bundle 已注册 API gateway、connection、Explorer 与 workspace-file 客户端包。运行时故障来自旧的 `dsh-client-connection` 构建产物缺少源码已声明的 `searchEntries` 属性，而不是 profile 漏注册。重建 connection 与客户端 bundle 后，浏览器即可获得已有 RPC 方法。

## Alternatives considered

**只在客户端过滤。** 拒绝，因为它仍会遍历被忽略目录，使搜索与 `@` 结果不一致，也无法保护大型 Unity `Library/` 树。

**监听 ignore 文件。** 拒绝，因为按请求读取即可确定性地在下一次请求生效，无需引入新的生命周期所有者；正文不变时，搜索索引键仍能保留缓存。

**手写 glob 匹配。** 拒绝，因为维护中的 `ignore` 包已覆盖所需 Git 风格语法与否定规则，并减少自有解析代码。

## Consequences

文件树展开、全工作区搜索与 `@` 候选现在共享 Host 过滤。修改 ignore 后，下一次搜索或刷新的列举无需重启 Host 即生效；已经渲染的树仍需点击刷新以发出列举请求。产品规则因后应用而可否定 `.gitignore` 规则。`.dshignore` 与 `.cursorignore` 不叠加：前者优先。
