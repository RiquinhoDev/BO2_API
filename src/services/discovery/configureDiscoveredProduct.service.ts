// ════════════════════════════════════════════════════════════
// 📁 discovery/configureDiscoveredProduct.service.ts
// Atomic use case behind POST /api/discovery/configure. The existing-product
// check, active-course read, Product create and ProductProfile create all run
// inside a single Mongoose transaction, so a failure on the second write never
// leaves an orphan Product behind. No Express here — the controller maps the
// discriminated result / typed domain errors onto the HTTP contract.
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import Product, { IProduct } from '../../models/product/Product'
import ProductProfile, { IProductProfile } from '../../models/product/ProductProfile'
import Course from '../../models/Course'
import type { ProductConfigurationData } from '../../types/discovery.types'

/** Thrown inside the transaction to abort cleanly when the code already exists. */
export class DuplicateProductCodeError extends Error {
  constructor(public readonly code: string) {
    super(`Product code already exists: ${code}`)
    this.name = 'DuplicateProductCodeError'
  }
}

/** Thrown inside the transaction to abort cleanly when there is no active Course. */
export class NoActiveCourseError extends Error {
  constructor() {
    super('No active course found')
    this.name = 'NoActiveCourseError'
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && Reflect.get(error, 'code') === 11000
}

export type ConfigureDiscoveredProductResult =
  | { status: 'created'; product: IProduct; productProfile: IProductProfile }
  | { status: 'duplicate_code'; code: string }
  | { status: 'no_active_course' }

/**
 * Creates the Product and its ProductProfile atomically. Both creates (and the
 * pre-checks) share one session; if any step throws the whole transaction is
 * rolled back. Duplicate-code and missing-course are signalled as typed domain
 * errors so the transaction aborts without any partial write, then mapped to a
 * discriminated result; every other failure propagates to the caller unchanged.
 */
export async function configureDiscoveredProduct(
  configData: ProductConfigurationData,
): Promise<ConfigureDiscoveredProductResult> {
  const session = await mongoose.startSession()
  try {
    return await session.withTransaction(async (): Promise<ConfigureDiscoveredProductResult> => {
      const code = configData.productData.code.toUpperCase()

      const existingProduct = await Product.findOne({ code }, undefined, { session })
      if (existingProduct) {
        throw new DuplicateProductCodeError(configData.productData.code)
      }

      const course = await Course.findOne({ isActive: true }, undefined, { session })
      if (!course) {
        throw new NoActiveCourseError()
      }

      const [product] = await Product.create(
        [
          {
            ...configData.productData,
            code,
            courseId: course._id,
            activeCampaignConfig: {
              ...configData.activeCampaignConfig,
              tagPrefix: configData.activeCampaignConfig?.tagPrefix || code,
              listId:
                configData.activeCampaignConfig?.listId ||
                course.activeCampaignConfig?.listId ||
                '1',
            },
            launchDate: new Date(),
          },
        ],
        { session },
      )

      const [productProfile] = await ProductProfile.create(
        [
          {
            ...configData.profileData,
            createdAt: new Date(),
            lastModified: new Date(),
          },
        ],
        { session },
      )

      return { status: 'created', product, productProfile }
    })
  } catch (error: unknown) {
    if (error instanceof DuplicateProductCodeError) {
      return { status: 'duplicate_code', code: error.code }
    }
    if (error instanceof NoActiveCourseError) {
      return { status: 'no_active_course' }
    }
    if (isDuplicateKeyError(error)) {
      return { status: 'duplicate_code', code: configData.productData.code }
    }
    throw error
  } finally {
    await session.endSession()
  }
}
