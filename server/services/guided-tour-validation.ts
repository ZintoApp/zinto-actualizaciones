import selectorParser from 'postcss-selector-parser';
import { TOUR_FEATURES, TOUR_SIGNALS, isSupportedTourRoute } from '../../shared/guided-tour-registry';
import { tourPublicationErrors, type TourDefinition } from '../../shared/guided-tours';

// Shared by package validation and normal authoring; no executable adapters are accepted.
export function tourConfigurationErrors(definition: TourDefinition): string[] {
  const errors: string[] = [];
  if (!TOUR_FEATURES.some(feature => feature.id === definition.feature)) errors.push('unknown_feature');
  if (![...definition.routes, ...definition.steps.flatMap(step => [step.route, step.completion.type === 'route' ? step.completion.path : undefined].filter(Boolean) as string[])].every(isSupportedTourRoute)) errors.push('unsupported_route');
  try {
    for (const step of definition.steps) for (const selector of [step.target, (step.completion.type === 'click' || step.completion.type === 'change') ? step.completion.selector : undefined]) {
      if (selector) selectorParser().astSync(selector.replace(/\{\{[^}]+\}\}/g, 'resource'));
    }
  } catch { errors.push('invalid_selector'); }
  errors.push(...tourPublicationErrors(definition, TOUR_SIGNALS).filter(error => !['default_language', 'media_description'].includes(error)));
  return [...new Set(errors)];
}
