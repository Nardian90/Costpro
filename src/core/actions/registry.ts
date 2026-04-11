import { ActionDefinition, ActionHandler } from './types';

class ActionRegistry {
  private actions: Map<string, ActionDefinition> = new Map();

  register(action: ActionDefinition) {
    this.actions.set(action.id, action);
  }

  dispatch(id: string, payload?: any) {
    const action = this.actions.get(id);
    if (action) {
      console.log(`[ActionBus] Dispatching ${id}`, payload);
      return action.handler(payload);
    }
    console.warn(`[ActionBus] Action ${id} not found`);
  }

  getActions() {
    return Array.from(this.actions.values());
  }
}

export const actionBus = new ActionRegistry();
