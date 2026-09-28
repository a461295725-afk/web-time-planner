# V3.4 外部助手 API

V3.4 允许 Grok 等外部聊天助手读取 Time Planner 上下文、提出计划草稿，并在用户确认后写回任务、计划、执行结果、复盘和流程模板。网站仍是唯一事实源，不新增内置聊天页，也不保存完整对话。

所有日期使用 `YYYY-MM-DD`，时区固定为 `Asia/Shanghai`。接口按 Token 所属 `user_id` 隔离。

## 创建连接 Token

登录网站后打开“设置 → 外部 AI 助手”，填写助手名称和权限，生成一次性 Token。服务器只保存哈希；Token 可随时撤销或重置。

请求头：

```text
X-API-Token: <一次性显示的助手 Token>
```

所有允许的 POST、PATCH 写请求还必须带：

```text
Idempotency-Key: <本次逻辑操作的唯一键，8-200 字符>
```

网络重试时复用原键，会返回第一次的结果并附带 `Idempotency-Replayed: true`；同一键用于不同请求返回 `409`。并发到达的同一请求只执行一次，尚未完成的副本返回 `409` 和“同一请求正在处理中”；客户端应稍后复用原键重试，不能换新键重复写入。

助手写请求必须同时使用 `Content-Type: application/json`，且 JSON 顶层必须是对象。缺少或错误的内容类型、非法 JSON、`null`、数组或基础类型均返回 `400`。

设置面板会显示最近五条外部写入记录（助手名称、方法、路径、状态码和时间），请求正文和 Token 不会写入审计列表。

## 权限

| 权限 | 能力 |
| --- | --- |
| `context:read` | 读取任务、项目、忙闲、计划、复盘、确认记忆、流程模板和候选 |
| `tasks:write` | 创建/更新任务，记录完成、部分完成、推迟和放弃 |
| `plans:write` | 生成、调整和确认今日计划 |
| `reviews:write` | 保存每日或每周复盘 |
| `templates:write` | 保存或应用流程模板 |

缺少 Token、Token 错误、已撤销或缺少所需权限都返回 `401`。

## 读取上下文与忙闲

```text
GET /api/v1/assistant/context?from=2026-09-28&to=2026-10-04
```

返回范围任务、项目、每日忙闲、复盘和已确认记忆。范围校验与 `freebusy` 一致，最多 31 天。

```text
GET /api/v1/assistant/plans?date=2026-09-28
GET /api/v1/assistant/handoff?date=2026-09-28&kind=morning
GET /api/v1/assistant/handoff?date=2026-09-28&kind=evening
GET /api/v1/smart-day?date=2026-09-28&kind=morning
GET /api/v1/freebusy?from=2026-09-28&to=2026-10-04
GET /api/v1/projects
GET /api/v1/projects/:projectId
```

早晨交接包含计划、当天任务、逾期、到期跟进和阻塞；晚上交接包含当天结果、未完成项、专注分钟和已保存日复盘。

## 任务

沿用通用任务接口：

```text
GET    /api/v1/tasks
POST   /api/v1/tasks
PATCH  /api/v1/tasks
```

外部助手不能删除任务、项目、习惯、想法、阅读项、重复任务或流程模板；带有效助手 Token 的删除请求统一返回 `403`。放弃任务必须记录 `outcome=dropped`，保留历史依据。

新增/更新字段：

```json
{
  "title": "联系供应商",
  "scheduledDate": "2026-10-02",
  "executionState": "waiting",
  "nextAction": "周五再次询问",
  "doneDefinition": "收到正式报价单",
  "waitingOn": "供应商报价",
  "followUpDate": "2026-10-02",
  "blocker": null,
  "taskLevel": "action",
  "parentTaskId": "可选上级任务 ID",
  "originRef": "conversation:可选外部引用"
}
```

`executionState` 为 `active | waiting | blocked`；`taskLevel` 为 `milestone | task | action`。上级任务必须属于同一用户，并且在指定项目时必须属于同一项目。

任务标题最多 200 个字符，描述最多 5000 个字符；下一步、完成标准、等待对象、阻塞原因和来源引用各最多 500 个字符。新增和更新共用同一套限制。

### 记录结果

```text
GET  /api/v1/assistant/tasks/:taskId/outcomes
POST /api/v1/assistant/tasks/:taskId/outcomes
```

部分完成并安排明天继续：

```json
{
  "date": "2026-09-28",
  "outcome": "partial",
  "actualMinutes": 45,
  "nextAction": "补完功能示例",
  "rescheduleDate": "2026-09-29",
  "note": "首屏和接口说明已完成"
}
```

等待外部条件：

```json
{
  "date": "2026-09-28",
  "outcome": "postponed",
  "nextAction": "周五催一次",
  "rescheduleDate": "2026-10-02",
  "waitingOn": "供应商报价",
  "followUpDate": "2026-10-02"
}
```

结果为 `done | partial | postponed | dropped`。结果日期只能是今天或过去，不能预先填写未来结果。`partial` 必须填写 `nextAction`，可继续安排在结果当天；`postponed` 必须填写 `nextAction` 和晚于结果日期的 `rescheduleDate`。`dropped` 会关闭任务但不计入完成数，仍保留在计划数和结果历史中。

每条结果会保存记录当时的计划日期和预估时长快照。复盘统计同一任务同一天只采用最新一条结果，并优先使用历史事件和快照；任务后来被重新打开或改期，不会改写过去的计划数、计划内完成数和完成数。完整结果历史仍可查询。

不存在或不属于当前用户的任务统一返回 `404 {"error":"任务不存在或不可访问"}`。

## 今日计划草稿

```text
POST /api/v1/assistant/plans/drafts

{
  "date": "2026-09-28",
  "taskIds": ["任务 ID"],
  "useAi": false
}
```

显式传入 `taskIds` 时不能为空。生成草稿不会修改任务日期。已确认计划默认不能被新草稿覆盖，会返回 `409`；用户明确同意重排后可发送 `"replaceConfirmed": true`，旧确认版本会完整保存在 `GET /api/v1/assistant/plans?date=...` 的 `history` 中。

只有省略 `date` 才默认今天；若显式传入非字符串、空值或不合法日期，返回 `400`，不会静默改为今天。

调整计划项：

```text
PATCH /api/v1/assistant/plans/items/:itemId

{"action":"accept"}
{"action":"reject"}
{"action":"move","block":"afternoon","startMinute":810,"endMinute":870}
```

若提供 `position`，必须是非负安全整数；非法值返回 `400`。

用户明确确认后：

```text
POST /api/v1/assistant/plans/:planId/confirm
{}
```

确认才会把未拒绝的计划项写入任务日期。

拒绝或移动计划项后，计划摘要会按当前未拒绝项目的数量和真实分钟数重新计算。

## 复盘草稿与保存

```text
GET /api/v1/assistant/review-draft?periodType=weekly&periodStart=2026-09-28
```

草稿只由真实任务结果、专注、习惯和结转统计生成，返回 `facts`、`wins`、`blockers`、`nextActions` 和 `notes`。保存前可在聊天中补充或修改：

```text
POST /api/v1/assistant/reviews

{
  "periodType": "weekly",
  "periodStart": "2026-09-28",
  "wins": ["完成……"],
  "blockers": ["等待……"],
  "nextAction": ["下周先……"],
  "notes": ["用户确认后的补充"]
}
```

数组会保存为 Markdown 列表，也可以直接传字符串。

## 流程模板与三级任务

```text
GET  /api/v1/assistant/workflows
POST /api/v1/assistant/workflows
GET  /api/v1/assistant/workflow-candidates
POST /api/v1/assistant/workflows/:templateId/apply
```

模板示例：

```json
{
  "name": "文章发布流程",
  "description": "从成稿到发布",
  "steps": [
    {"key":"launch","title":"发布文章","level":"milestone"},
    {"key":"review","title":"完成终稿检查","level":"task","parentKey":"launch"},
    {"key":"links","title":"检查链接和图片","level":"action","parentKey":"review","estimatedMinutes":20}
  ]
}
```

`parentKey` 必须引用前面已经出现的步骤。应用模板：

```json
{
  "projectId": "目标项目 ID",
  "scheduledDate": "2026-09-29"
}
```

每次应用都会创建新的任务记录，并写入模板、应用批次和步骤来源。候选接口只返回建议，不会自动保存或应用。

不存在或不属于当前用户的模板、目标项目统一返回租户安全的 `404`，不会区分“确实不存在”和“属于其他用户”。

## 推荐的确认边界

- 读取、生成草稿、生成复盘草稿：可直接执行。
- 新增/修改任务、记录结果：先复述将写入的内容，再由用户确认。
- 确认今日计划、显式替换已确认计划、批量应用模板、记录 `dropped`：必须获得明确确认。
- 删除不属于助手能力；即使用户要求，也改为记录 `dropped` 或请用户在网页端自行删除。

可直接把 [`skills/grok-time-planner/SKILL.md`](../skills/grok-time-planner/SKILL.md) 的内容作为 Grok Bot 的行为说明。
