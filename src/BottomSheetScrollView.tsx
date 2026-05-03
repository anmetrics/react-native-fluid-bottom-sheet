import React, { useContext, useCallback } from 'react'
import { ScrollView, type ScrollViewProps } from 'react-native'

import { BottomSheetDynamicSizingCtx } from './context'

/**
 * A `<ScrollView>` that reports its inner content height to its parent
 * `<BottomSheet>` whenever `enableDynamicSizing` is set on the sheet.
 *
 * This is the right wrapper for scrollable content under dynamic sizing —
 * unlike `<BottomSheetView>` (which uses `onLayout` and would be bounded by
 * the sheet's current frame), `<BottomSheetScrollView>` uses the
 * ScrollView's `onContentSizeChange` to report the *natural* inner-content
 * height. The sheet then either fits exactly or caps at the configured
 * upper bound (`maxDynamicSnapFraction`) and falls back to scrolling.
 *
 * When dynamic sizing is disabled, the component behaves as a plain
 * `<ScrollView>` (the size callback is still chained to a user-provided
 * `onContentSizeChange` if one was passed).
 */
export function BottomSheetScrollView(props: ScrollViewProps) {
  const ctx = useContext(BottomSheetDynamicSizingCtx)
  const userOnContentSizeChange = props.onContentSizeChange

  const handleContentSizeChange = useCallback(
    (w: number, h: number) => {
      if (ctx && h > 0) ctx.setContentHeight(h)
      userOnContentSizeChange?.(w, h)
    },
    [ctx, userOnContentSizeChange]
  )

  return (
    <ScrollView {...props} onContentSizeChange={handleContentSizeChange} />
  )
}
