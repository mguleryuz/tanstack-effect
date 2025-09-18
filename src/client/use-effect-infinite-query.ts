'use client'

import type { UseInfiniteQueryOptions } from '@tanstack/react-query'
import { useInfiniteQuery } from '@tanstack/react-query'

import type { EffectHttpError } from '../error'
import { apiEffectRunner } from '../runner'
import type {
  ApiCallOptions,
  GetCleanSuccessType,
  GetRequestParams,
  TTanstackEffectClient,
} from '../types'

/**
 * @description Create the Tanstack infinite query helper for paginated data
 * @param section
 * @param method
 * @param params - Base parameters (without page/limit)
 * @param options - API call options and React Infinite Query options
 * @returns
 */
export function useEffectInfiniteQuery<
  X extends keyof TTanstackEffectClient,
  Y extends keyof TTanstackEffectClient[X],
  TPageParam = number,
>(
  section: X,
  method: Y,
  params: Omit<GetRequestParams<X, Y>, 'urlParams'> & {
    urlParams?: Omit<
      GetRequestParams<X, Y> extends { urlParams: infer U } ? U : never,
      'page' | 'limit'
    >
  },
  options?: ApiCallOptions &
    Omit<
      UseInfiniteQueryOptions<
        GetCleanSuccessType<X, Y>,
        EffectHttpError,
        GetCleanSuccessType<X, Y>,
        any[],
        TPageParam
      >,
      'queryKey' | 'queryFn' | 'getNextPageParam' | 'initialPageParam'
    > & {
      /**
       * Number of items per page
       */
      limit?: number
      /**
       * Custom function to get next page parameter from last page
       */
      getNextPageParam?: (
        lastPage: GetCleanSuccessType<X, Y>,
        allPages: GetCleanSuccessType<X, Y>[],
        lastPageParam: TPageParam
      ) => TPageParam | undefined | null
      /**
       * Initial page parameter
       */
      initialPageParam?: TPageParam
    }
) {
  const {
    includeCredentials = false,
    noCache = false,
    limit = 10,
    getNextPageParam,
    initialPageParam,
    ...useInfiniteQueryParams
  } = options || {}

  // Default next page parameter function for standard pagination
  const defaultGetNextPageParam = (lastPage: any, lastPageParam: any) => {
    // Assume the response has pagination info
    const pagination = lastPage?.pagination
    if (pagination?.has_next_page) {
      return typeof lastPageParam === 'number'
        ? lastPageParam + 1
        : pagination.current_page + 1
    }
    return undefined
  }

  // Default initial page parameter
  const defaultInitialPageParam = 1 as TPageParam

  return useInfiniteQuery({
    queryKey: [section, method, params, includeCredentials, noCache, limit],
    queryFn: ({ pageParam }) => {
      const queryParams = {
        ...params,
        urlParams: {
          ...params.urlParams,
          page: pageParam,
          limit,
        },
      } as GetRequestParams<X, Y>

      return apiEffectRunner(
        section,
        method,
        queryParams,
        includeCredentials,
        noCache
      )
    },
    getNextPageParam: getNextPageParam || defaultGetNextPageParam,
    initialPageParam: initialPageParam || defaultInitialPageParam,
    ...useInfiniteQueryParams,
  })
}
