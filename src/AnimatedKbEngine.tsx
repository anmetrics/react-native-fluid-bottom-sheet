import {
  useAnimatedKeyboard,
  useAnimatedReaction,
  type SharedValue,
} from 'react-native-reanimated'

interface Props {
  kbDriven: SharedValue<number>
  shouldHandleKeyboard: boolean
}

// Engine: per-frame keyboard tracking via reanimated's `useAnimatedKeyboard`.
// Default engine — mounted when `keyboardMode === 'animated'`. Has no
// dependency on `react-native-keyboard-controller`; consumers running this
// engine pay no cost for that library.
export function AnimatedKbEngine({ kbDriven, shouldHandleKeyboard }: Props) {
  const animatedKb = useAnimatedKeyboard()
  useAnimatedReaction(
    () => animatedKb.height.value,
    (h, prev) => {
      'worklet'
      if (!shouldHandleKeyboard) return
      if (h === prev) return
      kbDriven.value = h
    },
    [shouldHandleKeyboard]
  )
  return null
}
