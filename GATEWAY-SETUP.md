# OpenClaw 连接配置指南

OpenClaw Office 通过 WebSocket 连接 OpenClaw Gateway 进行实时通信。本文档说明连接配置要点和常见问题。

## 前置条件

1. **OpenClaw Gateway 已安装并运行**
2. **Node.js 18+**

## 安装

```bash
npm install -g @ww-ai-lab/openclaw-office
```

## 基本配置

### 1. 获取 Gateway Token

> **注意：** `openclaw config get gateway.auth.token` 新版本已对 token 脱敏，输出 `__OPENCLAW_REDACTED__`，无法获取真实值。

**方法 A — 从 dashboard 命令提取（推荐）：**

```bash
openclaw dashboard --no-open
# 输出示例：Dashboard URL: http://127.0.0.1:18789/#token=<your-token>
# 复制 URL 中 #token= 后面的值即为 Gateway Token
```

**方法 B — 从配置文件读取：**

```bash
# 查看配置文件路径
openclaw config file
# 通常为 ~/.openclaw/openclaw.json

# 提取 token
cat ~/.openclaw/openclaw.json | python3 -c "import sys,json; print(json.load(sys.stdin)['gateway']['auth']['token'])"
```

获取到 token 后，设置为环境变量：

```bash
export OPENCLAW_GATEWAY_TOKEN=<your-token>
```

或写入项目 `.env.local` 文件（仅开发模式）：

```
VITE_GATEWAY_TOKEN=<your-token>
```

### 2. 配置设备认证（Gateway 2026.2.15+）

Gateway 2026.2.15 起要求设备身份验证。Web 客户端需要绕过此限制：

```bash
openclaw config set gateway.controlUi.dangerouslyDisableDeviceAuth true
```

### 3. 配置不安全认证模式（Gateway 2026.3.23+）

> **重要：** Gateway 2026.3.23 引入了精细化 scope 授权模型。如果使用 `dangerouslyDisableDeviceAuth` 绕过设备认证，**必须** 同时启用 `allowInsecureAuth`，否则所有 RPC 调用的 scope 会被清空，导致 `missing scope: operator.read` 错误。

```bash
openclaw config set gateway.controlUi.allowInsecureAuth true
```

配置完成后重启 Gateway：

```bash
openclaw gateway restart
```

### 4. 配置允许的源（可选）

如果前端运行在非默认地址，需要添加到 `allowedOrigins`：

```bash
openclaw config set gateway.controlUi.allowedOrigins '["http://localhost:18789","http://127.0.0.1:18789","http://localhost:5180","http://127.0.0.1:5180"]'
```

## 启动

```bash
openclaw-office
```

默认访问 `http://localhost:5180`。

## Scope 权限说明

Gateway 使用基于 scope 的权限控制系统：

| Scope | 说明 | 包含的方法 |
|-------|------|-----------|
| `operator.admin` | 超级管理权限 | 包含所有方法（channels.logout、agents.create/update/delete、config.* 等） |
| `operator.read` | 只读权限 | channels.status、skills.status、usage.status、agents.list、sessions.list 等 |
| `operator.write` | 写入权限 | chat.send、chat.abort、sessions.create/send/abort 等 |
| `operator.approvals` | 审批权限 | exec.approval.* |
| `operator.pairing` | 配对权限 | node.pair.*、device.pair.* |

OpenClaw Office 默认请求 `operator.admin` + `operator.read` scope。

## 常见问题

### Q: Dashboard 显示 `missing scope: operator.read` 错误

**原因：** Gateway 2026.3.23+ 在 `dangerouslyDisableDeviceAuth` 模式下，如果未启用 `allowInsecureAuth`，会在连接时清空客户端请求的 scope。

**解决：**
```bash
openclaw config set gateway.controlUi.allowInsecureAuth true
openclaw gateway restart
```

### Q: 连接状态一直显示「连接中...」

**排查步骤：**
1. 确认 Gateway 是否在运行：`openclaw status`
2. 确认 token 是否有效：`openclaw dashboard --no-open`（应输出带 token 的 URL）
3. 检查 WebSocket 端口（默认 18789）是否可达

### Q: Office 升级后出现兼容性问题

建议确保 OpenClaw Office 版本与 Gateway 版本匹配：

| Office 版本 | 最低 Gateway 版本 | 配置要求 |
|-------------|-------------------|---------|
| 2026.3.23+  | 2026.3.23         | `allowInsecureAuth: true`（如使用 dangerouslyDisableDeviceAuth） |
| 2026.3.21   | 2026.2.15         | `dangerouslyDisableDeviceAuth: true` |

## 相关链接

- [OpenClaw 主仓库](https://github.com/openclaw/openclaw)
- [OpenClaw Office 仓库](https://github.com/WW-AI-Lab/openclaw-office)
- [npm 包](https://www.npmjs.com/package/@ww-ai-lab/openclaw-office)
