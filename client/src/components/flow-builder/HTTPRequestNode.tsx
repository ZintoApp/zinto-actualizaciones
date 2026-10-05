import { APP_ICONS } from '@/assets/icons';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Handle, Position } from 'reactflow';
import { useReactFlow } from 'reactflow';
import {
  Trash2,
  Copy,
  Settings,
  Plus,
  X,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Eye,
  EyeOff,
  FileJson,
  Ban as TabIconBan,
  Binary as TabIconBinary,
  Code as TabIconCode,
  Link as TabIconLink,
  List as TabIconList,
  Network as TabIconNetwork,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { useFlowContext } from '../../pages/flow-builder';
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from '@/lib/utils';
import { standardHandleStyle } from './StyledHandle';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { EnhancedVariablePicker } from './EnhancedVariablePicker';
import { HttpResponseFieldPicker } from './HttpResponseFieldPicker';
import { buildHttpTestResponseFieldPaths } from './http-response-field-paths';
import {
  PostmanImportDialog,
  requestConfigToNodeDataPatch,
  type PostmanImportAddResult,
  type PostmanImportApplyResult
} from './PostmanImportDialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  ensureContentTypeHeader,
  findUnresolvedTemplateVariables,
  normalizeHttpNodeData,
  uniqueNodeLabel,
  type HttpBodyType,
  type HttpFormDataRow,
  type HttpKeyValueRow,
  type HttpRawLanguage
} from '@shared/postman';

const CONTENT_TAB_ICONS = {
  none: TabIconBan,
  raw: TabIconCode,
  formdata: TabIconList,
  urlencoded: TabIconLink,
  binary: TabIconBinary,
  graphql: TabIconNetwork,
} as const;

const HTTP_METHODS = [
  { id: 'GET', name: 'GET' },
  { id: 'POST', name: 'POST' },
  { id: 'PUT', name: 'PUT' },
  { id: 'DELETE', name: 'DELETE' },
  { id: 'PATCH', name: 'PATCH' }
];

/** Shown as a dropdown when the header name is Content-Type (case-insensitive). */
const HTTP_CONTENT_TYPE_PRESETS = [
  'application/json',
  'application/xml',
  'text/plain',
  'text/html',
  'text/xml',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'application/javascript',
  'application/octet-stream',
  '*/*'
] as const;

interface HeaderPair {
  key: string;
  value: string;
  enabled?: boolean;
}

interface VariableMapping {
  responseField: string;
  variableName: string;
}

interface HTTPRequestNodeProps {
  id: string;
  data: {
    label: string;
    url?: string;
    method?: string;
    headers?: HeaderPair[];
    body?: string;
    bodyType?: HttpBodyType;
    rawLanguage?: HttpRawLanguage;
    params?: HttpKeyValueRow[];
    urlencoded?: HttpKeyValueRow[];
    formdata?: HttpFormDataRow[];
    binaryUrl?: string;
    graphqlQuery?: string;
    graphqlVariables?: string;
    authType?: string;
    authToken?: string;
    authUsername?: string;
    authPassword?: string;
    authApiKey?: string;
    authApiKeyHeader?: string;
    timeout?: number;
    followRedirects?: boolean;
    responseType?: string;
    retryCount?: number;
    retryDelay?: number;
    variableMappings?: VariableMapping[];
    /** Last values entered for Test Request unresolved placeholders. */
    testVariableDefaults?: Record<string, string>;
    onDeleteNode?: (id: string) => void;
    onDuplicateNode?: (id: string) => void;
  };
  isConnectable: boolean;
}

export function HTTPRequestNode({ id, data, isConnectable }: HTTPRequestNodeProps) {
  const { t } = useTranslation();
  const authTypeOptions = useMemo(
    () => [
      { id: 'none' as const, name: t('flow_builder.auth_none', 'None') },
      { id: 'bearer' as const, name: t('flow_builder.auth_bearer_token', 'Bearer Token') },
      { id: 'basic' as const, name: t('flow_builder.auth_basic_auth', 'Basic Auth') },
      { id: 'apikey' as const, name: t('flow_builder.auth_api_key', 'API Key') }
    ],
    [t]
  );
  const responseTypeOptions = useMemo(
    () => [
      { id: 'json', name: t('flow_builder.http_response_type_json', 'JSON') },
      { id: 'text', name: t('flow_builder.http_response_type_text', 'Text') },
      { id: 'xml', name: t('flow_builder.http_response_type_xml', 'XML') },
      { id: 'auto', name: t('flow_builder.http_response_type_auto', 'Auto-detect') }
    ],
    [t]
  );
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);

  const REQUEST_TEMPLATES = [
    {
      id: 'get_user',
      name: t(
        'flow_builder.template_get_user_data',
        'Get user (JSONPlaceholder sample)'
      ),
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/users/1',
      headers: [{ key: 'Accept', value: 'application/json' }],
      body: ''
    },
    {
      id: 'post_data',
      name: t(
        'flow_builder.template_post_form_data',
        'Create post (JSONPlaceholder sample)'
      ),
      method: 'POST',
      url: 'https://jsonplaceholder.typicode.com/posts',
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: '{\n  "title": "{{contact.name}}",\n  "body": "{{message.content}}",\n  "userId": 1\n}'
    },
    {
      id: 'update_record',
      name: t(
        'flow_builder.template_update_record',
        'Update post (JSONPlaceholder sample)'
      ),
      method: 'PUT',
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: '{\n  "id": 1,\n  "title": "Updated via flow",\n  "body": "{{message.content}}",\n  "userId": 1\n}'
    }
  ];
  const initial = normalizeHttpNodeData(data as Record<string, unknown>);
  const [url, setUrl] = useState(initial.url);
  const [method, setMethod] = useState(initial.method || 'GET');
  const [headers, setHeaders] = useState<HeaderPair[]>(initial.headers);
  const [body, setBody] = useState(initial.body);
  const [bodyType, setBodyType] = useState<HttpBodyType>(initial.bodyType);
  const [rawLanguage, setRawLanguage] = useState<HttpRawLanguage>(initial.rawLanguage);
  const [params, setParams] = useState<HttpKeyValueRow[]>(initial.params);
  const [urlencoded, setUrlencoded] = useState<HttpKeyValueRow[]>(initial.urlencoded);
  const [formdata, setFormdata] = useState<HttpFormDataRow[]>(initial.formdata);
  const [binaryUrl, setBinaryUrl] = useState(initial.binaryUrl);
  const [graphqlQuery, setGraphqlQuery] = useState(initial.graphqlQuery);
  const [graphqlVariables, setGraphqlVariables] = useState(initial.graphqlVariables);
  const [authType, setAuthType] = useState(data.authType || initial.authType || 'none');
  const [authToken, setAuthToken] = useState(data.authToken || initial.authToken || '');
  const [authUsername, setAuthUsername] = useState(data.authUsername || initial.authUsername || '');
  const [authPassword, setAuthPassword] = useState(data.authPassword || initial.authPassword || '');
  const [authApiKey, setAuthApiKey] = useState(data.authApiKey || initial.authApiKey || '');
  const [authApiKeyHeader, setAuthApiKeyHeader] = useState(data.authApiKeyHeader || initial.authApiKeyHeader || 'X-API-Key');
  const [timeout, setTimeoutValue] = useState(data.timeout || 30);
  const [followRedirects, setFollowRedirects] = useState(data.followRedirects !== undefined ? data.followRedirects : true);
  const [responseType, setResponseType] = useState(data.responseType || 'auto');
  const [retryCount, setRetryCount] = useState(data.retryCount || 0);
  const [retryDelay, setRetryDelay] = useState(data.retryDelay || 1000);
  const [variableMappings, setVariableMappings] = useState<VariableMapping[]>(data.variableMappings || []);
  const [importOpen, setImportOpen] = useState(false);
  const [testVariableDefaults, setTestVariableDefaults] = useState<Record<string, string>>(
    data.testVariableDefaults && typeof data.testVariableDefaults === 'object'
      ? data.testVariableDefaults
      : {}
  );
  const [testVarPrompt, setTestVarPrompt] = useState<{
    names: string[];
    values: Record<string, string>;
  } | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    data?: any;
    error?: string;
    duration?: number;
    retryAttempts?: number;
  } | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [showResponseHeaders, setShowResponseHeaders] = useState(false);
  const [showVariablePreview, setShowVariablePreview] = useState(false);

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode, flowId, customVariables } = useFlowContext();
  const { toast } = useToast();

  const testResponseFieldPaths = useMemo(() => {
    if (!testResult?.success) return [];
    return buildHttpTestResponseFieldPaths(testResult);
  }, [testResult]);

  const copyVariableToClipboard = useCallback(
    async (variable: string) => {
      try {
        await navigator.clipboard.writeText(variable);
        toast({
          title: t('flow_builder.http_request_variable_copied', 'Copied'),
          description: t(
            'flow_builder.http_request_variable_copied_description',
            'Variable copied to clipboard'
          )
        });
      } catch {
        toast({
          title: t('flow_builder.http_request_copy_failed', 'Copy failed'),
          description: t(
            'flow_builder.http_request_copy_failed_description',
            'Could not copy to clipboard'
          ),
          variant: 'destructive'
        });
      }
    },
    [toast, t]
  );

  const updateNodeData = useCallback((updates: any) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...updates
            }
          };
        }
        return node;
      })
    );
  }, [id, setNodes]);

  useEffect(() => {
    updateNodeData({
      url,
      method,
      headers,
      body,
      bodyType,
      rawLanguage,
      params,
      urlencoded,
      formdata,
      binaryUrl,
      graphqlQuery,
      graphqlVariables,
      authType,
      authToken,
      authUsername,
      authPassword,
      authApiKey,
      authApiKeyHeader,
      timeout,
      followRedirects,
      responseType,
      retryCount,
      retryDelay,
      variableMappings,
      testVariableDefaults
    });
  }, [
    updateNodeData,
    url,
    method,
    headers,
    body,
    bodyType,
    rawLanguage,
    params,
    urlencoded,
    formdata,
    binaryUrl,
    graphqlQuery,
    graphqlVariables,
    authType,
    authToken,
    authUsername,
    authPassword,
    authApiKey,
    authApiKeyHeader,
    timeout,
    followRedirects,
    responseType,
    retryCount,
    retryDelay,
    variableMappings,
    testVariableDefaults
  ]);

  const addHeader = () => {
    setHeaders([...headers, { key: '', value: '', enabled: true }]);
  };

  const removeHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  const updateHeader = (index: number, field: 'key' | 'value' | 'enabled', value: string | boolean) => {
    const newHeaders = [...headers];
    if (field === 'enabled') {
      newHeaders[index] = { ...newHeaders[index], enabled: Boolean(value) };
    } else {
      newHeaders[index] = { ...newHeaders[index], [field]: value as string };
      if (field === 'key' && (value as string).trim().toLowerCase() === 'content-type') {
        const row = newHeaders[index];
        if (!row.value.trim()) {
          newHeaders[index].value = 'application/json';
        }
      }
    }
    setHeaders(newHeaders);
  };

  const changeBodyType = (next: HttpBodyType) => {
    setBodyType(next);
    setHeaders((prev) => ensureContentTypeHeader(prev.map((h) => ({
      key: h.key,
      value: h.value,
      enabled: h.enabled !== false
    })), next, rawLanguage));
  };

  const applyImportedConfig = useCallback((config: PostmanImportApplyResult['config']) => {
    const patch = requestConfigToNodeDataPatch(config);
    setUrl(String(patch.url || ''));
    setMethod(String(patch.method || 'GET'));
    setHeaders((patch.headers as HeaderPair[]) || []);
    setBody(String(patch.body || ''));
    setBodyType((patch.bodyType as HttpBodyType) || 'none');
    setRawLanguage((patch.rawLanguage as HttpRawLanguage) || 'json');
    setParams((patch.params as HttpKeyValueRow[]) || []);
    setUrlencoded((patch.urlencoded as HttpKeyValueRow[]) || []);
    setFormdata((patch.formdata as HttpFormDataRow[]) || []);
    setBinaryUrl(String(patch.binaryUrl || ''));
    setGraphqlQuery(String(patch.graphqlQuery || ''));
    setGraphqlVariables(String(patch.graphqlVariables || ''));
    setAuthType(String(patch.authType || 'none'));
    setAuthToken(String(patch.authToken || ''));
    setAuthUsername(String(patch.authUsername || ''));
    setAuthPassword(String(patch.authPassword || ''));
    setAuthApiKey(String(patch.authApiKey || ''));
    setAuthApiKeyHeader(String(patch.authApiKeyHeader || 'X-API-Key'));
  }, []);

  const handlePostmanApply = useCallback((result: PostmanImportApplyResult) => {
    applyImportedConfig(result.config);
    toast({
      title: t('flow_builder.postman_applied', 'Postman request applied'),
      description: t(
        'flow_builder.postman_applied_desc',
        'Request config updated. Flow settings were preserved.'
      )
    });
  }, [applyImportedConfig, toast, t]);

  const handlePostmanAddNodes = useCallback((result: PostmanImportAddResult) => {
    setNodes((nds) => {
      const source = nds.find((n) => n.id === id);
      const baseX = source?.position.x ?? 0;
      const baseY = (source?.position.y ?? 0) + 140;
      const existingLabels = nds.map((n) => String(n.data?.label || ''));
      const usedLabels = [...existingLabels];
      const newNodes = result.nodes.map((item, index) => {
        const label = uniqueNodeLabel(item.label, usedLabels);
        usedLabels.push(label);
        const patch = requestConfigToNodeDataPatch(item.config);
        return {
          id: `node_${nanoid()}`,
          type: 'http_request',
          position: { x: baseX, y: baseY + index * 120 },
          data: {
            label,
            ...patch,
            timeout: 30,
            followRedirects: true,
            responseType: 'auto',
            retryCount: 0,
            retryDelay: 1000,
            variableMappings: [],
            onDeleteNode,
            onDuplicateNode
          }
        };
      });
      return nds.concat(newNodes);
    });
    toast({
      title: t('flow_builder.postman_nodes_added', 'HTTP nodes added'),
      description: t(
        'flow_builder.postman_nodes_added_desc',
        'Added {{count}} unconnected node(s).',
        { count: result.nodes.length }
      )
    });
  }, [id, setNodes, onDeleteNode, onDuplicateNode, toast, t]);

  const addVariableMapping = () => {
    setVariableMappings([...variableMappings, { responseField: '', variableName: '' }]);
  };

  const removeVariableMapping = (index: number) => {
    setVariableMappings(variableMappings.filter((_, i) => i !== index));
  };

  const updateVariableMapping = (index: number, field: 'responseField' | 'variableName', value: string) => {
    const newMappings = [...variableMappings];
    newMappings[index][field] = value;
    setVariableMappings(newMappings);
  };

  const applyTemplate = (templateId: string) => {
    const template = REQUEST_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setMethod(template.method);
      setUrl(template.url);
      setHeaders(template.headers.map((h) => ({ ...h, enabled: true })));
      setBody(template.body);
      setBodyType('raw');
      setRawLanguage('json');
    }
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'text-primary';
      case 'POST': return 'text-primary';
      case 'PUT': return 'text-secondary-foreground';
      case 'DELETE': return 'text-destructive';
      case 'PATCH': return 'text-primary';
      default: return 'text-muted-foreground';
    }
  };

  const buildTestVariableMap = (): Record<string, string> => {
    const testData: Record<string, string> = {
      'contact.name': t('flow_builder.http_test_sample_contact_name', 'Test Contact'),
      'contact.phone': '+1234567890',
      'contact.email': 'test@example.com',
      'contact.id': '12345',
      'message.content': t('flow_builder.http_test_sample_message', 'This is a test message'),
      'date.today': new Date().toISOString().split('T')[0],
      'date.now': new Date().toISOString(),
      'time.now': new Date().toLocaleTimeString(),
      'user.name': t('flow_builder.http_test_sample_user', 'Test User'),
      'user.id': '123',
      'record.id': '456'
    };

    for (const [key, value] of Object.entries(testVariableDefaults || {})) {
      if (!key) continue;
      testData[key] = value ?? '';
    }

    for (const v of customVariables || []) {
      const name = (v?.name || '').trim();
      if (!name) continue;
      if (v.defaultValue != null && String(v.defaultValue).length > 0) {
        testData[name] = String(v.defaultValue);
      }
    }
    return testData;
  };

  const replaceVariables = (text: string, testData = buildTestVariableMap()): string => {
    let result = text;
    Object.entries(testData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'g');
      result = result.replace(regex, value);
    });
    return result;
  };

  const collectUnresolvedForTest = (testVariables: Record<string, string>): string[] => {
    const applyTestVars = (s: string) => replaceVariables(s, testVariables);
    return findUnresolvedTemplateVariables(
      applyTestVars(url),
      applyTestVars(body),
      applyTestVars(binaryUrl),
      applyTestVars(graphqlQuery),
      applyTestVars(graphqlVariables),
      applyTestVars(authToken),
      applyTestVars(authUsername),
      applyTestVars(authPassword),
      applyTestVars(authApiKey),
      ...headers.flatMap((h) => [applyTestVars(h.key || ''), applyTestVars(h.value || '')]),
      ...params.flatMap((p) => [applyTestVars(p.key || ''), applyTestVars(p.value || '')]),
      ...urlencoded.flatMap((p) => [applyTestVars(p.key || ''), applyTestVars(p.value || '')]),
      ...formdata.flatMap((p) => [applyTestVars(p.key || ''), applyTestVars(p.value || '')])
    );
  };

  const isValidUrl = (candidate: string): boolean => {
    const trimmed = candidate.trim();
    if (!trimmed) return false;
    // Allow flow/Postman variable placeholders; server validates after replacement.
    if (/\{\{[^}]+\}\}/.test(trimmed)) return true;
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  };

  const runTestRequest = async (testVariables: Record<string, string>) => {
    const applyTestVars = (s: string) => replaceVariables(s, testVariables);

    if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && bodyType === 'raw' && body) {
      try {
        const processedBody = applyTestVars(body);
        const hasJsonContentType = headers.some(
          (h) =>
            (h.key ?? '').toLowerCase() === 'content-type' &&
            String(h.value ?? '').includes('application/json')
        );
        if (rawLanguage === 'json' || hasJsonContentType || processedBody.trim().startsWith('{')) {
          JSON.parse(processedBody);
        }
      } catch {
        setTestResult({
          success: false,
          error: t('flow_builder.http_error_invalid_json_body', 'Invalid JSON in request body')
        });
        setShowTestResult(true);
        return;
      }
    }

    setIsTesting(true);
    setTestResult(null);
    setShowTestResult(true);

    try {
      const res = await fetch('/api/flow-variables/http-node-test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testVariables,
          nodeData: {
            url,
            method,
            headers,
            body,
            bodyType,
            rawLanguage,
            params,
            urlencoded,
            formdata,
            binaryUrl,
            graphqlQuery,
            graphqlVariables,
            authType,
            authToken,
            authUsername,
            authPassword,
            authApiKey,
            authApiKeyHeader,
            timeout,
            followRedirects,
            responseType,
            retryCount,
            retryDelay
          }
        })
      });

      const json = await res.json().catch(() => ({}));

      if (!json.ok) {
        setTestResult({
          success: false,
          error:
            typeof json.error === 'string'
              ? json.error
              : t('flow_builder.http_error_request_failed', 'Request failed')
        });
        setIsTesting(false);
        return;
      }

      if (json.error) {
        setTestResult({
          success: false,
          error: json.error,
          duration: json.duration,
          retryAttempts: json.retryAttempts
        });
        setIsTesting(false);
        return;
      }

      setTestResult({
        success: Boolean(json.success),
        status: json.status,
        statusText: json.statusText,
        headers: json.headers,
        data: json.data,
        duration: json.duration,
        retryAttempts: json.retryAttempts
      });
    } catch (error: unknown) {
      setTestResult({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : t('flow_builder.http_error_unknown', 'Unknown error occurred')
      });
    }

    setIsTesting(false);
  };

  const testRequest = async () => {
    if (!url.trim()) {
      setTestResult({
        success: false,
        error: t('flow_builder.http_error_url_required', 'Please enter a request URL')
      });
      setShowTestResult(true);
      return;
    }

    if (!isValidUrl(url)) {
      setTestResult({
        success: false,
        error: t(
          'flow_builder.http_error_invalid_url',
          'Please enter a valid URL (must include http:// or https://)'
        )
      });
      setShowTestResult(true);
      return;
    }

    const testVariables = buildTestVariableMap();
    const unresolved = collectUnresolvedForTest(testVariables);

    if (unresolved.length > 0) {
      const values: Record<string, string> = {};
      for (const name of unresolved) {
        values[name] = testVariableDefaults[name] ?? '';
      }
      setTestVarPrompt({ names: unresolved, values });
      return;
    }

    await runTestRequest(testVariables);
  };

  const confirmTestVarPrompt = async () => {
    if (!testVarPrompt) return;
    const prompted = { ...testVarPrompt.values };
    setTestVariableDefaults((prev) => ({ ...prev, ...prompted }));
    setTestVarPrompt(null);
    const testVariables = { ...buildTestVariableMap(), ...prompted };
    await runTestRequest(testVariables);
  };

  return (
    <div
      className={cn(
        'node-http-request rounded-lg bg-card border border-border shadow-sm group relative',
        isEditing ? 'min-w-[480px] max-w-[640px]' : 'max-w-[360px]'
      )}
    >
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onDuplicateNode(id)}
              >
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

      {/* Fixed Header */}
      <div className="p-3 border-b border-primary/20 bg-primary/10">
        <div className="font-medium flex items-center gap-2">
          <img 
            src={APP_ICONS.httpRequest}
            alt={t('flow_builder.http_request', 'HTTP Request')}
            className="h-4 w-4"
          />
          <span>{t('flow_builder.http_request', 'HTTP Request')}</span>
         <button data-tour="components-flow-builder-httprequestnode.button.common.hide"
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

      {/* Scrollable Content */}
      <div className={`${isEditing ? 'max-h-[500px]' : 'max-h-[200px]'} overflow-y-auto custom-scrollbar`}>
        <div className="p-3 space-y-3">

          {/* Configuration Summary */}
          <div className="text-sm p-3  rounded border border-border">
            <div className="flex items-center gap-1 mb-2">
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
              <span className={cn("font-medium", getMethodColor(method))}>{method}</span>
              <span className="text-xs text-muted-foreground">
                {url
                  ? url.length > 30
                    ? `${url.substring(0, 30)}...`
                    : url
                  : t('flow_builder.http_no_url', 'No URL configured')}
              </span>
            </div>

            <div className="text-xs text-muted-foreground mb-2">
              {authType !== 'none' &&
                `${t('flow_builder.http_summary_auth', 'Auth: {{type}}', {
                  type: authTypeOptions.find((a) => a.id === authType)?.name ?? ''
                })} • `}
              {headers.length > 0 &&
                `${headers.length === 1 ? t('flow_builder.http_summary_one_header', '1 header') : t('flow_builder.http_summary_n_headers', '{{count}} headers', { count: headers.length })} • `}
              {body && (method === 'POST' || method === 'PUT' || method === 'PATCH') &&
                `${t('flow_builder.http_body_configured', 'Body configured')} • `}
              {retryCount > 0 &&
                `${t('flow_builder.http_summary_retries', '{{count}} retries', { count: retryCount })} • `}
              {variableMappings.length > 0 &&
                (variableMappings.length === 1
                  ? t('flow_builder.http_summary_one_mapping', '1 mapping')
                  : t('flow_builder.http_summary_n_mappings', '{{count}} mappings', {
                      count: variableMappings.length
                    }))}
            </div>

            <div className="flex flex-wrap gap-1">
              {authType !== 'none' && (
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded shrink-0">
                  {t('flow_builder.http_auth', 'Auth')}:{' '}
                  {authTypeOptions.find((a) => a.id === authType)?.name}
                </span>
              )}
              {headers.length > 0 && (
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded shrink-0">
                  {headers.length}{' '}
                  {headers.length !== 1
                    ? t('flow_builder.http_headers', 'headers')
                    : t('flow_builder.http_header', 'header')}
                </span>
              )}
              {body && (method === 'POST' || method === 'PUT' || method === 'PATCH') && (
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded shrink-0">
                  {t('flow_builder.http_body_configured', 'Body configured')}
                </span>
              )}
              {retryCount > 0 && (
                <span className="text-[10px] bg-secondary/10 text-secondary border border-secondary/20 px-1 py-0.5 rounded shrink-0">
                  {t('flow_builder.http_retry', 'Retry')}: {retryCount}x
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
            <div className="text-xs space-y-3 border rounded p-2 ">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <Label className="font-medium">{t('flow_builder.http_quick_templates', 'Quick Templates')}</Label>
              <Button data-tour="components-flow-builder-httprequestnode.button.flow_builder.postman_import"
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setImportOpen(true)}
              >
                <FileJson className="h-3 w-3 mr-1" />
                {t('flow_builder.postman_import', 'Import Postman')}
              </Button>
            </div>
            <Select
              value=""
              onValueChange={applyTemplate}
            >
              <SelectTrigger data-tour="components-flow-builder-httprequestnode.selecttrigger.flow_builder.http_choose_template" className="text-xs h-7">
                <SelectValue placeholder={t('flow_builder.http_choose_template', 'Choose a template...')} />
              </SelectTrigger>
              <SelectContent
                className="w-64 max-h-60 overflow-y-auto z-50"
                side="top"
                align="end"
                sideOffset={8}
                avoidCollisions={true}
              >
                {REQUEST_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id} className="text-xs p-2">
                    <div className="flex flex-col items-start space-y-1 max-w-full">
                      <span className="font-medium text-xs truncate max-w-full">{template.name}</span>
                      <span className="text-[9px] text-muted-foreground leading-tight">
                        {template.method} • {template.url.length > 30 ? `${template.url.substring(0, 30)}...` : template.url}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="block mb-1 font-medium">{t('flow_builder.http_method', 'HTTP Method')}</Label>
            <Select
              value={method}
              onValueChange={setMethod}
            >
              <SelectTrigger data-tour="components-flow-builder-httprequestnode.selecttrigger.flow_builder.http_select_method" className="text-xs h-7">
                <SelectValue placeholder={t('flow_builder.http_select_method', 'Select method')} />
              </SelectTrigger>
              <SelectContent
                className="w-40 z-50"
                side="top"
                align="start"
                sideOffset={8}
                avoidCollisions={true}
              >
                {HTTP_METHODS.map((method) => (
                  <SelectItem key={method.id} value={method.id}>
                    <span className={getMethodColor(method.id)}>{method.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="block mb-1 font-medium">{t('flow_builder.http_request_url', 'Request URL')}</Label>
            <div className="flex gap-2">
              <Input data-tour="components-flow-builder-httprequestnode.input.flow_builder.http_url_placeholder"
                type="url"
                placeholder={t('flow_builder.http_url_placeholder', 'https://api.example.com/endpoint')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="text-xs h-7 flex-1"
              />
              <Button data-tour="components-flow-builder-httprequestnode.button.flow_builder.http_test_request_tooltip"
                variant="outline"
                size="sm"
                className="h-7 px-2 border-green-800 bg-green-950 text-green-50 hover:bg-green-900 hover:text-green-50 dark:border-green-900 dark:bg-green-950 dark:hover:bg-green-900"
                onClick={testRequest}
                disabled={isTesting || !url.trim()}
                title={t('flow_builder.http_test_request_tooltip', 'Test request with current configuration')}
              >
                {isTesting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
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
                      ? t('flow_builder.http_test_success', 'Request Successful')
                      : t('flow_builder.http_test_failed', 'Request Failed')}
                  </span>
                  {testResult.duration && (
                    <span className="text-[10px] text-muted-foreground">
                      ({testResult.duration}ms)
                    </span>
                  )}
                  {testResult.retryAttempts !== undefined && testResult.retryAttempts > 0 && (
                    <span className="text-[10px] text-secondary flex items-center gap-1">
                      <RotateCcw className="h-2.5 w-2.5" />
                      {t('flow_builder.http_test_retries_label', '{{count}} retries', {
                        count: testResult.retryAttempts
                      })}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  onClick={() => setShowTestResult(false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>

              {testResult.error ? (
                <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                  {testResult.error}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium">{t('flow_builder.http_status_label', 'Status:')}</span>
                    <span
                      className={`px-1 py-0.5 rounded text-[10px] ${
                        testResult.success
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'bg-destructive/10 text-destructive border border-destructive/20'
                      }`}
                    >
                      {testResult.status} {testResult.statusText}
                    </span>
                  </div>

                  {testResult.headers && Object.keys(testResult.headers).length > 0 && (
                    <div>
                      <button data-tour="components-flow-builder-httprequestnode.button.flow_builder.http_response_headers"
                        type="button"
                        className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
                        onClick={() => setShowResponseHeaders(!showResponseHeaders)}
                      >
                        {t('flow_builder.http_response_headers', 'Response Headers')}
                        {showResponseHeaders ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                      {showResponseHeaders && (
                        <div className="mt-1 text-[10px] bg-muted p-2 rounded font-mono max-h-20 overflow-y-auto">
                          {Object.entries(testResult.headers).map(([key, value]) => (
                            <div key={key} className="break-words leading-tight">
                              <span className="text-foreground">{key}:</span>{' '}
                              {typeof value === 'string' && value.length > 50
                                ? `${value.substring(0, 50)}...`
                                : value}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {testResult.data !== undefined && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        {t('flow_builder.http_response_data', 'Response Data')}
                      </div>
                      <div className="text-[10px] bg-muted p-2 rounded font-mono max-h-32 overflow-y-auto">
                        {typeof testResult.data === 'string'
                          ? testResult.data
                          : JSON.stringify(testResult.data, null, 2)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <Label className="block mb-1 font-medium">
              {t('flow_builder.webhook_authentication', 'Authentication')}
            </Label>
            <Select
              value={authType}
              onValueChange={setAuthType}
            >
              <SelectTrigger data-tour="components-flow-builder-httprequestnode.selecttrigger.flow_builder.webhook_select_auth" className="text-xs h-7">
                <SelectValue placeholder={t('flow_builder.webhook_select_auth', 'Select auth type')} />
              </SelectTrigger>
              <SelectContent
                className="w-48 z-50"
                side="top"
                align="start"
                sideOffset={8}
                avoidCollisions={true}
              >
                {authTypeOptions.map((auth) => (
                  <SelectItem key={auth.id} value={auth.id}>
                    {auth.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {authType === 'bearer' && (
              <div className="mt-2">
                <Input data-tour="components-flow-builder-httprequestnode.input.flow_builder.webhook_bearer_token"
                  type="password"
                  placeholder={t('flow_builder.webhook_bearer_token', 'Bearer token')}
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  className="text-xs h-7"
                />
              </div>
            )}

            {authType === 'basic' && (
              <div className="mt-2 space-y-2">
                <Input data-tour="components-flow-builder-httprequestnode.input.flow_builder.webhook_username"
                  placeholder={t('flow_builder.webhook_username', 'Username')}
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="text-xs h-7"
                />
                <Input data-tour="components-flow-builder-httprequestnode.input.flow_builder.webhook_password"
                  type="password"
                  placeholder={t('flow_builder.webhook_password', 'Password')}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="text-xs h-7"
                />
              </div>
            )}

            {authType === 'apikey' && (
              <div className="mt-2 space-y-2">
                <Input data-tour="components-flow-builder-httprequestnode.input.flow_builder.http_auth_api_header_placeholder"
                  placeholder={t(
                    'flow_builder.http_auth_api_header_placeholder',
                    'Header name (e.g., X-API-Key)'
                  )}
                  value={authApiKeyHeader}
                  onChange={(e) => setAuthApiKeyHeader(e.target.value)}
                  className="text-xs h-7"
                />
                <Input data-tour="components-flow-builder-httprequestnode.input.flow_builder.http_auth_api_value_placeholder"
                  type="password"
                  placeholder={t(
                    'flow_builder.http_auth_api_value_placeholder',
                    'API key value'
                  )}
                  value={authApiKey}
                  onChange={(e) => setAuthApiKey(e.target.value)}
                  className="text-xs h-7"
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-medium">{t('flow_builder.http_query_params', 'Query Params')}</Label>
              <Button data-tour="components-flow-builder-httprequestnode.button.common.add"
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setParams([...params, { key: '', value: '', enabled: true }])}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t('common.add', 'Add')}
              </Button>
            </div>
            {params.map((param, index) => (
              <div key={index} className="flex gap-1 mb-2 items-center">
                <Checkbox
                  checked={param.enabled !== false}
                  onCheckedChange={(c) => {
                    const next = [...params];
                    next[index] = { ...next[index], enabled: Boolean(c) };
                    setParams(next);
                  }}
                />
                <Input data-tour="components-flow-builder-httprequestnode.input.flow_builder.http_param_name"
                  placeholder={t('flow_builder.http_param_name', 'Key')}
                  value={param.key}
                  onChange={(e) => {
                    const next = [...params];
                    next[index] = { ...next[index], key: e.target.value };
                    setParams(next);
                  }}
                  className="text-xs h-7 flex-1"
                />
                <Input data-tour="components-flow-builder-httprequestnode.input.flow_builder.http_param_value"
                  placeholder={t('flow_builder.http_param_value', 'Value')}
                  value={param.value}
                  onChange={(e) => {
                    const next = [...params];
                    next[index] = { ...next[index], value: e.target.value };
                    setParams(next);
                  }}
                  className="text-xs h-7 flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setParams(params.filter((_, i) => i !== index))}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-medium">{t('flow_builder.http_custom_headers', 'Custom Headers')}</Label>
              <Button data-tour="components-flow-builder-httprequestnode.button.common.add"
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={addHeader}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t('common.add', 'Add')}
              </Button>
            </div>
            {headers.map((header, index) => {
              const isContentTypeHeader = header.key.trim().toLowerCase() === 'content-type';
              const rawCt = header.value.trim();
              const contentTypeOptions: string[] = [...HTTP_CONTENT_TYPE_PRESETS];
              if (rawCt && !contentTypeOptions.includes(rawCt)) {
                contentTypeOptions.unshift(rawCt);
              }
              const contentTypeSelectValue = rawCt || 'application/json';

              return (
                <div key={index} className="flex gap-1 mb-2 items-center">
                  <Checkbox
                    checked={header.enabled !== false}
                    onCheckedChange={(c) => updateHeader(index, 'enabled', Boolean(c))}
                  />
                  <Input data-tour="components-flow-builder-httprequestnode.input.flow_builder.http_header_name"
                    placeholder={t('flow_builder.http_header_name', 'Header name')}
                    value={header.key}
                    onChange={(e) => updateHeader(index, 'key', e.target.value)}
                    className="text-xs h-7 flex-1"
                  />
                  {isContentTypeHeader ? (
                    <Select
                      value={contentTypeSelectValue}
                      onValueChange={(v) => updateHeader(index, 'value', v)}
                    >
                      <SelectTrigger data-tour="components-flow-builder-httprequestnode.selecttrigger.flow_builder.http_select_content_type" className="text-xs h-7 flex-1 font-mono">
                        <SelectValue
                          placeholder={t(
                            'flow_builder.http_select_content_type',
                            'Select media type'
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent className="z-50 max-h-60" side="top" align="start" sideOffset={4}>
                        {contentTypeOptions.map((opt) => (
                          <SelectItem key={opt} value={opt} className="text-xs font-mono">
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input data-tour="components-flow-builder-httprequestnode.input.flow_builder.http_header_value"
                      placeholder={t('flow_builder.http_header_value', 'Header value')}
                      value={header.value}
                      onChange={(e) => updateHeader(index, 'value', e.target.value)}
                      className="text-xs h-7 flex-1"
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => removeHeader(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>

          <div>
            <Label className="block mb-1 font-medium">
              {t('flow_builder.http_body', 'Body')}
            </Label>
            <Tabs value={bodyType} onValueChange={(v) => changeBodyType(v as HttpBodyType)}>
              <TabsList>
                {(['none', 'raw', 'formdata', 'urlencoded', 'binary', 'graphql'] as HttpBodyType[]).map((tab) => (
                  <TabsTrigger icon={CONTENT_TAB_ICONS[tab]} key={tab} value={tab}>
                    {tab === 'formdata'
                      ? 'form-data'
                      : tab === 'urlencoded'
                        ? 'x-www-form-urlencoded'
                        : tab === 'graphql'
                          ? 'GraphQL'
                          : tab}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent data-tour="components-flow-builder-httprequestnode.tabscontent.none" value="none" className="text-[10px] text-muted-foreground py-2">
                {t('flow_builder.http_body_none', 'No body will be sent.')}
              </TabsContent>
              <TabsContent data-tour="components-flow-builder-httprequestnode.tabscontent.raw" value="raw" className="space-y-2">
                <Select value={rawLanguage} onValueChange={(v) => setRawLanguage(v as HttpRawLanguage)}>
                  <SelectTrigger className="text-xs h-7 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="xml">XML</SelectItem>
                    <SelectItem value="html">HTML</SelectItem>
                    <SelectItem value="javascript">JavaScript</SelectItem>
                  </SelectContent>
                </Select>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  multiline
                  flowId={flowId ?? undefined}
                  value={body}
                  onChange={setBody}
                  placeholder={t(
                    'flow_builder.http_body_placeholder',
                    '{"key": "value", "data": "{{contact.name}}"}'
                  )}
                  className="flex-1 min-w-0"
                  pickerButtonClassName="h-8 w-8 p-0 self-start shrink-0"
                />
              </TabsContent>
              <TabsContent data-tour="components-flow-builder-httprequestnode.tabscontent.urlencoded" value="urlencoded" className="space-y-2">
                <Button data-tour="components-flow-builder-httprequestnode.button.common.add"
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setUrlencoded([...urlencoded, { key: '', value: '', enabled: true }])}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('common.add', 'Add')}
                </Button>
                {urlencoded.map((row, index) => (
                  <div key={index} className="flex gap-1 items-center">
                    <Checkbox
                      checked={row.enabled !== false}
                      onCheckedChange={(c) => {
                        const next = [...urlencoded];
                        next[index] = { ...next[index], enabled: Boolean(c) };
                        setUrlencoded(next);
                      }}
                    />
                    <Input data-tour="components-flow-builder-httprequestnode.input.row.key"
                      className="text-xs h-7 flex-1"
                      value={row.key}
                      placeholder="key"
                      onChange={(e) => {
                        const next = [...urlencoded];
                        next[index] = { ...next[index], key: e.target.value };
                        setUrlencoded(next);
                      }}
                    />
                    <Input data-tour="components-flow-builder-httprequestnode.input.row.value"
                      className="text-xs h-7 flex-1"
                      value={row.value}
                      placeholder="value"
                      onChange={(e) => {
                        const next = [...urlencoded];
                        next[index] = { ...next[index], value: e.target.value };
                        setUrlencoded(next);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setUrlencoded(urlencoded.filter((_, i) => i !== index))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </TabsContent>
              <TabsContent data-tour="components-flow-builder-httprequestnode.tabscontent.formdata" value="formdata" className="space-y-2">
                <Button data-tour="components-flow-builder-httprequestnode.button.common.add"
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() =>
                    setFormdata([...formdata, { key: '', value: '', enabled: true, type: 'text' }])
                  }
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('common.add', 'Add')}
                </Button>
                {formdata.map((row, index) => (
                  <div key={index} className="flex gap-1 items-center">
                    <Checkbox
                      checked={row.enabled !== false}
                      onCheckedChange={(c) => {
                        const next = [...formdata];
                        next[index] = { ...next[index], enabled: Boolean(c) };
                        setFormdata(next);
                      }}
                    />
                    <Input data-tour="components-flow-builder-httprequestnode.input.row.key"
                      className="text-xs h-7 w-20"
                      value={row.key}
                      placeholder="key"
                      onChange={(e) => {
                        const next = [...formdata];
                        next[index] = { ...next[index], key: e.target.value };
                        setFormdata(next);
                      }}
                    />
                    <Select
                      value={row.type}
                      onValueChange={(v) => {
                        const next = [...formdata];
                        next[index] = { ...next[index], type: v as 'text' | 'file' };
                        setFormdata(next);
                      }}
                    >
                      <SelectTrigger className="text-xs h-7 w-16">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="file">File</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input data-tour="components-flow-builder-httprequestnode.input.row.value"
                      className="text-xs h-7 flex-1"
                      value={row.value}
                      placeholder={row.type === 'file' ? 'https://…/file' : 'value'}
                      onChange={(e) => {
                        const next = [...formdata];
                        next[index] = { ...next[index], value: e.target.value };
                        setFormdata(next);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setFormdata(formdata.filter((_, i) => i !== index))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </TabsContent>
              <TabsContent data-tour="components-flow-builder-httprequestnode.tabscontent.binary" value="binary" className="space-y-2">
                <Label className="text-[10px] text-muted-foreground">
                  {t(
                    'flow_builder.http_binary_url_hint',
                    'URL or server-accessible path (supports {{variables}})'
                  )}
                </Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  flowId={flowId ?? undefined}
                  value={binaryUrl}
                  onChange={setBinaryUrl}
                  placeholder="https://example.com/file.bin"
                  className="flex-1 min-w-0"
                  pickerButtonClassName="h-8 w-8 p-0 shrink-0"
                />
              </TabsContent>
              <TabsContent data-tour="components-flow-builder-httprequestnode.tabscontent.graphql" value="graphql" className="space-y-2">
                <Label className="text-[10px]">{t('flow_builder.http_graphql_query', 'Query')}</Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  multiline
                  flowId={flowId ?? undefined}
                  value={graphqlQuery}
                  onChange={setGraphqlQuery}
                  placeholder="query { ... }"
                  className="flex-1 min-w-0"
                  pickerButtonClassName="h-8 w-8 p-0 self-start shrink-0"
                />
                <Label className="text-[10px]">{t('flow_builder.http_graphql_vars', 'Variables (JSON)')}</Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  multiline
                  flowId={flowId ?? undefined}
                  value={graphqlVariables}
                  onChange={setGraphqlVariables}
                  placeholder='{ "id": "1" }'
                  className="flex-1 min-w-0"
                  pickerButtonClassName="h-8 w-8 p-0 self-start shrink-0"
                />
              </TabsContent>
            </Tabs>
          </div>

          <div>
            <Label className="block mb-1 font-medium">
              {t('flow_builder.http_response_type', 'Response Type')}
            </Label>
            <Select
              value={responseType}
              onValueChange={setResponseType}
            >
              <SelectTrigger data-tour="components-flow-builder-httprequestnode.selecttrigger.flow_builder.http_select_response_type" className="text-xs h-7">
                <SelectValue
                  placeholder={t('flow_builder.http_select_response_type', 'Select response type')}
                />
              </SelectTrigger>
              <SelectContent
                className="w-40 z-50"
                side="top"
                align="start"
                sideOffset={8}
                avoidCollisions={true}
              >
                {responseTypeOptions.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                {t('flow_builder.http_retry_on_failure', 'Retry on Failure')}
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setRetryCount(Math.max(0, retryCount - 1))}
                  disabled={retryCount <= 0}
                >-</Button>
                <span className="text-xs w-8 text-center">{retryCount}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setRetryCount(Math.min(5, retryCount + 1))}
                  disabled={retryCount >= 5}
                >+</Button>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground leading-snug">
              {t('flow_builder.http_retry_help', 'Retries apply to connection failures, timeouts, and transient HTTP responses (408, 429, and 5xx). Most other status codes, including typical 4xx client errors, use a single attempt.')}
            </p>

            {retryCount > 0 && (
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">
                  {t('flow_builder.http_retry_delay_ms', 'Retry Delay (ms)')}
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setRetryDelay(Math.max(100, retryDelay - 500))}
                    disabled={retryDelay <= 100}
                  >-</Button>
                  <span className="text-xs w-12 text-center">{retryDelay}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setRetryDelay(Math.min(10000, retryDelay + 500))}
                    disabled={retryDelay >= 10000}
                  >+</Button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                {t('flow_builder.http_timeout_seconds', 'Timeout (seconds)')}
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setTimeoutValue(Math.max(1, timeout - 5))}
                  disabled={timeout <= 1}
                >-</Button>
                <span className="text-xs w-8 text-center">{timeout}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setTimeoutValue(Math.min(300, timeout + 5))}
                  disabled={timeout >= 300}
                >+</Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium cursor-pointer">
                {t('flow_builder.http_follow_redirects', 'Follow redirects')}
              </Label>
              <Switch
                checked={followRedirects}
                onCheckedChange={setFollowRedirects}
              />
            </div>
          </div>

          <div className="pt-2 border-t">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Label className="font-medium text-sm">
                  {t('flow_builder.http_response_variable_mapping', 'Response Variable Mapping')}
                </Label>
              </div>
              <Button data-tour="components-flow-builder-httprequestnode.button.flow_builder.http_add_mapping"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={addVariableMapping}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t('flow_builder.http_add_mapping', 'Add Mapping')}
              </Button>
            </div>

            {variableMappings.length === 0 ? (
              <div className="text-center py-4 border-2 border-dashed border-border rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-2">
                  {t('flow_builder.http_no_mappings_title', 'No variable mappings configured')}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {t('flow_builder.http_no_mappings_hint', 'Map response fields to flow variables for use in subsequent nodes')}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                {variableMappings.map((mapping, index) => (
                  <div key={index} className="group border rounded-lg p-2 bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex gap-2 items-center">
                      <div className="flex-1">
                        <Label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                          {t('flow_builder.http_response_field', 'Response Field')}
                        </Label>
                        <HttpResponseFieldPicker
                          value={mapping.responseField}
                          onChange={(v) => updateVariableMapping(index, 'responseField', v)}
                          paths={testResponseFieldPaths}
                          placeholder={t(
                            'flow_builder.http_placeholder_response_field',
                            'data.id'
                          )}
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
                        <div className="flex-1 min-w-0">
                          <EnhancedVariablePicker customVariables={customVariables}
                            flowId={flowId ?? undefined}
                            value={mapping.variableName}
                            onChange={(v) => updateVariableMapping(index, 'variableName', v)}
                            placeholder={t(
                              'flow_builder.http_placeholder_variable_name',
                              'http.user_id'
                            )}
                            className="text-xs h-6 border-border"
                            wrapInBraces={false}
                            pickerButtonClassName="h-6 w-6 p-0"
                          />
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 mt-4 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeVariableMapping(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    {mapping.responseField && mapping.variableName && (
                      <div className="mt-2 text-[9px] text-muted-foreground bg-muted px-2 py-1 rounded">
                        {t(
                          'flow_builder.http_mapping_preview',
                          '{{variable}} maps from envelope field {{field}} (dot paths such as data, data.id, headers)',
                          {
                            variable: `{{${mapping.variableName}}}`,
                            field: mapping.responseField
                          }
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 p-2 bg-primary/10 border border-primary/20 rounded-md">
              <p className="text-[10px] text-primary">
                <strong>{t('flow_builder.http_variable_tip_title', "💡 Tip:")}</strong>{' '}
                {t(
                  'flow_builder.http_variable_tip_body',
                  'Response field paths are relative to the HTTP result envelope (same object as http.response), e.g. data, data.items.0.id, status, or headers for the full header map. After a successful test, use the field picker (brackets icon) to insert paths from the response.'
                )}
              </p>
            </div>
          </div>

          <div className="pt-3 border-t">
            <button data-tour="components-flow-builder-httprequestnode.button.flow_builder.http_available_output_variables"
              className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center justify-between w-full p-2 rounded hover:bg-muted transition-colors"
              onClick={() => setShowVariablePreview(!showVariablePreview)}
            >
              <div className="flex items-center gap-2">
                <span>{t('flow_builder.http_available_output_variables', 'Available Output Variables')}</span>
                <span className="text-[10px] bg-muted text-muted-foreground border border-border px-1.5 py-0.5 rounded-full">
                  {t('flow_builder.http_output_variables_count', '{{count}} variables', {
                    count: 9 + variableMappings.filter((m) => m.variableName).length
                  })}
                </span>
              </div>
              {showVariablePreview ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            {showVariablePreview && (
              <div className="mt-2 space-y-2">
                <div className="text-[10px] bg-primary/10 border border-primary/20 p-2 rounded">
                  <div className="font-medium text-primary mb-2">
                    {t('flow_builder.http_builtin_variables', 'Built-in Variables')}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <button data-tour="components-flow-builder-httprequestnode.button.flow_builder.http_request_click_to_copy"
                        type="button"
                        onClick={() => void copyVariableToClipboard('{{http.response}}')}
                        className="text-primary bg-card px-1 py-0.5 rounded shrink-0 max-w-[55%] truncate cursor-pointer font-mono border-0 text-left hover:bg-muted/60 transition-colors"
                        title={t('flow_builder.http_request_click_to_copy', 'Click to copy')}
                      >
                        {'{{http.response}}'}
                      </button>
                      <span className="text-primary text-right">
                        {t('flow_builder.http_var_desc_response_full', 'Full envelope (status, data, headers, url, …)')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <button data-tour="components-flow-builder-httprequestnode.button.flow_builder.http_request_click_to_copy"
                        type="button"
                        onClick={() => void copyVariableToClipboard('{{http.lastResponse}}')}
                        className="text-primary bg-card px-1 py-0.5 rounded shrink-0 max-w-[55%] truncate cursor-pointer font-mono border-0 text-left hover:bg-muted/60 transition-colors"
                        title={t('flow_builder.http_request_click_to_copy', 'Click to copy')}
                      >
                        {'{{http.lastResponse}}'}
                      </button>
                      <span className="text-primary text-right">
                        {t('flow_builder.http_var_desc_last_response', 'Parsed body only (same as http.response.data)')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <button data-tour="components-flow-builder-httprequestnode.button.flow_builder.http_request_click_to_copy"
                        type="button"
                        onClick={() => void copyVariableToClipboard('{{http.response.status}}')}
                        className="text-primary bg-card px-1 py-0.5 rounded shrink-0 max-w-[55%] truncate cursor-pointer font-mono border-0 text-left hover:bg-muted/60 transition-colors"
                        title={t('flow_builder.http_request_click_to_copy', 'Click to copy')}
                      >
                        {'{{http.response.status}}'}
                      </button>
                      <span className="text-primary text-right">
                        {t('flow_builder.http_var_desc_status', 'HTTP status code')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <button data-tour="components-flow-builder-httprequestnode.button.flow_builder.http_request_click_to_copy"
                        type="button"
                        onClick={() => void copyVariableToClipboard('{{http.response.data}}')}
                        className="text-primary bg-card px-1 py-0.5 rounded shrink-0 max-w-[55%] truncate cursor-pointer font-mono border-0 text-left hover:bg-muted/60 transition-colors"
                        title={t('flow_builder.http_request_click_to_copy', 'Click to copy')}
                      >
                        {'{{http.response.data}}'}
                      </button>
                      <span className="text-primary text-right">
                        {t('flow_builder.http_var_desc_data', 'Parsed response body')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <button data-tour="components-flow-builder-httprequestnode.button.flow_builder.http_request_click_to_copy"
                        type="button"
                        onClick={() => void copyVariableToClipboard('{{http.response.headers}}')}
                        className="text-primary bg-card px-1 py-0.5 rounded shrink-0 max-w-[55%] truncate cursor-pointer font-mono border-0 text-left hover:bg-muted/60 transition-colors"
                        title={t('flow_builder.http_request_click_to_copy', 'Click to copy')}
                      >
                        {'{{http.response.headers}}'}
                      </button>
                      <span className="text-primary text-right">
                        {t('flow_builder.http_var_desc_headers_map', 'Response headers map')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <button data-tour="components-flow-builder-httprequestnode.button.flow_builder.http_request_click_to_copy"
                        type="button"
                        onClick={() => void copyVariableToClipboard('{{http.response.duration}}')}
                        className="text-primary bg-card px-1 py-0.5 rounded shrink-0 max-w-[55%] truncate cursor-pointer font-mono border-0 text-left hover:bg-muted/60 transition-colors"
                        title={t('flow_builder.http_request_click_to_copy', 'Click to copy')}
                      >
                        {'{{http.response.duration}}'}
                      </button>
                      <span className="text-primary text-right">
                        {t('flow_builder.http_var_desc_duration_ms', 'Request duration (ms)')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <button data-tour="components-flow-builder-httprequestnode.button.flow_builder.http_request_click_to_copy"
                        type="button"
                        onClick={() => void copyVariableToClipboard('{{http.success}}')}
                        className="text-primary bg-card px-1 py-0.5 rounded shrink-0 max-w-[55%] truncate cursor-pointer font-mono border-0 text-left hover:bg-muted/60 transition-colors"
                        title={t('flow_builder.http_request_click_to_copy', 'Click to copy')}
                      >
                        {'{{http.success}}'}
                      </button>
                      <span className="text-primary text-right">
                        {t('flow_builder.http_var_desc_success_2xx', 'True if status is 2xx')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <button data-tour="components-flow-builder-httprequestnode.button.flow_builder.http_request_click_to_copy"
                        type="button"
                        onClick={() => void copyVariableToClipboard('{{http.duration}}')}
                        className="text-primary bg-card px-1 py-0.5 rounded shrink-0 max-w-[55%] truncate cursor-pointer font-mono border-0 text-left hover:bg-muted/60 transition-colors"
                        title={t('flow_builder.http_request_click_to_copy', 'Click to copy')}
                      >
                        {'{{http.duration}}'}
                      </button>
                      <span className="text-primary text-right">
                        {t('flow_builder.http_var_desc_duration_alias', 'Alias for http.response.duration')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <button data-tour="components-flow-builder-httprequestnode.button.flow_builder.http_request_click_to_copy"
                        type="button"
                        onClick={() => void copyVariableToClipboard('{{http.status}}')}
                        className="text-primary bg-card px-1 py-0.5 rounded shrink-0 max-w-[55%] truncate cursor-pointer font-mono border-0 text-left hover:bg-muted/60 transition-colors"
                        title={t('flow_builder.http_request_click_to_copy', 'Click to copy')}
                      >
                        {'{{http.status}}'}
                      </button>
                      <span className="text-primary text-right">
                        {t('flow_builder.http_var_desc_status_alias', 'Alias for http.response.status')}
                      </span>
                    </div>
                  </div>
                </div>

                {variableMappings.filter(m => m.variableName).length > 0 && (
                  <div className="text-[10px] bg-primary/10 border border-primary/20 p-2 rounded">
                    <div className="font-medium text-primary mb-2">
                      {t('flow_builder.http_custom_mapped_variables', 'Custom Mapped Variables')}
                    </div>
                    <div className="space-y-1">
                      {variableMappings.map((mapping, index) => (
                        mapping.variableName && (
                          <div key={index} className="flex items-center justify-between gap-1">
                            <button data-tour="components-flow-builder-httprequestnode.button.flow_builder.http_request_click_to_copy"
                              type="button"
                              onClick={() =>
                                void copyVariableToClipboard(`{{${mapping.variableName}}}`)
                              }
                              className="text-primary bg-card px-1 py-0.5 rounded cursor-pointer font-mono border-0 text-left hover:bg-muted/60 transition-colors truncate max-w-[55%]"
                              title={t('flow_builder.http_request_click_to_copy', 'Click to copy')}
                            >
                              {`{{${mapping.variableName}}}`}
                            </button>
                            <span className="text-primary truncate ml-2">
                              {mapping.responseField ||
                                t('flow_builder.http_custom_mapping_fallback', 'Custom mapping')}
                            </span>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-[10px] text-muted-foreground mt-2">
            <p>
              {t(
                'flow_builder.http_node_footer',
                'The HTTP request node runs when reached in the flow and continues to the next node. Results are stored in http.response (full envelope) and http.lastResponse (parsed body, including 0, false, empty string, or null). Use {{dataVar}} or mappings for nested fields. Executes once per flow path unless variables are cleared.',
                { dataVar: '{{http.response.data}}' }
              )}
            </p>
          </div>

        </div>
      )}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      <Handle
        type="source"
        position={Position.Right}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      <PostmanImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onApply={handlePostmanApply}
        onAddNodes={handlePostmanAddNodes}
      />

      <Dialog
        open={Boolean(testVarPrompt)}
        onOpenChange={(open) => {
          if (!open) setTestVarPrompt(null);
        }}
      >
        <DialogContent data-tour="components-flow-builder-httprequestnode.dialogcontent.flow_builder.http_test_vars_title" className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('flow_builder.http_test_vars_title', 'Enter test variable values')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {t(
              'flow_builder.http_test_vars_hint',
              'These placeholders have no defaults yet. Values are used for this Test Request and remembered on the node.'
            )}
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {testVarPrompt?.names.map((name) => (
              <div key={name} className="grid grid-cols-[1fr_1.2fr] gap-2 items-center">
                <code className="text-xs truncate">{`{{${name}}}`}</code>
                <Input data-tour="components-flow-builder-httprequestnode.input.flow_builder.http_test_vars_value_placeholder"
                  className="h-8 text-xs"
                  value={testVarPrompt.values[name] ?? ''}
                  placeholder={t('flow_builder.http_test_vars_value_placeholder', 'Test value')}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTestVarPrompt((prev) =>
                      prev
                        ? { ...prev, values: { ...prev.values, [name]: value } }
                        : prev
                    );
                  }}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button data-tour="components-flow-builder-httprequestnode.button.common.cancel" variant="outline" size="sm" onClick={() => setTestVarPrompt(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-flow-builder-httprequestnode.button.flow_builder.http_test_vars_run" size="sm" onClick={() => void confirmTestVarPrompt()} disabled={isTesting}>
              {t('flow_builder.http_test_vars_run', 'Run test')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}