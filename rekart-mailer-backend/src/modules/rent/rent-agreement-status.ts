/** Mirrors frontend rent agreement acceptance checks. */
export function isRentFinalOfferDeclinedClosed(
  dynamicData?: Record<string, unknown>,
): boolean {
  return dynamicData?.finalOfferDeclinedClosed === true;
}

export function isRentFinalOfferResumePending(
  dynamicData?: Record<string, unknown>,
): boolean {
  return dynamicData?.finalOfferResumePending === true;
}

export function isRentFinalOfferResumeLocked(
  dynamicData?: Record<string, unknown>,
): boolean {
  return dynamicData?.finalOfferResumeLocked === true;
}

export function rentAgreementDeclinedPendingResend(
  dynamicData?: Record<string, unknown>,
): boolean {
  if (!dynamicData) return false;
  if (isRentFinalOfferDeclinedClosed(dynamicData)) return false;
  if (isRentFinalOfferResumePending(dynamicData)) return false;
  const gen = Number(dynamicData.agreementGeneration ?? 0);
  const declinedGen = Number(dynamicData.agreementDeclinedGen ?? 0);
  const signedGen = Number(dynamicData.agreementSignedGen ?? 0);
  return (
    dynamicData.agreementDeclined === true &&
    gen > 0 &&
    declinedGen === gen &&
    signedGen !== gen
  );
}

export function isRentAgreementAccepted(
  dynamicData?: Record<string, unknown> | null,
): boolean {
  if (!dynamicData || dynamicData.agreementSigned !== true) return false;
  if (rentAgreementDeclinedPendingResend(dynamicData)) return false;

  const gen = Number(dynamicData.agreementGeneration ?? 0);
  const signedGen = Number(dynamicData.agreementSignedGen ?? 0);

  if (gen > 0 && signedGen > 0) {
    return signedGen === gen;
  }

  return true;
}
