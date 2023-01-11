import { Interface } from 'ethers'

export { ProviderType, ProviderCapabilities, ProviderConfig, ProvidersConfig, FailoverStrategy, EthereumProvider, ProviderHealth } from '../providers/types'

export type ContractConfig = { name: string; address: string; abi: any[]; watchFunctions: string[] }
export type WalletConfig = { name: string; address: string }
export type TokenTransferConfig = { enabled: boolean; minValueUsd?: number; tokens?: string[] }
export type NftTransferConfig = { enabled: boolean; collections?: string[] }
export type DexSwapConfig = { enabled: boolean; minValueUsd?: number; dexes?: string[] }
export type LargeTransferConfig = { enabled: boolean; minEth: number }
export type ContractDeployConfig = { enabled: boolean; watchCreators?: string[] }
export type GasConfig = { enabled: boolean; alertThresholdGwei: number; checkIntervalSeconds: number }
export type TrackingConfig = { tokenTransfers?: TokenTransferConfig; nftTransfers?: NftTransferConfig; dexSwaps?: DexSwapConfig; largeTransfers?: LargeTransferConfig; contractDeploys?: ContractDeployConfig; gasAlerts?: GasConfig }
export type NotificationConfig = { discord: { enabled: boolean; webhookUrl?: string }; telegram: { enabled: boolean; chatId?: string } }
export type AppConfig = { contracts: ContractConfig[]; wallets?: WalletConfig[]; tracking?: TrackingConfig; notifications: NotificationConfig; providers?: { primary: any; fallbacks?: any[]; strategy?: 'priority' | 'round-robin' } }

export type EventSourceType = 'contract' | 'wallet' | 'token_transfer' | 'nft_transfer' | 'dex_swap' | 'large_transfer' | 'contract_deploy' | 'gas_alert'
export type BaseEvent = { sourceType: EventSourceType; transactionHash: string; from: string; to: string; value: string; blockNumber?: number; timestamp?: number }
export type ContractEvent = BaseEvent & { sourceType: 'contract'; contractName: string; contractAddress: string; functionName: string; functionArgs: Record<string, any> }
export type WalletEvent = BaseEvent & { sourceType: 'wallet'; walletName: string; contractName: string; contractAddress: string; functionName: string; functionArgs: Record<string, any> }
export type TokenTransferEvent = BaseEvent & { sourceType: 'token_transfer'; tokenAddress: string; tokenSymbol: string; tokenName: string; tokenDecimals: number; amount: string; amountFormatted: string; valueUsd?: number }
export type NftTransferEvent = BaseEvent & { sourceType: 'nft_transfer'; contractAddress: string; collectionName: string; tokenId: string; tokenType: 'ERC721' | 'ERC1155'; amount?: string }
export type DexSwapEvent = BaseEvent & { sourceType: 'dex_swap'; dexName: string; dexAddress: string; tokenIn: { address: string; symbol: string; amount: string }; tokenOut: { address: string; symbol: string; amount: string }; valueUsd?: number }
export type LargeTransferEvent = BaseEvent & { sourceType: 'large_transfer'; valueEth: string; valueUsd?: number }
export type ContractDeployEvent = BaseEvent & { sourceType: 'contract_deploy'; deployer: string; contractAddress: string; bytecodeSize: number }
export type GasAlertEvent = { sourceType: 'gas_alert'; currentGwei: number; thresholdGwei: number; timestamp: number; transactionHash: string; from: string; to: string; value: string }
export type DecodedTransaction = ContractEvent | WalletEvent | TokenTransferEvent | NftTransferEvent | DexSwapEvent | LargeTransferEvent | ContractDeployEvent | GasAlertEvent
export type LegacyDecodedTransaction = { sourceType: 'contract' | 'wallet'; contractName: string; contractAddress: string; functionName: string; functionArgs: Record<string, any>; transactionHash: string; from: string; to: string; value: string; blockNumber?: number; walletName?: string }

export type NotificationMessage = { title: string; sourceType: EventSourceType; txHash: string; from: string; to?: string; value: string; explorerBase: string; explorerTxUrl: string; contractName?: string; contractAddress?: string; functionName?: string; args?: Record<string, any>; targetAddress?: string; walletName?: string; tokenSymbol?: string; tokenAmount?: string; collectionName?: string; tokenId?: string; dexName?: string; tokenIn?: { symbol: string; amount: string }; tokenOut?: { symbol: string; amount: string }; valueEth?: string; deployedAddress?: string; gasGwei?: number; gasThreshold?: number }
export type ContractWatcher = { name: string; address: string; interface: Interface; watchFunctions: Set<string> }
export type WalletWatcher = { name: string; address: string }
export type NotificationChannel = { send(message: NotificationMessage): Promise<void> }

export const KNOWN_DEX_ROUTERS: Record<string, string> = { '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'Uniswap V2', '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3', '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap Universal', '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f': 'SushiSwap', '0x1111111254fb6c44bac0bed2854e76f90643097d': '1inch', '0xdef1c0ded9bec7f1a1670819833240f027b25eff': '0x Protocol', '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap Universal Router' }
export const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
export const ERC721_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
export const ERC1155_SINGLE_TRANSFER_TOPIC = '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62'
export const ERC1155_BATCH_TRANSFER_TOPIC = '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb'
