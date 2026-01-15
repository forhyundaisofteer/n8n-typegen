#!/usr/bin/env node

/**
 * Generate mocks and TypeScript types from Google Docs API specification
 * 
 * Usage:
 *   node scripts/generate-from-docs.js <google-docs-url-or-file-path>
 * 
 * Example:
 *   node scripts/generate-from-docs.js https://docs.google.com/document/d/xxx
 *   node scripts/generate-from-docs.js ./api-spec.json
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FRONTEND_DIR = join(__dirname, '..', 'frontend')
const MOCKS_DIR = join(FRONTEND_DIR, 'src', 'mocks')
const TYPES_DIR = join(FRONTEND_DIR, 'src')

/**
 * Parse API specification from Google Docs or JSON file
 * Expected format:
 * {
 *   "apis": [
 *     {
 *       "method": "GET|POST|PUT|DELETE|PATCH",
 *       "path": "/api/users",
 *       "requestBody": { ... },
 *       "response": { ... },
 *       "statusCode": 200
 *     }
 *   ]
 * }
 */
async function parseApiSpec(source) {
  // If it's a URL, fetch it (requires Google Docs API or export)
  if (source.startsWith('http')) {
    console.log('Fetching from URL:', source)
    // TODO: Implement Google Docs API integration
    // For now, assume it's a JSON export URL
    const response = await fetch(source)
    return await response.json()
  }
  
  // If it's a file path, read it
  const filePath = source.startsWith('/') ? source : join(process.cwd(), source)
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

/**
 * Generate MSW handlers from API specification
 */
function generateHandlers(apis) {
  const imports = "import { http, HttpResponse } from 'msw'\n\n"
  
  const handlers = apis.map(api => {
    const { method, path, response, statusCode = 200, requestBody } = api
    const methodLower = method.toLowerCase()
    
    // Convert path params (e.g., /api/users/:id)
    const pathWithParams = path.replace(/\{(\w+)\}/g, ':$1')
    
    // Generate handler based on method
    if (methodLower === 'get') {
      if (path.includes('{') || path.includes(':')) {
        return `  // ${method} ${path}
  http.${methodLower}('${pathWithParams}', ({ params }) => {
    return HttpResponse.json(${JSON.stringify(response, null, 2)})
  })`
      } else {
        return `  // ${method} ${path}
  http.${methodLower}('${path}', () => {
    return HttpResponse.json(${JSON.stringify(response, null, 2)})
  })`
      }
    } else if (['post', 'put', 'patch'].includes(methodLower)) {
      const bodyType = requestBody ? `as ${generateTypeName(path, 'Request')}` : ''
      return `  // ${method} ${path}
  http.${methodLower}('${pathWithParams}', async ({ params, request }) => {
    ${requestBody ? `const body = await request.json() ${bodyType}` : ''}
    return HttpResponse.json(
      ${JSON.stringify(response, null, 6)},
      { status: ${statusCode} }
    )
  })`
    } else if (methodLower === 'delete') {
      return `  // ${method} ${path}
  http.${methodLower}('${pathWithParams}', ({ params }) => {
    return HttpResponse.json(
      ${JSON.stringify(response, null, 6)},
      { status: ${statusCode} }
    )
  })`
    }
  }).join(',\n\n')
  
  return `${imports}// Auto-generated handlers from API specification
export const handlers = [
${handlers}
]
`
}

/**
 * Convert JSON schema to TypeScript interface
 */
function jsonToTypeScript(value, indent = 0) {
  const spaces = '  '.repeat(indent)
  
  if (value === null) {
    return 'null'
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'any[]'
    }
    const itemType = jsonToTypeScript(value[0], indent)
    // Check if itemType is already an object type
    if (itemType.startsWith('{')) {
      return `${itemType}[]`
    }
    return `(${itemType})[]`
  }
  
  if (typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return 'Record<string, any>'
    }
    
    const props = entries.map(([key, val]) => {
      const propType = jsonToTypeScript(val, indent + 1)
      return `${spaces}  ${key}: ${propType}`
    }).join('\n')
    
    return `{\n${props}\n${spaces}}`
  }
  
  // Primitive types
  if (typeof value === 'string') {
    return 'string'
  }
  if (typeof value === 'number') {
    return 'number'
  }
  if (typeof value === 'boolean') {
    return 'boolean'
  }
  
  return 'any'
}

/**
 * Generate TypeScript type definitions from API specification
 */
function generateTypes(apis) {
  const types = new Map()
  
  apis.forEach(api => {
    const { method, path, requestBody, response } = api
    
    // Generate request type
    if (requestBody && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
      const requestTypeName = generateTypeName(path, 'Request')
      if (!types.has(requestTypeName)) {
        types.set(requestTypeName, requestBody)
      }
    }
    
    // Generate response type
    const responseTypeName = generateTypeName(path, 'Response')
    if (!types.has(responseTypeName)) {
      types.set(responseTypeName, response)
    }
  })
  
  let typeDefinitions = "// Auto-generated TypeScript types from API specification\n\n"
  
  types.forEach((value, typeName) => {
    const typeScript = jsonToTypeScript(value)
    // Handle array types - if it's an array, use type alias instead of interface
    if (Array.isArray(value)) {
      typeDefinitions += `export type ${typeName} = ${typeScript}\n\n`
    } else {
      typeDefinitions += `export interface ${typeName} ${typeScript}\n\n`
    }
  })
  
  // Generate API function types
  typeDefinitions += "// API function types\n"
  typeDefinitions += "export interface ApiEndpoints {\n"
  
  apis.forEach(api => {
    const { method, path, requestBody } = api
    const requestTypeName = generateTypeName(path, 'Request')
    const responseTypeName = generateTypeName(path, 'Response')
    const functionName = pathToFunctionName(path)
    
    if (requestBody) {
      typeDefinitions += `  ${method.toLowerCase()}${functionName}: (body: ${requestTypeName}) => Promise<${responseTypeName}>\n`
    } else {
      typeDefinitions += `  ${method.toLowerCase()}${functionName}: () => Promise<${responseTypeName}>\n`
    }
  })
  
  typeDefinitions += "}\n"
  
  return typeDefinitions
}

/**
 * Generate type name from path
 */
function generateTypeName(path, suffix) {
  const parts = path
    .replace(/^\/api\//, '')
    .replace(/\//g, '_')
    .replace(/\{|\}/g, '')
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  
  return `${parts}${suffix}`
}

/**
 * Convert path to function name
 */
function pathToFunctionName(path) {
  return path
    .replace(/^\/api\//, '')
    .replace(/\//g, '_')
    .replace(/\{|\}/g, '')
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/**
 * Main function
 */
async function main() {
  const source = process.argv[2]
  
  if (!source) {
    console.error('Usage: node scripts/generate-from-docs.js <google-docs-url-or-file-path>')
    process.exit(1)
  }
  
  try {
    // Parse API specification
    const spec = await parseApiSpec(source)
    
    if (!spec.apis || !Array.isArray(spec.apis)) {
      throw new Error('Invalid API specification format. Expected { "apis": [...] }')
    }
    
    // Ensure directories exist
    await mkdir(MOCKS_DIR, { recursive: true })
    await mkdir(TYPES_DIR, { recursive: true })
    
    // Generate handlers
    const handlersCode = generateHandlers(spec.apis)
    await writeFile(join(MOCKS_DIR, 'handlers.ts'), handlersCode, 'utf-8')
    console.log('✓ Generated handlers.ts')
    
    // Generate types
    const typesCode = generateTypes(spec.apis)
    await writeFile(join(TYPES_DIR, 'api.d.ts'), typesCode, 'utf-8')
    console.log('✓ Generated api.d.ts')
    
    console.log('\n✅ Successfully generated mocks and types!')
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

main()
