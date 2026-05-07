import { useEffect } from 'react'
import { Platform } from 'react-native'
import {
  withTiming,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated'
import {
  useKeyboardHandler,
  KeyboardController,
} from 'react-native-keyboard-controller'

const IS_IOS = Platform.OS === 'ios'

interface Props {
  kbDriven: SharedValue<number>
  shouldHandleKeyboard: boolean
  keyboardActiveRef: { current: boolean }
}

// Engine: per-frame keyboard tracking via `react-native-keyboard-controller`.
// Mounted only when `keyboardMode === 'handler'`. Lives in its own file so
// the host file (`BottomSheet.tsx`) can lazy-load it via `require()` —
// consumers running the default `'animated'` engine never pay to evaluate
// this module nor to spin up `react-native-keyboard-controller`.
export function HandlerKbEngine({
  kbDriven,
  shouldHandleKeyboard,
  keyboardActiveRef,
}: Props) {
  // Seed `kbDriven` + `keyboardActiveRef` from the library's last-known
  // state so a sheet that mounts with the keyboard already visible (e.g.
  // navigating into a screen that auto-focuses an input) renders at the
  // right offset without waiting for the next show/hide event.
  useEffect(() => {
    if (KeyboardController.isVisible()) {
      keyboardActiveRef.current = true
      const h = KeyboardController.state().height
      if (h > 0 && kbDriven.value === 0) kbDriven.value = h
    }
  }, [kbDriven, keyboardActiveRef])

  useKeyboardHandler(
    {
      onStart: (e) => {
        'worklet'
        if (!shouldHandleKeyboard) return
        // iOS: this is the only event that carries the destination
        // height + the OS animation duration. Match the native curve
        // exactly with `withTiming(e.height, { duration: e.duration })`.
        // Android: `onMove` will drive per-frame from here.
        if (IS_IOS) {
          const duration = e.duration > 0 ? e.duration : 250
          kbDriven.value = withTiming(e.height, { duration })
        }
      },
      onMove: (e) => {
        'worklet'
        if (!shouldHandleKeyboard) return
        if (!IS_IOS) {
          cancelAnimation(kbDriven)
          kbDriven.value = e.height
        }
      },
      onEnd: (e) => {
        'worklet'
        if (!shouldHandleKeyboard) return
        if (!IS_IOS) {
          kbDriven.value = e.height
        }
      },
      onInteractive: (e) => {
        'worklet'
        if (!shouldHandleKeyboard) return
        cancelAnimation(kbDriven)
        kbDriven.value = e.height
      },
    },
    [shouldHandleKeyboard]
  )

  return null
}
