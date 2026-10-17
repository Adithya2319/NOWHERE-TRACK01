import { create } from "zustand";
import { api } from "../services/api";

// This is a disposable cache. SQLite through /api is the source of durable state.
let generation = 0;
let requestSequence = 0;
export const useSharedStore = create((set, get) => ({
  data: null,
  status: "loading",
  error: "",
  authNotice: "",
  async refresh(signal) {
    const currentGeneration = generation;
    const request = ++requestSequence;
    try {
      const data = await api("/state", { signal });
      if (
        !signal?.aborted &&
        currentGeneration === generation &&
        request === requestSequence
      )
        set({ data, status: "ready", error: "" });
      return data;
    } catch (error) {
      if (
        error.name === "AbortError" ||
        signal?.aborted ||
        currentGeneration !== generation ||
        request !== requestSequence
      )
        return;
      if (error.status === 401)
        set({ data: null, status: "anonymous", error: "" });
      else
        set({ status: get().data ? "ready" : "error", error: error.message });
      throw error;
    }
  },
  async bootstrap(signal) {
    const currentGeneration = generation;
    try {
      await api("/me", { signal });
      if (signal?.aborted || currentGeneration !== generation) return;
      await get().refresh(signal);
    } catch (error) {
      if (
        error.name === "AbortError" ||
        signal?.aborted ||
        currentGeneration !== generation
      )
        return;
      if (error.status === 401)
        set({ data: null, status: "anonymous", error: "" });
      else set({ status: "error", error: error.message });
    }
  },
  clear(authNotice = "") {
    generation += 1;
    set({ data: null, status: "anonymous", error: "", authNotice });
  },
}));
