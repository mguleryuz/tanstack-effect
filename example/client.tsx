// You need to import the shared file for the routes to register in runtime
import './shared'

import {
  useEffectMutation,
  useEffectQuery,
  useSchemaForm,
} from 'tanstack-effect/client'

import { FormBuilder } from './form-builder'
import { UserSchema } from './shared'

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

  const form = useSchemaForm<typeof UserSchema.Type>({
    schema: UserSchema,
    initialData: user.data,
  })

  const updateUser = useEffectMutation('user', 'updateUser', {
    onSuccess: () => {
      console.log('Updated User')
    },
  })

  return (
    <div className="space-y-4">
      <h1>User: {user.data?.username}</h1>
      <h1>Update User</h1>
      <FormBuilder
        form={{
          ...form,
          // We can extend the form object to add custom logic
          setData: (data) => {
            // We can call the original setData method to update the form data
            form.setData(data)
            // We can also call the updateUser mutation to update the user
            if (!data || !user.data?.username) return
            updateUser.mutate({
              path: {
                username: user.data.username,
              },
              payload: data,
            })
          },
        }}
      />
    </div>
  )
}
