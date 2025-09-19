import type { GetCleanSuccessType, GetRequestParams } from 'tanstack-effect'

// Mock Hono class / for demonstration purposes
class Hono {
  [key: string]: any
}

// Minimal mock server to serve the OpenAPI spec
const app = new Hono()

// Get user route like its defined in the schema
app.get('/user/:username', async (c: any) => {
  const { username } = c.req.param()

  // Some function to get the user
  const request = async (
    params: GetRequestParams<'user', 'user'>
  ): Promise<GetCleanSuccessType<'user', 'user'>> => {
    // Some logic to get the user
    return {} as any
  }

  const user = await request({
    path: {
      username,
    },
  })

  return c.json(user)
})

// Update user route like its defined in the schema
app.put('/user/:username', async (c: any) => {
  const { username } = c.req.param()
  const body: GetRequestParams<'user', 'updateUser'>['payload'] =
    await c.req.json()

  // Some function to update the user
  const request = async (
    params: GetRequestParams<'user', 'updateUser'>
  ): Promise<GetCleanSuccessType<'user', 'updateUser'>> => {
    // Some logic to update the user
    return {} as any
  }

  const updatedUser = await request({
    path: {
      username,
    },
    payload: body,
  })

  return c.json(updatedUser)
})

export default app
