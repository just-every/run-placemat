let sequence = 0
export const methods = Object.fromEntries([
 ['discover', 'server', 'discover'], ['initialize', 'initialize'], ['tools', 'tools', 'list'],
 ['list', 'prompts', 'list'], ['get', 'prompts', 'get'], ['call', 'tools', 'call'], ['templates', 'resources', 'templates', 'list'],
].map(([key, ...parts]) => [key, parts.join('/')]))
export function promptClient({request, origin, token}) {
 return async (method, params = {}) => {
  const response = await request(new URL('/mcp', origin).href, {method:'POST', headers:{
   Origin:origin, 'Content-Type':'application/json', 'MCP-Protocol-Version':'2026-07-28', 'Mcp-Method':method,
   ...(params.name ? {'Mcp-Name':params.name} : {}), ...(token ? {Authorization:`Bearer ${token}`} : {}),
  }, body:JSON.stringify({jsonrpc:'2.0', id:++sequence, method, params:{...params, _meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}})})
  const message = await response.json()
  return {status:response.status, headers:response.headers, message, result:message.result}
 }
}
