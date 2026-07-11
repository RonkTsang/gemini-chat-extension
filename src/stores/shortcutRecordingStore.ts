import { create } from 'zustand'

interface ShortcutRecordingState {
  isRecording: boolean
  setRecording: (isRecording: boolean) => void
}

export const useShortcutRecordingStore = create<ShortcutRecordingState>((set) => ({
  isRecording: false,
  setRecording: (isRecording) => set({ isRecording }),
}))
