import type { GetRequestParams, GetReturnType, PromiseSuccess } from '@/types'
import { FetchHttpClient } from '@effect/platform'
import { Effect, Layer } from 'effect'

import { EffectHttpError } from './error'

type TanstackEffectClient = any
let ApiClient: TanstackEffectClient

// Create custom HttpClient layers with proper fetch configuration
const createHttpClientLayer = (
  includeCredentials: boolean,
  noCache: boolean
) => {
  return FetchHttpClient.layer.pipe(
    Layer.provide(
      Layer.succeed(
        FetchHttpClient.Fetch,
        FetchHttpClient.Fetch.of(((
          input: RequestInfo | URL,
          init?: RequestInit | undefined
        ) => {
          const headers = new Headers(init?.headers)

          if (noCache) {
            headers.set('X-No-Cache', 'true')
          }

          return fetch(input, {
            ...init,
            credentials: includeCredentials ? 'include' : 'same-origin',
            headers,
          })
        }) as typeof fetch)
      )
    )
  )
}

/**
 * @description The api effect function
 * @param section
 * @param method
 * @param params
 * @returns
 */
export function apiEffect<
  X extends keyof TanstackEffectClient,
  Y extends keyof TanstackEffectClient[X],
>(section: X, method: Y, params: GetRequestParams<X, Y>): GetReturnType<X, Y> {
  const res = Effect.gen(function* () {
    const { client } = yield* ApiClient
    const sectionObj = client[section]
    const methodFn = sectionObj[method]
    if (typeof methodFn !== 'function') {
      throw new Error(
        `Method ${String(section)}.${String(method)} is not a function`
      )
    }
    return yield* (methodFn as any)(params)
  }) as GetReturnType<X, Y>
  return res
}

/**
 * @description Create a function that given the group, method name and params returns a Promise that queries the API
 * @param section
 * @param method
 * @param params
 * @param includeCredentials - Whether to include credentials in the request (default: false)
 * @param noCache - Whether to bypass cache with X-No-Cache header (default: false)
 * @returns PromiseSuccess
 */
export function apiEffectRunner<
  X extends keyof TanstackEffectClient,
  Y extends keyof TanstackEffectClient[X],
>(
  section: X,
  method: Y,
  params: GetRequestParams<X, Y>,
  includeCredentials = false,
  noCache = false
): PromiseSuccess<X, Y> {
  const program = apiEffect(section, method, params)
  const httpLayer = createHttpClientLayer(includeCredentials, noCache)
  const apiLayer = ApiClient.Default.pipe(Layer.provide(httpLayer))

  return Effect.runPromise(
    program.pipe(
      Effect.provide(apiLayer),
      Effect.mapError((error) => new EffectHttpError(error))
    )
  )
}

export function setApiClient(client: TanstackEffectClient) {
  ApiClient = client
}
