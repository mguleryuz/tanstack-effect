<div align="center">

[![npm latest package][npm-latest-image]][npm-url]
[![Build Status][ci-image]][ci-url]
[![License][license-image]][license-url]
[![npm downloads][npm-downloads-image]][npm-url]
[![Follow on Twitter][twitter-image]][twitter-url]

</div>

## Tanstack Effect

Bun + Npm + Typescript + Standard Version + Flat Config Linting + Husky + Commit / Release Pipeline

## Summary

This package contains < tanstack effect > for [MG](https://github.com/mguleryuz).

Check out the [Changelog](./CHANGELOG.md) to see what changed in the last releases.

## Install

```bash
bun add tanstack-effect
```

Install Bun ( bun is the default package manager for this project ( its optional ) ):

```bash
# Supported on macOS, Linux, and WSL
curl -fsSL https://bun.sh/install | bash
# Upgrade Bun every once in a while
bun upgrade
```

## Usage

The library is designed for a typed server-client workflow using Effect's `HttpApi`.

1. Define your API on the server and generate the client type

```ts
// example/server.ts
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'
import { getTanstackEffectClient } from 'tanstack-effect'

export const UserSchema = Schema.Struct({
  username: Schema.String,
})

export const GetUserPathParams = Schema.Struct({
  username: Schema.String,
})

export const userGroup = HttpApiGroup.make('user')
  .add(
    HttpApiEndpoint.get('user', '/:username')
      .setPath(GetUserPathParams)
      .addSuccess(UserSchema)
  )
  .prefix('/user')

const ErrorResponse = Schema.Struct({
  message: Schema.String,
})

export const Api = HttpApi.make('Api')
  .addError(ErrorResponse, { status: 400 })
  .addError(ErrorResponse, { status: 401 })
  .addError(ErrorResponse, { status: 403 })
  .addError(ErrorResponse, { status: 404 })
  .addError(ErrorResponse, { status: 500 })
  .addError(ErrorResponse, { status: 503 })
  .addError(ErrorResponse, { status: 504 })
  .addError(ErrorResponse, { status: 429 })
  .addError(ErrorResponse, { status: 405 })
  .addError(ErrorResponse, { status: 406 })
  .addError(ErrorResponse, { status: 408 })
  .addError(ErrorResponse, { status: 409 })
  .add(userGroup)

export class TanstackEffectClient extends getTanstackEffectClient(Api) {}

export type TTanstackEffectClient = TanstackEffectClient['client']
```

2. Augment the `tanstack-effect` client interface in a `.d.ts`

Place a declaration file accessible to your app (e.g. `src/types/tanstack-effect.d.ts`) and ensure your `tsconfig.json` includes it.

```ts
// example/tanstack-effect.d.ts
import type { TTanstackEffectClient as Client } from './server'

declare module 'tanstack-effect' {
  interface TTanstackEffectClient extends Client {}
}
```

3. Use the client-safe hooks on the frontend

```tsx
// example/client.tsx
import { useEffectQuery } from 'tanstack-effect/client'

export default function Page() {
  const user = useEffectQuery(
    'user', // group key
    'user', // endpoint key
    { path: { username: 'test' } },
    { includeCredentials: true, noCache: false }
  )

  return (
    <div>
      <h1>User</h1>
      <p>{user.data?.username}</p>
    </div>
  )
}
```

Available client hooks:

- `useEffectQuery`
- `useEffectInfiniteQuery`
- `useEffectMutation`

Import them from `tanstack-effect/client`. The main entry `tanstack-effect` is server-safe and used to build the typed client from your `HttpApi` definition.

## Developing

Install Dependencies:

```bash
bun i
```

Watching TS Problems:

```bash
bun watch
```

Format / Lint / Type Check:

```bash
bun format
bun lint
bun type-check
```

## How to make a release

**For the Maintainer**: Add `NPM_TOKEN` to the GitHub Secrets.

1. PR with changes
2. Merge PR into main
3. Checkout main
4. `git pull`
5. `bun release: '' | alpha | beta` optionally add `-- --release-as minor | major | 0.0.1`
6. Make sure everything looks good (e.g. in CHANGELOG.md)
7. Lastly run `bun release:pub`
8. Done

## License

This package is licensed - see the [LICENSE](./LICENSE.md) file for details.

[ci-image]: https://badgen.net/github/checks/mguleryuz/tanstack-effect/main?label=ci
[ci-url]: https://github.com/mguleryuz/tanstack-effect/actions/workflows/ci.yaml
[npm-url]: https://npmjs.org/package/tanstack-effect
[twitter-url]: https://twitter.com/mgguleryuz
[twitter-image]: https://img.shields.io/twitter/follow/mgguleryuz.svg?label=follow+MG
[license-image]: https://img.shields.io/badge/License-Apache%20v2-blue
[license-url]: ./LICENSE.md
[npm-latest-image]: https://img.shields.io/npm/v/tanstack-effect/latest.svg
[npm-downloads-image]: https://img.shields.io/npm/dm/tanstack-effect.svg
