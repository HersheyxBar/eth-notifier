const { Contract } = require('ethers')
const ERC20_ABI = ['function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)']
const ERC721_ABI = ['function name() view returns (string)', 'function symbol() view returns (string)']
const cache = new Map()

class MetadataFallback {
  static async getTokenMetadata(provider, addr) {
    const key = `token:${addr.toLowerCase()}`
    if (cache.has(key)) return cache.get(key)
    const c = new Contract(addr, ERC20_ABI, provider)
    const [name, symbol, decimals] = await Promise.all([c.name().catch(() => 'Unknown'), c.symbol().catch(() => 'UNKNOWN'), c.decimals().catch(() => 18)])
    const meta = { name, symbol, decimals: Number(decimals) }
    cache.set(key, meta)
    return meta
  }
  static async getNftContractMetadata(provider, addr) {
    const key = `nft:${addr.toLowerCase()}`
    if (cache.has(key)) return cache.get(key)
    const c = new Contract(addr, ERC721_ABI, provider)
    const [name, symbol] = await Promise.all([c.name().catch(() => addr.slice(0, 10) + '...'), c.symbol().catch(() => 'NFT')])
    const meta = { name, symbol, tokenType: 'ERC721' }
    cache.set(key, meta)
    return meta
  }
}

module.exports = { MetadataFallback }
