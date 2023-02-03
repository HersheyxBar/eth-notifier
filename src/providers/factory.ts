import { EthereumProvider, ProviderType, ProviderConfig } from './types'
import { AlchemyProvider } from './alchemy'
import { InfuraProvider } from './infura'
import { QuickNodeProvider } from './quicknode'
import { AnkrProvider } from './ankr'
import { MoralisProvider } from './moralis'
import { ChainstackProvider } from './chainstack'
import { GetBlockProvider } from './getblock'
import { BlastProvider } from './blast'
import { PocketProvider } from './pocket'

const PROVIDERS: Record<ProviderType, new(c:ProviderConfig)=>EthereumProvider> = {
  [ProviderType.ALCHEMY]: AlchemyProvider, [ProviderType.INFURA]: InfuraProvider, [ProviderType.QUICKNODE]: QuickNodeProvider,
  [ProviderType.ANKR]: AnkrProvider, [ProviderType.MORALIS]: MoralisProvider, [ProviderType.CHAINSTACK]: ChainstackProvider,
  [ProviderType.GETBLOCK]: GetBlockProvider, [ProviderType.BLAST]: BlastProvider, [ProviderType.POCKET]: PocketProvider
}

export function createProvider(config:ProviderConfig): EthereumProvider {
  const P = PROVIDERS[config.type]
  if (!P) throw new Error(`Unknown provider: ${config.type}`)
  return new P(config)
}

export function resolveConfigValue(v:string|undefined): string|undefined {
  if (!v) return undefined
  if (v.startsWith('env:')) { const val = process.env[v.slice(4)]; if (!val) console.warn(`Env ${v.slice(4)} not set`); return val }
  return v
}

export function parseProviderConfig(raw:any): ProviderConfig {
  return { type: raw.type as ProviderType, apiKey: resolveConfigValue(raw.apiKey), httpUrl: resolveConfigValue(raw.httpUrl), wsUrl: resolveConfigValue(raw.wsUrl), network: raw.network || 'mainnet', priority: raw.priority }
}
