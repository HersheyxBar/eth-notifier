export enum ProviderType { ALCHEMY='alchemy', INFURA='infura', QUICKNODE='quicknode', ANKR='ankr', MORALIS='moralis', CHAINSTACK='chainstack', GETBLOCK='getblock', BLAST='blast', POCKET='pocket' }

export type ProviderCapabilities = { websocket:boolean, pendingTransactions:boolean, addressFilteredPending:boolean, tokenMetadata:boolean, nftMetadata:boolean }
export type ProviderConfig = { type:ProviderType, apiKey?:string, httpUrl?:string, wsUrl?:string, network:string, priority?:number }
export type LogFilter = { fromBlock?:number|string, toBlock?:number|string, address?:string|string[], topics?:(string|string[]|null)[] }
export type TokenMetadata = { name:string, symbol:string, decimals:number, logo?:string }
export type NftContractMetadata = { name:string, symbol?:string, tokenType?:string, totalSupply?:string, openSea?:{ floorPrice?:number, collectionName?:string, imageUrl?:string, description?:string } }
export type SubscriptionHandle = { unsubscribe:()=>Promise<void> }
export type PendingTransactionConfig = { toAddress?:string[], fromAddress?:string[], hashesOnly?:boolean }
export type BlockWithTransactions = { number:number, hash:string, timestamp:number, transactions:TransactionResponse[] }
export type TransactionResponse = { hash:string, from:string, to:string|null, value:bigint, data:string, nonce:number, gasLimit:bigint, gasPrice?:bigint, maxFeePerGas?:bigint, maxPriorityFeePerGas?:bigint, blockNumber?:number, blockHash?:string }
export type TransactionReceipt = { hash:string, blockNumber:number, blockHash:string, from:string, to:string|null, contractAddress:string|null, status:number, gasUsed:bigint, logs:Log[] }
export type Log = { address:string, topics:string[], data:string, blockNumber:number, blockHash:string, transactionHash:string, transactionIndex:number, logIndex:number }
export type ProviderHealth = { type:ProviderType, healthy:boolean, latencyMs?:number, lastError?:string, blockNumber?:number, consecutiveFailures:number }
export type FailoverStrategy = 'priority' | 'round-robin'
export type ProvidersConfig = { primary:ProviderConfig, fallbacks?:ProviderConfig[], strategy?:FailoverStrategy }

export interface EthereumProvider {
  readonly type: ProviderType
  readonly capabilities: ProviderCapabilities
  readonly isConnected: boolean
  connect(): Promise<void>
  disconnect(): Promise<void>
  getBlockNumber(): Promise<number>
  getBlock(blockNumber:number): Promise<BlockWithTransactions|null>
  getBlockWithTransactions(blockNumber:number): Promise<BlockWithTransactions|null>
  getLogs(filter:LogFilter): Promise<Log[]>
  getTransactionReceipt(hash:string): Promise<TransactionReceipt|null>
  getGasPrice(): Promise<bigint>
  getTokenMetadata(address:string): Promise<TokenMetadata>
  getNftContractMetadata(address:string): Promise<NftContractMetadata>
  subscribeToBlocks(callback:(blockNumber:number)=>void): Promise<SubscriptionHandle>
  subscribeToPendingTransactions(config:PendingTransactionConfig, callback:(tx:TransactionResponse)=>void): Promise<SubscriptionHandle|null>
  healthCheck(): Promise<ProviderHealth>
}
