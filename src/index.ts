import { HttpApi, HttpApiClient } from '@effect/platform'
import { Effect } from 'effect'

/**
 * @description Get the Tanstack Effect client
 * @param api - The HttpApi instance
 * @param baseUrl - The base URL for the client (default: '/api')
 * @returns The Tanstack Effect client
 */
export function getTanstackEffectClient<
  T extends ReturnType<typeof HttpApi.make>,
>(api: T, baseUrl = '/api') {
  return class TanstackEffectClient extends Effect.Service<TanstackEffectClient>()(
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
}

export * from './types'
