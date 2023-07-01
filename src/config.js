const fs = require('fs')
const path = require('path')
const { config: loadEnv } = require('dotenv')
const { Interface } = require('ethers')
const { ProviderType } = require('./types')

loadEnv()

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/
const EXPLORERS = { mainnet: 'https://etherscan.io', goerli: 'https://goerli.etherscan.io', sepolia: 'https://sepolia.etherscan.io', polygon: 'https://polygonscan.com', arbitrum: 'https://arbiscan.io', optimism: 'https://optimistic.etherscan.io', base: 'https://basescan.org' }

function loadConfig() {
  const p = path.join(process.cwd(), 'config.json')
  if (!fs.existsSync(p)) throw new Error(`Config not found: ${p}`)
  const config = JSON.parse(fs.readFileSync(p, 'utf-8'))
  validateConfig(config)
  return config
}

function validateConfig(c) {
  if (!c.contracts || !Array.isArray(c.contracts)) throw new Error('Config must include "contracts" array')
  for (const ct of c.contracts) {
    if (!ct.name) throw new Error('Contract must have "name"')
    if (!ct.address || !ADDR_RE.test(ct.address)) throw new Error(`Invalid address for "${ct.name}"`)
    if (!ct.abi || !Array.isArray(ct.abi)) throw new Error(`"${ct.name}" must have "abi" array`)
    if (!ct.watchFunctions?.length) throw new Error(`"${ct.name}" must have watchFunctions`)
  }
  if (c.wallets) for (const w of c.wallets) { if (!w.name) throw new Error('Wallet must have "name"'); if (!w.address || !ADDR_RE.test(w.address)) throw new Error(`Invalid wallet address "${w.name}"`) }
  if (!c.notifications) throw new Error('Config must include "notifications"')
}

function createContractWatchers(config) {
  const m = new Map()
  for (const c of config.contracts) { const addr = c.address.toLowerCase(); m.set(addr, { name: c.name, address: addr, interface: new Interface(c.abi), watchFunctions: new Set(c.watchFunctions.map(v => v.trim().toLowerCase().replace(/\s+/g, ''))) }) }
  return m
}

function createWalletWatchers(config) {
  const m = new Map()
  for (const w of config.wallets || []) { const addr = w.address.toLowerCase(); m.set(addr, { name: w.name, address: addr }) }
  return m
}

function getEnvVar(name, required = true) { const v = process.env[name]; if (!v && required) throw new Error(`Env "${name}" required`); return v || '' }
function getEnvNumber(name, fallback) { const r = getEnvVar(name, false); if (!r) return fallback; const p = parseInt(r, 10); return Number.isFinite(p) ? p : fallback }

const ENV = {
  get ALCHEMY_API_KEY() { return getEnvVar('ALCHEMY_API_KEY') },
  get ALCHEMY_API_KEYS() {
    const keys = []
    const primary = getEnvVar('ALCHEMY_API_KEY', false); if (primary) keys.push(primary)
    for (let i = 2; i <= 5; i++) { const k = getEnvVar(`ALCHEMY_API_KEY_${i}`, false); if (k) keys.push(k) }
    if (!keys.length) throw new Error('At least one ALCHEMY_API_KEY required')
    return keys
  },
  get DISCORD_WEBHOOK_URL() { return getEnvVar('DISCORD_WEBHOOK_URL', false) },
  get TELEGRAM_BOT_TOKEN() { return getEnvVar('TELEGRAM_BOT_TOKEN', false) },
  get NETWORK() { return getEnvVar('NETWORK', false) || 'mainnet' },
  get NOTIFY_DEDUPE_SECONDS() { return getEnvNumber('NOTIFY_DEDUPE_SECONDS', 60) }
}

function getExplorerBase(network) { return EXPLORERS[network.toLowerCase()] || EXPLORERS.mainnet }

function createProviderManager(config) {
  const { ProviderManager } = require('./providers')
  const network = ENV.NETWORK
  if (config.providers) return new ProviderManager({ primary: { ...config.providers.primary, network }, fallbacks: config.providers.fallbacks?.map(f => ({ ...f, network })), strategy: config.providers.strategy })
  const manager = new ProviderManager()
  ENV.ALCHEMY_API_KEYS.forEach(k => manager.addProviderFromEnv(ProviderType.ALCHEMY, k, network))
  const infura = getEnvVar('INFURA_API_KEY', false); if (infura) manager.addProviderFromEnv(ProviderType.INFURA, infura, network)
  const ankr = getEnvVar('ANKR_API_KEY', false); if (ankr) manager.addProviderFromEnv(ProviderType.ANKR, ankr, network)
  const moralis = getEnvVar('MORALIS_API_KEY', false); if (moralis) manager.addProviderFromEnv(ProviderType.MORALIS, moralis, network)
  const blast = getEnvVar('BLAST_API_KEY', false); if (blast) manager.addProviderFromEnv(ProviderType.BLAST, blast, network)
  const pocket = getEnvVar('POCKET_PORTAL_ID', false); if (pocket) manager.addProviderFromEnv(ProviderType.POCKET, pocket, network)
  return manager
}

module.exports = { loadConfig, createContractWatchers, createWalletWatchers, getEnvVar, ENV, getExplorerBase, createProviderManager }
