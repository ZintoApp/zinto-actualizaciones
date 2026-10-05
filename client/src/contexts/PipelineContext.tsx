import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { PipelineFilters } from '@shared/types/pipeline-filters';
import { useToast } from '@/hooks/use-toast';

interface Pipeline {
  id: number;
  companyId: number | null;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  isTemplate: boolean;
  templateCategory: string | null;
  orderNum: number;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PipelineContextType {
  activePipelineId: number | null;
  setActivePipelineId: (pipelineId: number | null) => void;
  pipelines: Pipeline[];
  isLoading: boolean;
  activePipeline: Pipeline | null;
  filters: PipelineFilters;
  setFilters: (filters: PipelineFilters | ((prev: PipelineFilters) => PipelineFilters)) => void;
  clearFilters: () => void;
  activeFilterCount: number;
}

const PipelineContext = createContext<PipelineContextType | undefined>(undefined);

interface PipelineProviderProps {
  children: ReactNode;
  syncUrl?: boolean;
}

export function PipelineProvider({ children, syncUrl = true }: PipelineProviderProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activePipelineId, setActivePipelineIdState] = useState<number | null>(null);
  const [filters, setFiltersState] = useState<PipelineFilters>({});
  const urlUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);

  const {
    data: pipelines = [],
    isLoading
  } = useQuery({
    queryKey: ['/api/pipelines'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/pipelines');
      return res.json();
    },
  });

  // Read pipelineId and filters from URL on mount
  useEffect(() => {
    if (!syncUrl) return;

    const params = new URLSearchParams(window.location.search);
    const pipelineIdFromUrl = params.get('pipelineId');
    if (pipelineIdFromUrl) {
      const id = parseInt(pipelineIdFromUrl);
      if (!isNaN(id)) {
        setActivePipelineIdState(id);
      }
    }

    // Read filters from URL
    const filtersParam = params.get('filters');
    if (filtersParam) {
      try {
        const parsedFilters = JSON.parse(decodeURIComponent(filtersParam));
        if (typeof parsedFilters === 'object' && parsedFilters !== null) {
          setFiltersState(parsedFilters);
          toast({
            title: 'Filters loaded',
            description: 'Filters loaded from URL',
          });
        }
      } catch (error) {
        console.error('Error parsing filters from URL:', error);
        toast({
          title: 'Invalid filters',
          description: 'Could not load filters from URL. Using default filters.',
          variant: 'destructive',
        });
        // Clear the invalid filters param from URL
        const params = new URLSearchParams(window.location.search);
        params.delete('filters');
        const paramsString = params.toString();
        window.history.replaceState({}, '', paramsString ? `${window.location.pathname}?${paramsString}` : window.location.pathname);
      }
    }

  }, [syncUrl, toast]);

  // Set default pipeline when pipelines load
  useEffect(() => {
    if (pipelines.length > 0 && !activePipelineId) {
      const defaultPipeline = pipelines.find((p: Pipeline) => p.isDefault) || pipelines[0];
      if (defaultPipeline) {
        setActivePipelineIdState(defaultPipeline.id);
        if (syncUrl) {
          updateUrl(defaultPipeline.id);
        }
      }
    } else if (pipelines.length > 0 && activePipelineId) {
      // Validate that activePipelineId exists in pipelines
      const pipelineExists = pipelines.some((p: Pipeline) => p.id === activePipelineId);
      if (!pipelineExists) {
        const defaultPipeline = pipelines.find((p: Pipeline) => p.isDefault) || pipelines[0];
        if (defaultPipeline) {
          setActivePipelineIdState(defaultPipeline.id);
          if (syncUrl) {
            updateUrl(defaultPipeline.id);
          }
        }
      }
    }
  }, [pipelines, activePipelineId, syncUrl]);

  // Clear or reconcile stageIds when activePipelineId changes
  const prevPipelineIdRef = useRef<number | null>(null);
  useEffect(() => {
    const prevPipelineId = prevPipelineIdRef.current;
    
    // Only reconcile if pipeline actually changed and we have stageIds to check
    if (activePipelineId !== null && activePipelineId !== prevPipelineId && filters.stageIds && filters.stageIds.length > 0) {
      // Fetch stages for the new pipeline to validate stageIds
      apiRequest('GET', `/api/pipeline/stages?pipelineId=${activePipelineId}`)
        .then((res) => res.json())
        .then((stages: any[]) => {
          const validStageIds = stages.map((s: any) => s.id);
          const currentStageIds = filters.stageIds!;
          const invalidStageIds = currentStageIds.filter(id => !validStageIds.includes(id));
          
          if (invalidStageIds.length > 0) {
            // Remove invalid stageIds that don't belong to the new pipeline
            const updatedStageIds = currentStageIds.filter(id => validStageIds.includes(id));
            setFiltersState((prev) => {
              const updated = {
                ...prev,
                stageIds: updatedStageIds.length > 0 ? updatedStageIds : undefined,
              };
              if (syncUrl) {
                updateUrl(undefined, updated, true);
              }
              return updated;
            });
          }
        })
        .catch((error) => {
          console.error('Error validating stageIds when pipeline changed:', error);
          // On error, clear stageIds to avoid filtering out all deals
          setFiltersState((prev) => {
            const updated = { ...prev, stageIds: undefined };
            if (syncUrl) {
              updateUrl(undefined, updated, true);
            }
            return updated;
          });
        });
    }
    
    // Update ref after processing
    prevPipelineIdRef.current = activePipelineId;
  }, [activePipelineId, filters.stageIds, syncUrl]);

  const updateUrl = (pipelineId?: number, filtersToUpdate?: PipelineFilters, debounce = false) => {
    if (!syncUrl) return;

    const performUpdate = () => {
      const params = new URLSearchParams(window.location.search);
      
      if (pipelineId !== undefined) {
        if (pipelineId) {
          params.set('pipelineId', pipelineId.toString());
        } else {
          params.delete('pipelineId');
        }
      }

      const filtersToSerialize = filtersToUpdate !== undefined ? filtersToUpdate : filters;
      const hasFilters = Object.keys(filtersToSerialize).some(key => {
        const value = filtersToSerialize[key as keyof PipelineFilters];
        if (Array.isArray(value)) {
          return value.length > 0;
        }
        return value !== undefined && value !== null && value !== '';
      });

      if (hasFilters) {
        params.set('filters', encodeURIComponent(JSON.stringify(filtersToSerialize)));
      } else {
        params.delete('filters');
      }

      // Compute the next URL
      const paramsString = params.toString();
      const nextUrl = paramsString 
        ? `${window.location.pathname}?${paramsString}`
        : window.location.pathname;
      
      // Compare with current URL and only update if different
      const currentUrl = window.location.pathname + window.location.search;
      if (nextUrl !== currentUrl) {
        window.history.replaceState({}, '', nextUrl);
      }
    };

    if (debounce) {
      // Clear existing timer
      if (urlUpdateTimerRef.current) {
        clearTimeout(urlUpdateTimerRef.current);
      }
      // Schedule debounced update
      urlUpdateTimerRef.current = setTimeout(performUpdate, 300);
    } else {
      // Immediate update (for pipeline ID changes)
      performUpdate();
    }
  };

  const setActivePipelineId = (pipelineId: number | null) => {
    setActivePipelineIdState(pipelineId);
    if (syncUrl) {
      updateUrl(pipelineId ?? undefined);
    }
  };

  const setFilters = (newFilters: PipelineFilters | ((prev: PipelineFilters) => PipelineFilters)) => {
    setFiltersState((prev) => {
      const updated = typeof newFilters === 'function' ? newFilters(prev) : newFilters;
      // Debounce URL updates for filter changes to avoid spamming navigation events
      if (syncUrl) {
        updateUrl(undefined, updated, true);
      }
      return updated;
    });
  };

  const clearFilters = () => {
    setFiltersState({});
    if (syncUrl) {
      updateUrl(undefined, {}, true);
    }
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (urlUpdateTimerRef.current) {
        clearTimeout(urlUpdateTimerRef.current);
      }
    };
  }, []);

  const activeFilterCount = useMemo(() => {
    return Object.keys(filters).filter(key => {
      const value = filters[key as keyof PipelineFilters];
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== undefined && value !== null && value !== '';
    }).length;
  }, [filters]);

  const activePipeline = pipelines.find((p: Pipeline) => p.id === activePipelineId) || null;

  const contextValue: PipelineContextType = {
    activePipelineId,
    setActivePipelineId,
    pipelines,
    isLoading,
    activePipeline,
    filters,
    setFilters,
    clearFilters,
    activeFilterCount,
  };

  return (
    <PipelineContext.Provider value={contextValue}>
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipeline(): PipelineContextType {
  const context = useContext(PipelineContext);
  if (context === undefined) {
    throw new Error('usePipeline must be used within a PipelineProvider');
  }
  return context;
}
