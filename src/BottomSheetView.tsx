import React, { useContext, useCallback } from 'react'
import {
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { BottomSheetDynamicSizingCtx } from './context'

export interface BottomSheetViewProps {
  style?: StyleProp<ViewStyle>
  children?: React.ReactNode
}

/**
 * A `<View>` that reports its laid-out height to its parent
 * `<BottomSheet>` whenever `enableDynamicSizing` is set on the sheet.
 *
 * Use this when the sheet's content fits without scrolling. The sheet then
 * sizes itself to the children's natural height (plus chrome). When dynamic
 * sizing is disabled the component is just a plain `View` — no layout
 * reporting happens, so it's safe to leave in place across both modes.
 *
 * For scrollable content use `<BottomSheetScrollView>` instead — the
 * `<View>`'s `onLayout` reports the *frame* size, not the inner scroll
 * content, which would always come back bounded by the parent.
 */
export function BottomSheetView({ style, children }: BottomSheetViewProps) {
  const ctx = useContext(BottomSheetDynamicSizingCtx)

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (!ctx) return
      const h = e.nativeEvent.layout.height
      if (h > 0) ctx.setContentHeight(h)
    },
    [ctx]
  )

  return (
    <View style={style} onLayout={ctx ? onLayout : undefined}>
      {children}
    </View>
  )
}
