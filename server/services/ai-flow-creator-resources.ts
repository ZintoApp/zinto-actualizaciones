export type CreatorCustomFieldEntity = 'contact' | 'deal';

type CompanyCustomFieldResource = {
  id: number;
  entity: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  options?: unknown;
  required?: boolean | null;
};

export type AiFlowCreatorCustomFieldResource = {
  id: number;
  entity: CreatorCustomFieldEntity;
  fieldName: string;
  /** Compatibility alias used by existing Flow Creator resource consumers. */
  name: string;
  label: string;
  type: string;
  options: unknown;
  required: boolean;
};

/** Projects company custom-field rows into safe metadata the Flow Creator can reference. */
export function mapAiFlowCreatorCustomFields(
  fields: CompanyCustomFieldResource[],
  entity: CreatorCustomFieldEntity,
): AiFlowCreatorCustomFieldResource[] {
  return fields
    .filter((field) => field.entity === entity)
    .map((field) => ({
      id: field.id,
      entity,
      fieldName: field.fieldName,
      name: field.fieldName,
      label: field.fieldLabel,
      type: field.fieldType,
      options: field.options ?? null,
      required: Boolean(field.required),
    }));
}
