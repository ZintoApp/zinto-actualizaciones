import { Router } from 'express';
import { storage } from '../storage';
import { ensureAuthenticated } from '../middleware';
import { logger } from '../utils/logger';
import flowExecutor from '../services/flow-executor';
import { collectContextVariableKeysForPicker } from '../utils/flow-variable-picker-context';
import { extractCodeExecutionVariableNames } from '@shared/flow-code-output-variables';
import { normalizeAiAssistantVariables } from '@shared/ai-assistant-variables';

const router = Router();

/**
 * Get available variables for a flow
 * This includes captured variables from data capture nodes
 */
router.get('/flows/:flowId/variables', ensureAuthenticated, async (req, res) => {
  try {
    const flowId = parseInt(req.params.flowId);
    const userId = req.user?.id;
    const companyId = req.user?.companyId;

    if (!flowId || isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid flow ID'
      });
    }


    const flow = await storage.getFlow(flowId);
    if (!flow) {
      return res.status(404).json({
        success: false,
        error: 'Flow not found'
      });
    }


    if (flow.userId !== userId && flow.companyId !== companyId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }


    const nodes = flow.nodes as any[] || [];
    const dataCaptureNodes = nodes.filter(node => 
      node.type === 'data_capture' && 
      node.data?.captureRules?.length > 0
    );
    const aiAssistantNodes = nodes.filter(node =>
      ['ai_assistant', 'aiAssistant', 'aiAssistantNode'].includes(String(node.type ?? '')) &&
      node.data?.aiVariables?.length > 0
    );


    const codeExecutionNodes = nodes.filter(node => 
      node.type === 'code_execution' && 
      node.data?.code
    );

    const databaseQueryNodes = nodes.filter(node =>
      node.type === 'database_query' || node.type === 'databaseQueryNode'
    );


    const capturedVariables: Array<{
      variableKey: string;
      label: string;
      description: string;
      variableType: string;
      nodeId: string;
      nodeName: string;
      required: boolean;
    }> = [];

    dataCaptureNodes.forEach(node => {
      const captureRules = node.data.captureRules || [];
      const nodeName = node.data.label || `Data Capture ${node.id}`;

      captureRules.forEach((rule: any) => {
        if (rule.variableName) {
          capturedVariables.push({
            variableKey: rule.variableName,
            label: rule.variableName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
            description: rule.description || `Captured from ${nodeName}`,
            variableType: rule.dataType || 'string',
            nodeId: node.id,
            nodeName,
            required: rule.required || false
          });
        }
      });
    });

    aiAssistantNodes.forEach(node => {
      const nodeName = node.data?.label || `AI Assistant ${node.id}`;
      for (const definition of normalizeAiAssistantVariables(node.data?.aiVariables)) {
        const variableName = definition.name;
        capturedVariables.push({
          variableKey: variableName,
          label: variableName.replace(/[_.]+/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase()),
          description: `Populated by ${nodeName}`,
          variableType: 'text',
          nodeId: node.id,
          nodeName,
          required: definition.required !== false,
        });
      }
    });


    codeExecutionNodes.forEach(node => {
      const nodeName = node.data.label || `Code Execution ${node.id}`;
      

      capturedVariables.push({
        variableKey: 'code_execution_output',
        label: 'Code Execution Output',
        description: `Output variables from ${nodeName}`,
        variableType: 'object',
        nodeId: node.id,
        nodeName,
        required: false
      });
      extractCodeExecutionVariableNames(node.data.code).forEach((variableName) => {
        capturedVariables.push({
          variableKey: variableName,
          label: variableName.replace(/[_.-]+/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase()),
          description: `Created by ${nodeName}`,
          variableType: 'runtime',
          nodeId: node.id,
          nodeName,
          required: false
        });
        capturedVariables.push({
          variableKey: `code_execution_output.${variableName}`,
          label: `Code Output · ${variableName}`,
          description: `Nested output from ${nodeName}`,
          variableType: 'runtime',
          nodeId: node.id,
          nodeName,
          required: false
        });
      });
    });

    databaseQueryNodes.forEach(node => {
      const nodeName = node.data?.label || `Database ${node.id}`;

      capturedVariables.push({
        variableKey: 'database_query_output',
        label: 'Database Query Output',
        description: `Query result envelope from ${nodeName} (rows, rowCount, fields, etc.)`,
        variableType: 'object',
        nodeId: node.id,
        nodeName,
        required: false
      });
    });


    const uniqueVariables = capturedVariables.reduce((acc, variable) => {
      const existing = acc.find(v => v.variableKey === variable.variableKey);
      if (!existing) {
        acc.push(variable);
      }
      return acc;
    }, [] as typeof capturedVariables);

    let runtimeVariables: typeof uniqueVariables = [];
    try {
      const ctxSnap = await storage.getLatestFlowExecutionContextData(flowId);
      if (ctxSnap) {
        const keys = collectContextVariableKeysForPicker(ctxSnap, 200);
        const taken = new Set(uniqueVariables.map((v) => v.variableKey));
        for (const key of keys) {
          if (taken.has(key)) continue;
          taken.add(key);
          runtimeVariables.push({
            variableKey: key,
            label: key,
            description: 'Seen in a recent flow execution',
            variableType: 'runtime',
            nodeId: '',
            nodeName: 'Recent run',
            required: false
          });
        }
      }
    } catch (runtimeErr) {
      logger.warn('FlowVariables', 'Could not load runtime variable sample', runtimeErr);
    }

    const mediaAssets = await storage.getFlowMediaAssets(flowId);
    for (const asset of mediaAssets) {
      if (uniqueVariables.some((variable) => variable.variableKey === asset.variableName)) continue;
      uniqueVariables.push({
        variableKey: asset.variableName,
        label: asset.variableName.replace(/_+/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase()),
        description: `Flow media: ${asset.originalName}`,
        variableType: 'media',
        nodeId: '',
        nodeName: 'Media Gallery',
        required: false,
      });
    }

    const rawCustomVars = (flow as any).customVariables ?? [];
    const customVariables = rawCustomVars.map((v: any) => ({
      variableKey: v.name,
      label: v.label,
      description: v.description ?? '',
      variableType: v.dataType,
      nodeId: null,
      nodeName: null
    }));

    logger.info('FlowVariables', `Retrieved ${uniqueVariables.length} captured variables for flow ${flowId}`, {
      flowId,
      userId,
      variableCount: uniqueVariables.length,
      dataCaptureNodeCount: dataCaptureNodes.length,
      aiAssistantNodeCount: aiAssistantNodes.length,
      codeExecutionNodeCount: codeExecutionNodes.length,
      databaseQueryNodeCount: databaseQueryNodes.length
    });

    res.json({
      success: true,
      variables: uniqueVariables,
      runtimeVariables,
      customVariables,
      meta: {
        flowId,
        flowName: flow.name,
        dataCaptureNodeCount: dataCaptureNodes.length,
        aiAssistantNodeCount: aiAssistantNodes.length,
        codeExecutionNodeCount: codeExecutionNodes.length,
        databaseQueryNodeCount: databaseQueryNodes.length,
        totalVariableCount: uniqueVariables.length,
        runtimeVariableCount: runtimeVariables.length,
        customVariableCount: customVariables.length
      }
    });

  } catch (error) {
    logger.error('FlowVariables', 'Error getting flow variables', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get captured variable values for a specific session
 */
router.get('/sessions/:sessionId/variables', ensureAuthenticated, async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const scope = req.query.scope as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }


    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 100'
      });
    }

    if (offset < 0) {
      return res.status(400).json({
        success: false,
        error: 'Offset must be non-negative'
      });
    }


    const validScopes = ['global', 'flow', 'node', 'user', 'session'] as const;
    const validatedScope = scope && validScopes.includes(scope as any) ? scope as typeof validScopes[number] : 'session';


    const { variables, totalCount } = await storage.getFlowVariablesPaginated(sessionId, {
      scope: validatedScope,
      limit,
      offset
    });

    logger.info('FlowVariables', `Retrieved ${variables.length} variable values for session ${sessionId} (${offset}-${offset + variables.length} of ${totalCount})`, {
      sessionId,
      scope,
      limit,
      offset,
      variableCount: variables.length,
      totalCount
    });

    res.json({
      success: true,
      variables: variables.reduce((acc, variable) => {
        acc[variable.variableKey] = variable.variableValue;
        return acc;
      }, {} as Record<string, any>),
      details: variables,
      meta: {
        sessionId,
        scope: validatedScope,
        count: variables.length,
        totalCount,
        limit,
        offset,
        hasMore: offset + variables.length < totalCount
      }
    });

  } catch (error) {
    logger.error('FlowVariables', 'Error getting session variables', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Set a variable value for a session (for testing/debugging)
 */
router.post('/sessions/:sessionId/variables', ensureAuthenticated, async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { variableKey, variableValue, variableType, scope, nodeId } = req.body;

    if (!sessionId || !variableKey) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and variable key are required'
      });
    }

    await storage.setFlowVariable({
      sessionId,
      variableKey,
      variableValue,
      variableType: variableType || 'string',
      scope: scope || 'session',
      nodeId
    });

    logger.info('FlowVariables', `Set variable ${variableKey} for session ${sessionId}`, {
      sessionId,
      variableKey,
      variableType,
      scope
    });

    res.json({
      success: true,
      message: 'Variable set successfully'
    });

  } catch (error) {
    logger.error('FlowVariables', 'Error setting session variable', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Delete a variable for a session
 */
router.delete('/sessions/:sessionId/variables/:variableKey', ensureAuthenticated, async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const variableKey = req.params.variableKey;

    if (!sessionId || !variableKey) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and variable key are required'
      });
    }

    await storage.deleteFlowVariable(sessionId, variableKey);

    logger.info('FlowVariables', `Deleted variable ${variableKey} for session ${sessionId}`, {
      sessionId,
      variableKey
    });

    res.json({
      success: true,
      message: 'Variable deleted successfully'
    });

  } catch (error) {
    logger.error('FlowVariables', 'Error deleting session variable', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Clear all variables for a session
 */
router.delete('/sessions/:sessionId/variables', ensureAuthenticated, async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const scope = req.query.scope as string;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    await storage.clearFlowVariables(sessionId, scope);

    logger.info('FlowVariables', `Cleared variables for session ${sessionId}`, {
      sessionId,
      scope
    });

    res.json({
      success: true,
      message: 'Variables cleared successfully'
    });

  } catch (error) {
    logger.error('FlowVariables', 'Error clearing session variables', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get recent flow sessions for session selection
 */
router.get('/flows/:flowId/sessions', ensureAuthenticated, async (req, res) => {
  try {
    const flowId = parseInt(req.params.flowId);
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!flowId || isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid flow ID is required'
      });
    }


    const sessions = await storage.getRecentFlowSessions(flowId, limit, offset);

    logger.info('FlowVariables', `Retrieved ${sessions.length} recent sessions for flow ${flowId}`, {
      flowId,
      sessionCount: sessions.length,
      limit,
      offset
    });

    res.json({
      success: true,
      sessions,
      meta: {
        flowId,
        count: sessions.length,
        limit,
        offset
      }
    });

  } catch (error) {
    logger.error('FlowVariables', 'Error fetching recent flow sessions', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Delete all sessions for a flow
 */
router.delete('/flows/:flowId/sessions', ensureAuthenticated, async (req, res) => {
  try {
    const flowId = parseInt(req.params.flowId);

    if (!flowId || isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid flow ID is required'
      });
    }


    const deletedCount = await storage.deleteAllFlowSessions(flowId);

    logger.info('FlowVariables', `Deleted ${deletedCount} sessions for flow ${flowId}`, {
      flowId,
      deletedCount
    });

    res.json({
      success: true,
      message: `Successfully deleted ${deletedCount} sessions`,
      deletedCount
    });

  } catch (error) {
    logger.error('FlowVariables', 'Error deleting flow sessions', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/flow-variables/http-node-test
 * Runs HTTP node configuration with the same server stack as flow execution (SSRF-safe, retries, redirects, responseType).
 */
router.post('/http-node-test', ensureAuthenticated, async (req, res) => {
  try {
    const nodeData = req.body?.nodeData ?? req.body;
    if (!nodeData || typeof nodeData !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid request body' });
    }
    const testVariables =
      req.body?.testVariables && typeof req.body.testVariables === 'object'
        ? (req.body.testVariables as Record<string, unknown>)
        : null;
    const result = await flowExecutor.testHttpRequestNode(nodeData, testVariables);
    return res.json({ ok: true, ...result });
  } catch (error) {
    logger.error('FlowVariables', 'HTTP node test failed', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/flow-variables/webhook-node-test
 * Runs Webhook node configuration with the same server stack as flow execution.
 */
router.post('/webhook-node-test', ensureAuthenticated, async (req, res) => {
  try {
    const nodeData = req.body?.nodeData ?? req.body;
    if (!nodeData || typeof nodeData !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid request body' });
    }
    const result = await flowExecutor.testWebhookNode(nodeData);
    return res.json({ ok: true, ...result });
  } catch (error) {
    logger.error('FlowVariables', 'Webhook node test failed', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/flow-variables/database-node-test
 * Runs Database node configuration with the same server stack as flow execution.
 */
router.post('/database-node-test', ensureAuthenticated, async (req, res) => {
  try {
    const nodeData = req.body?.nodeData ?? req.body;
    if (!nodeData || typeof nodeData !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid request body' });
    }
    const result = await flowExecutor.testDatabaseQueryNode(nodeData);
    return res.json({ ok: true, ...result });
  } catch (error) {
    logger.error('FlowVariables', 'Database node test failed', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
