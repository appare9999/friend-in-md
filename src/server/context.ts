import { LockStore } from "./lib/lockStore.js";
import { Watcher } from "./lib/watcher.js";

export interface AppContext {
  root: string;
  lockStore: LockStore;
  watcher: Watcher;
}
