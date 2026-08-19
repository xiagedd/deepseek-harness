# dsh-native-command

[English](README.md) | 中文

宿主原生 OS 集成共享的**零依赖免 shell `execFile` 运行器**：一次 `runNativeCommand(command, args, signal)` 调用直接 spawn 可执行文件（绝不拼 shell 字符串），以 utf8 捕获 stdout/stderr，把调用方的 abort 传播为子进程终止，并在 Windows 上隐藏瞬时控制台窗口。失败时，调用会以错误拒绝；该错误附带退出 `code` 与两路已捕获输出，调用方无需重跑即可分类（工具缺失、已取消、真实失败）。

它的消费方都是宿主侧原生集成：[`directory-picker-native`](../../host/directory-picker-native/README.md) 后端的 OS 选择器命令，以及网关打开路径与在文件管理器中显示路径的操作（[`dsh-host-apiproxy`](../../host/apiproxy/README.md) 的 `host.openPath` / `host.revealPath`）。`NativeCommandRunner` 类型是这些调用方的可注入命令边界，三个运行器共用它。

另有两个启动器，面向价值在于弹出窗口而非输出的命令：两者都让子进程 detach、丢弃 stdio、unref，并在进程存在时立即 resolve，因此永远观察不到退出码，`signal` 只把关 spawn 这一步。`launchNativeCommandVerbatim` 只差一点——它把字面命令行交给 Windows（`windowsVerbatimArguments`），而不让 Node 逐 token 加引号。`explorer.exe /select,<path>` 必须如此：开关与路径是同一个 argv token，因路径含空格而给它加引号，会让 Explorer 识别不出开关、根本不弹窗，而 spawn 仍报成功。那里只有末尾的路径可以含空格；命令名与前面的 token 会被无引号拼接从而被拆开。

它是**库，不是服务或插件**：没有 `ctx`、不注册任何东西、不持有状态、不发事件。

## 接口面

```ts
import {
  runNativeCommand, launchNativeCommand, launchNativeCommandVerbatim, type NativeCommandRunner,
} from '@deepseek-ai/dsh-native-command'
```

## 模型体验

无；这是宿主侧子进程管道，这里没有任何东西进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **不做输出限量**——两路流在内存中无界缓冲；当前每个调用方只运行输出为一个路径或一行错误的小型原生工具。把它指向输出量可观的命令之前，先接入 `dsh-output-retention` 限量。
