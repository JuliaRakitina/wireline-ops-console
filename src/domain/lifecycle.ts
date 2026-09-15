import type { Lifecycle, LifecycleAction } from './types';

/** Invalid actions are inert: a paused run cannot silently become a new running session. */
export function transition(state: Lifecycle, action: LifecycleAction): Lifecycle {
  if (action.type === 'reset') return { phase: 'idle' };
  if (action.type === 'fault') return { phase: 'faulted', reason: action.reason };
  if (action.type === 'stop' && state.phase !== 'idle') return { phase: 'stopped' };

  switch (state.phase) {
    case 'idle':
    case 'stopped':
    case 'faulted':
      return action.type === 'connect' ? { phase: 'connecting' } : state;
    case 'connecting':
      return action.type === 'ready' ? { phase: 'ready' } : state;
    case 'ready':
      return action.type === 'start' ? { phase: 'running', direction: 'down' } : state;
    case 'running':
      if (action.type === 'pause') return { phase: 'paused', direction: state.direction };
      if (action.type === 'reverse')
        return { phase: 'running', direction: state.direction === 'down' ? 'up' : 'down' };
      return state;
    case 'paused':
      if (action.type === 'resume') return { phase: 'running', direction: state.direction };
      if (action.type === 'reverse')
        return { phase: 'paused', direction: state.direction === 'down' ? 'up' : 'down' };
      return state;
  }
}
