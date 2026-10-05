/** Intermediate + HTTP-node shapes for Postman collection import. */

export type PostmanSchemaVersion = '2.0' | '2.1';

export type AuthSource = 'collection' | 'folder' | 'request';

export type HeaderSource = AuthSource | 'request';

export interface KeyValueRow {
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
  /** Where this row originated (for auth/header preview). */
  source?: HeaderSource;
}

export type ParsedAuthType = 'none' | 'bearer' | 'basic' | 'apikey' | 'other';

export interface ParsedAuth {
  type: ParsedAuthType;
  source: AuthSource;
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  /** Raw Postman auth type string when type === 'other'. */
  otherType?: string;
}

export type ParsedBodyMode = 'none' | 'raw' | 'urlencoded' | 'formdata' | 'file' | 'graphql';

export interface ParsedFormDataRow extends KeyValueRow {
  type: 'text' | 'file';
  /** Original Postman file src (local path); cleared by mapper. */
  src?: string;
}

export interface ParsedBody {
  mode: ParsedBodyMode;
  raw?: string;
  rawLanguage?: string;
  urlencoded?: KeyValueRow[];
  formdata?: ParsedFormDataRow[];
  fileSrc?: string;
  graphql?: { query: string; variables: string };
}

export interface ParsedRequest {
  id: string;
  name: string;
  folderPath: string[];
  method: string;
  /** Base URL without query string. */
  url: string;
  urlRaw?: string;
  params: KeyValueRow[];
  headers: KeyValueRow[];
  auth: ParsedAuth;
  body: ParsedBody;
}

export interface PickerNode {
  id: string;
  name: string;
  type: 'folder' | 'request';
  children?: PickerNode[];
  requestId?: string;
}

export interface ParsedCollection {
  name: string;
  schemaVersion: PostmanSchemaVersion;
  tree: PickerNode[];
  requests: ParsedRequest[];
  /** Collection-level variable key → value. */
  variables: Record<string, string>;
}

export interface ParsedEnvironment {
  name: string;
  values: Record<string, string>;
}

export type HttpBodyType = 'none' | 'raw' | 'urlencoded' | 'formdata' | 'binary' | 'graphql';

export type HttpRawLanguage = 'json' | 'text' | 'xml' | 'html' | 'javascript';

export interface HttpKeyValueRow {
  key: string;
  value: string;
  enabled: boolean;
}

export interface HttpFormDataRow extends HttpKeyValueRow {
  type: 'text' | 'file';
}

export interface HttpRequestConfig {
  url: string;
  method: string;
  headers: HttpKeyValueRow[];
  params: HttpKeyValueRow[];
  bodyType: HttpBodyType;
  /** Raw body text; also kept in `body` for legacy compatibility. */
  body: string;
  rawLanguage: HttpRawLanguage;
  urlencoded: HttpKeyValueRow[];
  formdata: HttpFormDataRow[];
  binaryUrl: string;
  graphqlQuery: string;
  graphqlVariables: string;
  authType: 'none' | 'bearer' | 'basic' | 'apikey';
  authToken: string;
  authUsername: string;
  authPassword: string;
  authApiKey: string;
  authApiKeyHeader: string;
}

export type VariableMapAction = 'leave' | 'literal' | 'flow';

export interface VariableMappingChoice {
  name: string;
  action: VariableMapAction;
  /** Used when action is literal or flow (flow var name without braces). */
  value?: string;
  suggested?: string;
}

export interface MapRequestResult {
  config: HttpRequestConfig;
  warnings: string[];
  /** Comments removed from JSON raw body. */
  commentsRemoved: number;
}

export class PostmanParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PostmanParseError';
  }
}
