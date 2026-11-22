// Save games in localStorage: cash, reputation, story progress and the pistol unlock.
// Deliberately tiny and defensive — a corrupt or missing save just means "no save".

import { SAVE_KEY } from './config.js';

/** Returns the saved state object, or null when there is nothing usable. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: Number(data.cash) || 0,
      rep: Number(data.rep) || 0,
      missionIndex: Number(data.missionIndex) || 0,
      pistol: Boolean(data.pistol),
    };
  } catch {
    return null;
  }
}

/** Persists the player's progression. */
export function storeSave({ cash, rep, missionIndex, pistol }) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ cash, rep, missionIndex, pistol }));
  } catch {
    // Private mode / storage full: the game simply runs unsaved.
  }
}

/** Wipes the save (new game). */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
