# Generate Mocks and TypeScript Types from Google Docs API Specification

This guide explains how to generate MSW mocks and TypeScript type definitions (`api.d.ts`) in the frontend folder from a Google Docs API specification.

## Prerequisites

- Node.js installed
- Access to Google Docs API specification (as JSON format)

## Quick Start

### Step 1: Export API Specification from Google Docs

Export your API specification from Google Docs as JSON. The expected format is:

```json
{
  "apis": [
    {
      "method": "GET|POST|PUT|DELETE|PATCH",
      "path": "/api/endpoint",
      "requestBody": { ... },  // Optional, for POST/PUT/PATCH
      "response": { ... },
      "statusCode": 200        // Optional, defaults to 200
    }
  ]
}
```

### Step 2: Run the Generation Script

From the project root directory, run:

```bash
# Using a local JSON file
node scripts/generate-from-docs.js ./scripts/example-api-spec.json

# Using a Google Docs export URL (JSON format)
node scripts/generate-from-docs.js https://docs.google.com/document/d/xxx/export?format=json
```

### Step 3: Generated Files

The script will generate:

1. **`frontend/src/mocks/handlers.ts`** - MSW handlers for all API endpoints
2. **`frontend/src/api.d.ts`** - TypeScript type definitions for requests and responses

## API Specification Format

Each API endpoint should follow this structure:

```json
{
  "method": "GET",
  "path": "/api/users/{id}",
  "requestBody": {
    "name": "string",
    "email": "string"
  },
  "response": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  },
  "statusCode": 200
}
```

### Field Descriptions

- **`method`** (required): HTTP method (GET, POST, PUT, DELETE, PATCH)
- **`path`** (required): API endpoint path. Use `{paramName}` for path parameters (e.g., `/api/users/{id}`)
- **`requestBody`** (optional): Request body schema for POST/PUT/PATCH requests
- **`response`** (required): Response body schema
- **`statusCode`** (optional): HTTP status code, defaults to 200

## Generated Output Examples

### MSW Handlers (`frontend/src/mocks/handlers.ts`)

```typescript
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/api/users', () => {
    return HttpResponse.json([...])
  }),
  
  http.get('/api/users/:id', ({ params }) => {
    return HttpResponse.json({...})
  }),
  
  http.post('/api/users', async ({ request }) => {
    const body = await request.json() as UsersRequest
    return HttpResponse.json({...}, { status: 201 })
  })
]
```

### TypeScript Types (`frontend/src/api.d.ts`)

```typescript
export interface UsersResponse {
  id: number
  name: string
  email: string
}

export interface UsersRequest {
  name: string
  email: string
}

export interface ApiEndpoints {
  getUsers: () => Promise<UsersResponse[]>
  getUsersById: () => Promise<UsersResponse>
  postUsers: (body: UsersRequest) => Promise<UsersResponse>
}
```

## Integration with n8n Workflow

If you're using n8n to fetch data from Google Docs:

1. Use n8n's Google Docs node to fetch the document
2. Parse the document content to extract API specifications
3. Format the data as JSON matching the expected schema
4. Save to a file or pass directly to the script
5. Run the generation script

Example n8n workflow step:

```javascript
// In n8n Code node
const apiSpec = {
  apis: items.map(item => ({
    method: item.json.method,
    path: item.json.path,
    requestBody: item.json.requestBody,
    response: item.json.response,
    statusCode: item.json.statusCode || 200
  }))
}

return [{ json: apiSpec }]
```

## Troubleshooting

### Error: Invalid API specification format

Make sure your JSON file has the correct structure with an `apis` array.

### Path parameters not working

Use `{paramName}` format in your path (e.g., `/api/users/{id}`). The script will automatically convert it to MSW's `:paramName` format.

### Types not generating correctly

Ensure your `requestBody` and `response` objects are valid JSON schemas. The script uses these to generate TypeScript interfaces.

## Notes

- The script automatically creates necessary directories if they don't exist
- Existing `handlers.ts` and `api.d.ts` files will be overwritten
- Path parameters in the format `{id}` are converted to MSW's `:id` format
- Type names are generated from the endpoint path (e.g., `/api/users` → `UsersResponse`)
