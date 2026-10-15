import type { Supply } from '@/api';

export type CartLine = { supplyId: string; name: string; unit: string; stock: number; quantity: number };

export type CartState = {
  lines: CartLine[];
  drafts: Record<string, number>;
};

export type CartAction =
  | { type: 'setDraft'; supply: Supply; value: number }
  | { type: 'stepDraft'; supply: Supply; delta: 1 | -1 }
  | { type: 'add'; supply: Supply }
  | { type: 'remove'; supplyId: string }
  | { type: 'syncStock'; supplies: Supply[] }
  | { type: 'clear' };

export const initialCart: CartState = { lines: [], drafts: {} };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const quantityInCart = (state: CartState, supplyId: string) =>
  state.lines.find((line) => line.supplyId === supplyId)?.quantity ?? 0;

export const remainingFor = (state: CartState, supply: Pick<Supply, 'id' | 'stock'>) =>
  Math.max(supply.stock - quantityInCart(state, supply.id), 0);

export const cartReducer = (state: CartState, action: CartAction): CartState => {
  switch (action.type) {
    case 'setDraft': {
      const value = clamp(Math.trunc(action.value) || 0, 0, remainingFor(state, action.supply));
      return { ...state, drafts: { ...state.drafts, [action.supply.id]: value } };
    }
    case 'stepDraft': {
      const current = state.drafts[action.supply.id] ?? 0;
      return cartReducer(state, { type: 'setDraft', supply: action.supply, value: current + action.delta });
    }
    case 'add': {
      const { supply } = action;
      const remaining = remainingFor(state, supply);
      if (remaining === 0) return state;
      const draft = state.drafts[supply.id] ?? 0;
      const toAdd = clamp(draft > 0 ? draft : 1, 1, remaining);
      const exists = state.lines.some((line) => line.supplyId === supply.id);
      const lines = exists
        ? state.lines.map((line) =>
            line.supplyId === supply.id ? { ...line, stock: supply.stock, quantity: line.quantity + toAdd } : line,
          )
        : [...state.lines, { supplyId: supply.id, name: supply.name, unit: supply.unit, stock: supply.stock, quantity: toAdd }];
      return { lines, drafts: { ...state.drafts, [supply.id]: 0 } };
    }
    case 'remove':
      return { ...state, lines: state.lines.filter((line) => line.supplyId !== action.supplyId) };
    case 'syncStock': {
      const byId = new Map(action.supplies.map((supply) => [supply.id, supply]));
      const lines = state.lines
        .map((line) => {
          const fresh = byId.get(line.supplyId);
          return fresh ? { ...line, stock: fresh.stock, quantity: Math.min(line.quantity, fresh.stock) } : line;
        })
        .filter((line) => line.quantity > 0);
      const unchanged = lines.length === state.lines.length && lines.every((line, i) => line === state.lines[i]);
      return unchanged ? state : { ...state, lines };
    }
    case 'clear':
      return initialCart;
  }
};

export const cartTotals = (state: CartState) => ({
  itemCount: state.lines.length,
  totalQuantity: state.lines.reduce((sum, line) => sum + line.quantity, 0),
});
