import type { StyleProp, ViewStyle, AccessibilityRole } from 'react-native'

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

  /**
   * Auto-size the sheet to its content. When true, `snapPoint` / `snapPoints`
   * are ignored — the sheet measures the height of `<BottomSheetView>` /
   * `<BottomSheetScrollView>` children and sizes itself to fit. The
   * computed snap is clamped between `minDynamicSnapFraction` and
   * `maxDynamicSnapFraction`.
   *
   * Default: false.
   */
  enableDynamicSizing?: boolean

  /**
   * Lower bound on the auto-sized snap fraction. Also the snap fraction
   * the sheet renders at *before* the first content measurement arrives.
   * Only used when `enableDynamicSizing` is true. Default: 0.3.
   */
  minDynamicSnapFraction?: number

  /**
   * Upper bound on the auto-sized snap fraction. Content larger than this
   * gets clamped, and the sheet's body becomes scrollable inside its frame
   * (when `<BottomSheetScrollView>` is used). Only used when
   * `enableDynamicSizing` is true. Default: 0.9.
   */
  maxDynamicSnapFraction?: number

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
  accessibilityRole?: AccessibilityRole
  closeButtonAccessibilityLabel?: string

  // --- Haptics ---
  /** Enable haptic feedback on snap and close. Default: false */
  enableHaptics?: boolean

  // --- Keyboard ---
  /** Keyboard avoidance behavior. Default: 'padding' */
  keyboardBehavior?: 'padding' | 'height' | 'none'

  /**
   * Minimum top Y the sheet can reach when shifted up by the keyboard.
   * Use this to prevent the sheet from overlapping a custom header above it.
   * Defaults to max(useSafeAreaInsets().top, StatusBar.currentHeight).
   */
  topInset?: number

  // --- Callbacks ---
  onSnap?: (index: number) => void
  /** Fires when an animation completes. `toIndex` is the destination snap index, or -1 when closing. */
  onAnimate?: (toIndex: number) => void
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
