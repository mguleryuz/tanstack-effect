import { HttpApi, HttpApiClient, HttpApiGroup } from '@effect/platform'
import { Effect } from 'effect'

import { setApiClient } from './runner'

/**
 * @description Get the Tanstack Effect client
 * @param api - The HttpApi instance
 * @param baseUrl - The base URL for the client (default: '/api')
 * @returns The Tanstack Effect client
 */
export function getTanstackEffectClient<
  Id extends string,
  Groups extends HttpApiGroup.HttpApiGroup.Any,
  ApiError,
  ApiR,
>(
  api: HttpApi.HttpApi<Id, Groups, ApiError, ApiR>,
  baseUrl?: string
): new (_: never) => { client: HttpApiClient.Client<Groups, ApiError, never> }

export function getTanstackEffectClient<
  Id extends string,
  Groups extends HttpApiGroup.HttpApiGroup.Any,
  ApiError,
  ApiR,
>(api: HttpApi.HttpApi<Id, Groups, ApiError, ApiR>, baseUrl = '/api') {
  class TanstackEffectClient extends Effect.Service<TanstackEffectClient>()(
    'TanstackEffectClient',
    {
      effect: Effect.gen(function* () {
        return {
          client: yield* HttpApiClient.make(api, {
            baseUrl,
          }),
        }
      }),
    }
  ) {}

  setApiClient(TanstackEffectClient)

  return TanstackEffectClient
}

export * from './client'
export * from './error'
export * from './runner'
export * from './schema-form'
export * from './types'
export * from './util'
export * from './format'
