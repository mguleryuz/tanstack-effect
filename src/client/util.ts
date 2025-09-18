import type { GetRequestParams, TTanstackEffectClient } from '../types'

/**
 * @description Create the Tanstack query key
 * @param section
 * @param method
 * @param params
 * @param includeCredentials - Whether credentials are included (affects cache key)
 * @returns
 */
export function getQueryKey<
  X extends keyof TTanstackEffectClient,
  Y extends keyof TTanstackEffectClient[X],
>(
  section: X,
  method: Y,
  params: GetRequestParams<X, Y>,
  includeCredentials = false,
  noCache = false
) {
  return [section, method, params, includeCredentials, noCache] as const
}
