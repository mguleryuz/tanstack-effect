<div align="center">

[![npm latest package][npm-latest-image]][npm-url]
[![Build Status][ci-image]][ci-url]
[![License][license-image]][license-url]
[![npm downloads][npm-downloads-image]][npm-url]
[![Follow on Twitter][twitter-image]][twitter-url]

</div>

## Tanstack Effect

Bun + Npm + Typescript + Standard Version + Flat Config Linting + Husky + Commit / Release Pipeline
OpenAPI + Swagger UI + Tanstack Query + Effect Schemas

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
// You need to import the shared file for the routes to register in runtime
import './shared'

import {
  useEffectMutation,
  useEffectQuery,
  useSchemaForm,
} from 'tanstack-effect/client'

import { FormBuilder } from './form-builder'
import { UserSchema } from './shared'

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

### Schema-driven forms (Form Builder + Hook)

Build forms directly from your Effect `Schema`:

- `useSchemaForm` hook manages form state, validation, and field updates
- `example/form-builder.tsx` is a reference UI that you can copy

Using the example `FormBuilder` UI:

- Copy `example/form-builder.tsx` into your app (e.g. `src/components/form-builder.tsx`).
- Replace the placeholder UI elements (`Input`, `Textarea`, `Switch`, `Card`, `Badge`, etc.) with your preferred UI library.
- We use `shadcn/ui` in our app, but any UI kit works. The builder expects standard `value`, `onChange`, and basic layout components.
- Supports nested objects, labels, descriptions, simple validation error display, and optional collapsing.

This lets you infer form fields directly from your schema without maintaining separate field configs.

#### Important: Schema Annotations with `optionalWith`

When using `Schema.optionalWith()` for optional fields with defaults, annotations must be placed on the **inner Schema type**, not on the `optionalWith` result. This is due to how Effect Schema handles `PropertySignature` annotations internally.

**Correct pattern (annotations preserved):**

```ts
import { Schema } from 'effect'

const MySchema = Schema.Struct({
  // ✅ Annotations on the inner Schema type - WORKS
  maxItems: Schema.optionalWith(
    Schema.Number.annotations({
      title: 'Max Items',
      description: 'Maximum number of items to process',
    }),
    { default: () => 50 }
  ),

  // ✅ Using a pre-defined annotated Schema - WORKS
  logLevel: Schema.optionalWith(LogLevel, { default: () => 'info' }),
})
```

**Incorrect pattern (annotations lost):**

```ts
const MySchema = Schema.Struct({
  // ❌ Annotations on optionalWith result - DOES NOT WORK
  maxItems: Schema.optionalWith(Schema.Number, {
    default: () => 50,
  }).annotations({
    title: 'Max Items',
    description: 'Maximum number of items to process',
  }),
})
```

This limitation exists because `Schema.optionalWith()` returns a `PropertySignature`, and calling `.annotations()` on a `PropertySignature` doesn't store annotations in the AST in an accessible way. By placing annotations on the inner Schema type, the annotations are preserved and can be extracted by the form builder.

2. Define your API on the shared file and generate the client type

<!-- BEGIN:shared -->
```ts
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'
import { getTanstackEffectClient } from 'tanstack-effect'

// Base user schema - i.e. the schema which would be in the database
export const UserSchema = Schema.Struct({
  username: Schema.String,
  name: Schema.String,
  surname: Schema.String,
  email: Schema.String,
})

// Path params for the user endpoint
export const GetUserPathParams = Schema.Struct({
  username: Schema.String,
})

// Update user request - i.e. the schema which would be sent to the server
export const UpdateUserRequest = Schema.partial(UserSchema)

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
<!-- END:shared -->

3. Augment the `tanstack-effect` client interface in a `.d.ts`

Place a declaration file accessible to your app (e.g. `src/types/tanstack-effect.d.ts`) and ensure your `tsconfig.json` includes it.

<!-- BEGIN:d.ts -->
```ts
import type { TTanstackEffectClient as Client } from './shared'

declare module 'tanstack-effect' {
  interface TTanstackEffectClient extends Client {}
}
```
<!-- END:d.ts -->

4. Set up the route for the API (required)

<!-- BEGIN:user -->
```ts
import type { GetCleanSuccessType, GetRequestParams } from 'tanstack-effect'

// Mock Hono class / for demonstration purposes
class Hono {
  [key: string]: any
}

// Minimal mock server to serve the OpenAPI spec
const app = new Hono()

// Get user route like its defined in the schema
app.get('/user/:username', async (c: any) => {
  const { username } = c.req.param()

  // Some function to get the user
  const request = async (
    params: GetRequestParams<'user', 'user'>
  ): Promise<GetCleanSuccessType<'user', 'user'>> => {
    // Some logic to get the user
    return {} as any
  }

  const user = await request({
    path: {
      username,
    },
  })

  return c.json(user)
})

// Update user route like its defined in the schema
app.put('/user/:username', async (c: any) => {
  const { username } = c.req.param()
  const body: GetRequestParams<'user', 'updateUser'>['payload'] =
    await c.req.json()

  // Some function to update the user
  const request = async (
    params: GetRequestParams<'user', 'updateUser'>
  ): Promise<GetCleanSuccessType<'user', 'updateUser'>> => {
    // Some logic to update the user
    return {} as any
  }

  const updatedUser = await request({
    path: {
      username,
    },
    payload: body,
  })

  return c.json(updatedUser)
})

export default app
```
<!-- END:user -->

5. Set up OpenAPI documentation (optional)

<!-- BEGIN:openapi -->
```ts
import { OpenApi } from '@effect/platform'

// Importing TanstackEffectClient to mirror real-world usage where this is the API import equivalent
import { Api } from './shared'

// Mock Hono class / for demonstration purposes
class Hono {
  [key: string]: any
}

// Minimal mock server to serve the OpenAPI spec
const app = new Hono()

app.get('/docs/openapi.json', (c: any) => {
  const spec = OpenApi.fromApi(Api)
  return c.json(spec)
})

app.get('/docs', (c: any) =>
  c.html(`
    <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="SwaggerUI" />
  <title>SwaggerUI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
<script>
  window.onload = () => {
    window.ui = SwaggerUIBundle({
      url: '/docs/openapi.json',
      dom_id: '#swagger-ui',
    });
  };
</script>
</body>
</html>`)
)

export default {
  port: 8080,
  fetch: app.fetch,
}
```
<!-- END:openapi -->

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
