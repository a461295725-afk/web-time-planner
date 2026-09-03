# Time Planner V3

面向个人与家庭双账号场景的时间规划工作台。每位用户拥有独立数据空间，可以在同一个应用中完成快速收集、安排今天、专注执行和复盘，并通过可查看、可修正、可删除的结构化记忆逐渐获得更贴合自己的安排建议。

## 新版本亮点

- `Ctrl/Cmd + K` 快速记录任务、想法和稍后阅读内容。
- 收件箱统一整理未排期任务、想法和未读资料。
- 全局搜索任务、项目笔记、想法和阅读内容。
- 智能今天根据优先级、截止日期、预计用时、精力和个人偏好生成计划草案。
- 计划先预览、后确认；AI 不可用时自动使用确定性规则安排。
- 专注计时、每日/每周复盘、显式任务结转和停滞项目提醒。
- 长期记忆支持查看、确认、修改和删除，并严格按账号隔离。
- 用户数据导出会排除密码、会话、API Key 和其他敏感信息。

## 技术栈

Next.js 16 App Router、React 19、TypeScript、Tailwind CSS v4、SQLite、better-sqlite3。

## 本地运行

需要 Node.js 20。

```bash
npm ci
npm run dev
```

打开 <http://localhost:3000>。首次访问会进入 `/setup`，用于创建管理员账号。

AI 功能需要在本地 `.env` 中配置 `AI_API_KEY`；密钥、数据库和环境文件均已排除在 Git 之外。

## 验证

```bash
npm test
npx tsc --noEmit --incremental false
npx next build --webpack
```

请按以上顺序执行，避免多个命令同时写入 Next.js 构建目录。

## Docker 部署

```bash
docker compose up -d --build
```

应用仅绑定本机 `127.0.0.1:3000`，数据保存在 `./data/time-planner.db`。公网访问建议通过受控的反向代理或隧道提供，并启用 HTTPS。

## 文档

- [`specs/time-planner-v3.md`](specs/time-planner-v3.md)：V3 功能范围与验收标准。
- [`docs/smart-day-api.md`](docs/smart-day-api.md)：智能今天接口约定。
- [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)：V3 实施记录。
