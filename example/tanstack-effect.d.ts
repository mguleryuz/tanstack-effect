import type { TTanstackEffectClient as Client } from './server'

declare module 'tanstack-effect' {
  interface TTanstackEffectClient extends Client {}
}
