import { AsyncLocalStorage } from "node:async_hooks";
import type { AgentContext } from "./tenantContext.js";

const storage = new AsyncLocalStorage<AgentContext>();

export const runWithAgentContext = <T>(context: AgentContext, callback: () => Promise<T>) =>
  storage.run(context, callback);

export const getAgentContext = () => storage.getStore();
