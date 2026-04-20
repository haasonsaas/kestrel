# Publishing

Kestrel keeps the Electron desktop app private at the repository root and publishes SDK artifacts from the `sdk` directory.

## JavaScript SDK

The npm package lives in `sdk/js` and is published as `@evalops/kestrel-sdk`.

```bash
npm --prefix sdk/js install
npm --prefix sdk/js run build
npm --prefix sdk/js run pack:dry
npm --prefix sdk/js publish --access public
```

The root convenience commands are:

```bash
npm run sdk:build
npm run sdk:package
npm run sdk:publish:npm
```

## Rust SDK

The crate lives in `sdk/rust/kestrel-sdk` and is published as `kestrel-sdk`.

```bash
cargo package -p kestrel-sdk
cargo publish -p kestrel-sdk
```

The root convenience command is:

```bash
npm run sdk:publish:crate
```

## Desktop App Install

The desktop app install command is intentionally named `app:install` so npm package installs do not build and copy the macOS app into `/Applications`.
