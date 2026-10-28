const positiveId = /^[1-9][0-9]*$/

export function signerSetupCommand(userId: string, communityId: string): string {
  if (!positiveId.test(userId) || !positiveId.test(communityId)) {
    throw new Error('Signer setup requires valid user and community IDs.')
  }
  return `npm run regtest:signer -- setup --community-id ${communityId} --user-id ${userId}`
}

export function compressedPublicKeyError(value: string): string | null {
  const key = value.trim()
  if (!key) return 'Paste the public key printed by the signer setup utility.'
  return /^(02|03)[0-9a-fA-F]{64}$/.test(key)
    ? null
    : 'Use the 66-character compressed public key printed by the utility. It must begin with 02 or 03.'
}
