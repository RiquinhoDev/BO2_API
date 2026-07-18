import { ACTagResponse } from '../../types/activecampaign.types'

export interface AddTagsBatchResult {
  success: string[]
  failed: string[]
  total: number
}

type AddTag = (email: string, tagName: string) => Promise<ACTagResponse>

export async function addTagsInBatches(
  email: string,
  tagNames: string[],
  addTag: AddTag,
  batchSize: number = 3
): Promise<AddTagsBatchResult> {
  const result: AddTagsBatchResult = {
    success: [],
    failed: [],
    total: tagNames.length
  }

  for (let i = 0; i < tagNames.length; i += batchSize) {
    const batch = tagNames.slice(i, i + batchSize)
    const responses = await Promise.all(
      batch.map(tag => addTag(email, tag))
    )

    batch.forEach((tag, index) => {
      if (responses[index]?.contactTag?.id) {
        result.success.push(tag)
      } else {
        result.failed.push(tag)
      }
    })

    if (i + batchSize < tagNames.length) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  return result
}
