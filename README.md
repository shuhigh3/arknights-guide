# 罗德岛攻略检索终端

《明日方舟》攻略检索网站：输入要打的关卡，按练度阈值过滤，列出 B 站上可参考的攻略视频；支持森空岛扫码登录，直接读取账号里的干员与练度。

前端是单文件 `index.html`，浏览器直接打开即用，零外部静态资源引用。

在线访问：https://shuhigh3.github.io/arknights-guide/

## 扫码登录需要一条转发端点

森空岛接口不返回 CORS 头且要求签名，浏览器无法直连；GitHub Pages 也只能托管静态文件。请部署本仓库内的 `worker.js`（Cloudflare Worker，免费、自带 HTTPS）：

1. 打开 dash.cloudflare.com，Workers & Pages，Create，Worker
2. 粘贴 `worker.js` 全文，Deploy
3. 得到形如 `https://xxxx.workers.dev` 的地址

回到网站在两处填写：

| 用途 | 填写位置 | 填写内容 |
| --- | --- | --- |
| B 站攻略检索 | 检索设置，通道选「自定义代理前缀」 | `https://xxxx.workers.dev/?url=` |
| 森空岛扫码登录 | 登录弹窗，「代理设置」里的转发前缀 | `https://xxxx.workers.dev/skland` |

填完点「测试通道」确认通过即可。

## 本机运行（可选）

`python proxy.py`，然后浏览器访问 `http://127.0.0.1:8787/`。只适合在自己这一台电脑上用，换设备或手机无效。

## 隐私

扫码产生的凭据只存在浏览器 localStorage（`akgf.skland.v1`），不写入本仓库；`worker.js` 与 `proxy.py` 都是无状态转发，不留存凭据、不写日志。仓库内不含任何个人凭据。
