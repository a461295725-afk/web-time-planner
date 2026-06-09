# Hermes 稍后阅读投递契约

外部 API 已实现。此文档记录 Hermes 接入时稍后阅读的投递约定。

## 接收规则

- 仅处理含明确指令 `稍后阅读` 且包含合法 `http` 或 `https` 链接的消息。
- 请求使用 `X-API-Token` 校验身份，令牌从服务端环境变量读取。
- 链接写入前移除 fragment 以及 `utm_*`、`spm` 跟踪参数；规范化链接相同的条目合并更新，不重复创建。

## 实际接口

稍后阅读已整合到 `/api/v1/reading`，使用 `X-API-Token` 鉴权。详见 `docs/hermes-api.md`。

`POST /api/v1/reading`

```json
{
  "url": "https://example.com/article",
  "title": "可选标题",
  "notes": "消息中的补充说明"
}
```
