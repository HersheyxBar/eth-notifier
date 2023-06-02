import { EthereumListener } from '../src/listener/ethereum';
import { ERC20_TRANSFER_TOPIC } from '../src/types';

const makeTopicAddress = (addr: string): string => `0x${addr.replace(/^0x/, '').padStart(64, '0')}`;
const makeTopicUint = (value: bigint): string => `0x${value.toString(16).padStart(64, '0')}`;

describe('EthereumListener log handling', () => {
  it('emits ERC20 and ERC721 transfer events', async () => {
    const events: any[] = [];

    const listener: any = new EthereumListener({
      watchers: new Map(),
      walletWatchers: new Map(),
      trackingConfig: { tokenTransfers: { enabled: true }, nftTransfers: { enabled: true } },
      onTransaction: (d: any) => events.push(d),
      apiKeys: ['test']
    });

    listener.getToken = async () => ({ symbol: 'TKN', name: 'Token', decimals: 18 });
    listener.getCollection = async () => 'CoolNFT';

    const from = '0x' + 'a'.repeat(40);
    const to = '0x' + 'b'.repeat(40);
    const tokenAddr = '0x' + 'c'.repeat(40);
    const nftAddr = '0x' + 'd'.repeat(40);

    const erc20Log = {
      address: tokenAddr,
      topics: [ERC20_TRANSFER_TOPIC, makeTopicAddress(from), makeTopicAddress(to)],
      data: makeTopicUint(BigInt(1234)),
      transactionHash: '0x' + '1'.repeat(64)
    };

    const erc721Log = {
      address: nftAddr,
      topics: [ERC20_TRANSFER_TOPIC, makeTopicAddress(from), makeTopicAddress(to), makeTopicUint(BigInt(42))],
      data: '0x',
      transactionHash: '0x' + '2'.repeat(64)
    };

    listener.pm = {
      executeWithFailover: async () => [erc20Log, erc721Log]
    };

    await listener.processLogs(123);

    expect(events).toHaveLength(2);
    const tokenEvent = events.find(e => e.sourceType === 'token_transfer');
    const nftEvent = events.find(e => e.sourceType === 'nft_transfer');

    expect(tokenEvent).toBeTruthy();
    expect(tokenEvent.tokenSymbol).toBe('TKN');
    expect(tokenEvent.tokenAddress).toBe(tokenAddr);

    expect(nftEvent).toBeTruthy();
    expect(nftEvent.tokenType).toBe('ERC721');
    expect(nftEvent.tokenId).toBe('42');
    expect(nftEvent.contractAddress).toBe(nftAddr);
  });
});
