const productFind = jest.fn();
const countDocuments = jest.fn();

jest.mock("../../../src/models/product/Product", () => ({
  __esModule: true,
  default: { find: productFind },
}));

jest.mock("../../../src/models/UserProduct", () => ({
  __esModule: true,
  default: { countDocuments },
}));

import { getAllProducts } from "../../../src/controllers/products/product.controller";
import { normalizeProductPublicName } from "../../../src/services/products/productPublicName";

describe("public product name contract", () => {
  it.each([
    { code: "OGI_V1", name: "OGI V1" },
    { code: "OGI", name: "OGI" },
    { code: "OGI_V1", name: "O Grande Investimento V1" },
  ])("normalizes legacy OGI record %# without changing its code", (product) => {
    const result = normalizeProductPublicName({
      ...product,
      platform: "hotmart",
      isActive: true,
    });

    expect(result).toMatchObject({
      code: product.code,
      name: "O Grande Investimento",
      platform: "hotmart",
      isActive: true,
    });
  });

  it("leaves non-OGI public names unchanged and does not mutate the source", () => {
    const product = { code: "CLAREZA_MENSAL", name: "Clareza Mensal" };

    expect(normalizeProductPublicName(product)).toEqual(product);
    expect(product).toEqual({ code: "CLAREZA_MENSAL", name: "Clareza Mensal" });
  });

  it("lists the canonical OGI name while preserving the technical code", async () => {
    const records = [
      {
        _id: "ogi-id",
        code: "OGI_V1",
        name: "OGI V1",
        toObject: () => ({ _id: "ogi-id", code: "OGI_V1", name: "OGI V1" }),
      },
      {
        _id: "clareza-id",
        code: "CLAREZA_MENSAL",
        name: "Clareza Mensal",
        toObject: () => ({
          _id: "clareza-id",
          code: "CLAREZA_MENSAL",
          name: "Clareza Mensal",
        }),
      },
    ];
    const chain = {
      populate: jest.fn(),
      sort: jest.fn(),
      limit: jest.fn().mockResolvedValue(records),
    };
    chain.populate.mockReturnValue(chain);
    chain.sort.mockReturnValue(chain);
    productFind.mockReturnValue(chain);
    countDocuments.mockResolvedValue(4);

    const json = jest.fn();
    await getAllProducts(
      { query: {} } as never,
      { json } as never,
      jest.fn() as never,
    );

    expect(json).toHaveBeenCalledWith({
      success: true,
      data: {
        products: [
          {
            _id: "ogi-id",
            code: "OGI_V1",
            name: "O Grande Investimento",
            studentCount: 4,
          },
          {
            _id: "clareza-id",
            code: "CLAREZA_MENSAL",
            name: "Clareza Mensal",
            studentCount: 4,
          },
        ],
      },
      meta: { total: 2 },
    });
  });
});
