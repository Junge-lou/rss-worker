# 微博 Cookie 更新指南（WEIBO_COOKIE）

> 本文档记录 rss-worker 微博 RSS 的 cookie 存放位置与更新流程，供后续更新时直接照做。
> 最后更新：2026-09-15

## Cookie 存放位置

- Cookie 不在代码或仓库里，而是 Cloudflare Worker 的加密 secret：**`WEIBO_COOKIE`**
- Worker 名称：`rss-worker`（配置见 `wrangler.toml`），账号 `loujinshang.jmsu@vip.163.com`
- 代码读取点：
  - `src/lib/weibo/user.js`（第 13、27 行附近）：`Cookie: ctx.env.WEIBO_COOKIE || ''`
  - `src/lib/weibo/utils.js`（getShowData / formatArticle / formatComments）
- README 第 28 行也有手动操作说明（`wrangler secret put WEIBO_COOKIE`）

## 更新流程

1. 从浏览器复制完整的 m.weibo.cn cookie（关键登录态字段：`SUB`、`SUBP`、`SCF`、`ALF`）
2. 在项目根目录 `C:\Workspace\rss-worker` 执行（PowerShell）：

```powershell
$cookie = @'
<粘贴完整 cookie，单行>
'@
$cookie | node node_modules/wrangler/wrangler-dist/cli.js secret put WEIBO_COOKIE
```

3. 看到 `✨ Success! Uploaded secret WEIBO_COOKIE` 即生效（secret put 会直接生成新版本，无需另外 deploy）
4. 验证：

```powershell
node node_modules/wrangler/wrangler-dist/cli.js secret list
```

## 注意事项

- **不要用 `npx wrangler ...`**：DSH 沙箱下 npx/wrangler 启动器和 wrangler 内部的 esbuild 子进程会报 `spawn EPERM`。必须直接跑 `node node_modules/wrangler/wrangler-dist/cli.js`，且需要 `danger-full-access` 提权（esbuild 子进程 + 访问 Cloudflare API）。
- here-string `@'...'@` 粘贴的 cookie 不含末尾换行；即使通过管道多传了换行也没关系，wrangler 会 `trimTrailingWhitespace`。
- 登录态有效期看新 cookie 里的 `ALF`（Unix 秒）：当前 `ALF=1792048178` ≈ **2026-10-15**。过期后 m.weibo.cn 接口开始返回未登录内容，RSS 抓取会异常，届时重复上面流程即可。
- `SSOLoginState` 的值是最近一次登录时间，可用来确认 cookie 新鲜度。

## 更新历史

| 日期 | 操作 | 备注 |
| --- | --- | --- |
| 2026-09-15 | 首次创建 `WEIBO_COOKIE`，随后更新为最新 cookie | 新 cookie 含 `SSOLoginState=1789456178`、`MLOGIN=1` 等 m.weibo.cn 字段；`ALF=1792048178`（约 2026-10-15 过期） |
