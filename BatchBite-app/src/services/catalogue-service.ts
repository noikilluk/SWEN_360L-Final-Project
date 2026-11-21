/**
 * Products, recipes, product versions and ingredient stock
 * (FR-02, plus the Sprint 2 ingredient planning and versioning features).
 */
import type { Transaction } from '@/data/database';
import { ensure } from '@/domain/errors';
import { requireCapability } from '@/domain/permissions';
import { availableStock, formatQuantity, mergeLines } from '@/domain/recipe';
import type {
  Fils,
  ID,
  Ingredient,
  IngredientUnit,
  Product,
  ProductVariant,
  ProductVersion,
  RecipeLine,
} from '@/domain/types';
import { validateRequiredText } from '@/domain/validation';

import { type ServiceContext, loadActor } from './context';
import { notifyRoles } from './notification-service';

/** Prefix the editor uses for variants that do not have a saved id yet. */
export const NEW_VARIANT_PREFIX = 'new:';
/** Upper limit for an embedded product photo (base64 data URI). */
export const MAX_PHOTO_LENGTH = 700_000;

export interface ProductInput {
  name: string;
  description: string;
  price: Fils;
  emoji: string;
  photoUri?: string;
  variants: ProductVariant[];
  recipe: RecipeLine[];
  /** Keyed by variant id (or a `new:` key for variants created in the editor). */
  variantRecipes: Record<ID, RecipeLine[]>;
  changeNote?: string;
}

export interface IngredientInput {
  name: string;
  unit: IngredientUnit;
  stock: number;
  lowStockThreshold: number;
  costPerUnit: number;
  allergens: string[];
}

export class CatalogueService {
  constructor(private readonly ctx: ServiceContext) {}

  createProduct(actorId: ID, input: ProductInput): Promise<Product> {
    return this.ctx.db.transaction((tx) => {
      const actor = loadActor(tx, actorId);
      requireCapability(actor, 'manageProducts');
      const clean = this.cleanInput(tx, input);
      const now = this.ctx.now().toISOString();
      const productId = this.ctx.crypto.randomId();
      const version = this.writeVersion(tx, productId, 1, clean, actorId, clean.changeNote || 'First version');
      const product: Product = {
        id: productId,
        ownerId: actorId,
        name: clean.name,
        description: clean.description,
        price: clean.price,
        emoji: clean.emoji,
        photoUri: clean.photoUri,
        variants: clean.variants,
        recipe: clean.recipe,
        variantRecipes: clean.variantRecipes,
        version: 1,
        currentVersionId: version.id,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      return tx.put('products', product);
    });
  }

  /**
   * Saves product changes. If the price, name, variants or recipe change, a new
   * immutable ProductVersion is created; existing orders keep pointing to the
   * version they were placed with.
   */
  updateProduct(actorId: ID, productId: ID, input: ProductInput): Promise<{ product: Product; newVersion: boolean }> {
    return this.ctx.db.transaction((tx) => {
      const actor = loadActor(tx, actorId);
      requireCapability(actor, 'manageProducts');
      const existing = tx.require('products', productId, 'product');
      const clean = this.cleanInput(tx, input);

      const versionedFieldsChanged =
        existing.name !== clean.name ||
        existing.price !== clean.price ||
        stableJson(existing.variants) !== stableJson(clean.variants) ||
        stableJson(existing.recipe) !== stableJson(clean.recipe) ||
        stableJson(existing.variantRecipes) !== stableJson(clean.variantRecipes);

      let version = existing.version;
      let currentVersionId = existing.currentVersionId;
      if (versionedFieldsChanged) {
        version += 1;
        const note = clean.changeNote || describeChange(existing, clean);
        currentVersionId = this.writeVersion(tx, productId, version, clean, actorId, note).id;
      }

      const product: Product = {
        ...existing,
        name: clean.name,
        description: clean.description,
        price: clean.price,
        emoji: clean.emoji,
        photoUri: clean.photoUri,
        variants: clean.variants,
        recipe: clean.recipe,
        variantRecipes: clean.variantRecipes,
        version,
        currentVersionId,
        updatedAt: this.ctx.now().toISOString(),
      };
      tx.put('products', product);
      return { product, newVersion: versionedFieldsChanged };
    });
  }

  setProductActive(actorId: ID, productId: ID, active: boolean) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageProducts');
      tx.update('products', productId, { active, updatedAt: this.ctx.now().toISOString() });
    });
  }

  createIngredient(actorId: ID, input: IngredientInput): Promise<Ingredient> {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageIngredients');
      const clean = cleanIngredient(input);
      const duplicate = tx.all('ingredients').some((i) => i.name.toLowerCase() === clean.name.toLowerCase());
      ensure(!duplicate, 'CONFLICT', `An ingredient called "${clean.name}" already exists.`);
      return tx.put('ingredients', {
        id: this.ctx.crypto.randomId(),
        ...clean,
        reserved: 0,
        updatedAt: this.ctx.now().toISOString(),
      });
    });
  }

  updateIngredient(actorId: ID, ingredientId: ID, input: IngredientInput): Promise<Ingredient> {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageIngredients');
      const existing = tx.require('ingredients', ingredientId, 'ingredient');
      const clean = cleanIngredient(input);
      const duplicate = tx
        .all('ingredients')
        .some((i) => i.id !== ingredientId && i.name.toLowerCase() === clean.name.toLowerCase());
      ensure(!duplicate, 'CONFLICT', `An ingredient called "${clean.name}" already exists.`);
      ensure(
        clean.stock >= existing.reserved,
        'VALIDATION',
        `${formatQuantity(existing.reserved, existing.unit)} is reserved for confirmed orders, so stock cannot go below that.`,
      );
      ensure(
        clean.unit === existing.unit || existing.reserved === 0,
        'VALIDATION',
        'The unit cannot change while stock is reserved for orders.',
      );
      const updated: Ingredient = { ...existing, ...clean, updatedAt: this.ctx.now().toISOString() };
      tx.put('ingredients', updated);
      checkLowStock(tx, this.ctx, existing, updated);
      return updated;
    });
  }

  /** Adds (or removes, with a negative amount) stock after a delivery or a stock count. */
  adjustStock(actorId: ID, ingredientId: ID, delta: number): Promise<Ingredient> {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageIngredients');
      ensure(Number.isFinite(delta) && delta !== 0, 'VALIDATION', 'Enter an amount to add or remove.');
      const existing = tx.require('ingredients', ingredientId, 'ingredient');
      const stock = Math.round((existing.stock + delta) * 100) / 100;
      ensure(stock >= 0, 'VALIDATION', 'Stock cannot go below zero.');
      ensure(
        stock >= existing.reserved,
        'VALIDATION',
        `${formatQuantity(existing.reserved, existing.unit)} is reserved for confirmed orders, so stock cannot go below that.`,
      );
      const updated = { ...existing, stock, updatedAt: this.ctx.now().toISOString() };
      tx.put('ingredients', updated);
      checkLowStock(tx, this.ctx, existing, updated);
      return updated;
    });
  }

  deleteIngredient(actorId: ID, ingredientId: ID) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageIngredients');
      const ingredient = tx.require('ingredients', ingredientId, 'ingredient');
      ensure(ingredient.reserved === 0, 'CONFLICT', 'This ingredient is reserved for confirmed orders.');
      const usedBy = tx.all('products').filter((p) =>
        [...p.recipe, ...Object.values(p.variantRecipes).flat()].some((l) => l.ingredientId === ingredientId),
      );
      ensure(
        usedBy.length === 0,
        'CONFLICT',
        `Remove it from these recipes first: ${usedBy.map((p) => p.name).join(', ')}.`,
      );
      tx.delete('ingredients', ingredientId);
    });
  }

  private writeVersion(
    tx: Transaction,
    productId: ID,
    version: number,
    input: CleanProduct,
    actorId: ID,
    changeNote: string,
  ): ProductVersion {
    return tx.put('productVersions', {
      id: this.ctx.crypto.randomId(),
      productId,
      version,
      name: input.name,
      price: input.price,
      variants: input.variants,
      recipe: input.recipe,
      variantRecipes: input.variantRecipes,
      changeNote,
      createdAt: this.ctx.now().toISOString(),
      createdBy: actorId,
    });
  }

  /** Validates editor input and gives new variants real ids. */
  private cleanInput(tx: Transaction, input: ProductInput): CleanProduct {
    const nameProblem = validateRequiredText(input.name, 'a product name', 40);
    ensure(!nameProblem, 'VALIDATION', nameProblem ?? '');
    ensure(input.description.trim().length <= 240, 'VALIDATION', 'Descriptions can have at most 240 characters.');
    ensure(
      Number.isInteger(input.price) && input.price > 0 && input.price <= 1_000_000,
      'VALIDATION',
      'Enter a price between BD 0.001 and BD 1000.',
    );
    ensure(!input.photoUri || input.photoUri.length <= MAX_PHOTO_LENGTH, 'VALIDATION', 'That photo is too large. Pick a smaller one or crop it.');

    const idMap = new Map<ID, ID>();
    const variants: ProductVariant[] = [];
    const seen = new Set<string>();
    for (const variant of input.variants) {
      const name = variant.name.trim();
      if (!name) continue;
      ensure(name.length <= 30, 'VALIDATION', 'Option names can have at most 30 characters.');
      ensure(!seen.has(name.toLowerCase()), 'VALIDATION', `The option "${name}" is listed twice.`);
      seen.add(name.toLowerCase());
      const id = variant.id.startsWith(NEW_VARIANT_PREFIX) ? this.ctx.crypto.randomId() : variant.id;
      idMap.set(variant.id, id);
      variants.push({ id, name });
    }
    // UML: every product has at least one variant (1..*).
    ensure(variants.length > 0, 'VALIDATION', 'Add at least one option, for example "Classic".');

    const ingredients = tx.read('ingredients');
    const cleanLines = (lines: RecipeLine[]) => {
      for (const line of lines) {
        ensure(ingredients[line.ingredientId], 'VALIDATION', 'A recipe uses an ingredient that no longer exists.');
        ensure(
          Number.isFinite(line.quantity) && line.quantity > 0,
          'VALIDATION',
          `Enter an amount above 0 for ${ingredients[line.ingredientId].name}.`,
        );
      }
      return mergeLines(lines);
    };

    const variantRecipes: Record<ID, RecipeLine[]> = {};
    for (const [key, lines] of Object.entries(input.variantRecipes)) {
      const id = idMap.get(key);
      if (!id) continue; // Variant was removed in the editor.
      const cleaned = cleanLines(lines);
      if (cleaned.length) variantRecipes[id] = cleaned;
    }

    return {
      name: input.name.trim(),
      description: input.description.trim(),
      price: input.price,
      emoji: input.emoji || '🧁',
      photoUri: input.photoUri,
      variants,
      recipe: cleanLines(input.recipe),
      variantRecipes,
      changeNote: input.changeNote?.trim() ?? '',
    };
  }
}

type CleanProduct = Required<Omit<ProductInput, 'photoUri'>> & { photoUri?: string };

function cleanIngredient(input: IngredientInput): IngredientInput {
  const nameProblem = validateRequiredText(input.name, 'an ingredient name', 40);
  ensure(!nameProblem, 'VALIDATION', nameProblem ?? '');
  ensure(Number.isFinite(input.stock) && input.stock >= 0, 'VALIDATION', 'Stock must be 0 or more.');
  ensure(
    Number.isFinite(input.lowStockThreshold) && input.lowStockThreshold >= 0,
    'VALIDATION',
    'The low stock warning level must be 0 or more.',
  );
  ensure(Number.isFinite(input.costPerUnit) && input.costPerUnit >= 0, 'VALIDATION', 'Cost must be 0 or more.');
  return {
    name: input.name.trim(),
    unit: input.unit,
    stock: input.stock,
    lowStockThreshold: input.lowStockThreshold,
    costPerUnit: input.costPerUnit,
    allergens: [...new Set(input.allergens.map((a) => a.trim()).filter(Boolean))],
  };
}

/** Alerts owners the moment an ingredient's available stock drops to its warning level. */
export function checkLowStock(tx: Transaction, ctx: ServiceContext, before: Ingredient, after: Ingredient) {
  const wasLow = availableStock(before) <= before.lowStockThreshold;
  const isLow = availableStock(after) <= after.lowStockThreshold;
  if (!wasLow && isLow) {
    notifyRoles(tx, ctx, ['owner'], {
      kind: 'low_stock',
      title: `Low stock: ${after.name}`,
      body: `Only ${formatQuantity(Math.max(0, availableStock(after)), after.unit)} is free after reservations.`,
    });
  }
}

function describeChange(before: Product, after: CleanProduct): string {
  const parts: string[] = [];
  if (before.price !== after.price) parts.push('price');
  if (before.name !== after.name) parts.push('name');
  if (stableJson(before.variants) !== stableJson(after.variants)) parts.push('options');
  if (
    stableJson(before.recipe) !== stableJson(after.recipe) ||
    stableJson(before.variantRecipes) !== stableJson(after.variantRecipes)
  ) {
    parts.push('recipe');
  }
  return `Updated ${parts.join(', ')}`;
}

/** JSON with sorted object keys, for comparing recipes regardless of key order. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );
}
