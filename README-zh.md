<p align="center"><a href="README.md">English</a> · <b>简体中文</b></p>

# OpenXPlay Web Plugins

面向 `oxp-web-plugin/0` 的可选离线 Web 接收端插件；Stream 和 Relay 各自独立实现核心契约。插件默认关闭：参考接收端不会创建插件 frame，也不会发出相关请求；中继的插件路由和通道会拒绝访问。经过审核的插件包在沙箱、CSP 和防护层下运行，无法访问网络；WebRTC 防护属于缓解措施。

| 路径 | 内容 |
| --- | --- |
| `spec/` | 规范性 JSON schema 和可移植的契约测试向量 |
| `sdk/` | ESM SDK，以及 `dist/sdk/` 中生成的类型声明 |
| `host/`、`shared/` | 宿主 UI、纯策略逻辑、几何与校验 |
| `tools/`、`simulator/` | 校验器、ZIP 打包器、中继／接收端参考实现、一致性测试 |
| `tests/fixtures/` | 仅供测试的插件包 |
| `plugins/` | 官方插件：cats、games、visuals、whale-girl |
| `dist/install/` | 中继插件根目录：`host/` 和 `p/<id>/` |

需要 Node 22。使用 `npm ci` 安装；离线开发时可把 `node_modules` 符号链接到 `../OpenXPlay-Stream/web/node_modules`。

```sh
npm run build
npm test
npm run typecheck
npm run dev -- --enable
npm run dev -- --fixture valid
npm run validate
npm run validate -- tests/fixtures/valid
npm run validate -- path/to/package.oxpplugin
npm run pack
npm run pack -- tests/fixtures/valid
npm run conformance -- https://relay.example
npm run conformance -- https://relay.example --insecure --expect-off
```

`npm run dev -- --enable` 会在模拟器中加载官方插件。模拟器运行在 `http://localhost:5173`，插件默认关闭，可在模拟器控件中启用，或使用 `--enable`／`--fixture valid` 启用。`--storage <directory>` 为每个插件启用 JSON 持久化存储。插件文档必须使用 `color-scheme: light`（或默认的 `normal`），以匹配宿主中浅色的插件 iframe 元素并保留透明背景。宿主根节点跟随接收端的 `theme`。请从 `dist/sdk/` 复制一份 SDK，随你的插件一起打包；在 opaque frame 中，经典脚本（包括防护脚本）、样式和图片要加上 `crossorigin="anonymous"`。一致性测试在写入测试后会恢复原有存储；如果一开始没有存储，测试后会变为 `{}`，因为 v0 没有删除操作。

许可证：**Apache-2.0 OR MIT，由你任选其一**。详见 `LICENSE-APACHE` 和 `LICENSE-MIT`。

贡献须遵循 [OpenXPlay 贡献者许可协议](https://github.com/OpenXPlay/OpenXPlay/blob/main/CLA.md)（协议文本为英文）。在任意一个 OpenXPlay 仓库的 pull request 里按提示回复一次即可，之后所有仓库的 CLA 检查都会通过。
