/** MongoDB $convert helper — dynamicData money fields are often stored as strings. */
function toDouble(fieldPath: string): Record<string, unknown> {
  return {
    $convert: {
      input: { $ifNull: [fieldPath, 0] },
      to: 'double',
      onError: 0,
      onNull: 0,
    },
  };
}

/** Sum qty × rate from customerRentalItems, falling back to rentalItems. */
function rentItemsSubtotalExpr(): Record<string, unknown> {
  const itemsArray = {
    $cond: [
      {
        $gt: [
          { $size: { $ifNull: ['$dynamicData.customerRentalItems', []] } },
          0,
        ],
      },
      '$dynamicData.customerRentalItems',
      { $ifNull: ['$dynamicData.rentalItems', []] },
    ],
  };

  return {
    $sum: {
      $map: {
        input: itemsArray,
        as: 'item',
        in: {
          $multiply: [
            {
              $max: [
                1,
                toDouble('$$item.qty'),
              ],
            },
            toDouble('$$item.rate'),
          ],
        },
      },
    },
  };
}

/**
 * Resolved rental revenue for analytics — mirrors email renderer fallback:
 * rentalAmount → rentalTotal → sum of item line totals.
 */
export function rentJourneyRevenueAmountExpr(): Record<string, unknown> {
  return {
    $let: {
      vars: {
        rentalAmount: toDouble('$dynamicData.rentalAmount'),
        rentalTotal: toDouble('$dynamicData.rentalTotal'),
        itemsSubtotal: rentItemsSubtotalExpr(),
      },
      in: {
        $cond: [
          { $gt: ['$$rentalAmount', 0] },
          '$$rentalAmount',
          {
            $cond: [
              { $gt: ['$$rentalTotal', 0] },
              '$$rentalTotal',
              '$$itemsSubtotal',
            ],
          },
        ],
      },
    },
  };
}
