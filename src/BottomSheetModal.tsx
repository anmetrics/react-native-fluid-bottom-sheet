import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'

import { BottomSheet } from './BottomSheet'
import { useBottomSheetModalContext } from './BottomSheetModalProvider'
import type { BottomSheetProps, BottomSheetRef } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// BottomSheetModal — ref-driven, portal-style sibling of `BottomSheet`.
//
// The modal renders at the location of `BottomSheetModalProvider`, *not* in
// its own consumer's tree. Consumers control it imperatively:
//
//   const ref = useRef<BottomSheetModalRef>(null)
//   <BottomSheetModal ref={ref} title="…" snapPoint={0.7}>
//     <BottomSheetFlatList … />
//   </BottomSheetModal>
//
//   ref.current?.present()
//   ref.current?.dismiss()
//
// Use this when the modal might be rendered inside another `BottomSheet` /
// `ScrollView` and you don't want the inner virtualized list to trigger
// RN's "nested VirtualizedLists" warning.
// ─────────────────────────────────────────────────────────────────────────────

export interface BottomSheetModalRef {
  /** Show the sheet and animate it to the initial snap point. */
  present: () => void
  /** Animate the sheet closed. */
  dismiss: () => void
  /** Snap to a specific index (sheet must already be presented). */
  snapTo: (index: number) => void
}

export type BottomSheetModalProps = Omit<
  BottomSheetProps,
  'isVisible' | 'onClose'
> & {
  /** Fired after the modal animates out (whether dismissed by drag or via ref). */
  onDismiss?: () => void
}

let nextId = 0
const generateId = () => `bsm_${++nextId}`

export const BottomSheetModal = forwardRef<
  BottomSheetModalRef,
  BottomSheetModalProps
>(function BottomSheetModal(props, ref) {
  const ctx = useBottomSheetModalContext()
  const idRef = useRef<string>(generateId())
  const sheetRef = useRef<BottomSheetRef>(null)
  const [isVisible, setIsVisible] = useState(false)

  const handleClose = useCallback(() => {
    setIsVisible(false)
    props.onDismiss?.()
  }, [props])

  useImperativeHandle(
    ref,
    () => ({
      present: () => setIsVisible(true),
      dismiss: () => setIsVisible(false),
      snapTo: (index: number) => sheetRef.current?.snapTo(index)
    }),
    []
  )

  // Memoize the JSX node so the provider's `setState` bails out when nothing
  // about the modal changed (see `mount` in the provider). We list every
  // primitive prop explicitly — spreading `props` would create a new object
  // every render and defeat the memo.
  const node = useMemo(
    () => (
      <BottomSheet
        ref={sheetRef}
        isVisible={isVisible}
        onClose={handleClose}
        title={props.title}
        snapPoint={props.snapPoint}
        snapPoints={props.snapPoints}
        initialSnapIndex={props.initialSnapIndex}
        searchable={props.searchable}
        searchPlaceholder={props.searchPlaceholder}
        onSearch={props.onSearch}
        showHandle={props.showHandle}
        showCloseButton={props.showCloseButton}
        renderCloseButton={props.renderCloseButton}
        renderSearchIcon={props.renderSearchIcon}
        renderClearIcon={props.renderClearIcon}
        theme={props.theme}
        containerStyle={props.containerStyle}
        accessibilityLabel={props.accessibilityLabel}
        accessibilityRole={props.accessibilityRole}
        closeButtonAccessibilityLabel={props.closeButtonAccessibilityLabel}
        enableHaptics={props.enableHaptics}
        keyboardBehavior={props.keyboardBehavior}
        topInset={props.topInset}
        enableDynamicSizing={props.enableDynamicSizing}
        minDynamicSnapFraction={props.minDynamicSnapFraction}
        maxDynamicSnapFraction={props.maxDynamicSnapFraction}
        onSnap={props.onSnap}
        onAnimate={props.onAnimate}
      >
        {props.children}
      </BottomSheet>
    ),
    [
      isVisible,
      handleClose,
      props.title,
      props.snapPoint,
      props.snapPoints,
      props.initialSnapIndex,
      props.searchable,
      props.searchPlaceholder,
      props.onSearch,
      props.showHandle,
      props.showCloseButton,
      props.renderCloseButton,
      props.renderSearchIcon,
      props.renderClearIcon,
      props.theme,
      props.containerStyle,
      props.accessibilityLabel,
      props.accessibilityRole,
      props.closeButtonAccessibilityLabel,
      props.enableHaptics,
      props.keyboardBehavior,
      props.topInset,
      props.enableDynamicSizing,
      props.minDynamicSnapFraction,
      props.maxDynamicSnapFraction,
      props.onSnap,
      props.onAnimate,
      props.children
    ]
  )

  useEffect(() => {
    const id = idRef.current
    ctx.mount(id, node)
    return () => ctx.unmount(id)
  }, [ctx, node])

  return null
})
