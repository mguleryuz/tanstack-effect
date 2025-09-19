import { HttpApi, HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'
import { getTanstackEffectClient } from 'tanstack-effect'

// Base user schema - i.e. the schema which would be in the database
export const UserSchema = Schema.Struct({
  username: Schema.String,
  name: Schema.String,
  surname: Schema.String,
  email: Schema.String,
})

// Path params for the user endpoint
export const GetUserPathParams = Schema.Struct({
  username: Schema.String,
})

// Update user request - i.e. the schema which would be sent to the server
export const UpdateUserRequest = Schema.partial(UserSchema)

export const userGroup = HttpApiGroup.make('user')
  .add(
    HttpApiEndpoint.get('user', '/:username')
      .setPath(GetUserPathParams)
      .addSuccess(UserSchema)
  )
  .add(
    HttpApiEndpoint.put('updateUser', '/:username')
      .setPath(GetUserPathParams)
      .setPayload(UpdateUserRequest)
      .addSuccess(UserSchema)
  )
  .prefix('/user')

const ErrorResponse = Schema.Struct({
  message: Schema.String,
})

// Define the API contract
export const Api = HttpApi.make('Api')
  // Define global errors that apply to all endpoints
  .addError(ErrorResponse, { status: 400 }) // Bad Request
  .addError(ErrorResponse, { status: 401 }) // Unauthorized
  .addError(ErrorResponse, { status: 403 }) // Forbidden
  .addError(ErrorResponse, { status: 404 }) // Not Found
  .addError(ErrorResponse, { status: 500 }) // Internal Server Error
  .addError(ErrorResponse, { status: 503 }) // Service Unavailable
  .addError(ErrorResponse, { status: 504 }) // Gateway Timeout
  .addError(ErrorResponse, { status: 429 }) // Too Many Requests
  .addError(ErrorResponse, { status: 405 }) // Method Not Allowed
  .addError(ErrorResponse, { status: 406 }) // Not Acceptable
  .addError(ErrorResponse, { status: 408 }) // Request Timeout
  .addError(ErrorResponse, { status: 409 }) // Conflict
  .add(userGroup)

export class TanstackEffectClient extends getTanstackEffectClient(Api) {}

export type TTanstackEffectClient = TanstackEffectClient['client']
