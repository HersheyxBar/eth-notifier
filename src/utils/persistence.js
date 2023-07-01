const fs = require('fs')
const path = require('path')

const DEFAULT = { lastBlockNumber: 0, lastTimestamp: 0, pendingNotifications: [], seenTransactions: [] }

class StatePersistence {
  constructor(dataDir = '.data') {
    const dir = path.resolve(process.cwd(), dataDir)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.filePath = path.join(dir, 'state.json')
    this.debounceMs = 5000
    this.timer = null
    this.state = this.load()
  }
  load() { try { if (fs.existsSync(this.filePath)) return { ...DEFAULT, ...JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) } } catch (e) { console.warn('[Persistence] Load failed:', e) }; return { ...DEFAULT } }
  saveImmediate() { try { fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2)) } catch (e) { console.error('[Persistence] Save failed:', e) } }
  save() { if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(() => { this.saveImmediate(); this.timer = null }, this.debounceMs) }
  forceSave() { if (this.timer) { clearTimeout(this.timer); this.timer = null }; this.saveImmediate() }
  getLastBlockNumber() { return this.state.lastBlockNumber }
  setLastBlockNumber(n) { if (n > this.state.lastBlockNumber) { this.state.lastBlockNumber = n; this.state.lastTimestamp = Date.now(); this.save() } }
  addPendingNotification(n) { this.state.pendingNotifications.push(n); this.save() }
  removePendingNotification(id) { this.state.pendingNotifications = this.state.pendingNotifications.filter(n => n.id !== id); this.save() }
  getPendingNotifications() { return [...this.state.pendingNotifications] }
  updatePendingNotification(id, updates) { const n = this.state.pendingNotifications.find(x => x.id === id); if (n) { Object.assign(n, updates); this.save() } }
  setSeenTransactions(seen) { this.state.seenTransactions = Array.from(seen.entries()); this.save() }
  getSeenTransactions() { return new Map(this.state.seenTransactions) }
  getState() { return { ...this.state } }
  cleanup() { if (this.timer) { clearTimeout(this.timer); this.timer = null } }
}

module.exports = { StatePersistence }
