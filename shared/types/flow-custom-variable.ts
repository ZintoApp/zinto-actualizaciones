export interface FlowCustomVariable {
  id: string;
  name: string;
  label: string;
  description?: string;
  dataType: 'text';
  defaultValue?: string;
  createdAt: string;
}
