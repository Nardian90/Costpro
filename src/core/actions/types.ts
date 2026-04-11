export type ActionHandler = (payload?: any) => void | Promise<void>;

export interface ActionDefinition {
  id: string;
  label: string;
  handler: ActionHandler;
}
