# Web Time Planner 协作说明

## 项目定位

这是一个面向家庭场景、支持双人独立使用的个人暗色事项工作台，优先适配 Mac 主屏、副屏和平板使用场景。当前代码已经从静态原型进入本地可用阶段：主要页面、SQLite 持久化、周/月排程、打卡、想法、稍后阅读、配色设置与服务端 AI 拆分流程均已落地。

双人账号、会话鉴权、外部 API、Docker 部署、SSE 实时同步均已落地，服务器已运行。剩余待办见"尚未实现"。

## 开发约束

- 技术栈为 Next.js App Router + React + TypeScript + Tailwind CSS v4 + Framer Motion + Lucide React + SQLite (`better-sqlite3` / Drizzle schema)。
- 本项目使用 Next.js 16；改动路由、缓存、环境变量或服务端组件行为前，先读取 `node_modules/next/dist/docs/` 中对应文档。
- 所有日期语义按 `Asia/Shanghai` 计算，日期键使用 `YYYY-MM-DD`。
- 数据必须写入 SQLite，不要重新引入页面内演示数据作为业务来源。
- 任务只存一条记录；今日要事、周计划、项目详情和月历通过同一任务状态联动，不创建视图副本。
- API Key 不写入数据库、不下发前端，仅服务端读取 `AI_API_KEY`。
- 已实现双人账号登录与 Cookie 会话鉴权；所有页面与内部 API 均受登录保护，未登录请求返回 401。
- `hermes-skills/` 目录下存放 Hermes 微信机器人相关的 wrapper 脚本和技能配置，包含敏感 Token，**不要提交到 Git**。

## 产品规则

### 导航与视觉

- 顶部一级入口固定为 `任务 / 项目 / 想法 / 稍后阅读`。
- `任务` 不跳页，在首页今日要事区打开快速新增输入；其余入口进入完整工作区。
- 右上角齿轮打开设置抽屉；支持 `荧光终端 / 深海蓝青 / 琥珀夜航 / 玫红夜幕` 四套配色。
- 内容页面保持控制台顶栏和醒目的 `返回今日总览` 路径。
- 所有主页面及月历抽屉保留足够底部滚动留白，避免末项被视窗边缘或浮动反馈遮挡。

### 任务、项目与日期

- `scheduledDate` 表示任务被安排到某个具体日期，是今日要事、七日周计划和月历同步显示的唯一日期来源。
- `showInWeekPlan` 表示任务或项目进入本周规划范围，但不等于已有具体日期。
- 首页今日要事支持快速新增、完成勾选、Markdown 备注与任务排序。
- 首页本周板块是紧凑总览：独立周任务可排序，项目可折叠查看子任务，并可进入项目详情。
- 项目详情支持 Markdown 主笔记、手工新增/排序/完成子任务、子任务安排今日、项目或单个子任务加入本周计划，以及 AI 拆分建议。
- 项目加入本周后，周计划待办池中展示可折叠项目；展开后把尚未安排日期且未完成的子任务拖入具体日期。

### 七日周计划与月历

- `/week` 为完整周排程工作区：第一行横向展示本周七个日期框，第二行整宽展示 `待办事项`。
- 待办事项包含未安排日期的独立周任务，以及可折叠的本周项目及其待排子任务。
- 任务整行可拖入日期、日期间改期或拖回待办池；任务卡进入目标日期或待办区域时对应容器高亮。
- 临时安排到日期但未加入本周的任务会显示在七日表中；若拖回待办池，则自动加入本周计划。
- 拖动排序或改期后不能误触发完成状态。
- 月历抽屉可切换月份，显示各日任务与当月打卡矩阵；日期格默认显示至多三项，超出部分可点击打开当天完整详情。
- 周计划切换周次时，其月历初始定位到该周所在月份。

### 服务器部署与双人账号

- 部署到服务器后必须提供账号登录。你和妻子各自拥有独立账号，登录后看到的是**各自独立的工作台**——彼此的任务、项目、想法、稍后阅读、打卡记录和设置互不可见，互不干扰。
- 账户体系不提供”共享”或”协作”模式——每个人安排自己的日程，各自独立管理。
- 系统不开放自由注册：由初始管理员创建或邀请第二位家庭成员，避免公网陌生人注册访问。
- 数据隔离方案：所有现有数据表（tasks、projects、habits、habit_logs、ideas、reading_items、app_settings）增加 `user_id` 字段，所有查询和写入均以当前登录用户的 `user_id` 为条件过滤。
- 登录后以服务端会话保护页面与现有 `/api/*` 内部接口；未登录请求不得读取或修改工作台数据，也不得触发 AI 调用。
- 密码只保存安全哈希，会话使用安全 Cookie；`AI_API_KEY` 继续只保存在服务器环境变量中。

### 想法、稍后阅读与打卡

- `/ideas` 为 Markdown 想法卡片页；卡片展开时原位编辑，并可转换为今日任务或项目。
- 想法转换为任务/项目与删除原想法在同一事务完成；正文分别迁入任务备注或项目笔记。
- `/reading` 为稍后阅读收藏页；支持链接、标题、备注、已读切换与删除。
- 稍后阅读按规范化链接去重：移除 fragment、`utm_*` 和 `spm` 参数，重复提交合并更新。
- 打卡项目可在首页创建、重命名、删除与按日勾选；月历显示当月历史矩阵。

## 页面与路由

| 页面 | 用途 |
| --- | --- |
| `/` | 今日总览：首页 HUD、快捷入口、今日要事、本周预览、打卡与月历抽屉 |
| `/week` | 七日周计划排程与待办池 |
| `/projects` | 项目卡片列表与新建项目 |
| `/projects/[id]` | 项目笔记、子任务与 AI 拆分 |
| `/ideas` | 想法卡片与 Markdown 编辑/转换 |
| `/reading` | 稍后阅读收藏与已读管理 |
| `/login` | 登录页 |
| `/setup` | 首次初始化：创建管理员账号 |

## 数据模型

SQLite 文件为项目根目录下的 `time-planner.db`，已加入忽略规则。应用服务端启动读取数据库模块时会自动建表并补充缺失列；`npm run db:init` 可用于显式初始化。

| 表 | 作用 | 关键字段 |
| --- | --- | --- |
| `users` | 用户登录账号 | `username`, `password_hash`, `is_admin` |
| `sessions` | 登录会话 | `user_id`, `token`, `expires_at` |
| `projects` | 项目与主笔记 | `user_id`, `description`, `due_date`, `show_in_week_plan`, `pinned`, `group_name` |
| `tasks` | 所有任务与项目子任务 | `user_id`, `description`, `scheduled_date`, `project_id`, `show_in_week_plan`, `sort_order`, `today_sort_order` |
| `habits` / `habit_logs` | 打卡项目与日记录 | `user_id`, `habit_id`, `date` |
| `ideas` | Markdown 想法卡片 | `user_id`, `title`, `content` |
| `reading_items` | 稍后阅读收藏 | `user_id`, `normalized_url`, `notes`, `is_read`, `source` |
| `app_settings` | 页面偏好与非敏感 AI 设置 | `user_id`, `key`, `value` |
| `recurring_tasks` | 每月固定任务 | `user_id`, `title`, `day_of_month`, `priority` |

## 内部 API

所有内部 `/api/*` 路由均通过 Cookie 会话鉴权（`getUserFromRequest`），未登录返回 401。

| 路由 | 方法 | 行为 |
| --- | --- | --- |
| `/api/auth/setup` | `POST` | 首次创建管理员账号 |
| `/api/auth/login` | `POST` | 登录，返回 Set-Cookie |
| `/api/auth/logout` | `POST` | 登出，清除 Cookie |
| `/api/auth/register` | `POST` | 管理员创建新用户 |
| `/api/auth/session` | `GET` | 获取当前登录状态 |
| `/api/dashboard?date=YYYY-MM-DD` | `GET` | 获取任务、项目、打卡、固定任务和设置总览 |
| `/api/week?start=YYYY-MM-DD` | `GET` | 获取周排程、待办任务与项目任务池 |
| `/api/tasks` | `GET` / `POST` / `PATCH` / `DELETE` | 任务读取、新增、编辑/完成/排期、删除 |
| `/api/tasks/reorder` | `POST` | 按 `default` / `today` / `scheduled` 范围排序 |
| `/api/projects` | `GET` / `POST` | 项目列表与新建 |
| `/api/projects/[id]` | `GET` / `PATCH` / `DELETE` | 项目详情、笔记、更新、删除 |
| `/api/habits` | `POST` / `PATCH` / `PUT` / `DELETE` | 打卡项目及当日状态管理 |
| `/api/ideas` | `GET` / `POST` | 想法列表与新建空卡 |
| `/api/ideas/[id]` | `PATCH` / `DELETE` | 想法编辑与删除 |
| `/api/ideas/[id]/convert` | `POST` | 想法事务性转换为任务或项目 |
| `/api/reading` | `GET` / `POST` | 稍后阅读查询与去重写入 |
| `/api/reading/[id]` | `PATCH` / `DELETE` | 已读切换与删除 |
| `/api/settings` | `GET` / `PATCH` | 配色、AI 非敏感设置与 Hermes Token |
| `/api/recurring-tasks` | `GET` / `POST` / `PATCH` / `DELETE` | 每月固定任务管理 |
| `/api/events` | `GET` | SSE 实时同步事件流 |
| `/api/ai/test` | `POST` | 测试服务端模型连接 |
| `/api/ai/decompose` | `POST` | 根据项目标题与笔记生成待确认子任务建议 |

### Hermes 外部 API（`/api/v1/`，`X-API-Token` 鉴权）

| 路由 | 方法 | 行为 |
| --- | --- | --- |
| `/api/v1/tasks` | `GET` / `POST` / `PATCH` / `DELETE` | 任务 CRUD |
| `/api/v1/tasks/dashboard` | `GET` | 今日概览 |
| `/api/v1/projects` | `GET` / `POST` | 项目列表与新建 |
| `/api/v1/projects/[id]` | `GET` / `PATCH` / `DELETE` | 项目详情与更新 |
| `/api/v1/habits` | `GET` / `POST` / `DELETE` | 习惯列表与创建/删除 |
| `/api/v1/habits/check` | `POST` | 打卡/取消 |
| `/api/v1/ideas` | `GET` / `POST` / `DELETE` | 想法列表与创建/删除 |
| `/api/v1/reading` | `GET` / `POST` / `DELETE` | 阅读列表与添加/删除 |
| `/api/v1/recurring-tasks` | `GET` / `POST` / `DELETE` | 每月固定任务 |

## 设置与 AI

- 设置中持久化：主题、AI 服务商、模型名、接口地址、默认任务优先级、项目子任务自动加入本周、想法转任务自动安排今日。
- 默认 AI 设置为 OpenAI Responses API、模型 `gpt-4.1-mini`；另支持 Anthropic Messages API 与 OpenAI 兼容接口。
- 服务端环境变量：

```bash
AI_API_KEY=你的模型服务密钥
```

- 项目详情的 AI 拆分仅生成待确认建议，用户点击建议后才创建子任务。
- 部署和安全说明见 `docs/server-ai-settings.md`。

## 本地运行与校验

```bash
npm install
npm run dev
```

数据库显式初始化：

```bash
npm run db:init
```

当前已验证的生产检查命令：

```bash
npx tsc --noEmit --incremental false
npx next build --webpack
```

类型检查与 Next 构建应顺序执行，不要并发运行；两者都可能访问 `.next` 生成类型目录。

## 尚未实现

- AI 自动跨天滚入机制：每日 24:00 未完成 P1 任务自动滚入次日、P2/P3 退回本周计划或逾期池。
- 打卡每日 24:00 自动重置（当前打卡为手动勾选，无自动重置逻辑）。

## 深入文档

| 文档 | 用途 |
| --- | --- |
| `docs/server-ai-settings.md` | 服务端 AI 密钥配置与安全注意 |
| `docs/hermes-reading-api.md` | Hermes 稍后阅读投递契约（已实现于 v1 API） |
| `hermes-skills/time-planner/SKILL.md` | Hermes time-planner skill |
