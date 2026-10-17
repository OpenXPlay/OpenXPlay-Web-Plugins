# OpenXPlay Web Plugins

Optional offline web receiver plugins for `oxp-web-plugin/0`; Stream and Relay implement the core contract independently. Plugins are off by default: the reference receiver creates no plugin frame or requests, and relay plugin routes and channels refuse access. Reviewed packages run without network access under sandbox, CSP and guard layers; the WebRTC guard is a mitigation.

| Path | Contents |
| --- | --- |
| `spec/` | Normative JSON schemas and portable contract vectors |
| `sdk/` | ESM SDK and generated declarations in `dist/sdk/` |
| `host/`, `shared/` | Host UI, pure policy, geometry and validation |
| `tools/`, `simulator/` | Validator, ZIP packer, relay/receiver references, conformance |
| `tests/fixtures/` | Test packages only |
| `plugins/` | Official plugins: cats, games, visuals, whale-girl |
| `dist/install/` | Relay plugin root: `host/` and `p/<id>/` |

Node 22. Install with `npm ci`; offline development can symlink `node_modules` to `../OpenXPlay-Stream/web/node_modules`.

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

`npm run dev -- --enable` loads the official plugins in the simulator. The simulator starts at `http://localhost:5173`, with plugins off unless enabled in its controls or with `--enable` / `--fixture valid`. `--storage <directory>` enables per-plugin JSON persistence. Plugin documents must use `color-scheme: light` (or the default `normal`) to match the host’s light plugin iframe elements and preserve transparent backgrounds. The host root follows the receiver’s `theme`. Package your own SDK copy from `dist/sdk/`; use `crossorigin="anonymous"` on classic scripts (including the guard), styles and images inside opaque frames. Conformance restores existing storage after write tests; an initially absent store becomes `{}` because v0 has no delete operation.

Licence: **Apache-2.0 OR MIT at your option**. See `LICENSE-APACHE` and `LICENSE-MIT`.
