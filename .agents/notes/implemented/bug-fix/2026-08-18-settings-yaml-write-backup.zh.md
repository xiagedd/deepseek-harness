# Agent Note: settings.yaml 写前备份

Status: implemented

中文 | [English](2026-08-18-settings-yaml-write-backup.md)

## Problem

制作人重启后「通用设置」看起来被清空。排查显示 `~/.dsh/settings.yaml` 并未被 MCP/`loader.update` 或 ignore 的 `writeText` 重写（mtime 仍为 2026-08-14；现场 `settings.describe` 与 `host.describe` 仍返回已持久化的权限与默认模型）。文件提供者本就在锁内按命名空间做读改写合并，但未来若出现错误写入或外部半截覆盖，仍缺少上一份完整文档的可恢复副本。

## Decision

每次对非空 `settings.yaml` / `.json` 做原子替换之前，`dsh-settings-file` 把刚对账过的旧全文写到同级 `<document>.bak`，权限与主文件相同。主文件仍靠现有保留注释的叶子级补丁保留兄弟命名空间与未知键；`.bak` 只是上一版全文的可恢复副本。

## Alternatives considered

**滚动编号备份。** 否决：单份旁路副本已覆盖即时回滚，避免在 harness home 无限堆积。

**对空文件首次创建也写 `.bak`。** 否决：零长度旁路文件没有可恢复内容，只制造噪音。

## Consequences

更新一个命名空间仍不会从主文档丢掉其他节。写坏时可把 `<document>.bak` 拷回主文件。MCP 启停仍只写 profile 的 `cordis.patch.yml`，不触碰 `settings.yaml`。
