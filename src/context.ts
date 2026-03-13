import { createContext } from 'react'
import type { FlatList } from 'react-native'
import type { useAnimatedScrollHandler, AnimatedRef } from 'react-native-reanimated'
import type { Gesture } from 'react-native-gesture-handler'

export interface BottomSheetScrollContext {
  scrollHandler: ReturnType<typeof useAnimatedScrollHandler>
  contentGesture: ReturnType<typeof Gesture.Simultaneous>
  scrollRef: AnimatedRef<FlatList<any>>
}

export const BottomSheetScrollCtx = createContext<BottomSheetScrollContext | null>(null)
