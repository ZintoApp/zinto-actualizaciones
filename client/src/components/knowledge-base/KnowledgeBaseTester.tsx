import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Search, 
  Play, 
  Loader2, 
  FileText, 
  Clock,
  Target,
  Zap,
  AlertCircle,
  CheckCircle,
  Copy
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SearchResult {
  content: string;
  similarity: number;
  denseScore?: number;
  lexicalScore?: number;
  fusedScore?: number;
  document: {
    id: number;
    filename: string;
    originalName: string;
  };
  chunk: {
    index: number;
    tokenCount: number;
  };
}

interface PrecisionStats {
  candidateCount: number;
  dedupedCount: number;
  dedupeCollapsed: number;
  mmrApplied: boolean;
  rerankApplied: boolean;
  rerankDurationMs: number;
  topRerankScore: number;
  rerankMargin: number;
}

interface TestResult {
  originalPrompt: string;
  enhancedPrompt: string;
  contextUsed: string[];
  stats: {
    chunksRetrieved: number;
    chunksUsed: number;
    averageSimilarity: number;
    retrievalDurationMs: number;
    confidence: number;
    confidenceThreshold?: number;
    precisionStats: PrecisionStats;
  };
}

interface RetrievalDiagnosticRow {
  id: number;
  queryText: string;
  createdAt: string;
  turnCorrelationId?: string | null;
  confidence: number | null;
  confidenceThreshold: number | null;
  chunksRetrieved: number | null;
  abstained: boolean | null;
  abstainReason: string | null;
  answerValidated: boolean | null;
  validationGrounded: boolean | null;
  rerankApplied: boolean | null;
  topRerankScore: number | null;
}

function groupRetrievalDiagnostics(
  rows: RetrievalDiagnosticRow[]
): Array<{ key: string; rows: RetrievalDiagnosticRow[] }> {
  const seenTurnIds = new Set<string>();
  const groups: Array<{ key: string; rows: RetrievalDiagnosticRow[] }> = [];

  for (const row of rows) {
    if (row.turnCorrelationId) {
      if (seenTurnIds.has(row.turnCorrelationId)) {
        continue;
      }
      seenTurnIds.add(row.turnCorrelationId);
      groups.push({
        key: row.turnCorrelationId,
        rows: rows
          .filter((candidate) => candidate.turnCorrelationId === row.turnCorrelationId)
          .sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          ),
      });
    } else {
      groups.push({ key: String(row.id), rows: [row] });
    }
  }

  return groups;
}

function RetrievalDiagnosticRowView({ row }: { row: RetrievalDiagnosticRow }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2 border rounded-md p-3 text-sm">
      <span className="font-medium truncate max-w-md" title={row.queryText}>
        {row.queryText}
      </span>
      {row.confidence != null && (
        <Badge variant="secondary">
          {t('knowledge_base.test.confidence', 'Confidence')}{' '}
          {(row.confidence * 100).toFixed(0)}%
        </Badge>
      )}
      {row.abstained && (
        <Badge variant="destructive">
          {row.abstainReason ?? t('knowledge_base.test.abstained', 'abstained')}
        </Badge>
      )}
      {row.answerValidated && (
        <Badge variant={row.validationGrounded ? 'default' : 'destructive'}>
          {row.validationGrounded
            ? t('knowledge_base.test.validated_grounded', 'grounded')
            : t('knowledge_base.test.validated_not_grounded', 'not grounded')}
        </Badge>
      )}
      <span className="text-xs text-muted-foreground ml-auto">
        {new Date(row.createdAt).toLocaleString()}
      </span>
    </div>
  );
}

interface KnowledgeBaseTesterProps {
  nodeId: string;
  systemPrompt?: string;
}

export function KnowledgeBaseTester({ 
  nodeId, 
  systemPrompt = 'You are a helpful assistant.' 
}: KnowledgeBaseTesterProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());

  const { data: recentRetrievals } = useQuery({
    queryKey: ['knowledge-base-diagnostics', nodeId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/knowledge-base/diagnostics/${nodeId}?limit=10`);
      if (!response.ok) {
        return [] as RetrievalDiagnosticRow[];
      }
      const result = await response.json();
      return (result.data ?? []) as RetrievalDiagnosticRow[];
    },
  });

  const groupedRetrievals = useMemo(
    () => groupRetrievalDiagnostics(recentRetrievals ?? []),
    [recentRetrievals]
  );


  const parseKnowledgeBaseApiError = (errorBody: { error?: string; details?: string }, fallback: string) =>
    errorBody.details || errorBody.error || fallback;

  const searchMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      const response = await apiRequest('POST', '/api/knowledge-base/search', {
        query: searchQuery,
        nodeId,
        maxResults: 5
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(parseKnowledgeBaseApiError(error, 'Search failed'));
      }
      
      return response.json();
    },
    onSuccess: (result) => {
      setSearchResults(result.data.results);
    },
    onError: (error: Error) => {
      setSearchResults([]);
      toast({
        title: t('knowledge_base.test.search_error', 'Search failed'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });


  const testMutation = useMutation({
    mutationFn: async (testQuery: string) => {
      const response = await apiRequest('POST', '/api/knowledge-base/test-query', {
        query: testQuery,
        nodeId,
        systemPrompt
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(parseKnowledgeBaseApiError(error, 'Test failed'));
      }
      
      return response.json();
    },
    onSuccess: (result) => {
      setTestResult(result.data);
    },
    onError: (error: Error) => {
      setTestResult(null);
      toast({
        title: t('knowledge_base.test.test_error', 'Test failed'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleSearch = async () => {
    if (!query.trim()) return;
    await searchMutation.mutateAsync(query);
  };

  const handleTest = async () => {
    if (!query.trim()) return;
    await testMutation.mutateAsync(query);
  };

  const toggleChunkExpansion = (index: number) => {
    const newExpanded = new Set(expandedChunks);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedChunks(newExpanded);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: t('common.copied', 'Copied to clipboard'),
        description: t('knowledge_base.test.prompt_copied', 'Enhanced prompt copied to clipboard')
      });
    } catch (error) {
      toast({
        title: t('common.copy_failed', 'Copy failed'),
        description: t('common.copy_failed_desc', 'Failed to copy to clipboard'),
        variant: 'destructive'
      });
    }
  };

  const formatSimilarity = (similarity: number) => {
    return (similarity * 100).toFixed(1) + '%';
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.8) return 'text-green-600 bg-green-100';
    if (similarity >= 0.6) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const formatScore = (score: number | undefined) =>
    score != null ? (score * 100).toFixed(1) + '%' : null;

  return (
    <div className="space-y-6">
      {/* Query Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            {t('knowledge_base.test.title', 'Knowledge Base Tester')}
          </CardTitle>
          <CardDescription>
            {t('knowledge_base.test.description', 'Test how your knowledge base retrieves and enhances responses for different queries')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>
              {t('knowledge_base.test.query_label', 'Test Query')}
            </Label>
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('knowledge_base.test.query_placeholder', 'Enter a question or query to test against your knowledge base...')}
              rows={3}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSearch}
              disabled={!query.trim() || searchMutation.isPending}
              variant="outline"
            >
              {searchMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              {t('knowledge_base.test.search_button', 'Search Only')}
            </Button>
            
            <Button
              onClick={handleTest}
              disabled={!query.trim() || testMutation.isPending}
            >
              {testMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              {t('knowledge_base.test.test_button', 'Test RAG Enhancement')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              {t('knowledge_base.test.search_results', 'Search Results')}
            </CardTitle>
            <CardDescription>
              {searchResults.length} {t('knowledge_base.test.chunks_found', 'relevant chunks found')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {searchResults.map((result, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{result.document.originalName}</span>
                    <Badge variant="secondary" className="text-xs">
                      Chunk {result.chunk.index + 1}
                    </Badge>
                  </div>
                  <Badge className={`text-xs ${getSimilarityColor(result.similarity)}`}>
                    {formatSimilarity(result.similarity)} match
                  </Badge>
                </div>
                {(result.denseScore != null || result.lexicalScore != null || result.fusedScore != null) && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {result.denseScore != null && (
                      <Badge variant="outline" className="text-xs">
                        dense {formatScore(result.denseScore)}
                      </Badge>
                    )}
                    {result.lexicalScore != null && (
                      <Badge variant="outline" className="text-xs">
                        lexical {formatScore(result.lexicalScore)}
                      </Badge>
                    )}
                    {result.fusedScore != null && (
                      <Badge variant="outline" className="text-xs">
                        fused {formatScore(result.fusedScore)}
                      </Badge>
                    )}
                  </div>
                )}
                
                <Collapsible>
                  <CollapsibleTrigger
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
                    onClick={() => toggleChunkExpansion(index)}
                  >
                    {expandedChunks.has(index) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    {t('knowledge_base.test.view_content', 'View content')} ({result.chunk.tokenCount} tokens)
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="p-3 bg-gray-50 rounded text-sm whitespace-pre-wrap">
                      {result.content}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Test Results */}
      {testResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              {t('knowledge_base.test.enhancement_results', 'RAG Enhancement Results')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{testResult.stats.chunksRetrieved}</div>
                <div className="text-sm text-blue-600">{t('knowledge_base.test.chunks_retrieved', 'Chunks Retrieved')}</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{testResult.stats.chunksUsed}</div>
                <div className="text-sm text-green-600">{t('knowledge_base.test.chunks_used', 'Chunks Used')}</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {formatSimilarity(testResult.stats.averageSimilarity)}
                </div>
                <div className="text-sm text-purple-600">{t('knowledge_base.test.avg_similarity', 'Avg Similarity')}</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{testResult.stats.retrievalDurationMs}ms</div>
                <div className="text-sm text-orange-600">{t('knowledge_base.test.retrieval_time', 'Retrieval Time')}</div>
              </div>
            </div>

            {(testResult.stats.confidence != null || testResult.stats.precisionStats) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className={`text-center p-3 rounded-lg ${
                  testResult.stats.confidenceThreshold != null &&
                  testResult.stats.confidence < testResult.stats.confidenceThreshold
                    ? 'bg-red-50'
                    : 'bg-teal-50'
                }`}>
                  <div className={`text-2xl font-bold ${
                    testResult.stats.confidenceThreshold != null &&
                    testResult.stats.confidence < testResult.stats.confidenceThreshold
                      ? 'text-red-600'
                      : 'text-teal-600'
                  }`}>
                    {(testResult.stats.confidence * 100).toFixed(1)}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t('knowledge_base.test.confidence', 'Confidence')}
                    {testResult.stats.confidenceThreshold != null && (
                      <span className="block text-xs">
                        {t('knowledge_base.test.confidence_threshold', 'threshold')}{' '}
                        {(testResult.stats.confidenceThreshold * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-700">
                    {testResult.stats.precisionStats.candidateCount}
                  </div>
                  <div className="text-sm text-slate-600">
                    {t('knowledge_base.test.candidates', 'Candidates')}
                  </div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-700">
                    {testResult.stats.precisionStats.dedupedCount}
                  </div>
                  <div className="text-sm text-slate-600">
                    {t('knowledge_base.test.after_dedupe', 'After dedupe')}
                  </div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-700">
                    {testResult.stats.precisionStats.rerankApplied
                      ? testResult.stats.precisionStats.topRerankScore.toFixed(2)
                      : '—'}
                  </div>
                  <div className="text-sm text-slate-600">
                    {t('knowledge_base.test.top_rerank_score', 'Top rerank score')}
                  </div>
                </div>
              </div>
            )}

            <Separator />

            {/* Original vs Enhanced Prompt */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">
                {t('knowledge_base.test.prompt_comparison', 'Prompt Comparison')}
              </h3>
              
              {/* Original Prompt */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    {t('knowledge_base.test.original_prompt', 'Original System Prompt')}
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(testResult.originalPrompt)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <div className="p-3 bg-gray-50 rounded text-sm whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {testResult.originalPrompt}
                </div>
                <div className="text-xs text-gray-500">
                  {testResult.originalPrompt.length} characters
                </div>
              </div>

              {/* Enhanced Prompt */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    {t('knowledge_base.test.enhanced_prompt', 'Enhanced System Prompt')}
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(testResult.enhancedPrompt)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <div className="p-3 bg-green-50 border border-green-200 rounded text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {testResult.enhancedPrompt}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{testResult.enhancedPrompt.length} characters</span>
                  <span className="text-green-600">
                    +{testResult.enhancedPrompt.length - testResult.originalPrompt.length} characters added
                  </span>
                </div>
              </div>
            </div>

            {/* Context Used */}
            {testResult.contextUsed.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {t('knowledge_base.test.context_used', 'Context Chunks Used')}
                </Label>
                <div className="space-y-2">
                  {testResult.contextUsed.map((context, index) => (
                    <div key={index} className="p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">
                          Chunk {index + 1}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {context.length} characters
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap">
                        {context}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {groupedRetrievals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {t('knowledge_base.test.recent_retrievals', 'Recent retrievals')}
            </CardTitle>
            <CardDescription>
              {t('knowledge_base.test.recent_retrievals_desc', 'Latest tracked retrieval turns for this node')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {groupedRetrievals.map((group) => (
              <div key={group.key} className="space-y-2">
                {group.rows.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    {t('knowledge_base.test.turn_retrievals', '{{count}} retrievals in turn', {
                      count: group.rows.length,
                    })}
                  </p>
                )}
                {group.rows.map((row) => (
                  <RetrievalDiagnosticRowView key={row.id} row={row} />
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
