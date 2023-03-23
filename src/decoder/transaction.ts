import { formatEther, TransactionDescription } from 'ethers';
import { ContractWatcher, ContractEvent } from '../types';

export function decodeTransaction(
  tx: {
    hash: string;
    from: string;
    to: string | null;
    value: bigint;
    data: string;
    blockNumber?: number;
  },
  watcher: ContractWatcher
): ContractEvent | null {
  if (!tx.to || !tx.data || tx.data === '0x') {
    return null;
  }

  let parsed: TransactionDescription | null = null;

  try {
    parsed = watcher.interface.parseTransaction({ data: tx.data });
  } catch (error) {
    return null;
  }

  if (!parsed) {
    return null;
  }

  const functionName = parsed.name.toLowerCase();
  const signature = parsed.fragment.format('sighash').toLowerCase().replace(/\s+/g, '');
  const selector = getSelector(tx.data);

  if (
    !watcher.watchFunctions.has(functionName) &&
    !watcher.watchFunctions.has(signature) &&
    !watcher.watchFunctions.has(selector)
  ) {
    return null;
  }

  const args: Record<string, any> = {};
  const fragment = parsed.fragment;

  for (let i = 0; i < fragment.inputs.length; i++) {
    const input = fragment.inputs[i];
    const value = parsed.args[i];
    args[input.name || `arg${i}`] = formatArgValue(value);
  }

  return {
    sourceType: 'contract',
    contractName: watcher.name,
    contractAddress: watcher.address,
    functionName: parsed.name,
    functionArgs: args,
    transactionHash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: formatEther(tx.value),
    blockNumber: tx.blockNumber
  };
}

function formatArgValue(value: any): any {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(formatArgValue);
  }

  if (typeof value === 'object' && value !== null) {
    const formatted: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      if (isNaN(Number(key))) {
        formatted[key] = formatArgValue(value[key]);
      }
    }
    return formatted;
  }

  return value;
}

export function getSelector(data: string): string {
  if (data.length < 10) {
    return '';
  }
  return data.slice(0, 10).toLowerCase();
}
