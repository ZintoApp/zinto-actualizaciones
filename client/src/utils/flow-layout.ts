import dagre from '@dagrejs/dagre';
import { Node, Edge } from 'reactflow';

/**
 * Node dimension mapping for all chatbot flow node types
 * Based on actual component dimensions and content requirements
 */
export const NODE_DIMENSIONS = {

  'trigger': { width: 220, height: 140 },
  'message': { width: 280, height: 180 },
  'quickreply': { width: 280, height: 220 },
  'quick_reply': { width: 280, height: 220 }, // Alternative naming
  

  'image': { width: 260, height: 160 },
  'video': { width: 260, height: 160 },
  'audio': { width: 260, height: 160 },
  'document': { width: 260, height: 160 },
  

  'condition': { width: 280, height: 200 },
  'wait': { width: 240, height: 160 },
  'follow_up': { width: 280, height: 180 },
  

  'ai_assistant': { width: 300, height: 250 },
  'translation': { width: 280, height: 200 },
  'webhook': { width: 280, height: 200 },
  'http_request': { width: 280, height: 200 },
  'database_query': { width: 300, height: 220 },
  'mcp_client_tool': { width: 320, height: 220 },
  'mcp_execute_tool': { width: 300, height: 200 },
  

  'shopify': { width: 300, height: 220 },
  'woocommerce': { width: 300, height: 220 },
  

  'typebot': { width: 300, height: 220 },
  'flowise': { width: 300, height: 220 },
  'n8n': { width: 300, height: 220 },
  'make': { width: 300, height: 220 },
  'google_sheets': { width: 300, height: 220 },
  'data_capture': { width: 280, height: 200 },
  'documind': { width: 300, height: 220 },
  'chat_pdf': { width: 300, height: 220 },
  'document_generator': { width: 560, height: 480 },
  

  'whatsapp_interactive_buttons': { width: 300, height: 240 },
  'whatsapp_poll': { width: 300, height: 240 },
  

  'bot_disable': { width: 260, height: 160 },
  'end_conversation': { width: 260, height: 160 },
  'bot_reset': { width: 260, height: 160 },
  

  'google_calendar': { width: 300, height: 220 },
  

  'update_pipeline_stage': { width: 300, height: 200 },

  'notes': { width: 300, height: 220 },

  'default': { width: 280, height: 200 }
} as const;

/**
 * Get dimensions for a specific node type
 */
export function getNodeDimensions(nodeType: string): { width: number; height: number } {
  return NODE_DIMENSIONS[nodeType as keyof typeof NODE_DIMENSIONS] || NODE_DIMENSIONS.default;
}

/**
 * Dagre layout configuration optimized for chatbot flows
 */
export const DAGRE_CONFIG = {

  rankdir: 'TB' as const,


  nodesep: 150,


  ranksep: 200,


  edgesep: 30,


  rankSep: 200,


  marginx: 100,
  marginy: 100,


  align: 'UL', // Align nodes to upper-left within ranks
  acyclicer: 'greedy', // Handle cycles better
  ranker: 'tight-tree' // Better for tree-like structures
} as const;

/**
 * Create and configure a Dagre graph for layout calculation
 */
function createDagreGraph(): dagre.graphlib.Graph {
  const graph = new dagre.graphlib.Graph();


  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: DAGRE_CONFIG.rankdir,
    nodesep: DAGRE_CONFIG.nodesep,
    ranksep: DAGRE_CONFIG.ranksep,
    edgesep: DAGRE_CONFIG.edgesep,
    marginx: DAGRE_CONFIG.marginx,
    marginy: DAGRE_CONFIG.marginy,
    align: DAGRE_CONFIG.align,
    acyclicer: DAGRE_CONFIG.acyclicer,
    ranker: DAGRE_CONFIG.ranker
  });

  return graph;
}

/**
 * Calculate layout positions using Dagre algorithm
 */
export function calculateDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  try {
    const graph = createDagreGraph();
    

    if (direction !== 'TB') {
      graph.setGraph({
        ...graph.graph(),
        rankdir: direction
      });
    }
    

    nodes.forEach((node) => {
      const dimensions = getNodeDimensions(node.type || 'default');
      graph.setNode(node.id, {
        width: dimensions.width,
        height: dimensions.height
      });
    });
    

    edges.forEach((edge) => {
      graph.setEdge(edge.source, edge.target);
    });
    

    dagre.layout(graph);
    

    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = graph.node(node.id);
      const dimensions = getNodeDimensions(node.type || 'default');
      
      if (!nodeWithPosition) {
        console.warn(`No layout position calculated for node ${node.id}`);
        return node;
      }
      

      const position = {
        x: nodeWithPosition.x - dimensions.width / 2,
        y: nodeWithPosition.y - dimensions.height / 2
      };
      
      return {
        ...node,
        position,

        data: {
          ...node.data,
          targetPosition: direction === 'LR' ? 'left' : 'top',
          sourcePosition: direction === 'LR' ? 'right' : 'bottom'
        }
      };
    });
    
    return {
      nodes: layoutedNodes,
      edges
    };
    
  } catch (error) {
    console.error('Error calculating Dagre layout:', error);
    

    return { nodes, edges };
  }
}

/**
 * Validate that nodes and edges are suitable for layout
 */
export function validateLayoutInput(nodes: Node[], edges: Edge[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!nodes || nodes.length === 0) {
    errors.push('No nodes provided for layout');
  }
  
  if (!edges) {
    errors.push('No edges array provided');
  }
  

  const nodesWithoutIds = nodes.filter(node => !node.id);
  if (nodesWithoutIds.length > 0) {
    errors.push(`${nodesWithoutIds.length} nodes missing IDs`);
  }
  

  const nodeIds = new Set(nodes.map(node => node.id));
  const invalidEdges = edges.filter(edge => 
    !nodeIds.has(edge.source) || !nodeIds.has(edge.target)
  );
  
  if (invalidEdges.length > 0) {
    errors.push(`${invalidEdges.length} edges reference non-existent nodes`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Find the root node (typically a trigger) for hierarchical layout
 */
export function findRootNode(nodes: Node[], edges: Edge[]): Node | null {

  const triggerNode = nodes.find(node => node.type === 'trigger');
  if (triggerNode) {
    return triggerNode;
  }
  

  const nodeIds = new Set(nodes.map(node => node.id));
  const nodesWithIncoming = new Set(edges.map(edge => edge.target));
  
  const rootCandidates = nodes.filter(node => 
    nodeIds.has(node.id) && !nodesWithIncoming.has(node.id)
  );
  

  return rootCandidates[0] || nodes[0] || null;
}

/**
 * Calculate optimal spacing based on node count and types
 */
export function calculateOptimalSpacing(nodes: Node[], edges: Edge[] = []): {
  nodesep: number;
  ranksep: number;
} {
  const nodeCount = nodes.length;


  const branchingFactor = calculateBranchingFactor(nodes, edges);


  let spacingMultiplier = 1;


  if (branchingFactor > 3) {
    spacingMultiplier = 1.8; // Much more space for complex branching like your screenshot
  } else if (branchingFactor > 2) {
    spacingMultiplier = 1.4;
  }


  if (nodeCount > 25) {
    spacingMultiplier *= 0.8;
  } else if (nodeCount > 15) {
    spacingMultiplier *= 0.9;
  }


  const largeNodeTypes = ['ai_assistant', 'typebot', 'flowise', 'n8n', 'make', 'google_sheets', 'quickreply', 'mcp_client_tool', 'mcp_execute_tool'];
  const largeNodeCount = nodes.filter(node =>
    largeNodeTypes.includes(node.type || '')
  ).length;

  const largeNodeRatio = largeNodeCount / nodeCount;
  if (largeNodeRatio > 0.3) {
    spacingMultiplier *= 1.1; // Increase spacing for flows with many large nodes
  }

  return {
    nodesep: Math.round(DAGRE_CONFIG.nodesep * spacingMultiplier),
    ranksep: Math.round(DAGRE_CONFIG.ranksep * spacingMultiplier)
  };
}

/**
 * Calculate the branching factor of the flow to determine layout complexity
 */
function calculateBranchingFactor(nodes: Node[], edges: Edge[]): number {
  if (edges.length === 0) return 1;

  const outgoingConnections = new Map<string, number>();


  edges.forEach(edge => {
    const current = outgoingConnections.get(edge.source) || 0;
    outgoingConnections.set(edge.source, current + 1);
  });


  const branchingCounts = Array.from(outgoingConnections.values());
  if (branchingCounts.length === 0) return 1;

  const maxBranching = Math.max(...branchingCounts);
  const avgBranching = branchingCounts.reduce((sum, count) => sum + count, 0) / branchingCounts.length;


  return (maxBranching * 0.7) + (avgBranching * 0.3);
}

/**
 * Main auto-arrange function for chatbot flows
 * Optimized for hierarchical conversation structures
 */
export function autoArrangeFlow(
  nodes: Node[],
  edges: Edge[],
  options: {
    direction?: 'TB' | 'LR';
    preserveUserPositions?: boolean;
    customSpacing?: { nodesep?: number; ranksep?: number };
  } = {}
): {
  nodes: Node[];
  edges: Edge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    levels: number;
    rootNode: string | null;
  };
} {
  const { direction = 'TB', preserveUserPositions = false, customSpacing } = options;


  const validation = validateLayoutInput(nodes, edges);
  if (!validation.isValid) {
    console.error('Invalid layout input:', validation.errors);
    return {
      nodes,
      edges,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        levels: 0,
        rootNode: null
      }
    };
  }


  if (nodes.length === 0) {
    return {
      nodes,
      edges,
      stats: { nodeCount: 0, edgeCount: 0, levels: 0, rootNode: null }
    };
  }

  try {

    const rootNode = findRootNode(nodes, edges);


    const spacing = customSpacing || calculateOptimalSpacing(nodes, edges);


    const graph = createDagreGraph();
    graph.setGraph({
      ...graph.graph(),
      rankdir: direction,
      nodesep: spacing.nodesep,
      ranksep: spacing.ranksep
    });


    nodes.forEach((node) => {
      const dimensions = getNodeDimensions(node.type || 'default');
      graph.setNode(node.id, {
        width: dimensions.width,
        height: dimensions.height
      });
    });


    edges.forEach((edge) => {
      graph.setEdge(edge.source, edge.target);
    });


    dagre.layout(graph);


    const levels = new Set<number>();


    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = graph.node(node.id);
      const dimensions = getNodeDimensions(node.type || 'default');

      if (!nodeWithPosition) {
        console.warn(`No position calculated for node ${node.id}`);
        return node;
      }


      levels.add(nodeWithPosition.y);


      const position = {
        x: nodeWithPosition.x - dimensions.width / 2,
        y: nodeWithPosition.y - dimensions.height / 2
      };

      return {
        ...node,
        position,
        data: {
          ...node.data,

          targetPosition: direction === 'LR' ? 'left' : 'top',
          sourcePosition: direction === 'LR' ? 'right' : 'bottom'
        }
      };
    });

    return {
      nodes: layoutedNodes,
      edges,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        levels: levels.size,
        rootNode: rootNode?.id || null
      }
    };

  } catch (error) {
    console.error('Error in autoArrangeFlow:', error);


    return {
      nodes,
      edges,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        levels: 0,
        rootNode: null
      }
    };
  }
}

/**
 * Utility function to check if auto-arrange is recommended
 * Based on flow complexity and current node positions
 */
export function shouldRecommendAutoArrange(nodes: Node[], edges: Edge[]): {
  recommended: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];


  const overlaps = detectNodeOverlaps(nodes);
  if (overlaps > 0) {
    reasons.push(`${overlaps} node overlaps detected`);
  }


  const outsideViewport = nodes.filter(node =>
    node.position.x < -1000 || node.position.y < -1000 ||
    node.position.x > 5000 || node.position.y > 5000
  ).length;

  if (outsideViewport > 0) {
    reasons.push(`${outsideViewport} nodes positioned outside normal viewport`);
  }


  const disconnected = findDisconnectedNodes(nodes, edges);
  if (disconnected.length > 0) {
    reasons.push(`${disconnected.length} disconnected nodes found`);
  }

  return {
    recommended: reasons.length > 0,
    reasons
  };
}

/**
 * Detect overlapping nodes
 */
function detectNodeOverlaps(nodes: Node[]): number {
  let overlaps = 0;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const node1 = nodes[i];
      const node2 = nodes[j];

      const dim1 = getNodeDimensions(node1.type || 'default');
      const dim2 = getNodeDimensions(node2.type || 'default');


      const padding = 20;
      const overlap = !(
        node1.position.x + dim1.width + padding < node2.position.x ||
        node2.position.x + dim2.width + padding < node1.position.x ||
        node1.position.y + dim1.height + padding < node2.position.y ||
        node2.position.y + dim2.height + padding < node1.position.y
      );

      if (overlap) {
        overlaps++;
      }
    }
  }

  return overlaps;
}

/**
 * Find nodes that are not connected to the main flow
 */
function findDisconnectedNodes(nodes: Node[], edges: Edge[]): Node[] {
  const connectedNodeIds = new Set<string>();


  edges.forEach(edge => {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  });


  return nodes.filter(node => !connectedNodeIds.has(node.id));
}
