import { APP_ICONS } from '@/assets/icons';
import { useCallback, useMemo, useState } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { useTranslation } from '@/hooks/use-translation';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { type MediaItem, normalizeMediaNodeItems, MEDIA_ITEMS_DEFAULT_DELAY_MS, MEDIA_ITEMS_MAX_DELAY_MS } from '@shared/types/node-types';
import { MediaItemsEditor } from './MediaItemsEditor';
import { standardHandleStyle } from './StyledHandle';
import { FLOW_DEFAULT_TARGET_HANDLE_ID, FLOW_DEFAULT_SOURCE_HANDLE_ID } from './flowHandleIds';
import { NodeToolbar } from './NodeToolbar';
import type { MessageKeyword } from './messageKeyword';
import { MEDIA_NODE_AVAILABLE_VARIABLES } from './mediaNodeConstants';
import { useFlowContext } from '../../pages/flow-builder';

export function DocumentNode({ data, isConnectable, id }: any) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const initialItems = useMemo(() => normalizeMediaNodeItems(data), []);
  const [items, setItems] = useState<MediaItem[]>(initialItems);
  const [interItemDelayMs, setInterItemDelayMs] = useState<number>(
    typeof data.interItemDelayMs === 'number' ? data.interItemDelayMs : MEDIA_ITEMS_DEFAULT_DELAY_MS
  );
  const [keywords, setKeywords] = useState<MessageKeyword[]>(
    data.keywords || []
  );
  const [enableKeywordTriggers, setEnableKeywordTriggers] = useState(data.enableKeywordTriggers || false);
  const { setNodes } = useReactFlow();
  const flowContext = useFlowContext();
  const flowId = flowContext?.flowId ?? undefined;
  const customVariables = flowContext?.customVariables;

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

  const handleEnableKeywordTriggersChange = (checked: boolean) => {
    setEnableKeywordTriggers(checked);
    updateNodeData({ enableKeywordTriggers: checked });
  };

  const addKeyword = () => {
    const defaultValue = `keyword${keywords.length + 1}`;
    const newKeyword: MessageKeyword = {
      id: Date.now().toString(),
      text: defaultValue, // Set text to match value
      value: defaultValue,
      caseSensitive: false
    };
    const newKeywords = [...keywords, newKeyword];
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const removeKeyword = (keywordId: string) => {
    const newKeywords = keywords.filter(k => k.id !== keywordId);
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const updateKeyword = (keywordId: string, field: keyof MessageKeyword, value: any) => {
    const newKeywords = keywords.map(k => {
      if (k.id === keywordId) {
        const updatedKeyword = { ...k, [field]: value };

        if (field === 'value') {
          updatedKeyword.text = value;
        }
        return updatedKeyword;
      }
      return k;
    });
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const applyItemsChange = useCallback((next: MediaItem[]) => {
    setItems(next);
    updateNodeData({
      mediaItems: next,
      mediaUrl: '',
      caption: '',
      fileName: '',
      originalName: '',
      mimetype: '',
      size: 0
    });
  }, [updateNodeData]);

  return (
    <div
      className={`node-document p-3 rounded-lg bg-card border border-border shadow-sm relative group transition-[max-width,width] duration-200 ${
        isEditing ? 'min-w-[400px] w-[520px] max-w-[560px]' : 'max-w-[350px]'
      }`}
    >
      {flowContext && (
        <NodeToolbar
          id={id}
          onDuplicate={flowContext.onDuplicateNode}
          onDelete={flowContext.onDeleteNode}
        />
      )}

      <div className="font-medium flex items-center gap-2 mb-2">
        <img 
          src={APP_ICONS.documentMessage}
          alt="Document Message" 
          className="h-4 w-4"
        />
        <span>{t('flow_builder.send_document', 'Send Document')}</span>
        <button data-tour="components-flow-builder-documentnode.button.common.done"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? t('common.done', 'Done') : t('common.edit', 'Edit')}
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <MediaItemsEditor
            isEditing
            items={items}
            onChange={applyItemsChange}
            mediaKind="document"
            fileTypeAccept="application/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
            enableUrlInput
            enableFileNameField
            showCaption
            variableButtons={MEDIA_NODE_AVAILABLE_VARIABLES}
            flowId={flowId}
            customVariables={customVariables}
            emptyLabel={t('flow_builder.media_items.empty_document', 'No documents added')}
            itemTypeLabel={t('flow_builder.document_label', 'Document')}
          />
          <div className="space-y-1">
            <label className="text-xs font-medium block" htmlFor={`inter-item-delay-${id}`}>
              {t('flow_builder.media_items.delay_label', 'Delay between items (ms)')}
            </label>
            <input data-tour="components-flow-builder-documentnode.input.flow_builder.media_items.delay_label"
              id={`inter-item-delay-${id}`}
              type="number"
              min={0}
              max={MEDIA_ITEMS_MAX_DELAY_MS}
              step={100}
              className="w-full p-2 text-xs border rounded"
              value={interItemDelayMs}
              onChange={(e) => {
                const next = Math.max(0, Math.min(MEDIA_ITEMS_MAX_DELAY_MS, Number(e.target.value) || 0));
                setInterItemDelayMs(next);
                updateNodeData({ interItemDelayMs: next });
              }}
            />
            <p className="text-[10px] text-muted-foreground">
              {t('flow_builder.media_items.delay_hint', 'Delay before sending the next item in this node.')}
            </p>
          </div>

          {/* Keyword Triggers Section */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">{t('flow_builder.keyword_triggers', 'Keyword Triggers:')}</label>
              <div className="flex items-center gap-2">
                <input data-tour="components-flow-builder-documentnode.input.flow_builder.enable_keyword_triggers"
                  type="checkbox"
                  id={`enable-keywords-${id}`}
                  checked={enableKeywordTriggers}
                  onChange={(e) => handleEnableKeywordTriggersChange(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor={`enable-keywords-${id}`} className="text-xs text-muted-foreground">
                  {t('flow_builder.enable_keyword_triggers', 'Enable keyword-based routing')}
                </label>
              </div>
            </div>

            {enableKeywordTriggers && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t('flow_builder.keywords_help', 'Define keywords that will route to different paths when users respond:')}
                  </span>
                  <Button data-tour="components-flow-builder-documentnode.button.flow_builder.add_keyword"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={addKeyword}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {t('flow_builder.add_keyword', 'Add Keyword')}
                  </Button>
                </div>

                {keywords.length > 0 && (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {keywords.map((keyword, index) => (
                      <div key={keyword.id} className="border rounded p-2 space-y-2 relative">
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary text-white flex items-center justify-center text-xs font-medium">
                            {index + 1}
                          </div>
                          <div className="flex-1 text-xs font-medium">Keyword {index + 1}</div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeKeyword(keyword.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="pl-8 space-y-2">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Match Value:</label>
                            <input data-tour="components-flow-builder-documentnode.input.keyword.value"
                              className="w-full p-1.5 text-xs border rounded"
                              value={keyword.value}
                              onChange={(e) => updateKeyword(keyword.id, 'value', e.target.value)}
                              placeholder="Text to match"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`case-sensitive-${keyword.id}`}
                              checked={keyword.caseSensitive}
                              onChange={(e) => updateKeyword(keyword.id, 'caseSensitive', e.target.checked)}
                              className="w-3 h-3"
                            />
                            <label htmlFor={`case-sensitive-${keyword.id}`} className="text-xs text-muted-foreground">
                              Case sensitive
                            </label>
                          </div>
                        </div>

                        {/* Output handle for this keyword */}
                        <Handle
                          type="source"
                          position={Position.Right}
                          id={`keyword-${keyword.value.toLowerCase().replace(/\s+/g, '-')}`}
                          style={{
                            ...standardHandleStyle,
                            top: '20px',
                            right: '-12px'
                          }}
                          isConnectable={isConnectable}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {enableKeywordTriggers && (
                  <div className="text-[10px] text-muted-foreground space-y-1">
                    <div>Each keyword will create its own output connection.</div>
                    <div>A "no match" output will be available for unmatched responses.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <MediaItemsEditor
            isEditing={false}
            items={items}
            onChange={applyItemsChange}
            mediaKind="document"
            fileTypeAccept="application/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
            enableUrlInput
            enableFileNameField
            showCaption
            variableButtons={MEDIA_NODE_AVAILABLE_VARIABLES}
            flowId={flowId}
            customVariables={customVariables}
            emptyLabel={t('flow_builder.media_items.empty_document', 'No documents added')}
            itemTypeLabel={t('flow_builder.document_label', 'Document')}
          />

          {enableKeywordTriggers && keywords.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <div className="font-medium mb-1">{t('flow_builder.keyword_triggers_active', 'Keyword Triggers Active:')}</div>
              <div className="space-y-1">
                {keywords.map((keyword, index) => (
                  <div key={keyword.id} className="flex items-center gap-2 relative">
                    <div className="flex-shrink-0 w-4 h-4 rounded bg-primary text-white flex items-center justify-center text-[10px] font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium">{keyword.text}</span>
                      <span className="text-muted-foreground/70"> → "{keyword.value}"</span>
                      {keyword.caseSensitive && <span className="text-orange-600 ml-1">(case sensitive)</span>}
                    </div>

                    {/* Output handle for this keyword */}
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={`keyword-${keyword.value.toLowerCase().replace(/\s+/g, '-')}`}
                      style={{
                        ...standardHandleStyle,
                        top: '50%',
                        right: '-12px'
                      }}
                      isConnectable={isConnectable}
                    />
                  </div>
                ))}

                {/* No match handle */}
                <div className="flex items-center gap-2 relative mt-2 pt-2 border-t border-border/50">
                  <div className="flex-shrink-0 w-4 h-4 rounded bg-muted-foreground text-primary-foreground flex items-center justify-center text-[10px] font-medium">
                    ?
                  </div>
                  <div className="flex-1 text-muted-foreground">
                    {t('flow_builder.no_match_route', 'No keyword match')}
                  </div>

                  <Handle
                    type="source"
                    position={Position.Right}
                    id="no-match"
                    style={{
                      ...standardHandleStyle,
                      top: '50%',
                      right: '-12px',
                      background: '#9ca3af'
                    }}
                    isConnectable={isConnectable}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        id={FLOW_DEFAULT_TARGET_HANDLE_ID}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      {/* Default output: next node after document send (when keyword routing is off). Keyword outputs use handles above. */}
      <Handle
        type="source"
        position={Position.Right}
        id={FLOW_DEFAULT_SOURCE_HANDLE_ID}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}
