export const IPC_CHANNELS = {
  AUTH: {
    UNLOCK: 'auth:unlock',
    LOCK: 'auth:lock',
    IS_UNLOCKED: 'auth:isUnlocked',
    HAS_VERIFIER: 'auth:hasVerifier',
  },
  TASKS: {
    LIST: 'tasks:list',
    CREATE: 'tasks:create',
    UPDATE: 'tasks:update',
    DELETE: 'tasks:delete',
  },
  VAULT: {
    LIST: 'vault:list',
    CREATE: 'vault:create',
    UPDATE: 'vault:update',
    DELETE: 'vault:delete',
    GENERATE_PASSWORD: 'vault:generatePassword',
  },
  SECURITY: {
    GET_SETTINGS: 'security:getSettings',
    SET_SETTINGS: 'security:setSettings',
    CLEAR_CLIPBOARD: 'security:clearClipboard',
  },
  BACKUP: {
    EXPORT: 'backup:export',
    IMPORT: 'backup:import',
    EXPORT_JSON: 'backup:export-json',
    IMPORT_JSON: 'backup:import-json',
  },
  SYNC: {
    GET_STATE: 'sync:getState',
    SET_ENABLED: 'sync:setEnabled',
    SET_RELAY_URL: 'sync:setRelayUrl',
    GENERATE_PAIRING_CODE: 'sync:generatePairingCode',
    CLAIM_PAIRING_CODE: 'sync:claimPairingCode',
    REMOVE_DEVICE: 'sync:removeDevice',
    SYNC_NOW: 'sync:syncNow',
    ON_STATE_CHANGED: 'sync:onStateChanged',
    ON_PEER_STATE_CHANGED: 'sync:onPeerStateChanged',
  },
} as const;
