import { decodeTransaction, getSelector } from '../src/decoder/transaction';
import { ContractWatcher } from '../src/types';
import { Interface } from 'ethers';

describe('getSelector', () => {
  it('should extract 4-byte selector from data', () => {
    expect(getSelector('0xa9059cbb000000000000000000000000')).toBe('0xa9059cbb');
  });

  it('should return empty string for short data', () => {
    expect(getSelector('0x1234')).toBe('');
    expect(getSelector('')).toBe('');
  });

  it('should lowercase the selector', () => {
    expect(getSelector('0xA9059CBB000000000000000000000000')).toBe('0xa9059cbb');
  });
});

describe('decodeTransaction', () => {
  const mintAbi = [
    {
      "inputs": [
        { "name": "to", "type": "address" },
        { "name": "amount", "type": "uint256" }
      ],
      "name": "mint",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [
        { "name": "from", "type": "address" },
        { "name": "to", "type": "address" },
        { "name": "amount", "type": "uint256" }
      ],
      "name": "transfer",
      "outputs": [{ "type": "bool" }],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ];

  const createWatcher = (watchFunctions: string[]): ContractWatcher => ({
    name: 'Test Contract',
    address: '0x1234567890123456789012345678901234567890',
    interface: new Interface(mintAbi),
    watchFunctions: new Set(watchFunctions.map(f => f.toLowerCase()))
  });

  it('should decode a watched function call', () => {
    const watcher = createWatcher(['mint']);
    const iface = new Interface(mintAbi);
    const data = iface.encodeFunctionData('mint', [
      '0x0000000000000000000000000000000000000001',
      BigInt('1000000000000000000')
    ]);

    const result = decodeTransaction({
      hash: '0xabc123',
      from: '0xsender',
      to: watcher.address,
      value: BigInt('100000000000000000'),
      data
    }, watcher);

    expect(result).not.toBeNull();
    expect(result?.functionName).toBe('mint');
    expect(result?.sourceType).toBe('contract');
    expect(result?.contractName).toBe('Test Contract');
    expect(result?.functionArgs.to).toBe('0x0000000000000000000000000000000000000001');
    expect(result?.value).toBe('0.1');
  });

  it('should return null for non-watched functions', () => {
    const watcher = createWatcher(['mint']);
    const iface = new Interface(mintAbi);
    const data = iface.encodeFunctionData('transfer', [
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000002',
      BigInt('1000000000000000000')
    ]);

    const result = decodeTransaction({
      hash: '0xabc123',
      from: '0xsender',
      to: watcher.address,
      value: BigInt(0),
      data
    }, watcher);

    expect(result).toBeNull();
  });

  it('should return null for empty data', () => {
    const watcher = createWatcher(['mint']);

    const result = decodeTransaction({
      hash: '0xabc123',
      from: '0xsender',
      to: watcher.address,
      value: BigInt(0),
      data: '0x'
    }, watcher);

    expect(result).toBeNull();
  });

  it('should return null for transactions without to address', () => {
    const watcher = createWatcher(['mint']);

    const result = decodeTransaction({
      hash: '0xabc123',
      from: '0xsender',
      to: null,
      value: BigInt(0),
      data: '0xabcdef'
    }, watcher);

    expect(result).toBeNull();
  });

  it('should handle function matching by selector', () => {
    const iface = new Interface(mintAbi);
    const mintSelector = iface.getFunction('mint')!.selector;

    const watcher = createWatcher([mintSelector]);
    const data = iface.encodeFunctionData('mint', [
      '0x0000000000000000000000000000000000000001',
      BigInt('1000000000000000000')
    ]);

    const result = decodeTransaction({
      hash: '0xabc123',
      from: '0xsender',
      to: watcher.address,
      value: BigInt(0),
      data
    }, watcher);

    expect(result).not.toBeNull();
    expect(result?.functionName).toBe('mint');
  });
});
