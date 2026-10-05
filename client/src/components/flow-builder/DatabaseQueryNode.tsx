import { APP_ICONS } from '@/assets/icons';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Handle, Position } from 'reactflow';
import { useReactFlow } from 'reactflow';
import { Trash2, Copy, Settings, Plus, X, Play, CheckCircle, XCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { standardHandleStyle } from './StyledHandle';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { EnhancedVariablePicker } from './EnhancedVariablePicker';
import { HttpResponseFieldPicker } from './HttpResponseFieldPicker';
import {
  buildDatabaseTestResponseFieldPaths,
  scanQueryVariableTokens
} from './database-response-field-paths';
import type { HttpResponseFieldPath } from './http-response-field-paths';

type FlowDatabaseEngine = 'postgres' | 'mysql';
type ConnectionMode = 'fields' | 'connectionString';

interface VariableMapping {
  responseField: string;
  variableName: string;
}

interface DatabaseQueryNodeProps {
  id: string;
  data: {
    label: string;
    engine?: FlowDatabaseEngine;
    connectionMode?: ConnectionMode;
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    ssl?: boolean;
    query?: string;
    parameters?: Array<{ name: string; value: string }>;
    rowLimit?: number;
    timeout?: number;
    variableMappings?: VariableMapping[];
    onDeleteNode?: (id: string) => void;
    onDuplicateNode?: (id: string) => void;
  };
  isConnectable: boolean;
}

export function DatabaseQueryNode({ id, data, isConnectable }: DatabaseQueryNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);

  const [engine, setEngine] = useState<FlowDatabaseEngine>(data.engine || 'postgres');
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(data.connectionMode || 'fields');
  const [connectionString, setConnectionString] = useState(data.connectionString || '');
  const [host, setHost] = useState(data.host || '');
  const [port, setPort] = useState<number | ''>(data.port ?? 5432);
  const [database, setDatabase] = useState(data.database || '');
  const [username, setUsername] = useState(data.username || '');
  const [password, setPassword] = useState(data.password || '');
  const [ssl, setSsl] = useState(Boolean(data.ssl));
  const [query, setQuery] = useState(data.query || '');
  const [rowLimit, setRowLimit] = useState(data.rowLimit ?? 100);
  const [timeout, setTimeoutValue] = useState(data.timeout ?? 30);
  const [variableMappings, setVariableMappings] = useState<VariableMapping[]>(data.variableMappings || []);

  const [isTesting, setIsTesting] = useState(false);
  const [showJsonView, setShowJsonView] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    rows?: Record<string, unknown>[];
    rowCount?: number;
    rowsAffected?: number;
    command?: string;
    fields?: Array<{ name: string; type?: string }>;
    durationMs?: number;
    truncated?: boolean;
    error?: string;
  } | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode, flowId, customVariables } = useFlowContext();
  const { toast } = useToast();

  const detectedParams = useMemo(() => scanQueryVariableTokens(query), [query]);

  const testResponseFieldPaths = useMemo((): HttpResponseFieldPath[] => {
    if (!testResult?.success) return [];
    return buildDatabaseTestResponseFieldPaths(testResult).map((p) => ({
      ...p,
      group: p.group === 'rows' ? 'data' : 'envelope'
    }));
  }, [testResult]);

  const hasConnection = useMemo(() => {
    if (connectionMode === 'connectionString') {
      return Boolean(connectionString.trim());
    }
    return Boolean(host.trim() && database.trim());
  }, [connectionMode, connectionString, host, database]);

  const connectionSummary = useMemo(() => {
    if (connectionMode === 'connectionString' && connectionString.trim()) {
      return t('flow_builder.db_connection_configured', 'Connection string configured');
    }
    if (host.trim() && database.trim()) {
      return `${database}@${host}`;
    }
    return t('flow_builder.db_no_connection', 'No connection');
  }, [connectionMode, connectionString, host, database, t]);

  const updateNodeData = useCallback(
    (updates: Record<string, unknown>) => {
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, ...updates } } : node
        )
      );
    },
    [id, setNodes]
  );

  useEffect(() => {
    updateNodeData({
      engine,
      connectionMode,
      connectionString,
      host,
      port,
      database,
      username,
      password,
      ssl,
      query,
      parameters: detectedParams.map((name) => ({ name, value: '' })),
      rowLimit,
      timeout,
      variableMappings
    });
  }, [
    updateNodeData,
    engine,
    connectionMode,
    connectionString,
    host,
    port,
    database,
    username,
    password,
    ssl,
    query,
    detectedParams,
    rowLimit,
    timeout,
    variableMappings
  ]);

  const handleEngineChange = (value: FlowDatabaseEngine) => {
    setEngine(value);
    if (port === '') {
      setPort(value === 'mysql' ? 3306 : 5432);
    }
  };

  const addVariableMapping = () => {
    setVariableMappings([...variableMappings, { responseField: '', variableName: '' }]);
  };

  const removeVariableMapping = (index: number) => {
    setVariableMappings(variableMappings.filter((_, i) => i !== index));
  };

  const updateVariableMapping = (
    index: number,
    field: 'responseField' | 'variableName',
    value: string
  ) => {
    const next = [...variableMappings];
    next[index][field] = value;
    setVariableMappings(next);
  };

  const copyOutputChip = useCallback(async () => {
    try {
      await navigator.clipboard.writeText('{{database_query_output}}');
      toast({
        title: t('flow_builder.http_request_variable_copied', 'Copied'),
        description: t('flow_builder.http_request_variable_copied_description', 'Variable copied to clipboard')
      });
    } catch {
      toast({
        title: t('flow_builder.http_request_copy_failed', 'Copy failed'),
        variant: 'destructive'
      });
    }
  }, [toast, t]);

  const testQuery = async () => {
    if (!hasConnection || !query.trim()) {
      setTestResult({
        success: false,
        error: t('flow_builder.db_test_missing_config', 'Connection and query are required')
      });
      setShowTestResult(true);
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setShowTestResult(true);

    try {
      const res = await fetch('/api/flow-variables/database-node-test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeData: {
            engine,
            connectionMode,
            connectionString,
            host,
            port,
            database,
            username,
            password,
            ssl,
            query,
            rowLimit,
            timeout
          }
        })
      });

      const json = await res.json().catch(() => ({}));

      if (!json.ok || json.error) {
        setTestResult({
          success: false,
          error: typeof json.error === 'string' ? json.error : t('flow_builder.db_test_failed', 'Query failed')
        });
        setIsTesting(false);
        return;
      }

      setTestResult({
        success: Boolean(json.success),
        rows: json.rows,
        rowCount: json.rowCount,
        rowsAffected: json.rowsAffected,
        command: json.command,
        fields: json.fields,
        durationMs: json.durationMs,
        truncated: json.truncated
      });
    } catch (error: unknown) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : t('flow_builder.http_error_unknown', 'Unknown error occurred')
      });
    }

    setIsTesting(false);
  };

  const previewRows = useMemo(() => {
    if (!testResult?.rows?.length) return [];
    return testResult.rows.slice(0, Math.min(rowLimit, 50));
  }, [testResult, rowLimit]);

  const resultEnvelope = useMemo(() => {
    if (!testResult?.success) return null;
    return {
      rows: testResult.rows ?? [],
      rowCount: testResult.rowCount ?? 0,
      rowsAffected: testResult.rowsAffected,
      command: testResult.command,
      fields: testResult.fields ?? [],
      truncated: testResult.truncated ?? false,
      durationMs: testResult.durationMs
    };
  }, [testResult]);

  const metadataRows = useMemo(() => {
    if (!resultEnvelope || previewRows.length > 0) return [];
    const entries: Array<{ field: string; value: string }> = [];
    if (resultEnvelope.command) {
      entries.push({ field: 'command', value: resultEnvelope.command });
    }
    if (resultEnvelope.rowsAffected !== undefined) {
      entries.push({ field: 'rowsAffected', value: String(resultEnvelope.rowsAffected) });
    }
    entries.push({ field: 'rowCount', value: String(resultEnvelope.rowCount) });
    if (resultEnvelope.durationMs !== undefined) {
      entries.push({ field: 'durationMs', value: String(resultEnvelope.durationMs) });
    }
    entries.push({ field: 'truncated', value: String(resultEnvelope.truncated) });
    return entries;
  }, [resultEnvelope, previewRows.length]);

  const tableColumns = useMemo(() => {
    if (testResult?.fields?.length) {
      return testResult.fields.map((f) => f.name);
    }
    if (previewRows[0]) {
      return Object.keys(previewRows[0]);
    }
    return [];
  }, [testResult, previewRows]);

  const schemeHint =
    engine === 'postgres'
      ? 'postgres://user:pass@host:5432/db'
      : 'mysql://user:pass@host:3306/db';

  return (
    <div
      className={cn(
        'node-database-query rounded-lg bg-card border border-border shadow-sm group relative',
        isEditing ? 'min-w-[600px] w-[720px] max-w-[800px]' : 'max-w-[360px]'
      )}
    >
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDuplicateNode(id)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.duplicate_node', 'Duplicate node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => onDeleteNode(id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.delete_node', 'Delete node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="p-3 border-b border-primary/20 bg-primary/10">
        <div className="font-medium flex items-center gap-2">
          <img
            src={APP_ICONS.database}
            alt={t('flow_builder.database_query', 'Database')}
            className="h-4 w-4"
          />
          <span>{t('flow_builder.database_query', 'Database')}</span>
          <button data-tour="components-flow-builder-databasequerynode.button.common.hide"
            className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? (
              <>
                <EyeOff className="h-3 w-3" />
                {t('common.hide', 'Hide')}
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" />
                {t('common.edit', 'Edit')}
              </>
            )}
          </button>
        </div>
      </div>

      <div
        className={`${isEditing ? 'max-h-[720px]' : 'max-h-[200px]'} overflow-y-auto custom-scrollbar`}
      >
        <div className="p-3 space-y-3">
          <div className="text-sm p-3 rounded border border-border">
            <div className="flex items-center gap-1 mb-2">
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-sky-600 uppercase text-xs">{engine}</span>
              <span className="text-xs text-muted-foreground truncate">{connectionSummary}</span>
            </div>
            <div className="text-xs text-muted-foreground mb-2">
              {detectedParams.length > 0 &&
                `${detectedParams.length} ${detectedParams.length === 1 ? 'param' : 'params'} • `}
              {variableMappings.length > 0 &&
                (variableMappings.length === 1
                  ? t('flow_builder.http_summary_one_mapping', '1 mapping')
                  : t('flow_builder.http_summary_n_mappings', '{{count}} mappings', {
                      count: variableMappings.length
                    }))}
            </div>
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded shrink-0">
                {engine === 'postgres' ? 'Postgres' : 'MySQL'}
              </span>
              {detectedParams.length > 0 && (
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded shrink-0">
                  {detectedParams.length} params
                </span>
              )}
              {variableMappings.length > 0 && (
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded shrink-0">
                  {variableMappings.length}{' '}
                  {variableMappings.length !== 1
                    ? t('flow_builder.http_mappings', 'mappings')
                    : t('flow_builder.http_mapping', 'mapping')}
                </span>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="text-xs space-y-3 border rounded p-2">
              <div>
                <Label className="block mb-1 font-medium">{t('flow_builder.db_engine', 'Engine')}</Label>
                <Select value={engine} onValueChange={(v) => handleEngineChange(v as FlowDatabaseEngine)}>
                  <SelectTrigger className="text-xs h-7">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-50" side="top" align="start" sideOffset={8}>
                    <SelectItem value="postgres">Postgres</SelectItem>
                    <SelectItem value="mysql">MySQL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="block mb-1 font-medium">
                  {t('flow_builder.db_connection_mode', 'Connection mode')}
                </Label>
                <Select
                  value={connectionMode}
                  onValueChange={(v) => setConnectionMode(v as ConnectionMode)}
                >
                  <SelectTrigger className="text-xs h-7">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-50" side="top" align="start" sideOffset={8}>
                    <SelectItem value="fields">Fields</SelectItem>
                    <SelectItem value="connectionString">Connection String</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {connectionMode === 'fields' ? (
                <div className="space-y-2">
                  <Input data-tour="components-flow-builder-databasequerynode.input.host"
                    placeholder="host"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    className="text-xs h-7"
                  />
                  <div className="flex gap-2">
                    <Input data-tour="components-flow-builder-databasequerynode.input.port"
                      type="number"
                      placeholder="port"
                      value={port}
                      onChange={(e) => setPort(e.target.value === '' ? '' : Number(e.target.value))}
                      className="text-xs h-7 w-24"
                    />
                    <Input data-tour="components-flow-builder-databasequerynode.input.database"
                      placeholder="database"
                      value={database}
                      onChange={(e) => setDatabase(e.target.value)}
                      className="text-xs h-7 flex-1"
                    />
                  </div>
                  <Input data-tour="components-flow-builder-databasequerynode.input.username"
                    placeholder="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="text-xs h-7"
                  />
                  <Input data-tour="components-flow-builder-databasequerynode.input.password"
                    type="password"
                    placeholder="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="text-xs h-7"
                  />
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium cursor-pointer">Use SSL</Label>
                    <Switch checked={ssl} onCheckedChange={setSsl} />
                  </div>
                </div>
              ) : (
                <div>
                  <Input data-tour="components-flow-builder-databasequerynode.input.flow_builder.db_connection_string_placeholder"
                    placeholder={t(
                      'flow_builder.db_connection_string_placeholder',
                      'postgres://user:pass@host:5432/db'
                    )}
                    value={connectionString}
                    onChange={(e) => setConnectionString(e.target.value)}
                    className="text-xs h-7 font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Expected scheme: {schemeHint}</p>
                </div>
              )}

              <div>
                <Label className="block mb-1 font-medium">Query</Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  multiline
                  flowId={flowId ?? undefined}
                  value={query}
                  onChange={setQuery}
                  placeholder={t(
                    'flow_builder.db_query_placeholder',
                    'SELECT * FROM users WHERE phone = {{contact.phone}}'
                  )}
                  className="flex-1 min-w-0"
                  pickerButtonClassName="h-8 w-8 p-0 self-start shrink-0"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t(
                    'flow_builder.db_param_hint',
                    'Use {{syntax}} syntax — values are bound as SQL parameters, never interpolated.',
                    { syntax: '{{variable}}' }
                  )}
                </p>
              </div>

              {detectedParams.length > 0 && (
                <div className="rounded border p-2 bg-muted/30">
                  <Label className="text-[10px] font-medium text-muted-foreground">Detected parameters</Label>
                  <ul className="mt-1 space-y-0.5">
                    {detectedParams.map((name) => (
                      <li key={name} className="text-[10px] font-mono text-foreground">
                        {`{{${name}}}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <Label className="block mb-1 font-medium text-xs">
                    {t('flow_builder.db_row_limit', 'Row limit')}
                  </Label>
                  <Input data-tour="components-flow-builder-databasequerynode.input.flow_builder.db_row_limit"
                    type="number"
                    min={1}
                    max={10000}
                    value={rowLimit}
                    onChange={(e) => setRowLimit(Math.min(10000, Math.max(1, Number(e.target.value) || 100)))}
                    className="text-xs h-7 w-full"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <Label className="block mb-1 font-medium text-xs">
                    {t('flow_builder.http_timeout_seconds', 'Timeout (seconds)')}
                  </Label>
                  <Input data-tour="components-flow-builder-databasequerynode.input.flow_builder.db_row_limit"
                    type="number"
                    min={1}
                    max={120}
                    value={timeout}
                    onChange={(e) => setTimeoutValue(Math.min(120, Math.max(1, Number(e.target.value) || 30)))}
                    className="text-xs h-7 w-full"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <Button data-tour="components-flow-builder-databasequerynode.button.flow_builder.db_run_query"
                    variant="outline"
                    size="sm"
                    className="h-7 w-full px-3 border-green-800 bg-green-950 text-green-50 hover:bg-green-900 hover:text-green-50"
                    onClick={testQuery}
                    disabled={isTesting || !hasConnection || !query.trim()}
                  >
                    {isTesting ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Play className="h-3 w-3 mr-1" />
                    )}
                    {t('flow_builder.db_run_query', 'Run query')}
                  </Button>
                </div>
              </div>

              {showTestResult && testResult && (
                <div className="mt-2 border rounded p-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {testResult.success ? (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span className="text-xs font-medium">
                        {testResult.success
                          ? t('flow_builder.db_test_success', 'Query successful')
                          : t('flow_builder.db_test_failed', 'Query failed')}
                      </span>
                      {testResult.durationMs !== undefined && (
                        <span className="text-[10px] text-muted-foreground">({testResult.durationMs}ms)</span>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setShowTestResult(false)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  {testResult.error ? (
                    <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                      {testResult.error}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">
                        {previewRows.length > 0 ? (
                          t('flow_builder.db_result_rows', '{{count}} row(s)', {
                            count: testResult.rowCount ?? previewRows.length
                          })
                        ) : testResult.rowsAffected !== undefined && testResult.rowsAffected > 0 ? (
                          <>
                            {testResult.command && (
                              <span className="font-medium text-foreground">{testResult.command}: </span>
                            )}
                            {t('flow_builder.db_result_rows_affected', '{{count}} row(s) affected', {
                              count: testResult.rowsAffected
                            })}
                          </>
                        ) : (
                          t('flow_builder.db_result_rows', '{{count}} row(s)', {
                            count: testResult.rowCount ?? 0
                          })
                        )}
                        {testResult.truncated && (
                          <span className="ml-2">
                            {t('flow_builder.db_truncated_notice', 'Showing first {{limit}} rows', {
                              limit: Math.min(rowLimit, 50)
                            })}
                          </span>
                        )}
                      </div>
                      <Button data-tour="components-flow-builder-databasequerynode.button.flow_builder.db_table_view"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={() => setShowJsonView(!showJsonView)}
                      >
                        {showJsonView
                          ? t('flow_builder.db_table_view', 'Table view')
                          : t('flow_builder.db_json_view', 'JSON view')}
                      </Button>
                      {showJsonView ? (
                        <pre className="text-[10px] bg-muted p-2 rounded font-mono max-h-32 overflow-y-auto">
                          {JSON.stringify(
                            previewRows.length > 0 ? previewRows : resultEnvelope,
                            null,
                            2
                          )}
                        </pre>
                      ) : previewRows.length > 0 ? (
                        <div className="overflow-x-auto max-h-32 overflow-y-auto border rounded">
                          <table className="w-full text-[10px] font-mono">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                {tableColumns.map((col) => (
                                  <th key={col} className="text-left p-1 font-medium">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewRows.map((row, i) => (
                                <tr key={i} className="border-b border-border/50">
                                  {tableColumns.map((col) => (
                                    <td key={col} className="p-1 align-top">
                                      {row[col] === null || row[col] === undefined
                                        ? ''
                                        : typeof row[col] === 'object'
                                          ? JSON.stringify(row[col])
                                          : String(row[col])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="overflow-x-auto max-h-32 overflow-y-auto border rounded">
                          <table className="w-full text-[10px] font-mono">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left p-1 font-medium">field</th>
                                <th className="text-left p-1 font-medium">value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {metadataRows.map((row) => (
                                <tr key={row.field} className="border-b border-border/50">
                                  <td className="p-1 align-top font-medium">{row.field}</td>
                                  <td className="p-1 align-top">{row.value}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 border-t">
                <div className="flex items-center justify-between mb-3">
                  <Label className="font-medium text-sm">
                    {t('flow_builder.http_response_variable_mapping', 'Response Variable Mapping')}
                  </Label>
                  <Button data-tour="components-flow-builder-databasequerynode.button.flow_builder.http_add_mapping" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={addVariableMapping}>
                    <Plus className="h-3 w-3 mr-1" />
                    {t('flow_builder.http_add_mapping', 'Add Mapping')}
                  </Button>
                </div>

                {variableMappings.length === 0 ? (
                  <div className="text-center py-4 border-2 border-dashed border-border rounded-lg bg-muted/50">
                    <p className="text-[10px] text-muted-foreground">
                      {t('flow_builder.http_no_mappings_hint', 'Map response fields to flow variables for use in subsequent nodes')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                    {variableMappings.map((mapping, index) => (
                      <div
                        key={index}
                        className="group border rounded-lg p-2 bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex gap-2 items-center">
                          <div className="flex-1">
                            <Label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                              {t('flow_builder.http_response_field', 'Response Field')}
                            </Label>
                            <HttpResponseFieldPicker
                              value={mapping.responseField}
                              onChange={(v) => updateVariableMapping(index, 'responseField', v)}
                              paths={testResponseFieldPaths}
                              placeholder="rows.0.id"
                              className="text-xs h-6 border-border"
                              pickerButtonClassName="h-6 w-6 p-0"
                              t={t}
                            />
                          </div>
                          <div className="flex items-center justify-center mt-4">
                            <div className="bg-primary/10 text-primary rounded-full p-1">
                              <span className="text-xs font-medium">→</span>
                            </div>
                          </div>
                          <div className="flex-1">
                            <Label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                              {t('flow_builder.http_variable_name', 'Variable Name')}
                            </Label>
                            <EnhancedVariablePicker
                              customVariables={customVariables}
                              flowId={flowId ?? undefined}
                              value={mapping.variableName}
                              onChange={(v) => updateVariableMapping(index, 'variableName', v)}
                              placeholder="db.customer_id"
                              className="text-xs h-6 border-border"
                              wrapInBraces={false}
                              pickerButtonClassName="h-6 w-6 p-0"
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 mt-4 text-destructive opacity-0 group-hover:opacity-100"
                            onClick={() => removeVariableMapping(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t">
                <p className="text-[10px] text-muted-foreground mb-1">
                  {t('flow_builder.db_output_variable', 'Output variable')}
                </p>
                <button data-tour="components-flow-builder-databasequerynode.button.flow_builder.db_output_chip"
                  type="button"
                  onClick={() => void copyOutputChip()}
                  className="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20 transition-colors"
                >
                  {t('flow_builder.db_output_chip', 'database_query_output')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Handle type="target" position={Position.Top} style={standardHandleStyle} isConnectable={isConnectable} />
      <Handle type="source" position={Position.Bottom} style={standardHandleStyle} isConnectable={isConnectable} />
    </div>
  );
}