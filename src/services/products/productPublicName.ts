export const OGI_PUBLIC_NAME = "O Grande Investimento";

const OGI_CODES = new Set(["OGI", "OGI_V1"]);
const LEGACY_OGI_NAMES = new Set([
  "OGI",
  "OGI V1",
  "OGI_V1",
  "O GRANDE INVESTIMENTO V1",
]);

type ProductWithPublicName = {
  code?: unknown;
  name?: unknown;
};

function normalizeLabel(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim().toUpperCase() : undefined;
}

export function normalizeProductPublicName<T extends ProductWithPublicName>(
  product: T,
): T {
  const code = normalizeLabel(product.code);
  const name = normalizeLabel(product.name);

  if (!OGI_CODES.has(code ?? "") && !LEGACY_OGI_NAMES.has(name ?? "")) {
    return product;
  }

  return { ...product, name: OGI_PUBLIC_NAME };
}
