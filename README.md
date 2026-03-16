# react-native-fluid-bottom-sheet

A performant, gesture-driven bottom sheet for React Native with snap points, search bar, and FlatList support. Built on `react-native-reanimated` and `react-native-gesture-handler`.

## Features

- Smooth spring-based animations with rubber-band effect
- Multiple snap points
- Swipe-to-dismiss
- Built-in search bar (optional)
- `BottomSheetFlatList` with seamless scroll-to-drag handoff
- Fully customizable theme and render props
- Zero UI library dependencies (no Expo icons, no RNE)

## Installation

```bash
npm install react-native-fluid-bottom-sheet
```

### Peer Dependencies

```bash
npm install react-native-reanimated react-native-gesture-handler
# optional, for safe area padding:
npm install react-native-safe-area-context
```

## Usage

```tsx
import { BottomSheet, BottomSheetFlatList } from 'react-native-fluid-bottom-sheet'

function App() {
  const [visible, setVisible] = useState(false)

  return (
    <BottomSheet
      isVisible={visible}
      onClose={() => setVisible(false)}
      title="My Sheet"
      snapPoints={[0.4, 0.8]}
    >
      <BottomSheetFlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ItemRow item={item} />}
      />
    </BottomSheet>
  )
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isVisible` | `boolean` | — | Controls sheet visibility |
| `onClose` | `() => void` | — | Called when sheet is dismissed |
| `title` | `string` | — | Header title |
| `snapPoints` | `number[]` | — | Array of snap points (fractions of screen height) |
| `snapPoint` | `number` | `0.6` | Single snap point shorthand |
| `initialSnapIndex` | `number` | `0` | Starting snap point index |
| `searchable` | `boolean` | `false` | Show search bar |
| `searchPlaceholder` | `string` | — | Search input placeholder |
| `onSearch` | `(query: string) => void` | — | Search callback |
| `showHandle` | `boolean` | `true` | Show drag handle |
| `showCloseButton` | `boolean` | `true` | Show close button |
| `renderCloseButton` | `(onClose) => ReactNode` | — | Custom close button |
| `renderSearchIcon` | `() => ReactNode` | — | Custom search icon |
| `renderClearIcon` | `() => ReactNode` | — | Custom clear icon |
| `theme` | `BottomSheetTheme` | — | Color overrides |
| `containerStyle` | `StyleProp<ViewStyle>` | — | Additional sheet styles |
| `keyboardBehavior` | `'padding' \| 'height' \| 'none'` | `'padding'` | How the sheet reacts to keyboard. `padding` shifts sheet up, `height` grows sheet, `none` ignores keyboard |
| `enableHaptics` | `boolean` | `false` | Haptic feedback on snap |
| `onSnap` | `(index: number) => void` | — | Called when sheet snaps to a point |
| `onAnimate` | `(from, to) => void` | — | Called when animation completes |
| `accessibilityLabel` | `string` | — | Accessibility label for the sheet |
| `closeButtonAccessibilityLabel` | `string` | `'Close bottom sheet'` | Accessibility label for close button |

### Ref Methods

```tsx
const sheetRef = useRef<BottomSheetRef>(null)

sheetRef.current?.expand()     // expand to max snap point
sheetRef.current?.collapse()   // collapse to min snap point
sheetRef.current?.close()      // close the sheet
sheetRef.current?.snapTo(1)    // snap to specific index
```

### Keyboard Handling

The sheet listens to keyboard events and smoothly animates to avoid the keyboard. No special Android configuration required — works with any `softwareKeyboardLayoutMode`.

- `'padding'` (default): shifts the sheet up by keyboard height
- `'height'`: grows the sheet taller to accommodate the keyboard
- `'none'`: ignores the keyboard

### Theme

```ts
interface BottomSheetTheme {
  backgroundColor?: string      // '#FFFFFF'
  handleColor?: string           // '#CCCCCC'
  textColor?: string             // '#000000'
  backdropColor?: string         // 'rgba(0,0,0,0.5)'
  searchBackgroundColor?: string // '#F0F0F0'
  searchTextColor?: string       // '#000000'
  searchPlaceholderColor?: string // '#999999'
}
```

## License

MIT


