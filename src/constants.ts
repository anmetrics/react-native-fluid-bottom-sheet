import { Dimensions } from 'react-native'

export const SCREEN_HEIGHT = Dimensions.get('window').height

export const SNAP_SPRING = { damping: 32, stiffness: 450, mass: 0.9 }
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
