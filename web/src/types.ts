export interface Community {
  key: string
  label: string
  color: string
  count: number
}

export interface Shard {
  path: string
  count: number
  sha256: string
}

export interface Manifest {
  schemaVersion: number
  network: string
  registryId: string
  generatedAt: string
  lastSyncedAt: string
  firstRequiredCheckpoint: number | null
  lastContiguousCheckpoint: number | null
  completeHistory: boolean
  coverageGaps: unknown[]
  totalCards: number
  totalCommunities: number
  communities: Community[]
  shards: Shard[]
}

export interface BuilderCard {
  cardObjectId: string
  txDigest: string
  checkpoint: number
  timestamp: string
  sender: string
  packageId: string
  objectType: string
  builderNo: string
  builderName: string
  communityRaw: string
  communityKey: string
  communityLabel: string
  profession: string
  focus: string
  country: string
  websiteUrl: string | null
}
