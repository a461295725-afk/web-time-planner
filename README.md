# Time Planner

面向家庭场景、支持双人独立使用的个人暗色事项工作台。

## 本地运行

```bash
npm install
npm run dev           # http://localhost:3000
npm run db:init       # 显式初始化数据库
```

首次访问会自动跳转到 `/setup` 创建管理员账号。

## 部署

```bash
# 生成 .env
echo 'AI_API_KEY=your-key' > .env

# 启动
docker compose up -d --build    # http://localhost:3080
```

数据持久化在 `./data/time-planner.db`，重启不丢失。

## 技术栈

Next.js 16 (App Router) + React + TypeScript + Tailwind CSS v4 + Framer Motion + Lucide React + SQLite (better-sqlite3 + Drizzle)。

## 文档

- `CLAUDE.md` — 协作说明、路由清单、数据模型
- `docs/server-ai-settings.md` — AI 密钥配置
- `docs/hermes-api.md` — 外部 API 文档（含 Token）
