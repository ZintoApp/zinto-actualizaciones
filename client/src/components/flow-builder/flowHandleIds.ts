/** Distinct default handle ids so React Flow can validate self-loops (same node → same node). */
export const FLOW_DEFAULT_TARGET_HANDLE_ID = 'flow-in';
export const FLOW_DEFAULT_SOURCE_HANDLE_ID = 'flow-out';
export const AI_VARIABLES_COMPLETE_HANDLE_ID = 'variables-complete';
/** AI Assistant target handle for incoming MCP Client Tool sub-tool edges (config-time, not control-flow). */
export const AI_TOOL_INPUT_HANDLE_ID = 'tool-input';
/** AI Assistant source handle: outbound route after successful Google Calendar `book_appointment`. */
export const AI_CALENDAR_BOOKING_COMPLETED_HANDLE_ID = 'calendar-booking-completed';
/** Message Trigger source handle for the initial-message branch (first inbound after contact creation). */
export const MESSAGE_TRIGGER_INITIAL_HANDLE_ID = 'initial-message';
