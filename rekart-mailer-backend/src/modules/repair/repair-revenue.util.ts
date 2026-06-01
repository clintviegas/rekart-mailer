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

/**
 * Resolved repair revenue for analytics — mirrors email renderer fallback:
 * paidAmount → paymentAmount → finalAmount → finalOffer → offerAmount → quoteAmount.
 */
export function repairJourneyRevenueAmountExpr(): Record<string, unknown> {
  return {
    $let: {
      vars: {
        paidAmount: toDouble('$dynamicData.paidAmount'),
        paymentAmount: toDouble('$dynamicData.paymentAmount'),
        finalAmount: toDouble('$dynamicData.finalAmount'),
        finalOffer: toDouble('$dynamicData.finalOffer'),
        offerAmount: toDouble('$dynamicData.offerAmount'),
        quoteAmount: toDouble('$dynamicData.quoteAmount'),
      },
      in: {
        $cond: [
          { $gt: ['$$paidAmount', 0] },
          '$$paidAmount',
          {
            $cond: [
              { $gt: ['$$paymentAmount', 0] },
              '$$paymentAmount',
              {
                $cond: [
                  { $gt: ['$$finalAmount', 0] },
                  '$$finalAmount',
                  {
                    $cond: [
                      { $gt: ['$$finalOffer', 0] },
                      '$$finalOffer',
                      {
                        $cond: [
                          { $gt: ['$$offerAmount', 0] },
                          '$$offerAmount',
                          {
                            $cond: [
                              { $gt: ['$$quoteAmount', 0] },
                              '$$quoteAmount',
                              0,
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  };
}
