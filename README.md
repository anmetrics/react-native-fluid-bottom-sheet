# react-native-fluid-bottom-sheet

A performant, gesture-driven bottom sheet for React Native with snap points, search bar, and FlatList support. Built on `react-native-reanimated` and `react-native-gesture-handler`.

## Features

- Smooth spring-based animations with rubber-band effect
- Multiple snap points, **or auto-size to content**
- Cross-platform keyboard avoidance (iOS, Android edge-to-edge, Android adjustResize)
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
npm install react-native-reanimated react-native-gesture-handler react-native-safe-area-context
```

`react-native-safe-area-context` is **required** — the sheet uses it to compute top/bottom insets so the snap point automatically reserves space for the status bar / nav bar / home indicator.

Wrap your app in `SafeAreaProvider` with `initialMetrics`:

```tsx
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context'

<SafeAreaProvider initialMetrics={initialWindowMetrics}>
  <App />
</SafeAreaProvider>
```

## Usage

### Static snap points

Use when you know the size in advance, or when children include a `ScrollView` / `FlatList` that needs a bounded viewport to scroll in.

```tsx
import { BottomSheet, BottomSheetFlatList } from 'react-native-fluid-bottom-sheet'

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
```

### Dynamic auto-sizing

Omit both `snapPoint` and `snapPoints` and the sheet measures its children and resizes to fit them — including the drag handle, header, optional search bar, and bottom safe-area inset. No flicker on size changes; the sheet animates between sizes.

```tsx
<BottomSheet
  isVisible={visible}
  onClose={() => setVisible(false)}
  title="Edit profile"
>
  <View style={{ padding: 16 }}>
    <Input label="Name" value={name} onChangeText={setName} />
    <Input label="Email" value={email} onChangeText={setEmail} />
    <Button title="Save" onPress={save} />
  </View>
</BottomSheet>
```

**When to use which:**

| | Static (`snapPoint` / `snapPoints`) | Dynamic (no snap props) |
|---|---|---|
| Children include `ScrollView` / `FlatList` | ✅ Required (gives the list a bounded viewport) | ❌ The list will collapse to zero height |
| Children are a static `<View>` form / list of cards | Works | ✅ Recommended — sheet sizes itself |
| You want explicit half-screen / full-screen snaps | ✅ | ❌ |
| Sheet should resize as content changes (e.g. items added/removed) | Use `useMeasuredSnapPoint` — see below | ✅ Built-in |

### Sizing a sheet around a `ScrollView`

`ScrollView` needs a bounded parent, so dynamic mode does not work for it. Measure the inner content size yourself and pass it as `snapPoint`:

```tsx
const { snapPoint, setHeight } = useMeasuredSnapPoint() // or your equivalent

<BottomSheet snapPoint={snapPoint} ...>
  <ScrollView onContentSizeChange={(_, h) => setHeight(h)}>
    {children}
  </ScrollView>
</BottomSheet>
```

The sheet renders at exactly `snapPoint × screenHeight`. Compute `snapPoint = (contentHeight + chrome + safeAreaBottom) / windowHeight` where `chrome` is the height of the bits the library renders on top of your children:

| Chrome element | Height (dp) | Rendered when |
|---|---|---|
| Drag handle area | 12 | `showHandle !== false` |
| Header (title + close) | 48 | `title` is set or `showCloseButton !== false` |
| Search bar | 56 | `searchable === true` |

A typical sheet (handle + title + close, no search) has `chrome = 60`.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isVisible` | `boolean` | — | Controls sheet visibility |
| `onClose` | `() => void` | — | Called when sheet is dismissed |
| `title` | `string` | — | Header title |
| `snapPoints` | `number[]` | — | Snap points as fractions of screen height. Omit for dynamic auto-sizing. |
| `snapPoint` | `number` | — | Single snap point shorthand. Omit for dynamic auto-sizing. |
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
| `keyboardBehavior` | `'padding' \| 'height' \| 'none'` | `'padding'` | How the sheet reacts to keyboard (see below) |
| `topInset` | `number` | auto | Minimum Y the sheet's top can reach. Defaults to `max(safeAreaInsets.top, StatusBar.currentHeight)`; pass a larger value to keep the sheet under a custom in-screen header. |
| `enableHaptics` | `boolean` | `false` | Haptic feedback on snap |
| `onSnap` | `(index: number) => void` | — | Called when sheet snaps to a point |
| `onAnimate` | `(from, to) => void` | — | Called when animation completes |
| `accessibilityLabel` | `string` | — | Accessibility label for the sheet |
| `accessibilityRole` | `string` | `'adjustable'` | Accessibility role for the sheet |
| `closeButtonAccessibilityLabel` | `string` | `'Close bottom sheet'` | Accessibility label for close button |

### Ref Methods

```tsx
const sheetRef = useRef<BottomSheetRef>(null)

sheetRef.current?.expand()     // expand to max snap point (or specify index)
sheetRef.current?.collapse()   // collapse to smallest snap point
sheetRef.current?.close()      // dismiss the sheet
sheetRef.current?.snapTo(1)    // snap to specific index
```

## Keyboard Handling

The sheet uses `useAnimatedKeyboard` from `react-native-reanimated` so the sheet stays glued to the visible keyboard top in every Android / iOS configuration:

- **iOS:** keyboard frame in window coords.
- **Android non-edge-to-edge with `adjustResize`:** the OS shrinks the window; the sheet's parent shrinks with it. The library detects this and avoids a double-shift.
- **Android edge-to-edge** (the default in Android 15+ / `enableEdgeToEdge=true`): the window does *not* shrink. The library passes `isStatusBarTranslucentAndroid` and `isNavigationBarTranslucentAndroid` to `useAnimatedKeyboard` so the reported keyboard height excludes the navigation bar — without these flags you'd see a phantom gap below the sheet equal to the nav bar height.

`keyboardBehavior` modes:
- `'padding'` (default): shifts the sheet up so its bottom sits on the keyboard.
- `'height'`: grows the sheet taller to accommodate the keyboard.
- `'none'`: ignores the keyboard (use if you want to handle it yourself).

### Android requirements

Set `android:windowSoftInputMode="adjustResize"` in your `AndroidManifest.xml`:

```xml
<activity
  android:name=".MainActivity"
  android:windowSoftInputMode="adjustResize"
  ... />
```

## Theme

```ts
interface BottomSheetTheme {
  backgroundColor?: string         // '#FFFFFF'
  handleColor?: string             // '#CCCCCC'
  textColor?: string               // '#000000'
  backdropColor?: string           // 'rgba(0,0,0,0.5)'
  searchBackgroundColor?: string   // '#F0F0F0'
  searchTextColor?: string         // '#000000'
  searchPlaceholderColor?: string  // '#999999'
}
```

## License

MIT
