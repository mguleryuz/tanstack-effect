import type {
  ApiCallOptions,
  GetCleanSuccessType,
  GetRequestParams,
  TTanstackEffectClient,
} from '@/types'
import type { UseQueryOptions } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'

import { apiEffectRunner } from '../runner'
import { EffectHttpError } from './error'

/**
 * @description Create the Tanstack query helper with proper initialData type inference
 * Overloads 1: When initialData is provided, data is non-nullable
 * @param section
 * @param method
 * @param params
 * @param options - API call options and React Query options
 * @returns
 */
export function useEffectQuery<
  X extends keyof TTanstackEffectClient,
  Y extends keyof TTanstackEffectClient[X],
>(
  section: X,
  method: Y,
  params: GetRequestParams<X, Y>,
  options: ApiCallOptions &
    Omit<
      UseQueryOptions<GetCleanSuccessType<X, Y>, EffectHttpError>,
      'queryKey' | 'queryFn'
    > & {
      initialData: GetCleanSuccessType<X, Y> | (() => GetCleanSuccessType<X, Y>)
    }
): Omit<
  ReturnType<typeof useQuery<GetCleanSuccessType<X, Y>, EffectHttpError>>,
  'data'
> & {
  data: GetCleanSuccessType<X, Y>
}

// Overload 2: When initialData is not provided, data is nullable
export function useEffectQuery<
  X extends keyof TTanstackEffectClient,
  Y extends keyof TTanstackEffectClient[X],
>(
  section: X,
  method: Y,
  params: GetRequestParams<X, Y>,
  options?: ApiCallOptions &
    Omit<
      UseQueryOptions<GetCleanSuccessType<X, Y>, EffectHttpError>,
      'queryKey' | 'queryFn'
    >
): ReturnType<typeof useQuery<GetCleanSuccessType<X, Y>, EffectHttpError>>

// Implementation
export function useEffectQuery<
  X extends keyof TTanstackEffectClient,
  Y extends keyof TTanstackEffectClient[X],
>(
  section: X,
  method: Y,
  params: GetRequestParams<X, Y>,
  options?: ApiCallOptions &
    Omit<
      UseQueryOptions<GetCleanSuccessType<X, Y>, EffectHttpError>,
      'queryKey' | 'queryFn'
    >
) {
  const {
    includeCredentials = false,
    noCache = false,
    ...useQueryParams
  } = options || {}

  return useQuery({
    queryKey: [section, method, params, includeCredentials, noCache],
    queryFn: () =>
      apiEffectRunner(section, method, params, includeCredentials, noCache),
    ...useQueryParams,
  })
}
