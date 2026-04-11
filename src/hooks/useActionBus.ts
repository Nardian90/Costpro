import { actionBus } from '@/core/actions/registry';

export function useActionBus() {
  return {
    dispatch: actionBus.dispatch.bind(actionBus),
    register: actionBus.register.bind(actionBus)
  };
}
