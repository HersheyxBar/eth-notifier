const { ProviderType } = require('../types')
const { AlchemyProvider } = require('./alchemy')
const { InfuraProvider } = require('./infura')
const { QuickNodeProvider } = require('./quicknode')
const { AnkrProvider } = require('./ankr')
const { MoralisProvider } = require('./moralis')
const { ChainstackProvider } = require('./chainstack')
const { GetBlockProvider } = require('./getblock')
const { BlastProvider } = require('./blast')
const { PocketProvider } = require('./pocket')

const PROVIDERS = { [ProviderType.ALCHEMY]: AlchemyProvider, [ProviderType.INFURA]: InfuraProvider, [ProviderType.QUICKNODE]: QuickNodeProvider, [ProviderType.ANKR]: AnkrProvider, [ProviderType.MORALIS]: MoralisProvider, [ProviderType.CHAINSTACK]: ChainstackProvider, [ProviderType.GETBLOCK]: GetBlockProvider, [ProviderType.BLAST]: BlastProvider, [ProviderType.POCKET]: PocketProvider }

function createProvider(config) { const P = PROVIDERS[config.type]; if (!P) throw new Error(`Unknown provider: ${config.type}`); return new P(config) }
function resolveConfigValue(v) { if (!v) return undefined; if (v.startsWith('env:')) { const val = process.env[v.slice(4)]; if (!val) console.warn(`Env ${v.slice(4)} not set`); return val }; return v }
function parseProviderConfig(raw) { return { type: raw.type, apiKey: resolveConfigValue(raw.apiKey), httpUrl: resolveConfigValue(raw.httpUrl), wsUrl: resolveConfigValue(raw.wsUrl), network: raw.network || 'mainnet', priority: raw.priority } }

module.exports = { createProvider, resolveConfigValue, parseProviderConfig }
