import { createContext } from 'react'
import type { FlatList } from 'react-native'
import type { useAnimatedScrollHandler, AnimatedRef } from 'react-native-reanimated'
import type { Gesture } from 'react-native-gesture-handler'

export interface BottomSheetScrollContext {
  scrollHandler: ReturnType<typeof useAnimatedScrollHandler>
  contentGesture: ReturnType<typeof Gesture.Simultaneous>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scrollRef: AnimatedRef<FlatList<any>>
}

export const BottomSheetScrollCtx = createContext<BottomSheetScrollContext | null>(null)

/**
 * Context shared by `<BottomSheet>` (when `enableDynamicSizing` is true) and
 * its measurement children — `<BottomSheetView>`, `<BottomSheetScrollView>`,
 * or any consumer that calls `setContentHeight` directly via
 * `useBottomSheetDynamicSizing`.
 *
 * `null` when dynamic sizing is disabled — measurement components fall back
 * to layout-only behavior.
 */
export interface BottomSheetDynamicSizingContextValue {
  /** Report the natural height of the sheet's content (chrome excluded). */
  setContentHeight: (h: number) => void
}

export const BottomSheetDynamicSizingCtx =
  createContext<BottomSheetDynamicSizingContextValue | null>(null)
