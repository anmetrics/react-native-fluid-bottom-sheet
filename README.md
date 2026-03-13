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
