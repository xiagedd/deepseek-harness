# Agent Note: 设置页重启 Web 服务入口

Status: implemented

[English](2026-08-18-settings-web-restart.md) | 中文

## 问题

重启脚本（`pnpm run web:restart`）已经存在，但操作者仍要离开 UI、打开终端、粘贴命令。制作人要求在设置面板上加一个按钮来执行该工具。

## 决策

在设置 → 通用设置提供仅限回环的**重启 Web 服务**行（`ui-settings-general`，id `restart-web`，order 90），调用 Host RPC `host.restartWeb`。

1. **窄 RPC** — 载荷为 `{ port?: number }`，schema 为 strict。多余键（`command`、`argv` 等）是 `bad-request`。省略端口时用当前 `webServer` 监听端口，否则 3080。Host 从不转发任意 argv。
2. **启动** — 确认宿主 cwd 下存在 `scripts/restart-dsh-web.mjs` 后，方法返回 `{ accepted, port }`，再异步分离启动该脚本且只传 `--port <n>`，以便 HTTP 响应刷出。杀进程安全规则仍在脚本内（仅 CommandLine 确认的 `dsh`／`web`／`--port`）。缺少脚本时以 `internal` 返回路径。
3. **UI** — RiskConfirmation 警告服务会中断数秒。接受后页面轮询 `GET /` 直到 2xx 或 45 秒，然后刷新。超时与 Host 错误显示在该行。远程浏览器从不注册该行。`host.restartWeb` 在 connection 特权集合中（仅回环）。
4. **首次加载** — 按钮在已加载的 `ui-settings-general` 客户端包内，重建 bundle 后硬刷新可以看见。Host 方法只存在于已经注册它的 Node 进程。更旧的 3080 进程会对 RPC 返回 404，直到手动执行一次 `pnpm run web:restart`（或等价重启）加载它；之后按钮可用。

## 考虑过的替代方案

- **设置里做任意命令执行器** — 否决：浏览器不得 spawn shell。Host 只暴露一个只能启动仓库重启脚本的动词。
- **RPC 阻塞到新进程健康** — 否决：当前进程会在重启中死去，进行中的 HTTP 调用无法等待。先接受再 spawn，加上客户端健康等待，才是能刷出响应的顺序。
- **放到新的设置分区或侧栏底部** — 否决：通用设置已持有无特定功能归属的 chrome，制作人截图也在该页「打开配置文件」旁边。

## 后果

回环标签页在已加载 `host.restartWeb` 的进程上可以从设置重启 Host。远程标签页永远没有该控件。测试注入 spawn，不得真的杀掉 3080。
