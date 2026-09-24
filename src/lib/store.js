import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_GAMES } from './constants.js';

const initialState = () => ({ version: 1, teams: [], members: [], games: DEFAULT_GAMES.map((g) => ({ ...g })), attempts: [] });

export function createStore(filePath) {
  let queue = Promise.resolve();
  async function readRaw() {
    try { return JSON.parse(await readFile(filePath, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return initialState(); throw error; }
  }
  async function writeRaw(state) {
    await mkdir(dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2), { flag: 'wx' });
    await rename(temporary, filePath);
  }
  return {
    read: () => queue.then(readRaw),
    update(callback) {
      const operation = queue.then(async () => {
        const state = await readRaw();
        const value = await callback(state);
        await writeRaw(state);
        return value;
      });
      queue = operation.then(() => undefined, () => undefined);
      return operation;
    },
  };
}
