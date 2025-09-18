import type { GetRequestParams } from '@/types'

type TanstackEffectClient = any

/**
 * @description Create the Tanstack query key
 * @param section
 * @param method
 * @param params
 * @param includeCredentials - Whether credentials are included (affects cache key)
 * @returns
 */
export function getQueryKey<
  X extends keyof TanstackEffectClient,
  Y extends keyof TanstackEffectClient[X],
>(
  section: X,
  method: Y,
  params: GetRequestParams<X, Y>,
  includeCredentials = false,
  noCache = false
) {
  return [section, method, params, includeCredentials, noCache] as const
}
