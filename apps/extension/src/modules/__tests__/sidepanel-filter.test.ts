import { describe, it, expect } from 'vitest';
import { filterBrandKitsByClient } from '../sidepanel-filter';
import type { Option } from '../sidepanel-types';

const kits: Option[] = [
  { id: 'bk-a1', name: 'A1', clientId: 'clientA' },
  { id: 'bk-a2', name: 'A2', clientId: 'clientA' },
  { id: 'bk-b1', name: 'B1', clientId: 'clientB' },
  { id: 'bk-none', name: 'N', clientId: undefined },
];

describe('filterBrandKitsByClient', () => {
  it('mostra somente Brand Kits do cliente A', () => {
    expect(filterBrandKitsByClient(kits, 'clientA').map((b) => b.id)).toEqual(['bk-a1', 'bk-a2']);
  });
  it('mostra somente Brand Kits do cliente B', () => {
    expect(filterBrandKitsByClient(kits, 'clientB').map((b) => b.id)).toEqual(['bk-b1']);
  });
  it('sem cliente selecionado, retorna todos', () => {
    expect(filterBrandKitsByClient(kits, null).length).toBe(4);
    expect(filterBrandKitsByClient(kits, undefined).length).toBe(4);
  });
  it('cliente inexistente => vazio', () => {
    expect(filterBrandKitsByClient(kits, 'zzz')).toEqual([]);
  });
  it('impede cross-client quando troca de cliente', () => {
    // Ao trocar de A para B, o conjunto anterior não "vaza".
    const afterA = filterBrandKitsByClient(kits, 'clientA');
    const afterB = filterBrandKitsByClient(kits, 'clientB');
    expect(afterA.some((b) => b.clientId === 'clientB')).toBe(false);
    expect(afterB.some((b) => b.clientId === 'clientA')).toBe(false);
  });
});
