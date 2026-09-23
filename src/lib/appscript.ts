/**
 * Re-export wrapper untuk backward compatibility.
 * Kode inti telah dipindahkan ke folder: src/backends/appscript/
 */
export {
  panggilAppsScript,
  type GasResponse,
} from '../backends/appscript/client.js';

export {
  identitasDariTokenAppsScript,
} from '../backends/appscript/auth.js';
