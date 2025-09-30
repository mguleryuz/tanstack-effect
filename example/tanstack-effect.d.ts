import type { TTanstackEffectClient as Client } from './shared'

declare module 'tanstack-effect' {
  interface TTanstackEffectClient extends Client {}
}
