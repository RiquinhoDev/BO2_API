export function ensureUsersV2Products<T extends object>(
  items: readonly T[],
): Array<T & { products: unknown[] }> {
  return items.map((item) => {
    const products = (item as T & { products?: unknown }).products
    return {
      ...item,
      products: Array.isArray(products) ? products : [],
    }
  })
}
