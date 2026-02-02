// You need to import the shared file for the routes to register in runtime
import './shared'

import {
  useEffectMutation,
  useEffectQuery,
  useSchemaForm,
} from 'tanstack-effect/client'

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

  const form = useSchemaForm({
    schema: UserSchema,
    initialData: user.data,
  })

  const updateUser = useEffectMutation('user', 'updateUser', {
    onSuccess: () => {
      console.log('Updated User')
    },
  })

  const handleSubmit = () => {
    if (!form.data || !user.data?.username) return
    updateUser.mutate({
      path: {
        username: user.data.username,
      },
      payload: form.data,
    })
  }

  return (
    <div className="space-y-4">
      <h1>User: {user.data?.username}</h1>
      <h1>Update User</h1>
      {/* Use form.fields, form.data, form.updateField, form.validationErrors
          to build your own form UI. See https://www.npmjs.com/package/liquidcn for a FormBuilder example. */}
      <button onClick={handleSubmit}>Update</button>
    </div>
  )
}
