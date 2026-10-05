import type { MCPServerConfig, MCPToolDescriptor } from "./types/mcp";

/** Same rules as server `loadFunctionDefinitionsForServers` filtering (editor can mirror counts). */
export function applyMcpToolFilter(
  tools: MCPToolDescriptor[],
  filter: MCPServerConfig["toolFilter"],
): MCPToolDescriptor[] {
  if (!filter || filter.mode === "all") {
    return tools;
  }
  if (filter.mode === "include") {
    return tools.filter((t) => filter.tools.includes(t.name));
  }
  if (filter.mode === "exclude") {
    return tools.filter((t) => !filter.tools.includes(t.name));
  }
  return tools;
}
