export interface PipelineFilters {
  searchTerm?: string;
  pipelineIds?: number[];
  stageIds?: number[];
  priorities?: ('low' | 'medium' | 'high')[];
  minValue?: number;
  maxValue?: number;
  dueDateFrom?: string;
  dueDateTo?: string;
  assignedUserIds?: number[];
  includeUnassigned?: boolean;
  tags?: string[];
  status?: string;
  createdFrom?: string;
  createdTo?: string;
  customFields?: Record<string, {operator: 'equals' | 'contains' | 'gt' | 'lt' | 'inArray'; value: string | number | string[]}>;
}
