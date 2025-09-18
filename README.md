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

1. Use the client-safe hooks on the frontend

<!-- BEGIN:client -->
```tsx
import {
  useEffectMutation,
  useEffectQuery,
  useSchemaForm,
} from 'tanstack-effect/client'

import { FormBuilder } from './form-builder'
import { UserSchema } from './server'

export default function Page() {
  const user = useEffectQuery(
    'user',
    'user',
    {
      path: {
        username: 'test',
      },
    },
    {
      includeCredentials: true,
      noCache: false,
    }
  )

  const form = useSchemaForm<typeof UserSchema.Type>({
    schema: UserSchema,
    initialData: user.data,
  })

  const updateUser = useEffectMutation('user', 'updateUser', {
    onSuccess: () => {
      console.log('Updated User')
    },
  })

  return (
    <div className="space-y-4">
      <h1>User: {user.data?.username}</h1>
      <h1>Update User</h1>
      <FormBuilder
        form={{
          ...form,
          // We can extend the form object to add custom logic
          setData: (data) => {
            // We can call the original setData method to update the form data
            form.setData(data)
            // We can also call the updateUser mutation to update the user
            if (!data || !user.data?.username) return
            updateUser.mutate({
              path: {
                username: user.data.username,
              },
              payload: data,
            })
          },
        }}
      />
    </div>
  )
}
```
<!-- END:client -->

Available client hooks:

- `useEffectQuery`
- `useEffectInfiniteQuery`
- `useEffectMutation`
- `useSchemaForm`

Import them from `tanstack-effect/client`. The main entry `tanstack-effect` is server-safe and used to build the typed client from your `HttpApi` definition.

2. Define your API on the server and generate the client type

<!-- BEGIN:server -->
```ts
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'
import { getTanstackEffectClient } from 'tanstack-effect'

export const UserSchema = Schema.Struct({
  username: Schema.String,
  name: Schema.String,
  surname: Schema.String,
  email: Schema.String,
})

export const GetUserPathParams = Schema.Struct({
  username: Schema.String,
})

export const UpdateUserRequest = Schema.Struct({
  username: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  surname: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
})

export const userGroup = HttpApiGroup.make('user')
  .add(
    HttpApiEndpoint.get('user', '/:username')
      .setPath(GetUserPathParams)
      .addSuccess(UserSchema)
  )
  .add(
    HttpApiEndpoint.put('updateUser', '/:username')
      .setPath(GetUserPathParams)
      .setPayload(UpdateUserRequest)
      .addSuccess(UserSchema)
  )
  .prefix('/user')

const ErrorResponse = Schema.Struct({
  message: Schema.String,
})

// Define the API contract
export const Api = HttpApi.make('Api')
  // Define global errors that apply to all endpoints
  .addError(ErrorResponse, { status: 400 }) // Bad Request
  .addError(ErrorResponse, { status: 401 }) // Unauthorized
  .addError(ErrorResponse, { status: 403 }) // Forbidden
  .addError(ErrorResponse, { status: 404 }) // Not Found
  .addError(ErrorResponse, { status: 500 }) // Internal Server Error
  .addError(ErrorResponse, { status: 503 }) // Service Unavailable
  .addError(ErrorResponse, { status: 504 }) // Gateway Timeout
  .addError(ErrorResponse, { status: 429 }) // Too Many Requests
  .addError(ErrorResponse, { status: 405 }) // Method Not Allowed
  .addError(ErrorResponse, { status: 406 }) // Not Acceptable
  .addError(ErrorResponse, { status: 408 }) // Request Timeout
  .addError(ErrorResponse, { status: 409 }) // Conflict
  .add(userGroup)

export class TanstackEffectClient extends getTanstackEffectClient(Api) {}

export type TTanstackEffectClient = TanstackEffectClient['client']
```
<!-- END:server -->

3. Augment the `tanstack-effect` client interface in a `.d.ts`

Place a declaration file accessible to your app (e.g. `src/types/tanstack-effect.d.ts`) and ensure your `tsconfig.json` includes it.

<!-- BEGIN:d.ts -->
```ts
import type { TTanstackEffectClient as Client } from './server'

declare module 'tanstack-effect' {
  interface TTanstackEffectClient extends Client {}
}
```
<!-- END:d.ts -->

### Schema-driven forms (Form Builder + Hook)

Build forms directly from your Effect `Schema`:

- `useSchemaForm` hook manages form state, validation, and field updates
- `generateFormFieldsWithSchemaAnnotations(data, schema)` generates field metadata from your schema
- `example/form-builder.tsx` is a reference UI that you can copy

Using the example `FormBuilder` UI:

- Copy `tanstack-effect/example/form-builder.tsx` into your app (e.g. `src/components/form-builder.tsx`).
- Replace the placeholder UI elements (`Input`, `Textarea`, `Switch`, `Card`, `Badge`, etc.) with your preferred UI library.
- We use `shadcn/ui` in our app, but any UI kit works. The builder expects standard `value`, `onChange`, and basic layout components.
- Supports nested objects, labels, descriptions, simple validation error display, and optional collapsing.

This lets you infer form fields directly from your schema without maintaining separate field configs.

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
