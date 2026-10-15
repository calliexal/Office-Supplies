import { describe, expect, it } from 'vitest';
import type { Supply } from '@/api';
import { cartReducer, cartTotals, initialCart, remainingFor } from './cart';

const pen: Supply = { id: 'pen', name: 'Gel Pen', stock: 5, unit: 'pcs', imageUrl: null };
const paper: Supply = { id: 'paper', name: 'A4 75gsm', stock: 3, unit: 'pcs', imageUrl: null };

describe('cartReducer', () => {
  it('adds 1 when the stepper is at 0', () => {
    const state = cartReducer(initialCart, { type: 'add', supply: pen });
    expect(state.lines).toEqual([expect.objectContaining({ supplyId: 'pen', quantity: 1 })]);
  });

  it('adds the drafted quantity and resets the draft', () => {
    let state = cartReducer(initialCart, { type: 'setDraft', supply: pen, value: 3 });
    state = cartReducer(state, { type: 'add', supply: pen });
    expect(state.lines[0]?.quantity).toBe(3);
    expect(state.drafts.pen).toBe(0);
  });

  it('never lets draft + cart exceed stock', () => {
    let state = cartReducer(initialCart, { type: 'setDraft', supply: pen, value: 4 });
    state = cartReducer(state, { type: 'add', supply: pen });
    state = cartReducer(state, { type: 'setDraft', supply: pen, value: 10 });
    expect(state.drafts.pen).toBe(1);
    state = cartReducer(state, { type: 'add', supply: pen });
    expect(state.lines[0]?.quantity).toBe(5);
    expect(remainingFor(state, pen)).toBe(0);
    expect(cartReducer(state, { type: 'add', supply: pen })).toBe(state);
  });

  it('applies repeated +/− steps against the latest state and clamps to stock', () => {
    let state = initialCart;
    for (let i = 0; i < 8; i += 1) state = cartReducer(state, { type: 'stepDraft', supply: pen, delta: 1 });
    expect(state.drafts.pen).toBe(5);
    state = cartReducer(state, { type: 'stepDraft', supply: pen, delta: -1 });
    expect(state.drafts.pen).toBe(4);
    for (let i = 0; i < 9; i += 1) state = cartReducer(state, { type: 'stepDraft', supply: pen, delta: -1 });
    expect(state.drafts.pen).toBe(0);
  });

  it('ignores out-of-stock products', () => {
    const empty = { ...pen, stock: 0 };
    expect(cartReducer(initialCart, { type: 'add', supply: empty })).toBe(initialCart);
  });

  it('clamps and drops lines when fresh stock is lower', () => {
    let state = cartReducer(initialCart, { type: 'setDraft', supply: pen, value: 5 });
    state = cartReducer(state, { type: 'add', supply: pen });
    state = cartReducer(state, { type: 'add', supply: paper });
    state = cartReducer(state, { type: 'syncStock', supplies: [{ ...pen, stock: 2 }, { ...paper, stock: 0 }] });
    expect(state.lines).toEqual([expect.objectContaining({ supplyId: 'pen', quantity: 2, stock: 2 })]);
  });

  it('computes totals', () => {
    let state = cartReducer(initialCart, { type: 'setDraft', supply: pen, value: 3 });
    state = cartReducer(state, { type: 'add', supply: pen });
    state = cartReducer(state, { type: 'setDraft', supply: paper, value: 3 });
    state = cartReducer(state, { type: 'add', supply: paper });
    expect(cartTotals(state)).toEqual({ itemCount: 2, totalQuantity: 6 });
  });
});
