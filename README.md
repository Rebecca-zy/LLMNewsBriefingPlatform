# LLM News Briefing Platform

独立项目，支持手动触发生成每日大模型新闻简报。

## 运行

```bash
cd /Users/zyyy/Desktop/work-space/LLMNewsBriefingPlatform
npm run start
```

打开：

`http://127.0.0.1:4311`

## 命令行手动触发

```bash
npm run generate -- 8
```

`8` 是最多入选条数。

## 输出文件

- `data/briefings/<id>.json`
- `data/briefings/<id>.md`

## 配置新闻源

编辑 `config/sources.json`。

## 企业微信推送（可选）

1. 配置群机器人 Webhook（推荐用环境变量）：

```bash
export WECHAT_WORK_WEBHOOK="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx"
```

2. 启动服务后，在页面中：
- 先生成或选择一条历史简报
- 点击 `推送到企业微信`
- 可在 `Webhook` 输入框临时覆盖环境变量（便于测试）

3. 也可直接调用接口：

```bash
curl -X POST http://127.0.0.1:4311/api/push/<briefing-id> \
  -H "Content-Type: application/json" \
  -d '{"webhook":"https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx"}'
```
