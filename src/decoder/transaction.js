const { formatEther } = require('ethers')

function decodeTransaction(tx, watcher) {
  if (!tx.to || !tx.data || tx.data === '0x') return null
  let parsed = null
  try { parsed = watcher.interface.parseTransaction({ data: tx.data }) } catch { return null }
  if (!parsed) return null
  const functionName = parsed.name.toLowerCase()
  const signature = parsed.fragment.format('sighash').toLowerCase().replace(/\s+/g, '')
  const selector = tx.data.length >= 10 ? tx.data.slice(0, 10).toLowerCase() : ''
  if (!watcher.watchFunctions.has(functionName) && !watcher.watchFunctions.has(signature) && !watcher.watchFunctions.has(selector)) return null
  const args = {}
  for (let i = 0; i < parsed.fragment.inputs.length; i++) { const input = parsed.fragment.inputs[i]; args[input.name || `arg${i}`] = formatArgValue(parsed.args[i]) }
  return { sourceType: 'contract', contractName: watcher.name, contractAddress: watcher.address, functionName: parsed.name, functionArgs: args, transactionHash: tx.hash, from: tx.from, to: tx.to, value: formatEther(tx.value), blockNumber: tx.blockNumber }
}

function formatArgValue(value) {
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(formatArgValue)
  if (typeof value === 'object' && value !== null) { const f = {}; for (const k of Object.keys(value)) if (isNaN(Number(k))) f[k] = formatArgValue(value[k]); return f }
  return value
}

function getSelector(data) { return data.length < 10 ? '' : data.slice(0, 10).toLowerCase() }

module.exports = { decodeTransaction, getSelector }
