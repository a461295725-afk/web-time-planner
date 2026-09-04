# V3.2 智能安排今天 API

所有日期使用 `YYYY-MM-DD`，时区固定为 `Asia/Shanghai`。浏览器接口使用登录 Cookie；Hermes 接口使用 `X-API-Token`。接口只操作当前认证用户的数据。

## 浏览器接口

### 获取工作台

```text
GET /api/smart-day?date=2026-08-24
```

返回当天候选任务、逾期任务、计划草案/已确认计划、工作窗口和专注记录。没有计划时 `plan` 为 `null`。

### 生成草案

```text
POST /api/smart-day/drafts
Content-Type: application/json

{
  "date": "2026-08-24",
  "useAi": true,
  "taskIds": ["可选的任务 ID"]
}
```

草案生成不会修改任务的 `scheduled_date`。规则算法保证时间不重叠、不超出工作窗口和每日容量。AI 只提供建议与理由；AI 缺失、超时或返回非法内容时自动使用规则结果。

`POST /api/smart-day` 也支持相同请求体，作为简写入口。

### 调整计划项

```text
PATCH /api/smart-day/items/:itemId
Content-Type: application/json

{"action":"accept"}
{"action":"reject"}
{"action":"move","block":"afternoon","startMinute":810,"endMinute":855}
```

只有 `draft` 状态的计划可以调整。拒绝不会删除任务；移动会重新校验时间窗口和同计划重叠。

### 确认计划

```text
POST /api/smart-day/plans/:planId/confirm
```

确认后才会把未拒绝的计划项对应任务安排到计划日期，并记录 `plan_confirmed` 反馈。重复确认是幂等的。

### 工作容量和时段

```text
GET   /api/smart-day/settings
PATCH /api/smart-day/settings
Content-Type: application/json

{
  "capacityMinutes": 360,
  "windows": [
    {"block":"morning","startMinute":540,"endMinute":720},
    {"block":"afternoon","startMinute":810,"endMinute":1080},
    {"block":"evening","startMinute":1170,"endMinute":1320}
  ]
}
```

窗口必须包含上午、下午、晚上，且互不重叠。设置写入当前用户的 `app_settings`。已确认且未过期的 V3.3 记忆会覆盖容量、默认预计时长和首选时段；确认后的 `estimate_multiplier` 会按历史实际耗时修正下一次排程时长。

### 专注会话

停止一次有效专注会话后，服务端会自动累计行为证据。达到阈值时只生成未确认的候选记忆，不会在用户确认前成为排程硬规则。

```text
GET   /api/focus-sessions?date=2026-08-24
POST  /api/focus-sessions
PATCH /api/focus-sessions/:sessionId
```

开始：

```json
{"taskId":"任务 ID","planItemId":"可选计划项 ID","date":"2026-08-24"}
```

停止或取消：

```json
{"action":"stop"}
```

```json
{"action":"cancel"}
```

停止时间由服务器记录，实际时长按完成会话累计。同一用户同时只能有一个运行中的会话；开始相同任务的重复请求会返回现有会话。

### 反馈事件

```text
GET /api/smart-day/feedback?date=2026-08-24&limit=100
GET /api/smart-day/feedback?since=毫秒时间戳
```

生成、确认、接受、拒绝、移动、专注开始/停止/取消等动作由服务端自动记录。事件只包含结构化 ID、时段和时长，不包含 AI 密钥或完整 Prompt。

## Hermes 只读摘要

```text
GET /api/v1/smart-day?date=2026-08-24&kind=morning
GET /api/v1/smart-day?date=2026-08-24&kind=overdue
GET /api/v1/smart-day?date=2026-08-24&kind=evening
```

`kind` 说明：

- `morning`：计划状态、确认计划项、预计时长、未安排数和逾期数。
- `overdue`：逾期任务、优先级、截止日期和预计时长。
- `evening`：完成数、完成任务、未完成任务、计划分钟和实际专注分钟。

这些 GET 请求不会确认计划、改变任务日期、完成任务或写入结转。Hermes 负责定时轮询和发送消息，Time Planner 本身不运行后台定时器。

## Hermes 范围忙闲

```text
GET /api/v1/freebusy?from=2026-09-01&to=2026-09-07
X-API-Token: <用户的 Hermes Token>
```

`from` 和 `to` 都是必填的闭区间日期，单次最多查询 31 天，因此可覆盖一周或一个月。时区固定为 `Asia/Shanghai`，接口不会接受或伪装其他时区。

返回每天的工作窗口、占用和空闲片段；时间同时提供 `HH:mm` 和从当天零点开始的分钟数：

```json
{
  "from": "2026-09-01",
  "to": "2026-09-01",
  "timezone": "Asia/Shanghai",
  "days": [
    {
      "date": "2026-09-01",
      "workWindows": [
        {"block":"morning","startMinute":540,"endMinute":720,"start":"09:00","end":"12:00"}
      ],
      "busy": [
        {"block":"morning","startMinute":540,"endMinute":585,"start":"09:00","end":"09:45","planItemId":"...","taskId":"...","title":"整理周报","status":"accepted"}
      ],
      "free": [
        {"block":"morning","startMinute":585,"endMinute":720,"start":"09:45","end":"12:00"}
      ],
      "freeMinutes": 135
    }
  ]
}
```

占用只来自当前用户非 `rejected` 的 `day_plan_items`，空闲由当前用户在 `app_settings` 中的智能安排工作窗口减去这些占用得到。仅设置 `scheduled_date`、但尚未形成计划时间段的任务不会占满全天。

聊天助手可以先读取范围忙闲，再使用现有 `/api/v1/tasks` 创建任务或更新 `scheduledDate`；精确时间段仍由智能今天草案管理。本接口只读，不创建日历、后台任务或外部订阅。
