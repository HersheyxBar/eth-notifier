import { Contract, JsonRpcProvider } from 'ethers'
import { TokenMetadata, NftContractMetadata } from './types'

const ERC20_ABI = ['function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)']
const ERC721_ABI = ['function name() view returns (string)', 'function symbol() view returns (string)', 'function totalSupply() view returns (uint256)', 'function tokenURI(uint256) view returns (string)', 'function supportsInterface(bytes4) view returns (bool)']
const ERC721_ID = '0x80ac58cd', ERC1155_ID = '0xd9b67a26'

export class MetadataFallback {
  private provider: JsonRpcProvider
  private tokenCache: Map<string, TokenMetadata> = new Map()
  private nftCache: Map<string, NftContractMetadata> = new Map()
  private expiry: number

  constructor(provider:JsonRpcProvider, expiryMs=3600000) { this.provider = provider; this.expiry = expiryMs }

  async getTokenMetadata(address:string): Promise<TokenMetadata> {
    const addr = address.toLowerCase()
    if (this.tokenCache.has(addr)) return this.tokenCache.get(addr)!
    const m = await this.fetchToken(address)
    this.tokenCache.set(addr, m)
    setTimeout(() => this.tokenCache.delete(addr), this.expiry)
    return m
  }

  private async fetchToken(address:string): Promise<TokenMetadata> {
    try {
      const c = new Contract(address, ERC20_ABI, this.provider)
      const [name, symbol, decimals] = await Promise.allSettled([c.name(), c.symbol(), c.decimals()])
      return { name: name.status==='fulfilled' ? name.value : 'Unknown Token', symbol: symbol.status==='fulfilled' ? symbol.value : 'UNKNOWN', decimals: decimals.status==='fulfilled' ? Number(decimals.value) : 18 }
    } catch { return { name: 'Unknown Token', symbol: 'UNKNOWN', decimals: 18 } }
  }

  async getNftContractMetadata(address:string): Promise<NftContractMetadata> {
    const addr = address.toLowerCase()
    if (this.nftCache.has(addr)) return this.nftCache.get(addr)!
    const m = await this.fetchNft(address)
    this.nftCache.set(addr, m)
    setTimeout(() => this.nftCache.delete(addr), this.expiry)
    return m
  }

  private async fetchNft(address:string): Promise<NftContractMetadata> {
    try {
      const tokenType = await this.detectType(address)
      const c = new Contract(address, ERC721_ABI, this.provider)
      const [name, symbol, totalSupply] = await Promise.allSettled([c.name(), c.symbol(), c.totalSupply()])
      return { name: name.status==='fulfilled' ? name.value : address.slice(0,10)+'...', symbol: symbol.status==='fulfilled' ? symbol.value : undefined, tokenType, totalSupply: totalSupply.status==='fulfilled' ? totalSupply.value.toString() : undefined }
    } catch { return { name: address.slice(0,10)+'...' } }
  }

  private async detectType(address:string): Promise<string|undefined> {
    try {
      const c = new Contract(address, ERC721_ABI, this.provider)
      const [is721, is1155] = await Promise.allSettled([c.supportsInterface(ERC721_ID), c.supportsInterface(ERC1155_ID)])
      if (is721.status==='fulfilled' && is721.value) return 'ERC721'
      if (is1155.status==='fulfilled' && is1155.value) return 'ERC1155'
    } catch {}
    return undefined
  }

  clearCache(): void { this.tokenCache.clear(); this.nftCache.clear() }
}
