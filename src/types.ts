import type { HttpClientResponse } from '@effect/platform'
import type { Effect } from 'effect'

type TanstackEffectClient = any

/**
 * @description Get the request params
 * @param X - The key of the Tanstack Effect client
 * @param Y - The key of the Tanstack Effect client[X]
 * @returns The request params
 */
export type GetRequestParams<
  X extends keyof TanstackEffectClient,
  Y extends keyof TanstackEffectClient[X],
> = TanstackEffectClient[X][Y] extends (...args: any[]) => any
  ? Parameters<TanstackEffectClient[X][Y]>[0]
  : never

/**
 * @description Get the return type
 * @param X - The key of the Tanstack Effect client
 * @param Y - The key of the Tanstack Effect client[X]
 * @returns The return type
 */
export type GetReturnType<
  X extends keyof TanstackEffectClient,
  Y extends keyof TanstackEffectClient[X],
> = TanstackEffectClient[X][Y] extends (...args: any[]) => any
  ? ReturnType<TanstackEffectClient[X][Y]>
  : never

/**
 * @description Exclude the HttpResponse tuple
 * @param T - The type to exclude the HttpResponse tuple from
 * @returns The type without the HttpResponse tuple
 */
export type ExcludeHttpResponseTuple<T> = Exclude<
  T,
  readonly [any, HttpClientResponse.HttpClientResponse]
>

/**
 * @description Get the clean success type
 * @param X - The key of the Tanstack Effect client
 * @param Y - The key of the Tanstack Effect client[X]
 * @returns The clean success type
 */
export type GetCleanSuccessType<
  X extends keyof TanstackEffectClient,
  Y extends keyof TanstackEffectClient[X],
> = ExcludeHttpResponseTuple<Effect.Effect.Success<GetReturnType<X, Y>>>

/**
 * @description Get the promise success type
 * @param X - The key of the Tanstack Effect client
 * @param Y - The key of the Tanstack Effect client[X]
 * @returns The promise success type
 */
export type PromiseSuccess<
  X extends keyof TanstackEffectClient,
  Y extends keyof TanstackEffectClient[X],
> = Promise<GetCleanSuccessType<X, Y>>

/**
 * @description Options for API calls
 */
export interface ApiCallOptions {
  /**
   * @description Whether to include credentials (cookies) in the request
   * @default false
   */
  includeCredentials?: boolean
  /**
   * @description Whether to bypass cache by setting X-No-Cache header
   * @default false
   */
  noCache?: boolean
}
