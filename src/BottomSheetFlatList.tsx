import React, { useContext } from 'react'
import { FlatList, FlatListProps } from 'react-native'
import Animated from 'react-native-reanimated'
import { GestureDetector } from 'react-native-gesture-handler'
import { BottomSheetScrollCtx } from './context'

const AnimatedFlatList = Animated.createAnimatedComponent(
  FlatList
) as unknown as <T>(
  props: FlatListProps<T> & { ref?: React.Ref<FlatList<T>> }
) => React.ReactElement

export function BottomSheetFlatList<T>(props: FlatListProps<T>) {
  const ctx = useContext(BottomSheetScrollCtx)

  if (!ctx) return <FlatList {...props} />

  return (
    <GestureDetector gesture={ctx.contentGesture}>
      <AnimatedFlatList<T>
        ref={ctx.scrollRef}
        {...props}
        onScroll={ctx.scrollHandler}
        scrollEventThrottle={1}
        bounces={false}
        overScrollMode="never"
      />
    </GestureDetector>
  )
}
