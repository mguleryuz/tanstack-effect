import { OpenApi } from '@effect/platform'

// Importing TanstackEffectClient to mirror real-world usage where this is the API import equivalent
import { Api } from './shared'

// Mock Hono class / for demonstration purposes
class Hono {
  [key: string]: any
}

// Minimal mock server to serve the OpenAPI spec
const app = new Hono()

app.get('/docs/openapi.json', (c: any) => {
  const spec = OpenApi.fromApi(Api)
  return c.json(spec)
})

app.get('/docs', (c: any) =>
  c.html(`
    <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="SwaggerUI" />
  <title>SwaggerUI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
<script>
  window.onload = () => {
    window.ui = SwaggerUIBundle({
      url: '/docs/openapi.json',
      dom_id: '#swagger-ui',
    });
  };
</script>
</body>
</html>`)
)

export default {
  port: 8080,
  fetch: app.fetch,
}
