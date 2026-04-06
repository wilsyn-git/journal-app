import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { getInventory, getFrozenDates } from '@/app/lib/inventoryData'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId } = auth.payload
    const [inventory, frozenDates] = await Promise.all([
      getInventory(userId),
      getFrozenDates(userId),
    ])

    return apiSuccess({
      streakFreezes: {
        count: inventory.freezeCount,
        max: inventory.maxQuantity,
        earningProgress: {
          current: inventory.earningCounter,
          target: inventory.earningInterval,
        },
      },
      streakShields: {
        count: inventory.shieldCount,
        max: inventory.shieldMaxQuantity,
        earningProgress: {
          current: inventory.shieldEarningCounter,
          target: inventory.shieldEarningInterval,
        },
      },
      frozenDates,
    })
  } catch (error) {
    console.error('Inventory error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to fetch inventory', 500)
  }
}
