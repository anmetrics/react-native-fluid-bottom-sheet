import { Dimensions } from 'react-native'

export const SCREEN_HEIGHT = Dimensions.get('window').height

// `overshootClamping` prevents the spring from going past its target — without
// it, snap / open / close animations briefly overshoot the snap position,
// which is especially visible when the keyboard is also rising at the same
// time (the spring's overshoot stacks on top of the keyboard-induced anchor
// shift, making the sheet appear to "bounce up too high" before settling).
export const SNAP_SPRING = {
  damping: 32,
  stiffness: 450,
  mass: 0.9,
  overshootClamping: true,
}
export const VELOCITY_FACTOR = 0.15
export const RUBBER_COEFF = 0.55

export const DEFAULT_THEME = {
  backgroundColor: '#FFFFFF',
  handleColor: '#CCCCCC',
  textColor: '#000000',
  backdropColor: 'rgba(0,0,0,0.5)',
  searchBackgroundColor: '#F0F0F0',
  searchTextColor: '#000000',
  searchPlaceholderColor: '#999999',
} as const
