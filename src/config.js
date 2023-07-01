const fs = require('fs')
const path = require('path')
const { config: loadEnv } = require('dotenv')
const { Interface } = require('ethers')
const { ProviderType } = require('./types')

loadEnv()

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/
const EXPLORERS = { mainnet: 'https://etherscan.io', goerli: 'https://goerli.etherscan.io', sepolia: 'https://sepolia.etherscan.io', polygon: 'https://polygonscan.com', arbitrum: 'https://arbiscan.io', optimism: 'https://optimistic.etherscan.io', base: 'https://basescan.org' }

function loadConfig() {
  const cwd = process.cwd()
  const yamlPath = path.join(cwd, 'config.yaml')
  const ymlPath = path.join(cwd, 'config.yml')
  const jsonPath = path.join(cwd, 'config.json')

  let config
  if (fs.existsSync(yamlPath)) {
    const yaml = require('js-yaml')
    config = yaml.load(fs.readFileSync(yamlPath, 'utf-8'))
    console.log('[Config] Loaded config.yaml')
  } else if (fs.existsSync(ymlPath)) {
    const yaml = require('js-yaml')
    config = yaml.load(fs.readFileSync(ymlPath, 'utf-8'))
    console.log('[Config] Loaded config.yml')
  } else if (fs.existsSync(jsonPath)) {
    config = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
    console.log('[Config] Loaded config.json')
  } else {
    console.error('\n[Config] No config file found!\n')
    console.error('  Create one by copying the example:')
    console.error('    cp config.example.yaml config.yaml\n')
    console.error('  Then edit config.yaml with your settings.')
    console.error('  See README.md for setup instructions.\n')
    throw new Error('Config not found. Run: cp config.example.yaml config.yaml')
  }

  if (!config || typeof config !== 'object') {
    throw new Error('Config file is empty or invalid. Check the file contents.')
  }

  validateConfig(config)
  return config
}

function validateConfig(c) {
  // Ensure contracts is an array (default to empty)
  if (!c.contracts) c.contracts = []
  if (!Array.isArray(c.contracts)) throw new Error('Config "contracts" must be an array (or omit it)')

  for (const ct of c.contracts) {
    if (!ct.name) throw new Error('Each contract needs a "name" field')
    if (!ct.address || !ADDR_RE.test(ct.address)) {
      throw new Error(
        `Invalid address for contract "${ct.name || 'unnamed'}".\n` +
        '  Ethereum addresses look like: 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18\n' +
        '  They start with "0x" followed by 40 hex characters.'
      )
    }
    if (!ct.abi || !Array.isArray(ct.abi)) throw new Error(`Contract "${ct.name}" needs an "abi" array`)
    if (!ct.watchFunctions?.length) throw new Error(`Contract "${ct.name}" needs at least one function in "watchFunctions"`)
  }

  if (c.wallets) {
    if (!Array.isArray(c.wallets)) throw new Error('Config "wallets" must be an array')
    for (const w of c.wallets) {
      if (!w.name) throw new Error('Each wallet needs a "name" field')
      if (!w.address || !ADDR_RE.test(w.address)) {
        throw new Error(
          `Invalid address for wallet "${w.name || 'unnamed'}".\n` +
          '  Ethereum addresses look like: 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18\n' +
          '  They start with "0x" followed by 40 hex characters.\n' +
          '  Find wallet addresses on https://etherscan.io'
        )
      }
    }
  }

  if (!c.notifications) {
    throw new Error(
      'Config must include a "notifications" section.\n' +
      '  Example:\n' +
      '  notifications:\n' +
      '    telegram:\n' +
      '      enabled: true\n' +
      '      chatId: "your_chat_id"'
    )
  }

  // Warn if nothing is being watched
  if (!c.contracts.length && (!c.wallets || !c.wallets.length)) {
    const hasTracking = c.tracking && Object.values(c.tracking).some(t => t?.enabled)
    if (!hasTracking) {
      console.warn('\n[Config] Warning: No wallets, contracts, or tracking configured.')
      console.warn('  Add at least one wallet address to config.yaml to start monitoring.\n')
    }
  }
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
