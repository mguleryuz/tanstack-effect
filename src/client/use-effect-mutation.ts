import type { UseMutationOptions } from '@tanstack/react-query'
import { useMutation } from '@tanstack/react-query'

import { apiEffectRunner } from '../runner'
import type {
  ApiCallOptions,
  GetCleanSuccessType,
  GetRequestParams,
  TTanstackEffectClient,
} from '../types'
import type { EffectHttpError } from './error'

/**
 * @description Create the Tanstack mutation helper with smart parameter handling
 * @param section
 * @param method
 * @param options - API call options and React Mutation options
 * @returns
 */
export function useEffectMutation<
  X extends keyof TTanstackEffectClient,
  Y extends keyof TTanstackEffectClient[X],
>(
  section: X,
  method: Y,
  options?: ApiCallOptions &
    Omit<
      UseMutationOptions<
        GetCleanSuccessType<X, Y>,
        EffectHttpError,
        GetRequestParams<X, Y> | undefined
      >,
      'mutationFn'
    >
) {
  const {
    includeCredentials = false,
    noCache = false,
    ...useMutationParams
  } = options || {}

  return useMutation({
    mutationFn: (params?: GetRequestParams<X, Y>) => {
      // Use empty object if no params provided
      const actualParams = params ?? ({} as GetRequestParams<X, Y>)
      return apiEffectRunner(
        section,
        method,
        actualParams,
        includeCredentials,
        noCache
      )
    },
    ...useMutationParams,
  })
}
