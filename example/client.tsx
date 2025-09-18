import { useEffectQuery } from 'tanstack-effect/client'

export default function Page() {
  const user = useEffectQuery(
    'user',
    'user',
    {
      path: {
        username: 'test',
      },
    },
    {
      includeCredentials: true,
      noCache: false,
    }
  )

  return (
    <div>
      <h1>User</h1>
      <p>{user.data?.username}</p>
    </div>
  )
}
