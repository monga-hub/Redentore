import { ITEM, type Bag, type Rarity, type Stack } from './bag.ts';
import { ARMOR_SLOTS, outfitChoices, type ArmorPart } from './gear.ts';

export interface Recipe { chapter: 1 | 2 | 3; rarity: Rarity }
export interface Progress extends Recipe { parts: ArmorPart[]; ids: string[] }
/** Only explicit new component metadata is evidence of recipe compatibility. Worn/legacy items stay untouched. */
export function assemblyProgress(bag: Bag): Progress[] {
  const groups = new Map<string, Progress>();
  for (const stack of bag.items) {
    const it = ITEM.get(stack.id);
    if (!it?.component || !it.chapter || !bag.hero || it.hero !== bag.hero || stack.n < 1) continue;
    const key = `${it.chapter}:${it.rarity}`;
    let group = groups.get(key);
    if (!group) { group = { chapter: it.chapter, rarity: it.rarity, parts: [], ids: [] }; groups.set(key, group); }
    if (!group.parts.includes(it.component)) { group.parts.push(it.component); group.ids.push(it.id); }
  }
  return [...groups.values()].sort((a, b) => a.chapter - b.chapter || ['comune', 'noncomune', 'raro', 'epico', 'leggendario'].indexOf(a.rarity) - ['comune', 'noncomune', 'raro', 'epico', 'leggendario'].indexOf(b.rarity));
}

const pending = new WeakMap<Bag, Assembly>();
/** A short-lived reservation, never serialized and never consuming before final confirmation. */
export class Assembly {
  readonly choices;
  private readonly bag: Bag;
  readonly ingredientIds: readonly string[];
  private readonly snapshot: string;
  private readonly hero;
  private ended = false;

  private constructor(bag: Bag, progress: Progress) {
    this.bag = bag;
    this.hero = bag.hero!;
    this.ingredientIds = [...progress.ids];
    this.snapshot = JSON.stringify(bag.items);
    this.choices = outfitChoices(this.hero, progress.chapter, progress.rarity);
  }

  static begin(bag: Bag, recipe: Recipe): Assembly | undefined {
    if (pending.has(bag)) return;
    const progress = assemblyProgress(bag).find(p => p.chapter === recipe.chapter && p.rarity === recipe.rarity && p.parts.length === ARMOR_SLOTS.length);
    if (!progress) return;
    const session = new Assembly(bag, progress);
    pending.set(bag, session);
    return session;
  }

  cancel(): void {
    this.ended = true;
    if (pending.get(this.bag) === this) pending.delete(this.bag);
  }

  confirm(id: string): string {
    if (this.ended || pending.get(this.bag) !== this) return 'Unione già chiusa.';
    if (!this.choices.some(it => it.id === id)) return 'Scegli uno dei tre abiti proposti.';
    if (this.bag.hero !== this.hero || JSON.stringify(this.bag.items) !== this.snapshot) {
      this.cancel();
      return 'La borsa è cambiata: controlla di nuovo i sei pezzi.';
    }
    const next: Stack[] = this.bag.items.map(s => ({ ...s }));
    for (const ingredient of this.ingredientIds) {
      const index = next.findIndex(s => s.id === ingredient && s.n > 0);
      if (index < 0) { this.cancel(); return 'Manca un componente.'; }
      if (--next[index].n === 0) next.splice(index, 1);
    }
    // Output is unstackable. Check the space after consumption, including legacy overflow bags.
    if (next.length + 1 > this.bag.capacity) return 'Libera un posto in borsa dopo il consumo dei pezzi.';
    next.push({ id, n: 1 });
    this.cancel(); // close before exposing the mutation; duplicate clicks cannot spend another set
    this.bag.items.splice(0, this.bag.items.length, ...next);
    return '';
  }
}
