import type { StyleProp, ViewStyle } from 'react-native'

export interface BottomSheetTheme {
  /** Sheet background color. Default: '#FFFFFF' */
  backgroundColor?: string
  /** Handle bar color. Default: '#CCCCCC' */
  handleColor?: string
  /** Title text color. Default: '#000000' */
  textColor?: string
  /** Backdrop color. Default: 'rgba(0,0,0,0.5)' */
  backdropColor?: string
  /** Search bar background. Default: '#F0F0F0' */
  searchBackgroundColor?: string
  /** Search bar text color. Default: '#000000' */
  searchTextColor?: string
  /** Search bar placeholder color. Default: '#999999' */
  searchPlaceholderColor?: string
}

export interface BottomSheetProps {
  isVisible: boolean
  onClose?: () => void
  title?: string
  children?: React.ReactNode
  containerStyle?: StyleProp<ViewStyle>

  /** Array of snap points as fractions of screen height (e.g. [0.3, 0.6, 0.9]) */
  snapPoints?: number[]
  /** Single snap point as fraction of screen height. Default: 0.6 */
  snapPoint?: number
  /** Index of the initial snap point. Default: 0 */
  initialSnapIndex?: number

  /** Show the search bar. Default: false */
  searchable?: boolean
  searchPlaceholder?: string
  onSearch?: (query: string) => void

  /** Show the drag handle. Default: true */
  showHandle?: boolean
  /** Show the close button. Default: true */
  showCloseButton?: boolean

  /** Custom close button render function */
  renderCloseButton?: (onClose: () => void) => React.ReactNode
  /** Custom search icon render function */
  renderSearchIcon?: () => React.ReactNode
  /** Custom clear icon render function for search */
  renderClearIcon?: () => React.ReactNode

  /** Theme colors */
  theme?: BottomSheetTheme

  // --- Accessibility ---
  accessibilityLabel?: string
  accessibilityRole?: string
  closeButtonAccessibilityLabel?: string

  // --- Haptics ---
  /** Enable haptic feedback on snap and close. Default: false */
  enableHaptics?: boolean

  // --- Keyboard ---
  /** Keyboard avoidance behavior. Default: 'padding' */
  keyboardBehavior?: 'padding' | 'height' | 'none'

  // --- Callbacks ---
  onSnap?: (index: number) => void
  onAnimate?: (fromValue: number, toValue: number) => void
}

export interface BottomSheetRef {
  /** Expand the sheet to the specified snap point index or max height if not provided */
  expand: (index?: number) => void
  /** Collapse the sheet to the smallest snap point (not fully close) */
  collapse: () => void
  /** Completely close the sheet */
  close: () => void
  /** Snap to a specific index */
  snapTo: (index: number) => void
}
