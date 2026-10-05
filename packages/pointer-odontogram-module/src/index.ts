export { default as OdontogramApp } from './App';
export { default } from './App';
export type { OdontogramThemeConfig, OdontogramPlugin, PluginLayer } from './App';
export type { OdontogramSummary, OdontogramSummarySection } from './odontogram';
export type { NumberingSystem } from './utils/numbering';
export {
  collectOdontogramPayload,
  importOdontogramPayload,
  importFhirBundle,
  onStateChange,
  setReadOnly,
  initOdontogram,
  destroyOdontogram,
} from './odontogram';
import './index.css';
