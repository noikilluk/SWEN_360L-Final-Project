/**
 * Ingredient planning: how much of each ingredient an order or a batch needs.
 */
import type {
  ID,
  Ingredient,
  IngredientReservation,
  IngredientUnit,
  RecipeLine,
} from './types';

export interface RecipeSource {
  recipe: RecipeLine[];
  variantRecipes: Record<ID, RecipeLine[]>;
}

/** Recipe for one unit of a given variant: base recipe plus that variant's extras. */
export function unitRecipe(source: RecipeSource, variantId: ID): RecipeLine[] {
  return mergeLines([...source.recipe, ...(source.variantRecipes[variantId] ?? [])]);
}

/** Adds up lines that use the same ingredient. */
export function mergeLines(lines: Iterable<RecipeLine>): RecipeLine[] {
  const totals = new Map<ID, number>();
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    totals.set(line.ingredientId, (totals.get(line.ingredientId) ?? 0) + line.quantity);
  }
  return [...totals].map(([ingredientId, quantity]) => ({ ingredientId, quantity: round(quantity) }));
}

/** Multiplies a recipe by a number of units. */
export function scaleLines(lines: readonly RecipeLine[], units: number): RecipeLine[] {
  return lines.map((line) => ({ ingredientId: line.ingredientId, quantity: round(line.quantity * units) }));
}

export function availableStock(ingredient: Ingredient): number {
  return round(ingredient.stock - ingredient.reserved);
}

export function isLowStock(ingredient: Ingredient): boolean {
  return availableStock(ingredient) <= ingredient.lowStockThreshold;
}

export interface Shortfall {
  ingredientId: ID;
  name: string;
  unit: IngredientUnit;
  needed: number;
  available: number;
  missing: number;
}

/** Ingredients that cannot cover `needs` with the stock that is not yet reserved. */
export function findShortfalls(
  needs: readonly IngredientReservation[],
  ingredients: Record<ID, Ingredient>,
): Shortfall[] {
  const shortfalls: Shortfall[] = [];
  for (const need of needs) {
    const ingredient = ingredients[need.ingredientId];
    if (!ingredient) continue;
    const available = availableStock(ingredient);
    if (available < need.quantity) {
      shortfalls.push({
        ingredientId: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        needed: need.quantity,
        available: Math.max(0, available),
        missing: round(need.quantity - Math.max(0, available)),
      });
    }
  }
  return shortfalls;
}

/** Ingredient cost of a set of lines in fils. */
export function linesCost(lines: readonly RecipeLine[], ingredients: Record<ID, Ingredient>): number {
  let total = 0;
  for (const line of lines) {
    const ingredient = ingredients[line.ingredientId];
    if (ingredient) total += line.quantity * ingredient.costPerUnit;
  }
  return Math.round(total);
}

export function formatQuantity(quantity: number, unit: IngredientUnit): string {
  if (unit === 'g' && quantity >= 1000) return `${round(quantity / 1000)} kg`;
  if (unit === 'ml' && quantity >= 1000) return `${round(quantity / 1000)} L`;
  if (unit === 'pcs') return `${round(quantity)} pcs`;
  return `${round(quantity)} ${unit}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
