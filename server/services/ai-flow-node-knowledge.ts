import {
  FLOW_NODE_DEFINITIONS,
  GENERATABLE_FLOW_NODE_DEFINITIONS,
  buildFlowNodeKnowledgeChunks,
  getFlowNodeDefinition,
} from '@shared/flow-node-registry';
import type { FlowNodeDefinition } from '@shared/types/ai-flow-creator';

/** Compatibility projection for callers of the former manually-authored knowledge base. */
export type NodeParameter = {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: unknown;
  enum?: readonly string[];
};

export type NodeFunction = {
  type: string;
  name: string;
  description: string;
  category: string;
  parameters: NodeParameter[];
  handles: Array<{ type: 'input' | 'output'; id: string; label?: string }>;
  useCases: string[];
  examples: Array<{ description: string; configuration: Record<string, unknown> }>;
  limitations: string[];
  relationships: { worksWellWith: string[]; alternatives: string[]; requiredBefore: string[]; requiredAfter: string[] };
  registryDefinition: FlowNodeDefinition;
};

function project(definition: FlowNodeDefinition): NodeFunction {
  return {
    type: definition.canvasType,
    name: definition.displayName,
    description: definition.description,
    category: definition.category,
    parameters: definition.fields.map((field) => ({
      name: field.name,
      type: field.type,
      required: Boolean(field.required),
      description: field.description,
      default: field.defaultValue,
      enum: field.values,
    })),
    handles: definition.handles.map((handle) => ({
      type: handle.kind === 'source' ? 'output' : 'input',
      id: handle.id,
      label: handle.label,
    })),
    useCases: definition.examples.length ? definition.examples : definition.keywords,
    examples: definition.examples.map((description) => ({ description, configuration: definition.defaultData() })),
    limitations: definition.limitations,
    relationships: { worksWellWith: [], alternatives: [], requiredBefore: [], requiredAfter: [] },
    registryDefinition: definition,
  };
}

export class NodeKnowledgeBase {
  private static instance: NodeKnowledgeBase;

  static getInstance(): NodeKnowledgeBase {
    if (!NodeKnowledgeBase.instance) NodeKnowledgeBase.instance = new NodeKnowledgeBase();
    return NodeKnowledgeBase.instance;
  }

  async initializeNodeKnowledge(): Promise<void> {
    // Registry definitions are immutable and loaded synchronously.
  }

  getNodeFunction(nodeType: string): NodeFunction | null {
    const definition = getFlowNodeDefinition(nodeType);
    return definition ? project(definition) : null;
  }

  getAllNodeTypes(): string[] {
    return FLOW_NODE_DEFINITIONS.map((definition) => definition.canvasType);
  }

  getGeneratableNodeTypes(): string[] {
    return GENERATABLE_FLOW_NODE_DEFINITIONS.map((definition) => definition.canvasType);
  }

  getAllNodeFunctions(): NodeFunction[] {
    return FLOW_NODE_DEFINITIONS.map(project);
  }

  buildKnowledgeDocuments(nodeType: string) {
    const definition = getFlowNodeDefinition(nodeType);
    return definition ? buildFlowNodeKnowledgeChunks(definition) : [];
  }
}
